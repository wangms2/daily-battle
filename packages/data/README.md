# @daily-battle/data

The Gen 4 OU set snapshot: up to 4 usage-weighted sets per species, each with a player-facing role label and one-line description. The generators (M3) and the AI's set priors (M4) read it.

```ts
import { sets } from '@daily-battle/data';

sets.species['Tyranitar'].sets; // [{ id, label, description, weight, moves, item, ... }]
```

## Sources

| File                        | From                                                                                                                                                  | License                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sources/gen4ou-sets.json`  | Smogon's curated analysis sets, via [data.pkmn.cc](https://data.pkmn.cc/sets/gen4ou.json)                                                             | © Smogon.com and contributors. Used **with permission** (see below) |
| `sources/gen4ou-stats.json` | [Smogon monthly usage stats](https://www.smogon.com/stats/), `chaos/gen4ou-1500.json`, trimmed to the fields we use, plus natures summed from spreads | Usage statistics from Pokémon Showdown ladder play                  |
| `sources/sources.json`      | URLs, fetch time, stats month, cutoff, and battle count                                                                                               |                                                                     |

`@smogon/sets` (the source DESIGN.md first named) isn't used. Its last release was in July 2021, and its stats-derived sets are a single naive set per species.

**Permission:** Smogon granted permission to use its set data in Daily Battle through DMs with Marty, a Smogon engineer. Credit Smogon on the credits page (DESIGN.md §16).

## How `gen4ou/sets.json` is built

`src/build.ts` is a pure function from sources to output. `scripts/build-sets.ts` runs it.

1. **Species:** ranked by weighted usage. The top `SPECIES_COUNT` (70) that have at least one valid curated set are kept.
2. **Resolve options:** curated sets list alternatives (slashed moves, several items or natures). The move slots get the combination with the highest product of usage shares, with no repeats. The item, ability, and nature each take their most-used option. A missing ability comes from the species' legal Gen 4 abilities. Hidden Power sets get the matching IVs.
3. **Validate:** every resolved set goes through `@pkmn/sim`'s `gen4ou` validator. Failures are dropped and reported. In the current data that's Spore and Sleep Powder sets (gen4ou bans sleep moves) and event-only moves that require a shiny.
4. **Weight** (DESIGN.md §5.1, option 1):
   - `score = geomean(move shares) × item share × ability share × nature share`, with each share floored at 0.005.
   - Keep the top 4 sets by score, drop any under 5% of the kept total, and normalize the rest to sum to 1.
   - This is set-level weight. The species-level `usage` is stored separately.
5. **Roles:** the ordered rules in `src/roles.ts` give a label and description from item, moves, and EVs (Choice items, Stealth Rock leads, setup sweepers, hazard setters, spinners, walls, and so on).
   - When two sets of one species share a label, a suffix tells them apart: the item, otherwise the EV spread, otherwise the source set name.
   - `gen4ou/role-overrides.json` holds hand-reviewed edits keyed by set id and is applied last.

## Refreshing

```sh
pnpm --filter @daily-battle/data refresh            # latest stats month; or --month YYYY-MM
pnpm --filter @daily-battle/data build-sets         # prints species/set counts and dropped sets
```

Review the diff in `gen4ou/sets.json`, especially new fallback labels (a set with no matching rule is labeled with its source name), and add overrides as needed. Then run `pnpm test`. The tests validate every set and fail if `sets.json` is out of date with `sources/`.

Rebuild whenever `@pkmn/sim` is upgraded, since validation rules change. The version is pinned in the `catalog` in `pnpm-workspace.yaml` and recorded in `meta.simVersion`.
