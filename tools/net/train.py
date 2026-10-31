"""Train the Master value/policy network on featurized selfplay data.

    tools\\net\\.venv\\Scripts\\python.exe tools\\net\\train.py --data tools\\net\\data\\feat\\<run> [--size small|large]

Data comes from packages/ai/scripts/featurize.ts (layout in meta.json). The
model is a small transformer over 13 tokens: 12 Pokémon (own six, then the
foe's, in slot order) and the field. Heads:
- value: the deciding side's chance to win;
- policy: Hard's visit shares over 14 option slots (moves, mega moves, switches);
- foe action: the foe's visit shares in the same world;
- foe sets: each foe Pokémon's item, ability and moves (per attribute, so any pool
  works). Names are randomly hidden in training (ID dropout) so new sets still read.
Battles are split 90/10 so no battle is in both train and validation.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F

MON_BASE = 40
MOVE_F = 29
SLOTS = 14
VOCAB = dict(species=1536, items=512, abilities=768, moves=1024)
# The last id of each table is reserved as "unknown" (ID dropout, and names a
# future pool adds before the net is retrained).
UNKNOWN = {k: v - 1 for k, v in VOCAB.items()}
ID_DROPOUT = 0.15
VALUE_WEIGHT = 1.0
DROPOUT = 0.0

SIZES = {
    "small": dict(d=128, layers=3, heads=4, ffn=256, dm=48),
    "large": dict(d=256, layers=4, heads=8, ffn=512, dm=64),
}


class Data:
    def __init__(self, path: Path, frac: float = 1.0, in_ram: bool = False):
        m = json.loads((path / "meta.json").read_text())
        self.meta = m
        n = m["rows"]
        self.n = n
        self.x = np.memmap(path / "x.bin", np.float16, "r", shape=(n, m["floats"]))
        self.ids = np.memmap(path / "ids.bin", np.uint16, "r", shape=(n, m["tokens"] * m["ids"]))
        if in_ram:
            self.x, self.ids = np.array(self.x), np.array(self.ids)
        self.y = np.fromfile(path / "y.bin", np.float32).reshape(n, m["y"])
        L = m["yLayout"]
        battle = self.y[:, L["battle"]].astype(np.int64)
        # A fixed hash of the battle number, so the split is stable as data grows.
        h = (battle * 2654435761) % 2**32
        val = h % 10 == 0
        # Learning-curve subsets keep whole battles and a fixed validation set.
        keep = ~val & ((h // 10) % 1000 < frac * 1000)
        self.train_idx = np.nonzero(keep)[0]
        self.val_idx = np.nonzero(val)[0]

    def batch(self, idx: np.ndarray, device: torch.device):
        idx = np.sort(idx)
        x = torch.from_numpy(np.asarray(self.x[idx], dtype=np.float32)).to(device, non_blocking=True)
        ids = torch.from_numpy(np.asarray(self.ids[idx], dtype=np.int64)).to(device, non_blocking=True)
        y = torch.from_numpy(self.y[idx]).to(device, non_blocking=True)
        return x, ids, y


class Net(nn.Module):
    def __init__(self, meta: dict, d: int, layers: int, heads: int, ffn: int, dm: int):
        super().__init__()
        self.tokens = meta["tokens"]
        self.mon_f = meta["monF"]
        self.field_f = meta["fieldF"]
        self.n_ids = meta["ids"]
        self.species = nn.Embedding(VOCAB["species"], d)
        self.item = nn.Embedding(VOCAB["items"], d)
        self.ability = nn.Embedding(VOCAB["abilities"], d)
        self.move_emb = nn.Embedding(VOCAB["moves"], dm)
        self.id_dropout = ID_DROPOUT
        self.mon_in = nn.Sequential(nn.LayerNorm(MON_BASE), nn.Linear(MON_BASE, d))
        self.move_in = nn.Sequential(
            nn.Linear(dm + MOVE_F, d), nn.GELU(), nn.Linear(d, d)
        )
        self.field_in = nn.Sequential(nn.LayerNorm(self.field_f), nn.Linear(self.field_f, d))
        self.pos = nn.Parameter(torch.zeros(self.tokens + 1, d))
        layer = nn.TransformerEncoderLayer(d, heads, ffn, dropout=DROPOUT, batch_first=True, norm_first=True, activation="gelu")
        self.encoder = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)
        self.value = nn.Sequential(nn.Linear(2 * d, d), nn.GELU(), nn.Linear(d, 1))
        # Move and mega logits from (the active Pokémon, the move); switch logits from each bench token.
        self.move_head = nn.Sequential(nn.Linear(2 * d, d), nn.GELU(), nn.Linear(d, 2))
        self.switch_head = nn.Linear(2 * d, 1)
        self.foe_move_head = nn.Sequential(nn.Linear(2 * d, d), nn.GELU(), nn.Linear(d, 2))
        self.foe_switch_head = nn.Linear(2 * d, 1)
        # The foe's hidden set, per attribute, so it works with any pool.
        self.item_head = nn.Linear(d, VOCAB["items"])
        self.ability_head = nn.Linear(d, VOCAB["abilities"])
        self.moves_head = nn.Linear(d, VOCAB["moves"])

    def drop_ids(self, ids: torch.Tensor) -> torch.Tensor:
        """Replace a share of names with "unknown", so the floats carry the meaning too."""
        if not self.training or self.id_dropout <= 0:
            return ids
        unk = torch.tensor(
            [UNKNOWN["species"], UNKNOWN["items"], UNKNOWN["abilities"]] + [UNKNOWN["moves"]] * 4,
            device=ids.device,
        )
        drop = torch.rand(ids.shape, device=ids.device) < self.id_dropout
        return torch.where(drop, unk.expand_as(ids), ids)

    def forward(self, x: torch.Tensor, ids: torch.Tensor):
        B, T = x.shape[0], self.tokens
        mons = x[:, : T * self.mon_f].reshape(B, T, self.mon_f)
        field = x[:, T * self.mon_f :]
        ids = self.drop_ids(ids.reshape(B, T, self.n_ids))
        moves_f = mons[:, :, MON_BASE:].reshape(B, T, 4, MOVE_F)
        mv = self.move_in(torch.cat([self.move_emb(ids[:, :, 3:7]), moves_f], -1))  # B,T,4,d
        mon = (
            self.mon_in(mons[:, :, :MON_BASE])
            + self.species(ids[:, :, 0])
            + self.item(ids[:, :, 1])
            + self.ability(ids[:, :, 2])
            + mv.sum(2)
        )
        h = torch.cat([mon, self.field_in(field)[:, None]], 1) + self.pos
        h = self.norm(self.encoder(h))
        pooled = torch.cat([h[:, -1], h[:, :T].mean(1)], -1)
        value = self.value(pooled).squeeze(-1)

        active = mons[:, :, 1]  # B,T
        def side_logits(lo: int, move_head, switch_head):
            a = active[:, lo : lo + 6]
            act = (h[:, lo : lo + 6] * a[..., None]).sum(1)  # B,d
            act_mv = (mv[:, lo : lo + 6] * a[..., None, None]).sum(1)  # B,4,d
            m = move_head(torch.cat([act[:, None].expand(-1, 4, -1), act_mv], -1))  # B,4,2
            s = switch_head(torch.cat([h[:, lo : lo + 6], act[:, None].expand(-1, 6, -1)], -1)).squeeze(-1)
            return torch.cat([m[..., 0], m[..., 1], s], -1)  # B,14

        policy = side_logits(0, self.move_head, self.switch_head)
        foe = side_logits(6, self.foe_move_head, self.foe_switch_head)
        foe_h = h[:, 6:12]
        sets = (self.item_head(foe_h), self.ability_head(foe_h), self.moves_head(foe_h))
        return value, policy, foe, sets


def soft_ce(logits: torch.Tensor, target: torch.Tensor, mask: torch.Tensor):
    logits = logits.masked_fill(mask <= 0, -1e9)
    return -(target * F.log_softmax(logits, -1)).sum(-1)


def losses(out, y: torch.Tensor, L: dict):
    value, policy, foe, (item_l, abil_l, moves_l) = out
    S = SLOTS
    pol, pmask = y[:, L["policy"] : L["policy"] + S], y[:, L["mask"] : L["mask"] + S]
    fpol, fmask = y[:, L["foePolicy"] : L["foePolicy"] + S], y[:, L["foeMask"] : L["foeMask"] + S]
    v = y[:, L["value"]]
    has_foe = fpol.sum(-1) > 0.5
    zero = torch.zeros_like(v)
    lv = F.binary_cross_entropy_with_logits(value, v, reduction="none")
    lp = soft_ce(policy, pol, pmask)
    lf = torch.where(has_foe, soft_ce(foe, fpol, fmask), zero)

    # The foe's true set per attribute (-1 where unknown).
    fi = y[:, L["foeItems"] : L["foeItems"] + 6].long()
    fa = y[:, L["foeAbilities"] : L["foeAbilities"] + 6].long()
    fm = y[:, L["foeMoves"] : L["foeMoves"] + 24].long().reshape(-1, 6, 4)
    li = F.cross_entropy(item_l.reshape(-1, VOCAB["items"]), fi.reshape(-1), ignore_index=-1, reduction="none").reshape(-1, 6)
    la = F.cross_entropy(abil_l.reshape(-1, VOCAB["abilities"]), fa.reshape(-1), ignore_index=-1, reduction="none").reshape(-1, 6)
    known_m = (fm >= 0).any(-1)  # B,6
    hot = torch.zeros_like(moves_l)
    hot.scatter_(-1, fm.clamp(min=0), (fm >= 0).float())
    lm = F.binary_cross_entropy_with_logits(moves_l, hot, reduction="none").sum(-1) / 4  # B,6
    lm = lm * known_m
    n_i, n_a, n_m = (fi >= 0).float().sum(-1), (fa >= 0).float().sum(-1), known_m.float().sum(-1)
    ls = li.sum(-1) / n_i.clamp(min=1) + la.sum(-1) / n_a.clamp(min=1) + lm.sum(-1) / n_m.clamp(min=1)

    top4 = moves_l.topk(4, -1).indices  # B,6,4
    hits = (top4[..., :, None] == fm[..., None, :]).any(-2) & (fm >= 0)  # B,6,4
    stats = {
        "value": lv,
        "value_acc": ((value > 0) == (v > 0.5)).float(),
        "policy": lp,
        "policy_top1": (policy.masked_fill(pmask <= 0, -1e9).argmax(-1) == pol.argmax(-1)).float(),
        "foe": lf,
        "foe_top1": torch.where(has_foe, (foe.masked_fill(fmask <= 0, -1e9).argmax(-1) == fpol.argmax(-1)).float(), zero),
        "has_foe": has_foe.float(),
        "item_hit": ((item_l.argmax(-1) == fi) & (fi >= 0)).float().sum(-1),
        "item_n": n_i,
        "ability_hit": ((abil_l.argmax(-1) == fa) & (fa >= 0)).float().sum(-1),
        "ability_n": n_a,
        "moves_hit": hits.float().sum((-1, -2)),
        "moves_n": (fm >= 0).float().sum((-1, -2)),
    }
    total = lv * VALUE_WEIGHT + lp + 0.5 * lf + 0.1 * ls
    return total.mean(), stats


def hp_baseline(data: Data) -> float:
    """Validation log loss of a logistic fit on HP and Pokémon-count differences."""
    m = data.meta
    T, mf = m["tokens"], m["monF"]
    def feats(idx):
        x = np.asarray(data.x[idx][:, : T * mf], dtype=np.float32).reshape(len(idx), T, mf)
        hp = x[:, :, 3] * x[:, :, 2]
        alive = x[:, :, 2]
        return np.stack([hp[:, :6].sum(1) - hp[:, 6:].sum(1), alive[:, :6].sum(1) - alive[:, 6:].sum(1)], 1)
    L = m["yLayout"]
    tr, va = data.train_idx, data.val_idx
    xt, xv = torch.tensor(feats(tr)), torch.tensor(feats(va))
    yt, yv = torch.tensor(data.y[tr, L["value"]]), torch.tensor(data.y[va, L["value"]])
    w = torch.zeros(3, requires_grad=True)
    opt = torch.optim.LBFGS([w], max_iter=200)
    def closure():
        opt.zero_grad()
        loss = F.binary_cross_entropy_with_logits(xt @ w[:2] + w[2], yt)
        loss.backward()
        return loss
    opt.step(closure)
    with torch.no_grad():
        return F.binary_cross_entropy_with_logits(xv @ w[:2] + w[2], yv).item()


@torch.no_grad()
def evaluate(model: Net, data: Data, device, batch: int) -> dict:
    """Validation metrics, with value and policy also split by in-pool vs varied-pool battles."""
    model.eval()
    L = data.meta["yLayout"]
    sums: dict[str, float] = {}
    def add(k, v):
        sums[k] = sums.get(k, 0.0) + v
    for i in range(0, len(data.val_idx), batch):
        idx = data.val_idx[i : i + batch]
        x, ids, y = data.batch(idx, device)
        with torch.autocast(device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
            out = model(x, ids)
        _, st = losses(to_float(out), y, L)
        varied = y[:, L["varied"]] > 0.5
        for k, v in st.items():
            add(k, v.sum().item())
        for name, g in (("pool", ~varied), ("varied", varied)):
            add(f"n_{name}", g.float().sum().item())
            for k in ("value", "value_acc", "policy", "policy_top1"):
                add(f"{k}_{name}", (st[k] * g).sum().item())
    model.train()
    n = len(data.val_idx)
    hf = max(sums["has_foe"], 1)
    ev = {
        "value": sums["value"] / n,
        "value_acc": sums["value_acc"] / n,
        "policy": sums["policy"] / n,
        "policy_top1": sums["policy_top1"] / n,
        "foe": sums["foe"] / hf,
        "foe_top1": sums["foe_top1"] / hf,
        "item_acc": sums["item_hit"] / max(sums["item_n"], 1),
        "ability_acc": sums["ability_hit"] / max(sums["ability_n"], 1),
        "moves_recall4": sums["moves_hit"] / max(sums["moves_n"], 1),
    }
    for name in ("pool", "varied"):
        g = sums[f"n_{name}"]
        ev[f"n_{name}"] = g
        for k in ("value", "value_acc", "policy", "policy_top1"):
            ev[f"{k}_{name}"] = sums[f"{k}_{name}"] / g if g else float("nan")
    return ev


def to_float(out):
    return tuple(o.float() if torch.is_tensor(o) else tuple(t.float() for t in o) for o in out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", type=Path, required=True)
    ap.add_argument("--size", choices=SIZES, default="small")
    ap.add_argument("--epochs", type=float, default=10)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--wd", type=float, default=0.05)
    ap.add_argument("--out", type=Path, default=None)
    ap.add_argument("--eval-every", type=int, default=0, help="steps between evals (0: once per epoch)")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--frac", type=float, default=1.0, help="fraction of training battles to use (learning curves)")
    ap.add_argument("--steps", type=int, default=0, help="fixed step budget, overrides --epochs")
    ap.add_argument("--in-ram", action="store_true", help="load x/ids into RAM instead of memory-mapping")
    ap.add_argument("--value-weight", type=float, default=1.0)
    ap.add_argument("--dropout", type=float, default=0.0)
    args = ap.parse_args()
    global VALUE_WEIGHT, DROPOUT
    VALUE_WEIGHT, DROPOUT = args.value_weight, args.dropout

    torch.manual_seed(args.seed)
    rng = np.random.default_rng(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    data = Data(args.data, args.frac, args.in_ram)
    model = Net(data.meta, **SIZES[args.size]).to(device)
    params = sum(p.numel() for p in model.parameters())
    print(f"{device}; {data.n} rows, train {len(data.train_idx)} / val {len(data.val_idx)}; {args.size} {params / 1e6:.2f}M params")
    print(f"baselines (val value log loss): coin {math.log(2):.4f}, HP+count logistic {hp_baseline(data):.4f}")

    steps_per_epoch = max(1, len(data.train_idx) // args.batch)
    total = args.steps or int(args.epochs * steps_per_epoch)
    eval_every = args.eval_every or steps_per_epoch
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.wd, betas=(0.9, 0.98))
    warm = min(500, total // 10 + 1)
    sched = torch.optim.lr_scheduler.LambdaLR(
        opt, lambda s: min(1, (s + 1) / warm) * 0.5 * (1 + math.cos(math.pi * min(1, s / max(1, total))))
    )
    L = data.meta["yLayout"]
    out_dir = args.out or (args.data / f"model-{args.size}")
    out_dir.mkdir(parents=True, exist_ok=True)
    log = []
    best = float("inf")
    t0 = time.time()
    step = 0
    while step < total:
        perm = rng.permutation(data.train_idx)
        for i in range(0, len(perm) - args.batch + 1, args.batch):
            x, ids, y = data.batch(perm[i : i + args.batch], device)
            with torch.autocast(device.type, dtype=torch.bfloat16, enabled=device.type == "cuda"):
                out = model(x, ids)
            loss, _ = losses(to_float(out), y, L)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            step += 1
            if step % eval_every == 0 or step == total:
                ev = evaluate(model, data, device, 2048)
                ev.update(step=step, epoch=step / steps_per_epoch, train_loss=loss.item(), secs=time.time() - t0)
                log.append(ev)
                print(
                    f"step {step} ep {ev['epoch']:.1f} train {ev['train_loss']:.3f} | val value {ev['value']:.4f} "
                    f"(acc {ev['value_acc']:.3f}) policy {ev['policy']:.3f} top1 {ev['policy_top1']:.3f} "
                    f"foe top1 {ev['foe_top1']:.3f} | item {ev['item_acc']:.3f} ability {ev['ability_acc']:.3f} "
                    f"moves@4 {ev['moves_recall4']:.3f} | pool/varied value {ev['value_pool']:.4f}/{ev['value_varied']:.4f} "
                    f"top1 {ev['policy_top1_pool']:.3f}/{ev['policy_top1_varied']:.3f} | {ev['secs']:.0f}s",
                    flush=True,
                )
                if ev["value"] + ev["policy"] < best:
                    best = ev["value"] + ev["policy"]
                    torch.save({"model": model.state_dict(), "size": args.size, "meta": {k: v for k, v in data.meta.items() if k != "names"}}, out_dir / "best.pt")
            if step >= total:
                break
    (out_dir / "log.json").write_text(json.dumps(log, indent=1))
    print(f"done; best checkpoint in {out_dir}")


if __name__ == "__main__":
    main()
