# @daily-battle/gen

Seeded generators for the game's content (DESIGN.md §6): the **weekly pool of 12** and the **daily opponent**. The same date always produces the same output, for every player.

```ts
import { generatePool, generateOpponent, generateWeek, weekKey, dayKey } from '@daily-battle/gen';

generatePool(weekKey(new Date())); // { generatorVersion, week, species: [12 names], attempts }
generateOpponent(dayKey(new Date())); // { generatorVersion, day, style, team: [{ species, setId }] x6, attempts }
generateWeek('2026-10-19'); // { pool, opponents: [Mon..Sun] }, what M5's schedule files hold
```

## Keys and versioning

- **Dates** come from the player's local calendar date (§4.1). A week key is its Monday. The arithmetic runs on Y/M/D, so DST never shifts a key.
- **Seed keys** are `gen<GENERATOR_VERSION>:week:YYYY-MM-DD` and `gen<GENERATOR_VERSION>:day:YYYY-MM-DD`, hashed with cyrb128 into an sfc32 rng. The rng is self-contained, so a dependency upgrade can't change past days.
- **Bump `GENERATOR_VERSION`** (`src/config.ts`) whenever output could change: an algorithm change, any value in `CONFIG`, or a set data refresh.
  - `src/__fixtures__/golden.json` pins three full weeks, and its test fails until you either bump the version or regenerate the file on purpose (`pnpm --filter @daily-battle/gen golden`).
  - M5's published schedule files freeze what players actually see.

## Weekly pool (12 species)

Each pool has a quota of 2–4 **below-OU** species (tier other than `OU`/`(OU)`: UU, UUBL, NU, PU), chosen uniformly per attempt. The quota and the rest are drawn separately, without replacement, weighted by **√usage**. The pool is redrawn until all of these hold:

- **Top-tier cap:** at most 4 of the 15 most-used species.
- **Stealth Rock:** at least 1 setter (required).
- **Type coverage:** every _major offensive type_ has a checker in the pool, meaning a species that resists it, is immune by type, or has an immunity ability its sets use (Levitate, Flash Fire, and so on).
  - Major types are the STAB attacking types with at least 5% of usage-weighted share. Currently: Water, Steel, Dragon, Ground, Electric, Dark, Fighting, Ghost, Fire.
- **Role mix:** at least 3 offensive, 2 defensive, and 2 utility species.
- **Legality:** a legal 6-of-12 team exists.

Two constraints are **soft**: a pool with no Spikes or Toxic Spikes setter, or no hazard remover (Rapid Spin or Defog), is accepted only half the time each. About 68% of random pools have each anyway, so in practice about 81% of pools end up with each.

The player may pick any of a species' sets, so a species counts for a trait if any of its sets has it.

## Daily opponent (6 species, hidden sets)

Six distinct species are drawn by **√usage**, then one set each by set weight. The team is redrawn unless:

- It passes the `gen4ou` validator.
- It has at most 2 hazard-setting sets.
- It has at least one offensive set and at least one non-offensive set.

A team without a hazard remover is accepted only half the time.

**No item clause:** gen4ou has none, so items may repeat.

**Style** picks the AI's preset (§8.5) and is never shown to the player:

- `stall`: 3 or more defensive sets.
- `offense`: no defensive sets and 4 or more offensive ones.
- `balance`: everything else.

## Checking

```sh
pnpm --filter @daily-battle/gen check [--n 10000]
```

`src/verify.ts` checks the output with logic written separately from the generators. The script prints attempt counts, species variety, and the style mix, and exits non-zero on any failure. CI runs 10,000 seeds. Vitest runs 1,000.

Last run (2026-10-21, generator v2, `--n 10000`, 36s): **0 failures**.

- **Pools:**
  - 3.41 attempts on average, 30 at most. All 100 species appear.
  - The most common species are in about 30% of pools (Tyranitar, Azelf, Magnezone); the rarest in about 2%.
  - 81% of pools have a Spikes or Toxic Spikes setter, and 81% have a remover.
  - Below-OU species per pool: 2 in 24% of pools, 3 in 33%, 4 in 43%.
- **Opponents:**
  - 1.69 attempts on average, 10 at most. All 100 species appear.
  - Starmie is in 23% of teams and Tyranitar 22%; the rarest are in about 1%.
  - Below-OU species fill 29% of slots through √usage weighting alone.
  - Styles: balance 71%, offense 17%, stall 12%.
