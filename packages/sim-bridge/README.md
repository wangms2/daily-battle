# @daily-battle/sim-bridge

Wrapper around [`@pkmn/sim`](https://www.npmjs.com/package/@pkmn/sim). For now it holds the M2 spike (DESIGN.md §7): a headless `runRandomBattle` helper and tests that confirm `gen4ou` works.

## Spike findings (2026-10-21, `@pkmn/sim` 0.10.11)

- **`gen4ou` is bundled.** `Dex.formats.get('gen4ou')` exists with `mod: 'gen4'`, so there's no need to load Showdown's `formats.ts` or vendor the full repo.
- **Ruleset:** `Standard`, `Evasion Abilities Clause`, `Baton Pass Stat Trap Clause`, `Freeze Clause Mod`, `Sleep Moves Clause`, `!Sleep Clause Mod`. Banlist: `AG`, `Uber`, `Arena Trap`, `Quick Claw`, `Soul Dew`, `Swagger`.
  - Gen 4 OU uses **Sleep Moves Clause** (sleep-inducing moves are banned outright) instead of the classic Sleep Clause Mod. M1's set data and M4's AI must account for this.
- **Garchomp is Uber in current gen4ou** (and Sand Veil falls under the Evasion Abilities Clause). DESIGN.md's share examples list Garchomp, so they no longer match the format.
- **The battle stream does not validate teams.** `>player` accepts illegal teams without complaint. Every generated or player team must go through `TeamValidator.get('gen4ou').validateTeam` explicitly (M1/M3).
- Seeds use the `PRNGSeed` string form, e.g. `'1,2,3,4'` (legacy gen5 four-number seed) or `PRNG.generateSeed()`. With fixed battle and policy seeds, two runs produce identical logs apart from `|t:|` timestamps. That's a good sign for the seed + choice-replay resume design (§7).
- Format IDs passed to `>start` use `formatid`.

## Usage

```ts
import { runRandomBattle, SAMPLE_TEAM_A, SAMPLE_TEAM_B } from '@daily-battle/sim-bridge';

const { winner, turns } = await runRandomBattle({ p1Team: SAMPLE_TEAM_A, p2Team: SAMPLE_TEAM_B });
```
