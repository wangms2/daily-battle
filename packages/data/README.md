# @daily-battle/data

Set snapshots for Gen 4 OU and Gen 5 OU: 2–4 usage-weighted sets per species, each with a player-facing role label and one-line description. The generators (M3) and the AI's set priors (M4) read them.

```ts
import { sets, setsFor } from '@daily-battle/data';
import { speciesDataFor } from '@daily-battle/data/species';

sets.species['Tyranitar'].sets; // Gen 4 OU: [{ id, label, description, weight, moves, item, ... }]
setsFor('gen5ou').species['Politoed'].sets; // any format in src/formats.ts
```

## Sources

| File                                                | From                                                                                                                                                  | License                                                             |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sources/gen4ou-sets.json`                          | Smogon's curated analysis sets, via [data.pkmn.cc](https://data.pkmn.cc/sets/gen4ou.json)                                                             | © Smogon.com and contributors. Used **with permission** (see below) |
| `sources/gen4uu-sets.json`                          | Smogon's curated gen4uu analysis sets, via [data.pkmn.cc](https://data.pkmn.cc/sets/gen4uu.json), for UU species without OU sets                      | © Smogon.com and contributors. Used **with permission**             |
| `sources/gen4ou-stats.json`                         | [Smogon monthly usage stats](https://www.smogon.com/stats/), `chaos/gen4ou-1500.json`, trimmed to the fields we use, plus natures summed from spreads | Usage statistics from Pokémon Showdown ladder play                  |
| `sources/gen4ou-sources.json`                       | URLs, fetch time, stats month, cutoff, and battle count                                                                                               |                                                                     |
| `sources/gen5ou-*.json`, `sources/gen5uu-sets.json` | The same files for Gen 5 OU, from `gen5ou`, `gen5uu`, and `chaos/gen5ou-1500.json`                                                                    | As above                                                            |

`@smogon/sets` (the source DESIGN.md first named) isn't used. Its last release was in July 2021, and its stats-derived sets are a single naive set per species.

**Permission:** Smogon granted permission to use its set data in Daily Battle through DMs with Marty, a Smogon engineer. Credit Smogon on the credits page (DESIGN.md §16).

## How `gen4ou/sets.json` is built

`src/build.ts` is a pure function from sources to output. `scripts/build-sets.ts` runs it.

1. **Species:** ranked by weighted OU usage. Two groups are kept:
   - The top `SPECIES_COUNT` (70) that have curated gen4ou sets. This already includes some UU and lower-tier species with real OU usage.
   - Every **UU or UUBL** species (by the sim's current Gen 4 tiers) with at least `UU_MIN_USAGE` (0.1%) OU usage. These use curated gen4ou sets if they have any, otherwise curated **gen4uu** sets. Either way, the sets are weighted by OU usage and validated for gen4ou.
   - Each species records its `tier` and `setSource`.
   - Currently 100 species: 70 + 30 UU/UUBL.
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
pnpm --filter @daily-battle/data build-species      # species facts and move info for the web client
```

Each script takes `--format <id>` (default `gen4ou`). The formats are listed in `src/formats.ts`, and each one's files are `sources/<format>-*.json` and `<format>/`.

Review the diff in `gen4ou/sets.json` (or the format you rebuilt), especially new fallback labels (a set with no matching rule is labeled with its source name), and add overrides as needed. Then run `pnpm test`. The tests validate every set and fail if `sets.json` is out of date with `sources/`.

Rebuild whenever `@pkmn/sim` is upgraded, since validation rules change. The version is pinned in the `catalog` in `pnpm-workspace.yaml` and recorded in `meta.simVersion`.

## Gen 5 OU

Built the same way (`--format gen5ou`), with a few differences, all in `BUILD_RULES` in `src/build.ts` or in `gen5ou/`:

- **Species:** 108, 70 + 38 UU/UUBL. **Ditto** (Imposter copies your set) and **Zoroark** (Illusion disguises it on the brief) are left out, since both break the game's "species visible, sets hidden" premise.
- **Hidden abilities** are legal from Gen 5 on (`legalAbilities`), so Politoed gets Drizzle and Ninetales Drought.
- **Team-wide bans:** gen5ou bans Drizzle with Swift Swim and Drought with Chlorophyll on one team. Each set passes on its own, so a pool could still offer an illegal six. Sets never take Swift Swim or Chlorophyll (Kingdra uses Sniper, Tangrowth Regenerator), and a test fails if every part of any `++` ban appears in the data. Sand Rush and Gems are banned outright, and the validator drops those sets.
- **Curation** (`gen5ou/set-curation.json`): Gen 5's analyses are thin, and 36 species had a single distinct set. The file hand-adds one or two sets for each, chosen from the Gen 5 OU usage stats, so every species has 2–4. Usage still weights them, and each kept set gets at least 5%. It also drops Venusaur's sun set (pointless without Chlorophyll) and swaps setup and recovery moves off two Choice sets (Breloom, Crobat).
- **Roles:** the rules gained Gen 5 vocabulary that can't change a Gen 4 label: the new setup moves (Quiver Dance, Shell Smash, Coil, Shift Gear, Hone Claws, Work Up), an **Eviolite tank** rule, and, after every other rule, **weather setters** (Drizzle, Drought, Sand Stream, Snow Warning) and **Volt Switch pivots**. `gen5ou/role-overrides.json` covers the rest.
