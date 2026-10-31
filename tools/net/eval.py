"""Head-to-head matches in the native env (plan-rl R6).

Players: "random", "greedy", "mcts:<iterations>" (full-information poke-engine
MCTS, the Hard-proxy) or "net:<checkpoint>" (greedy policy, no search).

    .venv\\Scripts\\python.exe eval.py net:data\\rl\\warm\\warm.pt mcts:1000 --games 200
"""
import argparse
import sys
import time
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from rl import match, player  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("a")
    p.add_argument("b")
    p.add_argument("--gens", default="3,4,5,6")
    p.add_argument("--games", type=int, default=200, help="per gen")
    p.add_argument("--battles", type=int, default=256, help="in flight per gen")
    p.add_argument("--seed", type=int, default=1)
    a = p.parse_args()
    gens = [int(g) for g in a.gens.split(",")]
    rng = np.random.default_rng(a.seed)
    catalog = str(HERE / "data" / "catalog")
    t = time.time()
    res = match(player(a.a, "cuda", rng), player(a.b, "cuda", rng), gens, a.games, a.seed, catalog, a.battles)
    avg = sum(res.values()) / len(res)
    se = (0.25 / (a.games * len(res))) ** 0.5
    print(
        f"{a.a} vs {a.b}: " + " ".join(f"g{g}:{v:.3f}" for g, v in res.items())
        + f" | all {avg:.3f} +/-{1.96 * se:.3f} ({time.time() - t:.0f}s)"
    )


if __name__ == "__main__":
    main()
