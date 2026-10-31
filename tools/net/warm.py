"""Warm start (plan-rl R5): behavior-clone Hard's search on run1 into model v2.

Each run1 record is Hard's top world, the decider as side one, with Hard's
visit shares over its options. The env's `observe_states` turns it into
observation v2 conservatively (of the foe only the active and fainted Pokémon
seen, nothing revealed, no history). The policy head learns softened shares
(temperature, plus a share of uniform over legal options) so RL can still move
away from Hard. The value and foe heads are left to RL.

One streaming pass; the first file is held out for validation.

    .venv\\Scripts\\python.exe warm.py --out data\\rl\\warm\\warm.pt
"""
import argparse
import json
import random
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from model import ACTIONS, Config, Net  # noqa: E402
from rl import eval_vs, to_dev  # noqa: E402


def slot_of(key):
    kind, _, n = key.partition(":")
    i = int(n) if n.isdigit() else -1
    if kind == "move" and 0 <= i < 4:
        return i
    if kind == "mega" and 0 <= i < 4:
        return 4 + i
    if kind == "switch" and 0 <= i < 6:
        return 8 + i
    return -1


def records(files):
    for path in files:
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                b = json.loads(line)
                for d in b["decisions"]:
                    yield b["gen"], d["state"], d["turn"], d["s1"]


def chunks(files, envs, size, temp, uniform, rng):
    """Featurized, shuffled chunks: (floats f16, ids, mask, target, hard_top)."""
    pending = {g: [] for g in envs}
    total = 0

    def flush():
        parts = []
        for g, items in pending.items():
            if not items:
                continue
            f, i, m = envs[g].observe_states([s for s, _, _ in items], [t for _, t, _ in items])
            share = np.zeros((len(items), ACTIONS), np.float32)
            for r, (_, _, s1) in enumerate(items):
                for o in s1:
                    a = slot_of(o["c"])
                    if a >= 0:
                        share[r, a] += o["p"]
            share *= m
            keep = share.sum(1) > 0
            share, f, i, m = share[keep], f[keep], i[keep], m[keep]
            top = share.argmax(1)
            soft = np.where(m, share, 0) ** (1 / temp)
            soft /= soft.sum(1, keepdims=True)
            legal = m / m.sum(1, keepdims=True)
            target = (1 - uniform) * soft + uniform * legal
            parts.append((f.astype(np.float16), i, m, target.astype(np.float32), top))
            items.clear()
        if not parts:
            return None
        cat = [np.concatenate([p[k] for p in parts]) for k in range(5)]
        perm = rng.permutation(len(cat[0]))
        return [c[perm] for c in cat]

    for g, s, t, s1 in records(files):
        if g not in pending:
            continue
        pending[g].append((s, t, s1))
        total += 1
        if total >= size:
            total = 0
            out = flush()
            if out is not None:
                yield out
    out = flush()
    if out is not None:
        yield out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default=str(HERE / "data" / "raw" / "run1"))
    p.add_argument("--out", default=str(HERE / "data" / "rl" / "warm" / "warm.pt"))
    p.add_argument("--gens", default="3,4,5,6")
    p.add_argument("--chunk", type=int, default=65536)
    p.add_argument("--minibatch", type=int, default=1024)
    p.add_argument("--lr", type=float, default=3e-4)
    p.add_argument("--temp", type=float, default=1.25, help="soften Hard's shares: p^(1/temp)")
    p.add_argument("--uniform", type=float, default=0.1, help="share of uniform-over-legal mixed in")
    p.add_argument("--epochs", type=int, default=1)
    p.add_argument("--eval-games", type=int, default=400)
    a = p.parse_args()
    dev = "cuda"
    gens = [int(g) for g in a.gens.split(",")]
    catalog = str(HERE / "data" / "catalog")
    import importlib

    envs = {g: importlib.import_module(f"pe_env_gen{g}").VecEnv(1, 0, catalog) for g in gens}
    files = sorted(Path(a.data).glob("*.jsonl"))
    val_files, train_files = files[:1], files[1:]
    rng = np.random.default_rng(0)
    torch.manual_seed(0)
    net = Net(Config()).to(dev)
    opt = torch.optim.AdamW(net.parameters(), lr=a.lr, weight_decay=0.01)

    def batch_tensors(c, s):
        f, i, m, tgt, top = (x[s : s + a.minibatch] for x in c)
        ft, it, mt, _ = to_dev((f, i, m, m[:, 0]), dev)
        return ft.float(), it, mt, torch.from_numpy(tgt).to(dev), torch.from_numpy(top).to(dev)

    @torch.no_grad()
    def validate():
        net.eval()
        n = ce = agree = 0.0
        for c in chunks(val_files, envs, a.chunk, a.temp, a.uniform, rng):
            for s in range(0, len(c[0]), 4096):
                f, i, m, tgt, top = (x[s : s + 4096] for x in c)
                ft, it, mt, _ = to_dev((f, i, m, m[:, 0]), dev)
                with torch.autocast("cuda", torch.bfloat16):
                    lg = net(ft.float(), it, mt)["policy"].float()
                lp = torch.log_softmax(lg, -1)
                t = torch.from_numpy(tgt).to(dev)
                ce += -(t * torch.where(mt, lp, torch.zeros_like(lp))).sum().item()
                agree += (lg.argmax(1) == torch.from_numpy(top).to(dev)).sum().item()
                n += len(f)
        net.train()
        return ce / n, agree / n, int(n)

    t0 = time.time()
    rows = 0
    net.train()
    for ep in range(a.epochs):
        order = list(train_files)
        random.Random(ep).shuffle(order)
        for c in chunks(order, envs, a.chunk, a.temp, a.uniform, rng):
            for s in range(0, len(c[0]), a.minibatch):
                f, i, m, tgt, _ = batch_tensors(c, s)
                with torch.autocast("cuda", torch.bfloat16):
                    lg = net(f, i, m)["policy"].float()
                lp = torch.log_softmax(lg, -1)
                loss = -(tgt * torch.where(m, lp, torch.zeros_like(lp))).sum(1).mean()
                opt.zero_grad(set_to_none=True)
                loss.backward()
                torch.nn.utils.clip_grad_norm_(net.parameters(), 1.0)
                opt.step()
                rows += len(f)
            print(f"epoch {ep + 1}: {rows:,} rows, loss {loss.item():.3f}, {time.time() - t0:.0f}s", flush=True)
        ce, agree, n = validate()
        print(f"epoch {ep + 1} validation ({n:,} rows): soft-target CE {ce:.3f}, agrees with Hard's top {agree:.3f}")

    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save(dict(model=net.state_dict(), state=dict(rows=rows)), out)
    print(f"saved {out}")
    for bot in ("random", "greedy"):
        r = eval_vs(net, bot, gens, a.eval_games, 99, catalog, dev)
        print(f"vs {bot}: " + " ".join(f"g{g}:{v:.2f}" for g, v in r.items()))


if __name__ == "__main__":
    main()
