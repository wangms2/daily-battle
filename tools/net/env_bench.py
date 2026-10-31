"""Random-play benchmark and sanity check for the self-play env (plan R1 gate).

    .venv\\Scripts\\python.exe env_bench.py [--n 1024] [--steps 300] [--gens 3,4,5,6]

Gate: at least 30k decisions/s summed over gens stepped one after another, no
panics, no illegal picks, and battles finishing with sane lengths.
"""
import argparse
import importlib
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
CATALOG = HERE / "data" / "catalog"


def run(gen: int, n: int, steps: int, seed: int) -> dict:
    mod = importlib.import_module(f"pe_env_gen{gen}")
    d = mod.dims()
    t0 = time.perf_counter()
    env = mod.VecEnv(n, seed, str(CATALOG))
    t_reset = time.perf_counter() - t0
    rng = np.random.default_rng(seed)
    t_obs = t_step = 0.0
    for _ in range(steps):
        t0 = time.perf_counter()
        floats, ids, mask, needs = env.observe()
        t_obs += time.perf_counter() - t0
        assert floats.shape == (2 * n, d["floats"]) and ids.shape == (2 * n, d["ids"])
        assert np.isfinite(floats).all(), "non-finite features"
        assert (mask[needs].sum(1) > 0).all(), "a row must act but has no legal action"
        # A random legal action per row.
        r = rng.random(mask.shape) * mask
        actions = r.argmax(1).astype(np.int64)
        t0 = time.perf_counter()
        env.step(actions)
        t_step += time.perf_counter() - t0
    s = env.stats()
    s.update(gen=gen, reset_s=t_reset, obs_s=t_obs, step_s=t_step)
    s["decisions_per_s"] = s["decisions"] / (t_obs + t_step)
    s["avg_turns"] = s["turns"] / max(1, s["games"])
    s["panic_messages"] = mod.panic_messages()[:3]
    return s


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--n", type=int, default=1024)
    p.add_argument("--steps", type=int, default=300)
    p.add_argument("--gens", default="3,4,5,6")
    p.add_argument("--seed", type=int, default=1)
    a = p.parse_args()
    import sys

    sys.path.insert(0, str(HERE))
    for g in [int(x) for x in a.gens.split(",")]:
        s = run(g, a.n, a.steps, a.seed)
        print(
            f"gen{g}: {s['decisions_per_s']:,.0f} decisions/s "
            f"(observe {s['obs_s']:.1f}s, step {s['step_s']:.1f}s, reset {s['reset_s']:.1f}s) | "
            f"games {s['games']}, avg turns {s['avg_turns']:.1f}, side one wins {s['side_one_wins']}, "
            f"draws {s['draws']}, illegal {s['illegal']}, panics {s['panics']}, stuck {s['stuck']}, "
            f"unknown base {s['unknown_base']}, speed evidence {s['speed_evidence']}"
        )
        for m in s["panic_messages"]:
            print("  panic:", m[:300])


if __name__ == "__main__":
    main()
