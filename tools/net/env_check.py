"""Hand-check of observation v3 in the self-play env (plan R1/R2).

    .venv\\Scripts\\python.exe env_check.py [--gens 3,4,5,6] [--n 256] [--steps 300]

Checks, every step, each row against the foe row's own (fully visible) view:
- an unseen foe token has only `exists` set and unknown ids;
- a seen foe's species and each revealed move id are the foe's real ones;
- the foe's true Speed lies inside its Speed bounds;
- history ids and the move tokens agree on what's revealed;
- matchup tokens name only seen foes, in order, and show the foe's damage for
  revealed moves only.
Then prints one battle's reveals turn by turn for reading by eye.
Set PE_ENV_DIR to check staged env builds.
"""
import argparse
import importlib
import os
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
if os.environ.get("PE_ENV_DIR"):  # staged env builds, e.g. while training holds the .pyd files
    sys.path.insert(0, os.environ["PE_ENV_DIR"])
MON = 165
BASE = 45
MOVE2 = 30
MATCH_FOES = 4
MATCH_F = 20
MATCH0 = 2903 - 6 * MATCH_FOES * MATCH_F
UNK = {"species": 1535, "item": 511, "ability": 767, "move": 1023}


def foe_tok(floats, i):
    return floats[:, (6 + i) * MON : (7 + i) * MON]


def own_tok(floats, i):
    return floats[:, i * MON : (i + 1) * MON]


def match_tok(floats, i, t):
    k = i * MATCH_FOES + t
    return floats[:, MATCH0 + k * MATCH_F : MATCH0 + (k + 1) * MATCH_F]


def check_matchups(floats, fail):
    """Matchup tokens (obs v3): own slot i vs the foe's active, then its other seen,
    unfainted slots. Foe damage shows only for revealed moves; empty tokens are zero."""
    foe_seen = np.stack([foe_tok(floats, j)[:, 40] > 0.5 for j in range(6)], 1)
    foe_active = np.stack([foe_tok(floats, j)[:, 1] > 0.5 for j in range(6)], 1)
    own_active = np.stack([own_tok(floats, i)[:, 1] > 0.5 for i in range(6)], 1)
    rows = np.arange(len(floats))
    for i in range(6):
        prev = np.full(len(floats), -1)
        for t in range(MATCH_FOES):
            x = match_tok(floats, i, t)
            on = x[:, 8] > 0.5
            if np.abs(x[~on]).max(initial=0) > 0:
                fail("match-empty", "an empty matchup token has floats")
            onehot = x[:, 12:18]
            tagged = onehot.sum(1) > 0.5
            j = onehot.argmax(1)
            if (onehot.sum(1) > 1.5).any():
                fail("match-onehot", "a matchup token names two foe slots")
            if (tagged & ~foe_seen[rows, j] & ~foe_active[rows, j]).any():
                fail("match-unseen", "a matchup token names an unseen foe")
            if t == 0 and (tagged & ~foe_active[rows, j]).any():
                fail("match-order", "the first matchup token isn't the foe's active")
            if t > 0 and (tagged & (j <= prev) & ~foe_active[rows, prev.clip(0)]).any():
                fail("match-order", "matchup foes out of slot order")
            prev = np.where(tagged, j, prev)
            if (on & ((x[:, 18] > 0.5) != own_active[:, i])).any():
                fail("match-own-active", "own-active flag wrong")
            if (on & ((x[:, 19] > 0.5) != foe_active[rows, j])).any():
                fail("match-foe-active", "foe-active flag wrong")
            for m in range(4):
                known = np.zeros(len(floats), bool)
                for jj in range(6):
                    known |= (j == jj) & (foe_tok(floats, jj)[:, BASE + m * MOVE2 + MOVE2 - 1] > 0.5)
                if (on & ~known & (x[:, 4 + m] != 0)).any():
                    fail("match-foe-move", "foe damage shown for an unrevealed move")


def check(gen: int, n: int, steps: int, seed: int):
    mod = importlib.import_module(f"pe_env_gen{gen}")
    env = mod.VecEnv(n, seed, str(HERE / "data" / "catalog"))
    rng = np.random.default_rng(seed)
    bad = {}
    counts = dict(seen=0, unseen=0, moves_known=0, item_known=0, ability_known=0, narrowed=0)

    def fail(k, msg):
        if k not in bad:
            print(f"  gen{gen} FAIL {k}: {msg}")
        bad[k] = bad.get(k, 0) + 1

    for _ in range(steps):
        floats, ids, mask, needs = env.observe()
        ids = ids.astype(np.int64)
        check_matchups(floats, fail)
        other = np.arange(2 * n) ^ 1
        for i in range(6):
            f = foe_tok(floats, i)
            truth = own_tok(floats[other], i)
            fid = ids[:, (6 + i) * 7 : (7 + i) * 7]
            tid = ids[other, i * 7 : (i + 1) * 7]
            seen = f[:, 40] > 0.5
            unseen = ~seen
            counts["seen"] += seen.sum()
            counts["unseen"] += unseen.sum()
            # Unseen: only x[2] (exists) may be set.
            rest = f[unseen].copy()
            rest[:, 2] = 0
            if np.abs(rest).max(initial=0) > 0:
                fail("unseen-floats", "an unseen foe token leaks floats")
            if unseen.any() and (fid[unseen] != [UNK["species"], UNK["item"], UNK["ability"]] + [UNK["move"]] * 4).any():
                fail("unseen-ids", "an unseen foe token leaks ids")
            if (f[unseen, 2] != truth[unseen, 2]).any() and (truth[unseen, 2] < 0.5).any():
                fail("unseen-fainted", "an unseen foe has fainted?")
            # Seen: species real; known item/ability/moves real, else unknown.
            if (fid[seen, 0] != tid[seen, 0]).any():
                fail("species", "seen species differs from the real one")
            for col, flag, unk, key in [(1, 41, UNK["item"], "item"), (2, 42, UNK["ability"], "ability")]:
                kn = seen & (f[:, flag] > 0.5)
                counts[f"{key}_known"] += kn.sum()
                if (fid[kn, col] != tid[kn, col]).any():
                    fail(key, f"known {key} differs from the real one")
                if (fid[seen & ~kn, col] != unk).any():
                    fail(key + "-leak", f"unknown {key} has a real id")
            for m in range(4):
                mk = seen & (f[:, BASE + m * MOVE2 + MOVE2 - 1] > 0.5)
                counts["moves_known"] += mk.sum()
                if (fid[mk, 3 + m] != tid[mk, 3 + m]).any():
                    fail("move", "known move differs from the real one")
                um = seen & ~mk
                if (fid[um, 3 + m] != UNK["move"]).any():
                    fail("move-leak", "unknown move has a real id")
                if np.abs(f[um, BASE + m * MOVE2 : BASE + (m + 1) * MOVE2]).max(initial=0) > 0:
                    fail("move-floats", "unknown move leaks floats")
            # Speed bounds hold the true effective Speed (stat, x1.5 with a Scarf).
            # An unrevealed Scarf may sit above the untouched prior; nothing else may.
            lo = np.rint(f[seen, 43] * 500)
            hi = np.rint(f[seen, 44] * 500)
            true_spe = np.rint(truth[seen, 43] * 500)
            base_spe = np.rint((f[seen, 9] * 500 - 36) / 2)
            prior_hi = np.floor((2 * base_spe + 99) * 11 / 10)
            scarf_ok = (hi == prior_hi) & (true_spe > hi)
            out = (true_spe < lo) | ((true_spe > hi) & ~scarf_ok)
            counts["narrowed"] += ((hi < prior_hi) | (lo > np.floor((2 * base_spe + 5) * 9 / 10))).sum()
            if out.any():
                k = np.flatnonzero(out)[0]
                fail("speed", f"true {true_spe[k]:.0f} outside [{lo[k]:.0f}, {hi[k]:.0f}] ({out.sum()} rows)")
                if bad["speed"] == 1:
                    row = np.flatnonzero(seen)[k]
                    print(f"    row {row} foe slot {i}; state: {env.state(row // 2)}")
        r = rng.random(mask.shape) * mask
        env.step(r.argmax(1).astype(np.int64))
    s = env.stats()
    print(
        f"gen{gen}: {'OK' if not bad else 'FAILED ' + str(bad)} | seen {counts['seen']}, unseen {counts['unseen']}, "
        f"moves known {counts['moves_known']}, items known {counts['item_known']}, abilities known {counts['ability_known']}, "
        f"speed narrowed {counts['narrowed']}, speed evidence {s['speed_evidence']}, games {s['games']}"
    )
    return not bad


def narrate(gen: int, seed: int, turns: int):
    """One battle from side one's view: the foe's revealed info after each step."""
    mod = importlib.import_module(f"pe_env_gen{gen}")
    env = mod.VecEnv(1, seed, str(HERE / "data" / "catalog"))
    rng = np.random.default_rng(seed)
    names = None
    try:
        import json

        names = json.loads(mod.names_json())
    except Exception:
        pass

    def nm(table, i):
        if i == {"species": UNK["species"], "items": UNK["item"], "abilities": UNK["ability"], "moves": UNK["move"]}[table]:
            return "?"
        if names:
            off = {"items": names["itemOffset"], "abilities": names["abilityOffset"]}.get(table, 0)
            lst = names[table]
            if 0 <= i - off < len(lst) and lst[i - off]:
                return lst[i - off]
        return str(i)

    print(f"\n--- gen{gen} narrated battle, side one's view of the foe ---")
    for t in range(turns):
        floats, ids, mask, needs = env.observe()
        f, x = floats[0], ids[0].astype(int)
        out = []
        for i in range(6):
            tok = f[(6 + i) * MON : (7 + i) * MON]
            if tok[40] < 0.5:
                continue
            fid = x[(6 + i) * 7 : (7 + i) * 7]
            mv = [nm("moves", m) for m in fid[3:] if m != UNK["move"]]
            out.append(
                f"{nm('species', fid[0])}{'*' if tok[1] > 0.5 else ''} hp {tok[3]:.2f} "
                f"item {nm('items', fid[1]) if tok[41] > 0.5 else '?'} abil {nm('abilities', fid[2]) if tok[42] > 0.5 else '?'} "
                f"spe [{tok[43] * 500:.0f},{tok[44] * 500:.0f}] moves {mv}"
            )
        print(f"step {t}: " + " | ".join(out))
        r = rng.random(mask.shape) * mask
        _, dones = env.step(r.argmax(1).astype(np.int64))
        if dones[0]:
            print("battle over")
            break
    print("state:", env.state(0)[:400])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--gens", default="3,4,5,6")
    p.add_argument("--n", type=int, default=256)
    p.add_argument("--steps", type=int, default=300)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--narrate", type=int, default=0, help="also narrate one battle of this gen")
    a = p.parse_args()
    ok = all([check(int(g), a.n, a.steps, a.seed) for g in a.gens.split(",")])
    if a.narrate:
        narrate(a.narrate, a.seed, 40)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
