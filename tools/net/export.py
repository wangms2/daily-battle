"""Exports a trained model v2 for the game (plan-rl R8): the weights as a .dbnet
file the engine's WASM loads (packages/engine-wasm/rust/src/net.rs), plus a
parity fixture of env observations and PyTorch's outputs for them.

    .venv\\Scripts\\python.exe export.py [checkpoint] [--out data\\export\\net]

checkpoint defaults to the newest snapshot of the pilot run. Runs on the CPU only.

.dbnet layout (little-endian):
    b"DBNET\\0\\0\\0", u32 format version, u32 n, n u32 config values
    (d, layers, heads, ffn, emb), u32 tensor count, then per tensor:
    u16 name length, name (UTF-8), u8 ndim, ndim u32 dims, u8 dtype (1 = f16), data.

Fixture (.fix) layout: u32 rows, then per row OBS_FLOATS f32, OBS_IDS u16,
ACTIONS u8 mask, then policy logits (ACTIONS f32), value logit (f32), foe-action
logits (ACTIONS f32). The outputs use the f16-rounded weights, so the WASM must
match them to float precision.
"""
import argparse
import struct
import sys
from pathlib import Path

import numpy as np
import torch

from model import ACTIONS, OBS_FLOATS, OBS_IDS, Config, Net

HERE = Path(__file__).parent
MAGIC = b"DBNET\0\0\0"
FORMAT = 1
F16 = 1


def latest_snapshot(run: Path) -> Path:
    snaps = sorted(run.glob("snap-*.pt"), key=lambda p: int(p.stem.split("-")[1]))
    if not snaps:
        raise SystemExit(f"no snapshots in {run}")
    return snaps[-1]


def write_weights(net: Net, path: Path) -> int:
    c = net.c
    sd = net.state_dict()
    with open(path, "wb") as f:
        f.write(MAGIC)
        cfg = [c.d, c.layers, c.heads, c.ffn, c.emb]
        f.write(struct.pack(f"<II{len(cfg)}I", FORMAT, len(cfg), *cfg))
        f.write(struct.pack("<I", len(sd)))
        for name, t in sd.items():
            b = name.encode()
            f.write(struct.pack("<H", len(b)) + b)
            f.write(struct.pack(f"<B{t.dim()}I", t.dim(), *t.shape))
            f.write(struct.pack("<B", F16))
            f.write(t.detach().cpu().to(torch.float16).numpy().astype("<f2").tobytes())
    return path.stat().st_size


def sample_rows(per_gen: int, seed: int):
    """Observations from random-play battles in every gen, at varied turns."""
    rows = []
    rng = np.random.default_rng(seed)
    for gen in (3, 4, 5, 6):
        pe = __import__(f"pe_env_gen{gen}")
        env = pe.VecEnv(16, seed + gen, str(HERE / "data" / "catalog"))
        got = 0
        for step in range(400):
            f, i, m, n = env.observe()
            if step % 7 == 3:
                for r in np.flatnonzero(n & m.any(1))[:4]:
                    rows.append((f[r].copy(), i[r].copy(), m[r].copy()))
                    got += 1
            if got >= per_gen:
                break
            env.step((rng.random(m.shape) * m).argmax(1).astype(np.int64))
    return rows


def main():
    p = argparse.ArgumentParser()
    p.add_argument("checkpoint", nargs="?")
    p.add_argument("--out", default=str(HERE / "data" / "export" / "net"))
    p.add_argument("--rows", type=int, default=64, help="fixture rows per gen")
    p.add_argument("--seed", type=int, default=7)
    a = p.parse_args()
    torch.set_num_threads(4)
    sys.path.insert(0, str(HERE))

    ck_path = Path(a.checkpoint) if a.checkpoint else latest_snapshot(HERE / "data" / "rl" / "pilot")
    ck = torch.load(ck_path, map_location="cpu", weights_only=False)
    net = Net(Config())
    net.load_state_dict(ck["model"])
    net.eval()
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    size = write_weights(net, out.with_suffix(".dbnet"))
    print(f"{ck_path.name}: {size / 2**20:.1f} MiB -> {out.with_suffix('.dbnet')}")

    rows = sample_rows(a.rows, a.seed)
    f = torch.from_numpy(np.stack([r[0] for r in rows]))
    i = torch.from_numpy(np.stack([r[1] for r in rows]).astype(np.int64))
    m = torch.from_numpy(np.stack([r[2] for r in rows]))
    with torch.no_grad():
        full = net(f, i, m)
        for t in net.state_dict().values():
            if t.is_floating_point():
                t.copy_(t.to(torch.float16).float())
        half = net(f, i, m)
    legal = m.float()
    agree = (full["policy"].argmax(1) == half["policy"].argmax(1)).float().mean().item()
    dv = (torch.sigmoid(full["value"]) - torch.sigmoid(half["value"])).abs().max().item()
    print(f"fixture {len(rows)} rows; f16 vs f32 weights: policy argmax agree {agree:.1%}, max |dP(win)| {dv:.4f}")
    assert legal.sum(1).min() > 0

    with open(out.with_suffix(".fix"), "wb") as fh:
        fh.write(struct.pack("<I", len(rows)))
        for r in range(len(rows)):
            fh.write(f[r].numpy().astype("<f4").tobytes())
            fh.write(i[r].numpy().astype("<u2").tobytes())
            fh.write(m[r].numpy().astype(np.uint8).tobytes())
            fh.write(half["policy"][r].numpy().astype("<f4").tobytes())
            fh.write(half["value"][r : r + 1].numpy().astype("<f4").tobytes())
            fh.write(half["foe_action"][r].numpy().astype("<f4").tobytes())
    print(f"-> {out.with_suffix('.fix')}")


if __name__ == "__main__":
    main()
