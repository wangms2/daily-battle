"""Training progress report: win rate vs MCTS-1000 -> Elo, and a rough estimate vs real Hard.

    .venv\\Scripts\\python.exe progress.py            # run "pilot", hourly rows
    .venv\\Scripts\\python.exe progress.py --every 0.5 --run pilot

The vs-Hard estimate chains measured matches (plan-rl R6 calibration): MCTS-1000 is
about -365 Elo vs real Hard (range -348..-380). Rough: confirm on Showdown (R8).
"""
import argparse
import csv
import math
from pathlib import Path

MCTS1000_VS_HARD = -365


def elo(p):
    p = min(max(p, 0.005), 0.995)
    return -400 * math.log10(1 / p - 1)


def win(d):
    return 1 / (1 + 10 ** (-d / 400))


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--run", default="pilot")
    a.add_argument("--every", type=float, default=1.0, help="hours per row")
    a.add_argument("--window", type=int, default=3, help="eval rounds averaged per row (smooths noise)")
    a = a.parse_args()
    rows = list(csv.DictReader(open(Path(__file__).parent / "data" / "rl" / a.run / "log.csv")))
    cols = [c for c in rows[0] if c.startswith("vs_mcts1000_g")]
    ev = [r for r in rows if r[cols[0]]]
    pts = [(float(r["hours"]), int(r["games"]), sum(float(r[c]) for c in cols) / len(cols),
            float(r["vs_init"] or "nan"), float(r["ent"])) for r in ev]

    print(f"{'hours':>6} {'games':>11} {'vs MCTS-1000':>13} {'Elo vs it':>10} {'est. vs Hard':>13} {'Elo vs Hard':>12} {'vs warm':>8} {'entropy':>8}")
    nxt = 0.0
    for i, (h, g, _, _, _) in enumerate(pts):
        if h + 1e-9 < nxt and i != len(pts) - 1:
            continue
        w = pts[max(0, i - a.window + 1): i + 1]
        p = sum(x[2] for x in w) / len(w)
        d = elo(p) + MCTS1000_VS_HARD
        print(f"{h:6.1f} {g:11,} {p:13.1%} {elo(p):+10.0f} {win(d):13.1%} {d:+12.0f} {w[-1][3]:8.1%} {w[-1][4]:8.2f}")
        nxt = h + a.every
    print("Goal: net alone 50% vs Hard (~86% vs MCTS-1000). Above ~85% vs MCTS-1000 the yardstick saturates:"
          " re-check snapshots with eval.py vs mcts:20000.")
    p10 = Path(__file__).parent / "data" / "rl" / a.run / "eval10k.csv"
    if p10.exists():
        r10 = [list(map(float, l.split(","))) for l in p10.read_text().split() if l]
        print("\nMain yardstick: win rate vs full-information MCTS-10000 (its strength vs real Hard is not"
              " calibrated; confirm with the Showdown gate)")
        print(f"{'hours':>6} {'games':>11} {'vs MCTS-10k':>12} {'Elo vs it':>10}  per gen")
        for i, r in enumerate(r10):
            w = r10[max(0, i - a.window + 1): i + 1]
            p = sum(sum(x[3:]) / len(x[3:]) for x in w) / len(w)
            print(f"{r[1]:6.1f} {int(r[2]):11,} {p:12.1%} {elo(p):+10.0f}  " + " ".join(f"{v:.2f}" for v in r[3:]))


if __name__ == "__main__":
    main()
