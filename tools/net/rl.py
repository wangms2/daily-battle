"""PPO self-play trainer (plan-rl R4), Jaxcalibur-style.

All four gen envs (pe_env_gen3..6) run side by side and every update mixes
them. Both sides of every battle are played by the current net. Each env's
step + observe runs on a worker thread (Rust releases the GIL and uses rayon)
while the GPU infers the next env, so CPU and GPU overlap.

Rows act only on turns they must choose (`needs`). A row's trajectory is its
own acting steps; the battle's result (1 win, 0 loss, 0.5 draw) lands on its
last acting step. GAE with gamma 1.

Losses: PPO-clip policy, value (BCE on lambda-returns), entropy, zero-avoiding
(-mean log pi over legal actions), foe next action (the other row's real
action), and foe item / ability / moves (true sets from `truth()`, on seen foe
slots).

    .venv\\Scripts\\python.exe rl.py --run smoke --minutes 10
    .venv\\Scripts\\python.exe rl.py --run main --hours 60 --resume
"""
import argparse
import csv
import importlib
import math
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import psutil
import torch
import torch.nn.functional as F

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
if os.environ.get("PE_ENV_DIR"):  # staged env builds, e.g. while training holds the .pyd files
    sys.path.insert(0, os.environ["PE_ENV_DIR"])
from model import ACTIONS, MON_F, OBS_FLOATS, OBS_IDS, Config, Net, load, upgrade  # noqa: E402

SEEN = 40  # mon float: the viewer has seen this Pokémon
DMG = 28  # move float: damage share of the foe's HP (own active only)
EVAL_BOTS = ("greedy", "mcts:1000")  # in-training evals; mcts = full-information Hard-proxy


def bot_actions(kind, f, m, rng):
    """Baseline opponents: "random" (uniform legal) or "greedy" (the own active's
    hardest-hitting move, mega if it can; a random switch when it can't attack)."""
    rand = (rng.random(m.shape) * m).argmax(1)
    if kind == "random":
        return rand.astype(np.int64)
    mons = f[:, : 12 * MON_F].reshape(-1, 12, MON_F)
    active = mons[:, :6, 1].argmax(1)
    am = mons[np.arange(len(f)), active, 45:].reshape(-1, 4, 30)[:, :, DMG]
    dmg = np.where(m[:, :4] | m[:, 4:8], am + 1e-3, -1.0)
    best = dmg.argmax(1)
    can = dmg.max(1) >= 0
    out = np.where(m[np.arange(len(f)), 4 + best], 4 + best, best)
    return np.where(can, out, rand).astype(np.int64)


def args():
    p = argparse.ArgumentParser()
    p.add_argument("--run", required=True, help="run name; output in data/rl/<run>")
    p.add_argument("--gens", default="3,4,5,6")
    p.add_argument("--battles", type=int, default=4096, help="battles in flight, split across gens")
    p.add_argument("--steps", type=int, default=32, help="rollout length per update")
    p.add_argument("--epochs", type=int, default=2)
    p.add_argument("--minibatch", type=int, default=4096)
    p.add_argument("--micro", type=int, default=2048, help="split each minibatch's forward/backward (memory); 0 = whole")
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--wd", type=float, default=0.01)
    p.add_argument("--clip", type=float, default=0.2)
    p.add_argument("--lam", type=float, default=0.95)
    p.add_argument("--ent", type=float, default=0.01, help="entropy coef at the start")
    p.add_argument("--ent-end", type=float, default=0.002, help="entropy coef after --anneal-hours")
    p.add_argument("--anneal-hours", type=float, default=24)
    p.add_argument("--za", type=float, default=0.003, help="zero-avoiding coef")
    p.add_argument("--vf", type=float, default=0.5)
    p.add_argument("--foe", type=float, default=0.2, help="foe-action loss coef")
    p.add_argument("--sets", type=float, default=0.1, help="foe set-heads loss coef")
    p.add_argument("--grad-clip", type=float, default=1.0)
    p.add_argument("--varied", type=float, default=0.3)
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--minutes", type=float, default=0, help="stop after this long (0 = use --hours)")
    p.add_argument("--hours", type=float, default=0)
    p.add_argument("--ckpt-minutes", type=float, default=30)
    p.add_argument("--eval-minutes", type=float, default=10)
    p.add_argument("--eval-games", type=int, default=200, help="per gen, vs random")
    p.add_argument("--eval10k-games", type=int, default=100, help="per gen vs mcts:10000, the main yardstick now (0 = off)")
    p.add_argument("--eval10k-every", type=int, default=2, help="run it every N eval rounds")
    p.add_argument("--init", default="", help="start weights (e.g. the warm start)")
    p.add_argument("--critic-warmup", type=int, default=8, help="with --init: updates that train only value/aux heads")
    p.add_argument("--resume", action="store_true")
    p.add_argument("--baseline", action="store_true", help="only print greedy vs random and exit")
    return p.parse_args()


class Envs:
    """The gen envs as one row space: rows [off_g, off_g + 2 n_g) belong to gen g.
    Rows 2i and 2i+1 are the two sides of a battle, so a row's foe is row ^ 1."""

    def __init__(self, gens, battles, seed, varied, catalog):
        self.gens = gens
        per = battles // len(gens)
        self.envs = [importlib.import_module(f"pe_env_gen{g}").VecEnv(per, seed * 101 + g, catalog, varied) for g in gens]
        self.rows = [2 * e.n for e in self.envs]
        self.off = np.concatenate([[0], np.cumsum(self.rows)]).tolist()
        self.R = self.off[-1]
        self.pool = ThreadPoolExecutor(len(gens))

    @staticmethod
    def _step(env, actions):
        r, d = env.step(actions)
        return r, d, env.observe(), env.truth()

    def submit(self, g, actions):
        return self.pool.submit(self._step, self.envs[g], actions)

    def stats(self):
        tot = {}
        for e in self.envs:
            for k, v in e.stats().items():
                tot[k] = tot.get(k, 0) + v
        return tot


def masked_logp(logits, mask):
    logp = torch.log_softmax(logits, -1)
    return torch.where(mask, logp, torch.zeros_like(logp))


def sample(logits):
    return torch.distributions.Categorical(logits=logits).sample()


class Buffer:
    def __init__(self, T, R, dev):
        z = lambda *s, dt=torch.float32: torch.zeros(*s, dtype=dt, device=dev)  # noqa: E731
        self.floats = z(T, R, OBS_FLOATS, dt=torch.float16)
        self.ids = z(T, R, OBS_IDS, dt=torch.int16)
        self.mask = z(T, R, ACTIONS, dt=torch.bool)
        self.truth = z(T, R, 42, dt=torch.int16)
        self.valid = z(T, R, dt=torch.bool)
        self.action = z(T, R, dt=torch.long)
        self.logp = z(T, R)
        self.value = z(T, R)
        self.reward = z(T, R)
        self.done = z(T, R, dt=torch.bool)


def gae(buf, last_value, lam):
    """Per-row GAE over acting steps only, gamma 1. A battle's reward goes to the
    row's last acting step before (or at) the step where it ended."""
    T, R = buf.valid.shape
    adv = torch.zeros(T, R, device=buf.valid.device)
    nv = last_value.clone()
    na = torch.zeros(R, device=nv.device)
    pend = torch.zeros(R, device=nv.device)
    for t in reversed(range(T)):
        d = buf.done[t]
        pend = torch.where(d, buf.reward[t], pend)
        nv = torch.where(d, torch.zeros_like(nv), nv)
        na = torch.where(d, torch.zeros_like(na), na)
        v = buf.valid[t]
        delta = pend + nv - buf.value[t]
        a = delta + lam * na
        adv[t] = torch.where(v, a, adv[t])
        nv = torch.where(v, buf.value[t], nv)
        na = torch.where(v, a, na)
        pend = torch.where(v, torch.zeros_like(pend), pend)
    return adv, adv + buf.value


@torch.no_grad()
def act(net, f, i, m, needs):
    """Sample actions for the rows that must act. Returns (actions, logp, value) for all
    rows (zeros elsewhere)."""
    R = f.shape[0]
    a = torch.zeros(R, dtype=torch.long, device=f.device)
    lp = torch.zeros(R, device=f.device)
    v = torch.zeros(R, device=f.device)
    idx = needs.nonzero().squeeze(1)
    if len(idx):
        with torch.autocast("cuda", torch.bfloat16):
            out = net(f[idx].float(), i[idx], m[idx])
        logits = out["policy"].float()
        s = sample(logits)
        a[idx] = s
        lp[idx] = torch.log_softmax(logits, -1).gather(1, s[:, None]).squeeze(1)
        v[idx] = torch.sigmoid(out["value"].float())
    return a, lp, v


@torch.no_grad()
def values(net, f, i, m):
    out = []
    for s in range(0, f.shape[0], 8192):
        with torch.autocast("cuda", torch.bfloat16):
            mm = m[s : s + 8192].clone()
            mm[~mm.any(1), 0] = True
            out.append(torch.sigmoid(net(f[s : s + 8192].float(), i[s : s + 8192], mm)["value"].float()))
    return torch.cat(out)


def to_dev(obs, dev):
    f, i, m, n = obs
    return (
        torch.from_numpy(f).to(dev, non_blocking=True).half(),
        torch.from_numpy(i.view(np.int16)).to(dev, non_blocking=True),
        torch.from_numpy(m).to(dev, non_blocking=True),
        torch.from_numpy(n).to(dev, non_blocking=True),
    )


def net_player(net, dev):
    @torch.no_grad()
    def play(env, f, i, m, rows):
        net.eval()
        ft, it, mt, _ = to_dev((f[rows], i[rows], m[rows], m[rows, 0]), dev)
        with torch.autocast("cuda", torch.bfloat16):
            return net(ft.float(), it, mt)["policy"].float().argmax(1).cpu().numpy()

    return play


def player(spec, dev, rng, net=None):
    """A player for `match`: a net, "random", "greedy", "mcts:<iterations>" (full-information
    poke-engine MCTS, the Hard-proxy) or "net:<checkpoint>"."""
    if spec == "net":
        return net_player(net, dev)
    if spec.startswith("net:"):
        n = load(Net(Config()).to(dev), torch.load(spec[4:], map_location=dev, weights_only=False)["model"])
        return net_player(n, dev)
    if spec.startswith("mcts:"):
        iters = int(spec[5:])
        return lambda env, f, i, m, rows: env.mcts_actions(rows.tolist(), iters, int(rng.integers(1 << 62)))
    return lambda env, f, i, m, rows: bot_actions(spec, f[rows], m[rows], rng)


def match(a, b, gens, games, seed, catalog, battles=256):
    """Player `a` vs player `b` (from `player`), `games` per gen; `a` is side one in
    even battles and side two in odd ones. Returns {gen: a's score}."""
    res = {}
    for g in gens:
        n = min(battles, games)
        env = importlib.import_module(f"pe_env_gen{g}").VecEnv(n, seed * 7 + g, catalog, 0.3)
        a_row = np.arange(n) * 2 + (np.arange(n) % 2)
        is_a = np.zeros(2 * n, bool)
        is_a[a_row] = True
        score = played = 0.0
        while played < games:
            f, i, m, needs = env.observe()
            acts = np.zeros(2 * n, np.int64)
            for mine, p in ((is_a, a), (~is_a, b)):
                rows = np.nonzero(mine & needs)[0]
                if len(rows):
                    acts[rows] = p(env, f, i, m, rows)
            r, d = env.step(acts)
            fin = d[a_row]
            score += r[a_row][fin].sum()
            played += fin.sum()
        res[g] = float(score / played)
    return res


def eval_vs(net, bot, gens, games, seed, catalog, dev, player_spec="net"):
    """`player_spec` (default the net: greedy policy, no search) vs `bot`. Returns {gen: score}."""
    rng = np.random.default_rng(seed)
    out = match(player(player_spec, dev, rng, net), player(bot, dev, rng, net), gens, games, seed, catalog)
    if net is not None:
        net.train()
    return out


def no_power_throttling():
    """Windows moves windowless background processes to E-cores (EcoQoS) while the user is
    idle; on the 12700K that cut rollout speed ~4x overnight. Opt this process out."""
    if sys.platform != "win32":
        return
    import ctypes

    class State(ctypes.Structure):
        _fields_ = [("Version", ctypes.c_ulong), ("ControlMask", ctypes.c_ulong), ("StateMask", ctypes.c_ulong)]

    k = ctypes.windll.kernel32
    k.GetCurrentProcess.restype = ctypes.c_void_p
    s = State(1, 1, 0)  # control EXECUTION_SPEED, state off
    if not k.SetProcessInformation(ctypes.c_void_p(k.GetCurrentProcess()), 4, ctypes.byref(s), ctypes.sizeof(s)):
        print("warning: could not disable power throttling", flush=True)


def main():
    a = args()
    no_power_throttling()
    dev = "cuda"
    torch.manual_seed(a.seed)
    gens = [int(g) for g in a.gens.split(",")]
    catalog = str(HERE / "data" / "catalog")
    if a.baseline:
        print("greedy vs random:", eval_vs(None, "random", gens, a.eval_games, a.seed, catalog, dev, player_spec="greedy"))
        return
    out = HERE / "data" / "rl" / a.run
    out.mkdir(parents=True, exist_ok=True)
    ckpt_path = out / "last.pt"

    net = Net(Config()).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=a.wd, betas=(0.9, 0.99))
    st = dict(update=0, decisions=0, games=0, seconds=0.0)
    if a.resume and ckpt_path.exists():
        ck = torch.load(ckpt_path, map_location=dev, weights_only=False)
        padded = upgrade(ck["model"])
        net.load_state_dict(ck["model"])
        opt.load_state_dict(ck["opt"])
        for g in opt.param_groups:  # the saved state restores the old values; the CLI wins
            g["lr"], g["weight_decay"] = a.lr, a.wd
        # An older observation layout: pad Adam's moments for the new inputs with zeros.
        for name, p in net.named_parameters():
            if name in padded:
                for k in ("exp_avg", "exp_avg_sq"):
                    m = opt.state[p][k]
                    opt.state[p][k] = torch.cat([m, m.new_zeros(m.shape[0], p.shape[1] - m.shape[1])], 1)
                print(f"upgraded {name} from {padded[name]} to {p.shape[1]} inputs")
        st = ck["state"]
        print(f"resumed {ckpt_path} at update {st['update']}, {st['games']:,} games, lr {a.lr:g}")
    elif a.init:
        load(net, torch.load(a.init, map_location=dev, weights_only=False)["model"])
        st["init"] = str(Path(a.init).resolve())
        print(f"init from {a.init}")
    net.train()
    HEADS = ("value.", "foe_move.", "foe_switch.", "set_item.", "set_ability.", "set_moves.")
    trunk = [p for n, p in net.named_parameters() if not n.startswith(HEADS)]

    envs = Envs(gens, a.battles, a.seed + st["update"], a.varied, catalog)
    R, T = envs.R, a.steps
    buf = Buffer(T, R, dev)
    print(f"gens {gens}, {R // 2} battles, {R} rows, rollout {T} -> up to {T * R:,} samples/update")

    log_path = out / "log.csv"
    new_log = not log_path.exists()
    logf = open(log_path, "a", newline="")
    log = csv.writer(logf)
    if new_log:
        log.writerow(
            ["update", "hours", "games", "decisions", "dps", "samples", "ent_coef", "pg", "vloss", "ent", "za",
             "kl", "clipfrac", "ev", "foe_acc", "item_acc", "abil_acc", "loss_foe", "loss_sets", "avg_turns",
             "draws", "illegal", "panics", "vs_prev", "vs_init"] + [f"vs_{b.replace(':', '')}_g{g}" for b in EVAL_BOTS for g in gens]
        )

    # Initial observations.
    obs = [to_dev(e.observe(), dev) for e in envs.envs]
    truth = [torch.from_numpy(e.truth().view(np.int16)).to(dev) for e in envs.envs]
    budget = (a.minutes * 60) if a.minutes else (a.hours * 3600)
    t0 = time.time()
    sec0 = st["seconds"]
    last_ckpt = last_eval = time.time()
    stats0 = envs.stats()
    evals, refs = {}, {}
    n_evals = 0

    def save():
        st["seconds"] = sec0 + time.time() - t0
        tmp = out / "last.tmp"
        torch.save(dict(model=net.state_dict(), opt=opt.state_dict(), state=st, args=vars(a)), tmp)
        os.replace(tmp, ckpt_path)

    while True:
        elapsed = time.time() - t0
        if budget and elapsed >= budget:
            break
        hours = (sec0 + elapsed) / 3600
        frac = min(1.0, hours / a.anneal_hours) if a.anneal_hours else 1.0
        ent_coef = a.ent + (a.ent_end - a.ent) * frac
        # A warm-started policy comes with a fresh value head: fit the critic before trusting its advantages.
        pw = 0.0 if st.get("init") and st["update"] < a.critic_warmup else 1.0
        tr0 = time.time()

        # ---- Rollout ----
        net.eval()
        futs = [None] * len(gens)
        for t in range(T):
            for g in range(len(gens)):
                lo, hi = envs.off[g], envs.off[g + 1]
                if futs[g] is not None:
                    r, d, o, tr = futs[g].result()
                    buf.reward[t - 1, lo:hi] = torch.from_numpy(r).to(dev)
                    buf.done[t - 1, lo:hi] = torch.from_numpy(d).to(dev)
                    obs[g] = to_dev(o, dev)
                    truth[g] = torch.from_numpy(tr.view(np.int16)).to(dev)
                f, i, m, n = obs[g]
                buf.floats[t, lo:hi] = f
                buf.ids[t, lo:hi] = i
                buf.mask[t, lo:hi] = m
                buf.valid[t, lo:hi] = n
                buf.truth[t, lo:hi] = truth[g]
                acts, lp, v = act(net, f, i, m, n)
                buf.action[t, lo:hi] = acts
                buf.logp[t, lo:hi] = lp
                buf.value[t, lo:hi] = v
                futs[g] = envs.submit(g, acts.cpu().numpy())
        for g in range(len(gens)):
            lo, hi = envs.off[g], envs.off[g + 1]
            r, d, o, tr = futs[g].result()
            buf.reward[T - 1, lo:hi] = torch.from_numpy(r).to(dev)
            buf.done[T - 1, lo:hi] = torch.from_numpy(d).to(dev)
            obs[g] = to_dev(o, dev)
            truth[g] = torch.from_numpy(tr.view(np.int16)).to(dev)
        last_v = torch.cat([values(net, *obs[g][:3]) for g in range(len(gens))])
        adv, ret = gae(buf, last_v, a.lam)
        t_roll = time.time() - tr0

        # ---- PPO update ----
        net.train()
        flat = buf.valid.flatten().nonzero().squeeze(1)
        N = len(flat)
        # Rows 2i/2i+1 are one battle and R is even, so a sample's foe is at index ^ 1.
        Ff = buf.floats.view(T * R, -1)
        Fi = buf.ids.view(T * R, -1)
        Fm = buf.mask.view(T * R, -1)
        Fv = buf.valid.flatten()
        Fa = buf.action.flatten()
        Ftr = buf.truth.view(T * R, 6, 7)
        Flp, Fval = buf.logp.flatten(), buf.value.flatten()
        Fadv, Fret = adv.flatten(), ret.flatten()
        acc = dict(pg=0.0, vloss=0.0, ent=0.0, za=0.0, kl=0.0, clipfrac=0.0, foe_acc=0.0, item_acc=0.0,
                   abil_acc=0.0, loss_foe=0.0, loss_sets=0.0)
        nb = 0
        for _ in range(a.epochs):
            perm = flat[torch.randperm(N, device=dev)]
            # Near-equal minibatches: a fixed-size split could leave a 1-sample tail, whose
            # std() is NaN (crashed the run at update 2210).
            for mb in perm.tensor_split(max(1, round(N / a.minibatch))):
                # Advantages normalized over the whole minibatch; micro-batches only
                # split the forward/backward to save memory (one optimizer step).
                ad_mb = Fadv[mb]
                ad_mb = (ad_mb - ad_mb.mean()) / (ad_mb.std(unbiased=False) + 1e-8)
                opt.zero_grad(set_to_none=True)
                for idx, ad in zip(mb.split(a.micro or len(mb)), ad_mb.split(a.micro or len(mb))):
                    w = len(idx) / len(mb)
                    fidx = idx ^ 1
                    f, i, m = Ff[idx].float(), Fi[idx], Fm[idx]
                    with torch.autocast("cuda", torch.bfloat16):
                        o = net(f, i, m)
                    logits = o["policy"].float()
                    logp_all = masked_logp(logits, m)
                    lp = logp_all.gather(1, Fa[idx][:, None]).squeeze(1)
                    ratio = torch.exp(lp - Flp[idx])
                    pg = -torch.min(ratio * ad, ratio.clamp(1 - a.clip, 1 + a.clip) * ad).mean()
                    p = logp_all.exp() * m
                    ent = -(p * logp_all).sum(1).mean()
                    nleg = m.sum(1).clamp(min=1)
                    za = -(logp_all.sum(1) / nleg).mean()
                    vloss = F.binary_cross_entropy_with_logits(o["value"].float(), Fret[idx].clamp(0, 1))
                    # Foe next action: the other row's real action, where it acted.
                    fv = Fv[fidx]
                    fm = Fm[fidx]
                    fl = o["foe_action"].float().masked_fill(~fm, -1e9)
                    ft = Fa[fidx]
                    if fv.any():
                        loss_foe = F.cross_entropy(fl[fv], ft[fv])
                        foe_acc = (fl[fv].argmax(1) == ft[fv]).float().mean().item()
                    else:
                        loss_foe, foe_acc = torch.zeros((), device=dev), 0.0
                    # Foe sets, on seen foe slots.
                    seen = f[:, : 12 * MON_F].view(-1, 12, MON_F)[:, 6:, SEEN] > 0.5
                    tr = Ftr[idx].long()
                    if seen.any():
                        it_l, ab_l, mv_l = o["item"][seen].float(), o["ability"][seen].float(), o["moves"][seen].float()
                        it_t, ab_t, mv_t = tr[..., 1][seen], tr[..., 2][seen], tr[..., 3:][seen]
                        multi = torch.zeros_like(mv_l)
                        multi.scatter_(1, mv_t, 1.0)
                        multi[:, 0] = 0.0  # id 0 = no move
                        loss_sets = F.cross_entropy(it_l, it_t) + F.cross_entropy(ab_l, ab_t) + F.binary_cross_entropy_with_logits(
                            mv_l, multi, reduction="sum"
                        ) / max(1, len(mv_l)) / 4
                        item_acc = (it_l.argmax(1) == it_t).float().mean().item()
                        abil_acc = (ab_l.argmax(1) == ab_t).float().mean().item()
                    else:
                        loss_sets, item_acc, abil_acc = torch.zeros((), device=dev), 0.0, 0.0
                    loss = pw * (pg - ent_coef * ent + a.za * za) + a.vf * vloss + a.foe * loss_foe + a.sets * loss_sets
                    (loss * w).backward()
                    with torch.no_grad():
                        lr_ = lp - Flp[idx]
                        acc["kl"] += w * ((lr_.exp() - 1) - lr_).mean().item()
                        acc["clipfrac"] += w * ((ratio - 1).abs() > a.clip).float().mean().item()
                    acc["pg"] += w * pg.item()
                    acc["vloss"] += w * vloss.item()
                    acc["ent"] += w * ent.item()
                    acc["za"] += w * za.item()
                    acc["foe_acc"] += w * foe_acc
                    acc["item_acc"] += w * item_acc
                    acc["abil_acc"] += w * abil_acc
                    acc["loss_foe"] += w * loss_foe.item()
                    acc["loss_sets"] += w * loss_sets.item()
                    del o, logits, logp_all, loss
                if not pw:
                    for p in trunk:  # heads only: AdamW skips params without grads (no decay either)
                        p.grad = None
                torch.nn.utils.clip_grad_norm_(net.parameters(), a.grad_clip)
                opt.step()
                nb += 1
            if not math.isfinite(acc["pg"]):
                break
        for k in acc:
            acc[k] /= max(nb, 1)
        if not all(math.isfinite(v) for v in acc.values()):
            save_bad = out / f"nan-{st['update']}.pt"
            torch.save(dict(model=net.state_dict(), state=st), save_bad)
            raise SystemExit(f"non-finite loss at update {st['update']}; saved {save_bad}")
        with torch.no_grad():
            vr = Fret[flat]
            ev = 1 - (vr - Fval[flat]).var() / (vr.var() + 1e-8)

        dt = time.time() - tr0
        st["update"] += 1
        st["decisions"] += N
        s1 = envs.stats()
        games = s1["games"] - stats0["games"]
        st["games"] += games
        turns = (s1["turns"] - stats0["turns"]) / max(games, 1)
        draws = (s1["draws"] - stats0["draws"]) / max(games, 1)
        stats0 = s1

        if time.time() - last_eval >= a.eval_minutes * 60 or (budget and time.time() - t0 + dt >= budget):
            evals = {b: eval_vs(net, b, gens, a.eval_games, st["update"], catalog, dev) for b in EVAL_BOTS}
            # Cycle check (vs the latest snapshot) and tripwire (vs the warm start).
            snaps = sorted(out.glob("snap-*.pt"), key=lambda p: int(p.stem[5:]))
            for name, ref in (("prev", snaps[-1] if snaps else None), ("init", st.get("init"))):
                if ref:
                    r = eval_vs(net, f"net:{ref}", gens, a.eval_games // 2, st["update"], catalog, dev)
                    refs[name] = sum(r.values()) / len(r)
            n_evals += 1
            if a.eval10k_games and n_evals % a.eval10k_every == 0:
                r10 = eval_vs(net, "mcts:10000", gens, a.eval10k_games, st["update"], catalog, dev)
                with open(out / "eval10k.csv", "a") as ef:  # separate file so log.csv's header stays stable on resume
                    ef.write(f"{st['update']},{(sec0 + time.time() - t0) / 3600:.3f},{st['games']},"
                             + ",".join(f"{r10[g]:.3f}" for g in gens) + "\n")
                print(f"u{st['update']} mcts:10000 " + " ".join(f"g{g}:{r10[g]:.2f}" for g in gens)
                      + f" | all {sum(r10.values()) / len(r10):.3f}", flush=True)
            last_eval = time.time()
        row = [st["update"], f"{(sec0 + time.time() - t0) / 3600:.3f}", st["games"], st["decisions"], f"{N / dt:.0f}", N,
               f"{ent_coef:.4f}"] + [f"{acc[k]:.4f}" for k in ("pg", "vloss", "ent", "za", "kl", "clipfrac")] + [
            f"{ev.item():.3f}", f"{acc['foe_acc']:.3f}", f"{acc['item_acc']:.3f}", f"{acc['abil_acc']:.3f}",
            f"{acc['loss_foe']:.3f}", f"{acc['loss_sets']:.3f}", f"{turns:.1f}", f"{draws:.3f}", s1["illegal"],
            s1["panics"], f"{refs['prev']:.3f}" if evals and "prev" in refs else "", f"{refs['init']:.3f}" if evals and "init" in refs else ""] + [f"{evals[b][g]:.3f}" if evals else "" for b in EVAL_BOTS for g in gens]
        log.writerow(row)
        logf.flush()
        with open(out / "mem.csv", "a") as mf:  # separate file so log.csv's header stays stable on resume
            mf.write(f"{st['update']},{psutil.Process().memory_info().rss >> 20},"
                     f"{torch.cuda.memory_reserved() >> 20}\n")
        ev_s = " | ".join(f"{b} " + " ".join(f"g{g}:{evals[b][g]:.2f}" for g in gens) for b in evals) if evals else ""
        if evals:
            ev_s += "".join(f" | vs {k} {v:.3f}" for k, v in refs.items())
        print(
            f"u{st['update']} {st['games']:,}g {N / dt:,.0f}dps (roll {t_roll:.1f}s/{dt:.1f}s) ent {acc['ent']:.2f} "
            f"v {acc['vloss']:.3f} ev {ev.item():.2f} kl {acc['kl']:.4f} foe {acc['foe_acc']:.2f} "
            f"item {acc['item_acc']:.2f} turns {turns:.0f} {ev_s}",
            flush=True,
        )
        if evals:
            evals, refs = {}, {}
        if time.time() - last_ckpt >= a.ckpt_minutes * 60:
            save()
            torch.save(dict(model=net.state_dict(), state=dict(st)), out / f"snap-{int(st['games'])}.pt")
            last_ckpt = time.time()
    save()
    torch.save(dict(model=net.state_dict(), state=dict(st)), out / f"snap-{int(st['games'])}.pt")
    print(f"done: {st['update']} updates, {st['games']:,} games, {st['decisions']:,} decisions")


if __name__ == "__main__":
    main()
