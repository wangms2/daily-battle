# Pokémon Daily — Design Doc

Name: **Pokémon Daily** (Daily Battle until the landing logo arrived; see D1), hosted on a subdomain of an existing domain, so the name does not need to be unique or separately registrable. A daily Pokémon battle game built on Gen 3, 4, 5, and 6 OU (four daily games; Gen 4 came first, then 5, 6, and 3), inspired by daily-red.com but with competitive Smogon sets, a player-built weekly team, a generated opponent each day, and a realistic ladder-style AI.

This doc is written to be split into implementation chunks. Section 13 lists milestones with acceptance criteria. Verify package APIs and licenses against current docs before relying on them; names below are from memory.

---

## 1. Summary

- Each **week**, the player builds a team of 6 from a pool of 12 Pokémon, choosing a set for each. The team is locked for the week.
- Each **day**, the player faces a generated opponent team. Opponent **species are visible; sets are hidden**.
- The goal is to win a 6v6 OU battle in the chosen game (Gen 3, 4, 5, or 6). No other objective.
- **Unlimited attempts** per day, but the **first attempt is the scored one**: it decides the day's result and the streak. Retries ("run it back") are allowed and still count as clearing the day, but they cannot rescue the streak. Sets are fixed for the day, so retries leak information.
- **Difficulty target:** about a 50% first-attempt win rate for an average player, and typically 2–3 attempts to clear a day.
- Once per day, the player may **swap one Pokémon or one set**.
- The opponent AI plays like an average ladder player: imperfect, sometimes wrong, never omniscient.
- Fully client-side, self-hosted, no accounts. State in localStorage.

## 2. Locked decisions

| Area                | Decision                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Format              | Gen 3, 4, 5, and 6 OU as four daily games (each its own team, opponents, tries, and streak), singles, 6v6, Showdown mechanics. Gen 6 adds one rule of ours: one Mega per team (§19) |
| Engine              | `@pkmn/sim` (standalone Showdown simulator), self-hosted, no Showdown server                                                                                                                           |
| Set data            | Smogon data (usage-weighted). 1–4 most common sets per species, weighted by usage                                                                                                                      |
| Player team         | Weekly. Pick 6 of 12, choose a role-named set for each, lock for the week. Optional suggested teams are a selection, not a default. No lineup ordering; the lead is picked on the daily brief          |
| Daily swap          | One per day: replace one Pokémon (from the original 12) OR change one set. Not both. Done on the daily brief screen                                                                                    |
| Opponent            | New each day. Species visible, sets hidden                                                                                                                                                             |
| Attempts            | Unlimited, with "run it back". The first attempt of the day is the scored result; retries still count as a clear but never change the streak                                                           |
| Battle RNG          | Fresh random seed per attempt, stored for resume (§7), never shared, so replays cannot be memorized. Team and set generation ARE seeded by date                                                        |
| Streak              | Consecutive days with a first-attempt win. Breaks on a first-attempt loss or a missed day. No freezes                                                                                                  |
| Difficulty          | ~50% first-attempt win rate for an average player; typically 2–3 attempts to clear                                                                                                                     |
| AI                  | Utility scoring + softmax noise, tuned to average ladder behavior, acts only on revealed info plus set priors                                                                                          |
| Share               | Headline (⭐ first try, won on try N, or not cleared), one row per counted try with Pokémon remaining, team (species only), streak. No opponent info, no sets, no turn counts (§11)                    |
| Battle UI           | Mirrors Pokémon Showdown's battle layout and flow, simplified where it makes sense. Classic experience with no extra clutter when Beginner hints are off                                               |
| Beginner hints      | A clearly labeled toggle, on by default for new players, persisted. Covers first-time explainers, type-effectiveness labels, speed range in tooltips, and the team-builder checklist. Easy to turn off |
| Pacing              | Quick like Showdown, with speed control and tap-to-skip                                                                                                                                                |
| Animations          | Whatever Showdown does (animated sprites, its own battle effects), nothing custom, with an off setting like Showdown's                                                                                 |
| Second mode (later) | Mid-battle puzzles on the same engine                                                                                                                                                                  |

## 3. Non-goals

- No leaderboards, and no email. Accounts are optional and minimal: a name protected with a password (§10.1).
- No multiplayer or PvP in the daily games. Versus rooms with friends are a separate mode (§18).
- No formats beyond Gen 3 to 6 OU for now. The format is a parameter throughout (`packages/data/src/formats.ts`), so another one is mostly data, sets, and a schedule run (§17, §19, §20).
- No minimizing-turns scoring.
- No Showdown server, websockets, or ladder integration.

## 4. Game rules and flow

### 4.1 Time

- A **day** and a **week** are keyed off the player's local calendar date, matching the existing site's "midnight in your time zone" behavior.
- The week starts Monday. The weekly pool and daily opponents are keyed by date strings (`YYYY-MM-DD`) so every player sees the same content for the same local date.
- Edge case: players in different time zones see different "today" content at the same instant. Accepted.

### 4.2 Weekly team building

1. On the first visit of a week, show the **pool of 12** (same for everyone).
2. Player selects 6, then a set for each. Sets are presented by **role** ("Choice Scarf attacker", "Stealth Rock lead") with a one-line description and the four moves; item, ability, nature, and EVs are behind a "Details" tap. No usage percentages.
3. Optionally, instead of building from scratch, the player can pick one of 2–3 **suggested teams** (§12.2a). This is a selection the player chooses, not a default, and the result stays editable.
4. Team locks for the week. There is no lineup ordering: in singles, only the lead matters, and it is chosen on the daily brief (§4.3).

Daily swap (done on the daily brief screen, shown as "1 change left"):

- One per day, resets at local midnight.
- Either replace one team member with another of the 12 (choosing a set), or change the set of one existing member.
- Unused swaps do not accumulate.
- **After a first-try loss** the streak is already over, so the team may change freely: any number of swaps and set changes, none using up the daily change, and they stay on the team for the rest of the week (the end card's "Change team" opens the brief ready to edit; the chip reads "Edit team"). **Pick a whole new team** (in edit mode, the code calls it "ditching") throws the weekly team away to build a new one from the pool; it ends a live streak for that day (`DayState.ditched`), and the confirmation says so.
- Once the day is won, the daily swap is no longer offered. Instead each practice run may make one **practice change** (a swap or a set change) for that run only; the weekly team is untouched, and the next run decides afresh. If a practice run is won, its change stays on the team from then on.

### 4.3 Daily battle

1. Player sees the **daily brief**: the opponent's 6 species (no sets), their own locked team, and the daily swap ("1 change left").
2. Player picks which Pokémon **leads** for this attempt (free, not a swap). After a faint, the player chooses the next Pokémon as in any singles battle.
3. Battle runs turn by turn. Win = all opponent Pokémon fainted.
4. On finish, record the attempt (result + player's Pokémon remaining) and offer "Run it back" or share. The first attempt of the day is the scored result; later attempts are recorded as retries.
5. Gen 4 has no team preview in the simulator; the brief is a UI screen, not a sim feature. Gen 5 has Team Preview: the lead picked on the brief is sent as the preview choice (no extra screen), the AI picks its own lead after seeing your six species, and the foe's six icons show from turn 1 (§17).

### 4.4 Stats

- Per day: attempts, result of each, and whether the day has been cleared.
- **Streak (revised after M9a):** consecutive days won **on the first try**. A lost first try breaks it at once (a forfeit or an abandoned try counts as a loss; reload resumes, §7, so a reload can't dodge one), and so does a missed day. There's no limit on tries: every try counts until the day is won (the result is "won on try N"), and runs after a win are practice, which are never shared. No streak freezes.
- **First-try wins are the best result.** They're celebrated simply: a ⭐ "First try!" headline in the share and a gold badge on the result card, plus a first-try count in stats.
- Also track: best streak, first-try rate, days played, clears (days eventually won), average tries per clear.
- A day shows one of: not played, first-try win, won on a later try, not cleared yet (today, tried but not won), or not cleared (a past day never won).
- Streaks and stats are derived from the saved attempts (`apps/web/src/lib/results.ts`), not stored.

### 4.5 Difficulty, streaks, and the team (added Oct 2026)

- Each game has a CPU difficulty, **Easy**, **Normal** (the default, and the AI of §8), or **Hard**, picked on the daily brief and remembered per game (`settings.difficulty`). An attempt records the difficulty it was played at.
- **Each difficulty is its own daily**: the same opponent team and the same locked team, but its own first try, tries, streak, and stats. A day's status on Home and the end card is the picked difficulty's. Home shows an Easy or Hard badge on the game.
- The picker is locked while a battle is in progress; switching difficulty never abandons a try.
- **Team rules follow Normal's tries only** (`dayLost`, `dayDecided`, the practice change). The team is shared, so an Easy or Hard loss doesn't free it up. Ditching the team (§4.2) breaks every difficulty's streak.
- Normal is unchanged: same AI, same engine string, same saves, same share text.

### 4.6 CPU difficulty (added Oct 2026)

| | Easy | Normal | Hard |
| --- | --- | --- | --- |
| Brain | The utility AI (§8) with the `EASY` preset | The utility AI with the team's style preset | poke-engine's MCTS over sampled worlds |
| Plays like | A beginner: mostly attacks (not always the best one), rarely switches, no hazards, setup, or predictions | A typical ladder player | A strong player that looks turns ahead and guesses your sets |
| Cost | < 1 ms a decision | < 1 ms | ~0.3 s a decision on a desktop (≤ 2 s on a slow phone) |

- **API.** `aiFor({ difficulty, style, data, engine?, pool? })` in `@daily-battle/ai`. Normal is exactly `aiForStyle(style)`, so its choices are byte-for-byte as before.
- **Hard** (`packages/ai/src/hard/`). Each decision:
  1. Reads the same `SideView` as the utility AI (hidden-info rules hold: the hidden-info test covers Hard).
  2. Samples 8 **worlds**: full foe teams drawn from the belief model (§8.2) for seen foes, and from the week's pool for unseen ones (Gen 3–4, no Team Preview).
  3. Translates each world to poke-engine's state string (`translate.ts`, `names.ts`) and runs a **seeded** MCTS on it, 150k iterations split by world weight.
  4. Sums each of our options' values across worlds, weighted, and plays the best legal one. If the engine can't search (about 3% of decisions, such as a state it can't represent), the STRONG utility preset decides instead.
- **The engine** is [poke-engine](https://github.com/pmariglia/poke-engine) (MIT), from our fork `wangms2/poke-engine`, which adds a seeded, clock-free search so a decision is reproducible. `packages/engine-wasm` wraps it in a small raw-ABI WebAssembly module per generation (`gen3.wasm` … `gen6.wasm`, 0.65–0.73 MB each, about 170–195 KB gzipped); a later generation needs only its feature flag and translation support. `version.ts` lists the gens built (`ENGINE_GENS`) and the module version.
- **Budget.** 150k iterations and 8 worlds came from a sweep of 40k to 200k: strength rose until about 150k and then flattened, while time kept growing. Measured at 150k: 6–0 against mid and 6–0 against strong in a small eval, about 270 ms a decision in Node.
- **Determinism and resume.** Each decision's search seed comes from the attempt's AI seed and the decision index. The AI's choices are also saved on the attempt (`aiChoices`), so a resume replays them instead of searching again; a saved choice that's no longer legal is searched for anew.
- **Where it runs.** In the battle worker, which fetches and compiles that game's module only for Hard (once per session; Easy and Normal never load it). The CSP allows `'wasm-unsafe-eval'` for it (`public/_headers`). A failed load shows the battle's usual error, and trying again fetches it anew. The picker hides Hard for a game whose module isn't in the build.
- **Versions.** The engine string gains the difficulty: `sim <v> ai 1` (Normal), `ai 1 easy 1`, `ai 1 hard 1 e1` (`EASY_VERSION`, `HARD_VERSION`, `WASM_VERSION`). Bump them when Easy's preset or Hard's search could choose differently; an in-progress battle then becomes a forfeit (§15).
- **Testing.**
  - The eval (`pnpm --filter @daily-battle/ai eval`) has Easy rows; `--hard` adds Hard's.
  - CI builds the WASM once (Rust stable plus `wasm32-unknown-unknown`) and shares it with every job. The sims job runs a small Hard eval at 20k iterations, reported but not asserted.
  - A coverage test checks that poke-engine knows every species, move, and ability in each game's sets.
  - The pipeline's `difficulty-report` plays the mid bot against a week's opponents on each difficulty. It is informational only: schedules are validated on Normal (§9).
  - An e2e test plays a Hard Gen 3 battle under the production CSP, reloads, and resumes.

## 5. Data pipeline

### 5.1 Source

**As built in M1 (Oct 2026):** curated Smogon analysis sets from `data.pkmn.cc/sets/gen4ou.json`, weighted with Smogon's monthly `chaos/gen4ou-1500.json` usage stats (option 1 below). Smogon granted permission to use the set data. `@smogon/sets` was not used: its last release was in July 2021, and its stats-derived sets are one naive set per species. See `packages/data/README.md` for the method. The original research notes follow.

Researched (Oct 2026). Both packages are open source on npm.

- **Primary: `@smogon/sets`.** Bundled, preprocessed, validated PokemonSet data gathered from Smogon, usage statistics, and third-party sources, grouped by format and generation. Static, works at build time, updated roughly monthly with each package release. Preferred because the build needs no network access.
- **Fallback/refresh: `@pkmn/smogon`.** Contains no data itself. Takes a fetch-compatible client and retrieves the latest sets from `data.pkmn.cc`, converting to PokemonSet format. It does not validate returned sets. It can also return usage statistics in `@pkmn/stats` format.
- **Raw usage stats:** Smogon publishes monthly per-species moveset files for `gen4ou` at several rating cutoffs (0, 1500, 1630, 1760) at `smogon.com/stats/<YYYY-MM>/moveset/`. Gen 4 OU is still tracked as of the 2024 and later reports.
- Dependencies for legality and data: `@pkmn/sim`, `@pkmn/data`, `@pkmn/dex`.

**Known gap: set-level usage weights.** Usage stats give per-species distributions of moves, items, and abilities, not usage shares for whole sets. Curated Smogon analysis sets have no usage weights. So "1–4 most common sets, weighted by usage" is not a ready-made field and M1 must derive it. Options to evaluate:

1. Take the curated sets for a species and weight each by how closely its moves/item/ability match the species' usage stats (e.g. product or average of the move and item usage shares).
2. Build sets from the stats directly (top moves/items/abilities per species) and cluster into 1–4 coherent sets.
3. Use whatever set-level weights `@smogon/sets` already provides, if its usage-derived sets carry them.
   Document which option is used, and keep species-level weights (overall usage rank) separate from set-level weights.

**Licensing check:** the packages' code is MIT. Confirm whether Smogon's set and usage data may be redistributed in the shipped JSON, and add attribution to Smogon in the credits.

### 5.2 Build-time snapshot

- A script downloads and normalizes data into versioned static JSON checked into or generated at build: `data/gen4ou/sets.json`.
- For each species: up to 4 sets, each with name, moves, item, ability, nature, EVs, IVs (default perfect unless set says otherwise), a normalized `weight` (usage share among the kept sets), and a player-facing **role label** plus a one-line description (e.g. "Choice Scarf attacker: fast and hits hard, locked into one move"). Derive labels with rules from item and moves (Choice Scarf plus attacks, Stealth Rock, Swords Dance, and so on), then human-review the output.
- **2–4 sets per species, for variety.** Candidates come from the species' own Smogon analysis, the other tier's analysis, and a hand-curated file (`gen4ou/set-curation.json`) that adds creative sets where the analyses are thin (Choice Specs Roserade; Nasty Plot and Specs Azelf) and drops weak ones (Azelf's Rain Dance lead). Usage ranks them: the most used set is the default, the top 4 distinct sets are kept, and no set is dropped for low usage; each kept set gets at least a 5% weight so rarer sets still appear on opponents. On a same-job tie the species' own analysis wins, so extra sources only add variety and published set ids stay stable. A test enforces 2–4 sets for every species.
- **Sets must be distinct.** Two sets of a species that share 3+ moves, invest EVs the same way (within 192 total), and do the same job are one set: the less used folds into the more used, which keeps its usage (`packages/data/src/distinct.ts`). A set's job is what its setup move boosts (physical, special, or speed; a setup sweeper's item is flavour), otherwise what its item does (Scarf for speed; Band, Specs, Life Orb, or Expert Belt for power; Sash; a berry; or other), and its role moves (hazards, spin, Trick, Trick Room, weather, screens, Wish, Baton Pass). So Mismagius's Nasty Plot and Calm Mind sets are one set, as are Rhyperior's two Leftovers Substitute attackers, and the same set name in two analyses is one set, while Flygon's Scarf and Band sets, or physically and specially defensive Hippowdon, stay separate.
- Filter: only species with enough usage to be in the playable pool (threshold configurable, start around top 60–80 species). Exclude sets that fail validation in `@pkmn/sim`'s `gen4ou` team validator.
- No runtime fetches to external data sources.

### 5.3 Validation

- Every set must pass the sim's validator for the `gen4ou` format.
- Unit test that loads all sets and validates them. Fail the build on any invalid set.
- Neither data package guarantees validity, since validation rules change over time. Re-run validation on every data refresh and when `@pkmn/sim` is upgraded.

## 6. Generation

### 6.1 Seeded PRNG

- Use a small deterministic PRNG (e.g. mulberry32 or the sim's own `PRNG`) seeded by a hash of a string key.
- Keys: `week:YYYY-MM-DD` (Monday date) for pools; `day:YYYY-MM-DD` for opponents. Include a `generatorVersion` in the key so algorithm changes can be rolled out without silently rewriting past days.

### 6.2 Weekly pool of 12

Weighted random draw by usage, with:

- Cap on how many top-tier species appear (no pool of 12 staples).
- Dedupe by species; respect species clause and standard Gen 4 OU restrictions.
- A quota of 2–4 below-OU species (UU, UUBL, and lower, drawn from those with real OU usage) so pools aren't only OU staples. They are weighted by usage^0.35, so more popular ones come up more often without any one dominating.
- Coverage constraints so at least one viable team exists:
  - ≥1 Stealth Rock setter (required)
  - A Spikes or Toxic Spikes setter in about half of pools (decided per week)
  - A hazard remover (Rapid Spin or Defog): soft; a pool without one is accepted half the time
  - ≥1 Pokémon that checks each of the major offensive types in the pool
  - A mix of offensive, defensive, and utility roles
- After constraints, run the validation in §9.2.

### 6.3 Daily opponent

- 6 species by usage-weighted draw (weighted by √usage, as built in M3, for more day-to-day variety), then for each species a set drawn by set weight.
- Coherence constraints (soft, via rejection sampling): at most 1–2 hazard setters, a remover likely present, role balance, Species clause (no repeated species). No item clause: gen4ou has none, so items may repeat.
- Assign a **style** label (`offense`, `balance`, `stall`) derived from the team's role mix; the AI uses it (§8.5).
- The generator outputs the full team including sets. The client shows only species.

### 6.4 Schedule file

- Prefer **pre-generating a published schedule** over generating at runtime: a build-time script emits `schedule/2026-W44.json` etc. containing the weekly pool and the 7 daily opponents. The client reads the file for the current date.
- Benefits: one source of truth, validated content only, easy to roll back, no cross-browser divergence.
- Pre-generate several weeks ahead. Fall back to runtime generation with the same seed only if a schedule file is missing (log it).
- **Regenerating a published week** (e.g. after a set data change) is allowed but deliberate: `schedule --force` rebuilds whole weeks, and `schedule --from-day <date>` rebuilds only a week's later days, keeping its pool, suggestions, and earlier days. A locked team records the pool it was built against as `<week>:g<generatorVersion>:c<candidate>`; when the current schedule's id differs, the app unlocks the week, drops today's unfinished battle and change, keeps finished tries, and reopens the team builder with a note that the week was refreshed.

## 7. Battle engine

- Package: `@pkmn/sim`, MIT licensed, an automatically generated extraction of just the simulator portion of `smogon/pokemon-showdown`. It exports `Dex`, `BattleStreams`, `Teams`, and a `RandomPlayerAI` (the latter is a useful baseline policy for M2, not the game AI). Random battles are not supported, which does not matter here.
- **Format availability must be verified first.** `@pkmn/sim` bundles stable, popular formats that need no mods, not the full upstream `config/formats.ts`. Confirm `gen4ou` is present. If not, load Showdown's `formats.ts` into the sim manually, or vendor the full `smogon/pokemon-showdown` repo (the package README itself suggests vendoring if you need the full simulator and validator).
- Reference docs: Showdown's `PROTOCOL.md`, `SIM-PROTOCOL.md`, `SIMULATOR.md`, `TEAMS.md`, `DEX.md`.
- Run `@pkmn/sim` in a **Web Worker** to keep the UI responsive.
- Create a battle with format `gen4ou`, both teams supplied as packed or JSON sets. Generate a fresh random battle seed at the start of each attempt and store it with the attempt (see resume below). Seeds are never shared across attempts or players, so replays cannot be memorized.
- Use the sim's stream/`BattleStream` API. Sim output is the Showdown protocol; the client parses it for rendering.
- Player decisions are sent as standard choices (`move N`, `switch N`), via the sim's request objects.
- Information hiding: the sim produces a side-specific request and a per-side log (`|split` handling). Each side (player UI, AI) must consume only its own side's view. The AI must never read `battle.sides[...]` internals or the opponent's request.
- Support: forfeit and resume.
  - **Resume design:** store the attempt's battle seed, the AI seed, the teams, and the ordered list of the player's choices in localStorage after every turn. On reload, recreate the battle with the same seeds and replay the choices to restore the exact state.
  - This requires the AI to be fully deterministic given its seed and the observed battle state (all AI randomness comes from the seeded rng passed to `choose`). Add a test: replaying a stored attempt reproduces the same final state.
  - **Forfeit** (explicit or abandoning the attempt) counts as an attempt and a loss with the Pokémon remaining at that point. This keeps the attempts count honest on the share screen.
  - No takebacks and no turn timer.
- Gen 4 specifics are handled by the sim; no custom mechanics. Test a few known interactions (Substitute, Choice lock, hazards, weather).

## 8. Opponent AI

Goal: realistic average-ladder-player behavior, imperfect but not random, legible enough that players can reason about it.

### 8.1 Interface

```ts
interface BattleAI {
  choose(view: SideView, rng: () => number): Choice; // Choice = move/switch
}
```

`SideView` is derived only from the AI's side's request plus the public battle log. It contains: own team (full info), opponent's revealed Pokémon, moves, items, abilities, current HP percentages, status, boosts, hazards, weather, field state.

### 8.2 Belief model

- Maintain, for each opposing Pokémon, a candidate set distribution: start from the usage-weighted sets for that species, then filter and renormalize as moves, items, and abilities are revealed.
- If nothing matches (player is off-meta), fall back to "unknown set" using the species' most common moves.
- Use `@smogon/calc` (or the sim's damage logic) to estimate damage by sampling or taking expected value over candidate sets. Verify the package supports Gen 4.

### 8.3 Utility scoring

For each legal action compute a score from weighted features:

- Expected damage dealt (as % of target HP) and KO potential
- Expected damage taken from likely opposing moves
- Speed comparison (who moves first)
- Type matchup of the active Pokémon vs the opposing active
- Hazard value (set when absent and it's safe), removal value
- Setup value when the opposing threat to the active is low
- Status value (Toxic/Will-O-Wisp on suitable targets)
- Switch value: matchup improvement minus the cost of a free hit
- Preservation of the AI's win condition(s)

Weights are parameters (§8.5).

### 8.4 Choice with noise

- Convert scores to a probability distribution with **softmax** and a temperature parameter, then sample.
- Targeted behaviors on top, as soft biases rather than hard rules:
  - High rate of picking the highest-damage move
  - Slight over-switching into resists
  - Hazards early
  - Some chance of "predicting" a switch and attacking the likely switch-in, sometimes wrong
  - Avoid repeating obviously suicidal moves
- No omniscience: if the player's Pokémon is not revealed, the AI treats it by priors.

### 8.5 Parameters and styles

- A config object: feature weights, softmax temperature, prediction rate, switch aggressiveness.
- Preset parameter sets per style (`offense`, `balance`, `stall`) selected from the daily opponent's style label.
- Tune against aggregate stats from mid-ladder Gen 4 OU play (switch rate, max-damage rate, turn of first hazard). If using public replay data, check Showdown's terms and strip usernames. If no data is used, tune by hand and document the targets.

### 8.6 Testing

- Deterministic unit tests using a fixed rng and constructed positions (e.g. AI picks the KO move when available at low temperature, AI does not use information it hasn't seen).
- Bot-vs-bot simulations used in §9.

## 9. Validation and calibration (offline)

### 9.1 Player bots

- Implement 2–3 player bots of different skill: a naive one (max damage), a mid one (the §8 AI with low noise), and a stronger one (lookahead or the §8 AI with high weights and low temperature).
- Each bot has two information modes: **uninformed** (opponent sets known only through priors and reveals, modeling a first attempt) and **informed** (given the opponent's actual sets, modeling a retry).

### 9.2 Pool validation (weekly)

- Sample many legal 6-of-12 teams from the pool with random set choices. Simulate against several random daily opponents.
- Require: sufficient viable teams (win rate above a floor for the mid bot), and no single dominating team (cap on the best team's win rate).
- Also emit 2–3 **suggested teams** per week with distinct archetypes (e.g. Balanced, Offense, Stall) that pass validation, for the team builder's suggestion row (§12.2a).
  - Suggested teams are **built to their archetype**, not labelled after the fact (`packages/pipeline/src/archetypes.ts`). Each set gets a role: an **attacker** (Choice item, Life Orb, Expert Belt, Focus Sash, a sweeping setup move such as Swords Dance or Dragon Dance, or a frail set with a full attacking stat), a **wall** (bulky, with recovery, Leftovers/Black Sludge, status or phazing; bulky Calm Mind or Curse counts), or **support** (the rest).
  - **Offense:** 4–6 attackers, no walls. **Stall:** 4–6 walls, no attackers. **Balanced:** 2–3 of each. All three need a hazard setter.
  - Per archetype, 16 candidate teams are drawn to those rules and simulated against the week's probe opponents; the top 3 are re-tested and the best is suggested if it clears the viability floor. A pool that can't field an archetype (too few walls for stall, say) simply offers fewer suggestions.
  - Pool acceptance is unaffected: it still checks that viable random teams come in more than one style.

### 9.3 Opponent validation (daily)

- Simulate each candidate daily opponent against sampled teams from that week's pool using the bots.
- Target: about a 50% first-attempt win rate for an average player and 2–3 attempts to clear. With first-attempt win rate f and later-attempt win rate p, the mean attempts per day is about f + (1 − f)(1 + 1/p) (for f = 0.5: p = 0.5 gives 2.0, p = 0.4 gives 2.25, p = 0.33 gives 2.5).
- Starting bands (config): **uninformed mid bot 45–55%** (first attempt) and **informed mid bot 35–55%** (retries).
- Also require the naive bot's win rate to be clearly lower than the stronger bot's (the matchup rewards skill).
- Assumption to validate: the mid bot approximates an average player. Calibrate the bands against real playtests (§9.4) rather than treating them as exact.
- Because the first attempt is what counts, check the first-attempt result across many simulated runs per matchup, not one, and reject matchups that depend heavily on crits or misses.
- Reject degenerate cases: stalemates (turn cap, e.g. 300 turns), hard counters with no answers in the pool.

### 9.4 Reporting

- The pipeline writes a report per schedule file (win rates by bot, rejected candidates and reasons) for human review.
- Thresholds are config, tuned after playtesting real players.

## 10. Client state (localStorage)

Versioned schema, now `version: 4`. v2 dropped the stored `stats` block (streaks and stats are derived from `days`, §4.4); v3 changed the speeds; v4 gives each format its own game (`games.gen4ou`, `games.gen5ou`, each `{ weeks, days }`), and a v1–v3 save moves into Gen 4 OU with `settings.format` set to it. The shape before v4, which is now one game's:

```ts
{
  version: 2,
  weeks: { [weekKey]: { team: Slot[6], poolId: string } },
  days: { [dayKey]: { swapUsed: boolean, change?: DayChange, lead?: string, practiceChange?: DayChange, attempts: Attempt[] } },
  settings: { beginnerHints: boolean, battleSpeed: 'normal'|'fast'|'instant', animations: boolean, shownExplainers: string[] }
}
Slot = { species, setId }
Attempt = { result: 'win'|'loss'|'forfeit'|'inProgress', remaining: number, ts: number, lead: string,
            team: Slot[6],   // as sent into battle, lead first
            battleSeed: string, aiSeed: string, choices: string[],  // seeds + choices enable resume (§7)
            engine: string,  // 'sim <version> ai <AI_VERSION>'; a mismatch on resume records a forfeit (§15)
            practiceChange?: DayChange }  // a practice run's one-off change (§4.2)
```

- Wrap all reads/writes in try/catch; the game must work if storage is unavailable (in-memory fallback with a notice).
- **Difficulties (§4.5) added no version:** they're optional fields an older save just lacks. `settings.difficulty: { [format]: 'easy'|'normal'|'hard' }` (Normal when unset); `Attempt.difficulty?: 'easy'|'hard'` (absent means Normal, so every earlier attempt is a Normal one); `Attempt.aiChoices?: string[]` (Hard's choices so far, for resume). The engine string carries the difficulty's versions (§4.6).
- Migration function per version bump.
- **Existing saves are never rewritten by a new feature.** New fields are optional (an older save just lacks them), and nothing merged in from an account removes anything (§10.1). `state/merge.test.ts` loads a save as players have it and checks it comes back unchanged.

### 10.1 Names and protected names (added Oct 2026)

Showdown-style, and as simple as possible: no email, no sign-up step.

- **A name when the game first opens.** The first time, once the landing has loaded, it dims and a card rises with Pikachu standing on its edge, asking the player's name (a link straight into a game or room skips it). Once they're met, the card slides away. The card (`screens/NameScreen.tsx`) is in the landing's style, a Professor-style "What's your name?" with a random suggestion (🎲). It's `settings.name`, local only, and versus uses it too (`versus/saved.ts`). A player who already has a versus name isn't asked.
- **Protecting it.** After a win, the end card offers to protect the name with a password (5+ characters). It stays there until the name is protected, and it's also in Settings › Trainer. Protecting registers the name on the server with this device's save. Like Showdown, an unprotected name isn't reserved; a protected one is taken. Picking a name (the name card, Settings › Trainer) checks it a moment after typing stops (`GET /api/accounts/<name>` → `{taken}`) and won't take a protected one.
- **Other devices.** Sign in with the name and password, from the name screen ("Played on another device?") or Settings › Trainer. The saves are merged (`state/merge.ts`): days and tries are combined (each try once), weeks keep the team that played more, lessons finished and the type trainer combine, and this device's preferences win. Streaks are derived, so they span both devices.
- **Sync.** Signed in, the save is pushed 2 s after a change and when the page is hidden; on opening, the server's save is merged in. A push over a newer save (another device's) gets 409, and the client merges and pushes again. Offline, play carries on and syncs later. Sessions don't expire; a signed-in device is never asked again.
- **Server** (`apps/server/src/accounts.ts`): one Durable Object per name (case and spacing don't make a new name), holding the PBKDF2-SHA256 hash (100k rounds, random salt), the SHA-256 of each device's token (up to 10), and the save (up to 1 MB). Ten wrong passwords in a row pause sign-in for 15 minutes. Routes: `POST /api/accounts/<name>` (protect), `POST|DELETE …/session` (sign in, sign out), `GET|PUT …/save`, `DELETE …` (delete, with the password).
- **No email, so no reset:** a forgotten password can't be recovered. The device's progress stays on the device regardless.

## 11. Share format

First-try win:

```
Pokémon Daily · Gen 4 OU · Oct 21
⭐ First try! 4/6 left
✅ 🟩🟩🟩🟩⬛⬛
Hippowdon, Azelf, Celebi, Heatran*, Jirachi, Lucario
🔥 5-day streak
```

Won on a later try (one row per try, up to the win; past ten tries the middle becomes a count: the first, `⋯ 11 tries more`, and the last two):

```
Pokémon Daily · Gen 4 OU · Oct 21
✅ Won on try 3 · 2/6 left
❌ 🟩⬛⬛⬛⬛⬛
❌ ⬜⬜⬛⬛⬛⬛
✅ 🟩🟩⬛⬛⬛⬛
Hippowdon, Azelf, Celebi, Heatran*, Jirachi, Lucario
🔥 6-day streak
```

Other headlines: `❌ Not cleared` (a past day never won, with `🔥 Streak reset`) and `Not cleared yet · 3 tries` mid-day. Practice runs after a win are never shared.

Easy and Hard add the difficulty to the header, with that difficulty's tries and streak: `Pokémon Daily · Gen 4 OU · Hard · Oct 21`. Normal's header is unchanged. The image card shows the same header.

- The last line is the link to play (the site's own address), so friends can tap through.
- Each row shows that try's result and your Pokémon left out of 6 (green = alive; grey ⬜ = still standing on a try that was given up), led by one emoji (✅/❌, a first try too) so the squares line up. A practice run shared from its end card adds `🔁 🟩🟩🟩⬛⬛⬛ practice` (`practice, with Gengar` if it swapped one in). At most 7 lines plus the link.
- Team: species only, lead first, from the deciding try (the win, or the latest try that counted); `*` marks a species swapped in that day.
- **Share opens a choice: image or text.** Both say the same thing, built from one model (`lib/share.ts`).
  - **Text:** plain text that pastes anywhere, copied straight to the clipboard (never the share sheet), else shown to copy.
  - **Image:** a 1200×630 card in the app's light theme (`lib/shareCard.ts`), drawn on a canvas in the browser. Its header takes one colour from the game played, so the generation shows at a glance: Emerald green for Gen 3, Diamond's steel blue for Gen 4, black for Gen 5 (with a white ball button, for Black and White), and Y's red for Gen 6. The card shows the date, the headline (gold "⭐ First try" badge), the try rows as squares, a practice row when sharing one, the team as sprites with names (`*` and gold for the day's swap), the streak, and the site address. The sheet previews it; it goes to the share sheet as the image alone where files can be shared (phones; with text alongside, iOS's Copy and some apps keep only the text, and the card shows the address anyway), else the clipboard, else a download. The preview is a `blob:` image, which the CSP allows (`img-src 'self' data: blob:`).
- Never include opponent species, sets, or turn counts.
- **Share all.** With two or more games played today, the Share sheet has a **This game / All games** switch, and the game picker has a **Share all N games** button under the list (**Share today** with one game, which shares that game's full result). All games is compact, one game per pair of lines, in picker order, with no teams; games not played today are left out:

  ```
  Pokémon Daily · Oct 21
  Gen 3 OU · Easy · 🔥 5-day streak
  ⭐ 🟩🟩🟩🟩⬛⬛ First try!
  Gen 4 OU · Streak reset
  ✅ 🟩🟩⬛⬛⬛⬛ Won on try 2
  ```

  Its image card has a plain clay header with the date, and a row per game: the mascot on the game's colour, the name (with difficulty and Coached), the short headline, the deciding try's squares, and that game's streak.

## 12. UI and tech

### 12.1 Stack (proposed)

- TypeScript, Vite, a component framework of choice (React or Svelte), Vitest for tests.
- Static hosting (any static host/CDN). No backend in v1.
- Monorepo layout:
  ```
  /packages
    /data       # set snapshot scripts + JSON
    /gen        # seeded generation + constraints
    /ai         # belief model, scoring, policies
    /sim-bridge # worker wrapper around @pkmn/sim, SideView extraction
    /pipeline   # offline validation, schedule emitter, reports
  /apps
    /web        # UI
  ```

### 12.2 Screens

1. **Home** (the daily brief): once played, today's result, tries, streak, Share, and the countdown to the next day.
2. **Weekly team builder**: pool of 12, role-named set picker, suggested teams, lock (§12.2a).
3. **Daily brief**: opponent species, your team, lead picker, daily swap ("1 change left"), Start.
4. **Battle**: Showdown-style layout and flow (§12.2b). Mobile-first.
5. **Result** (a card over the field): outcome, a ⭐ for a first-try win, today's tries as rows, the streak, Share, Try again / Play again, Back to today.

### 12.2a Team builder (should be a pleasure to use)

Goals: fast, tactile, and clear to someone new to competitive Pokémon. The whole flow should take under a minute.

- **Pool:** the 12 as large cards: sprite, name, type badges, and a role tag or two. Tap a card to add it; tap again to remove. Picked cards are highlighted with their slot number, and a pencil on them changes the set (there's no separate team row on phones: order doesn't matter, since the lead is picked each day). A second form of a Pokémon already on the team (Rotom-Wash with Rotom-Frost) is dimmed, per Species Clause. Interactions are instant and snappy; no heavy animation.
- **Set picker:** adding a Pokémon opens the picker straight away; tapping a team member opens it to change the set. Short tabs across the top name each set ("Scarf", "Swords Dance"); below, the selected set's card shows the role name ("Choice Scarf attacker"), a one-line description, the four moves, and the item, ability, nature, and EVs, with nothing to flip or scroll. The current set, or else the most used one (badged "Most used"), starts selected, so one tap on "Add Heatran" / "Use this set" confirms it. Closing the prompt adds nothing. No usage numbers. Tapping a move (or hovering it with a mouse) shows a small card above it with its type, category, power, accuracy, PP, priority/contact, and one line on what it does; a tap elsewhere closes it. The move facts ship in `species.json` so the builder never loads the simulator.
- **Wide screens (≥900px):** the pool is a 3×4 grid of compact row cards (sprite, name, types, role), with a details panel under it in place of the info sheet and set picker. Clicking a card adds it with the most used set (or the set previewed in the panel) and shows it in the panel; its ⓘ or a team-panel row just shows it (the shown member's row is ringed; each row has a × to remove it, and there are no slot numbers: the n/6 counter is enough). The panel has the set tabs, the selected set's moves, item (with its icon), ability, nature and EVs, a Pokédex entry (wide screens only, loaded on demand from `src/lib/flavor.json`, baked by `scripts/flavor.ts`), base and **final** stats (level 100, from the set's nature, EVs and IVs: `lib/stats.ts`, tested against the simulator), matchups, and Add/Remove.

  Phones show the same on the set picker, tightened to fit: the final stats on one line, and a description longer than two lines floats its full text over the card on a tap (or a mouse hover), never changing the layout, so the sheet doesn't scroll. Item icons come from PokeAPI/sprites, self-hosted by `scripts/items.ts` under `public/items/`. For a team member, choosing a tab changes its set at once.
- **Suggested teams:** a row of 2–3 suggested teams labeled by archetype (e.g. Balanced, Offense, Stall), under a "Suggested teams · Pick one to fill your team" heading so the chips explain themselves. Selecting one fills the slots, and the team stays fully editable. These come from simulation-validated candidates (§9.2); the player chooses to use one, it is never applied automatically.
- **Beginner hints (when on):** a compact checklist under the slots (hazards, hazard removal, physical attacker, special attacker, defensive Pokémon) with checkmarks, and a tap-to-view list of shared weaknesses. Hidden when hints are off.
- **Lock in:** a "Lock in team" button opens a confirmation showing the six sprites, then goes straight to the daily brief.

### 12.2b Battle UI

Mirror Pokémon Showdown's battle layout and flow, simplified where it makes sense. With Beginner hints off, the experience should feel like classic Showdown with nothing extra.

- **Layout (Showdown-style):** field with both active Pokémon, HP bars (name, level, HP %, status and stat-boost badges), weather and hazard indicators, a move grid (name, type color, PP), a switch row with team icons, and Showdown's text battle log visible beside or below the field (stacked on mobile).
- **Improved for mobile (M7.1):** the field keeps the Gen 4 scene's shape on phones, and the log takes the spare height below it (newest at the bottom, the whole battle scrollable inside it, expandable to a full sheet) instead of Showdown's chat-sidebar log and one-line message box. Floating result labels ("−24%", "Paralyzed", "Item knocked off") and ability/item pop-ups replace the in-field message box. The foe's HP bar carries six team marks: revealed Pokémon as icons, unrevealed as Poké Balls, fainted greyed. Your own team shows on the bench row, so your bar has none. Details open as a small card, not a full sheet.
- **Simplified vs Showdown:** no timer, chat, user list, ladder rating, or spectators. No team preview screen. Forfeit is a "Give up" item in a menu.
- **Tooltips:** tap (or hover on desktop) a Pokémon for Showdown-style details. For the opponent, show only revealed information: types, HP %, status, boosts, revealed moves, and the item or ability if revealed; with Beginner hints on, also its still-possible sets (§12.2c). No usage hints. Own Pokémon show full info, except the active one's moves, which the move buttons already show. Moves anywhere outside the move buttons are chips tinted by type, and items and abilities open a details card on tap, like moves.
- **Move details:** hover (desktop) or press (touch) a move, Showdown-style. On touch the card shows about 150ms into a press: lift before ~450ms and the tap chooses the move (the card goes); hold past it and the card stays open without choosing, until the next tap anywhere. It shows type, category, power, accuracy, PP, the move's description (the full Gen 4 text up to ~280 characters, else the summary), priority, and contact; with hints on, its effectiveness against the opposing active Pokémon.
- **Pacing (quick, like Showdown):**
  - Speeds are Slow / Normal / Fast (about 1150 / 800 / 450 ms per line), Normal by default, always reachable from the top bar. (An instant mode exists for automated tests only.)
  - Tap anywhere to skip the rest of the current turn's animation and text.
  - Nothing is chosen for you, even with a single legal choice: you tap a locked move or recharge turn yourself, and sending in your last Pokémon has its own prompt ("Send in your last Pokémon") and takes one tap.
  - The next turn's choices appear as soon as the previous turn ends; no extra confirmation steps.

### 12.2c Beginner hints

One toggle, clearly labeled, available on the home screen and in the battle menu, persisted in settings. On by default for new players, with a short note on first run that it can be turned off. Turning it off hides all hint UI immediately, including any pending explainers.

When on:

- **First-time explainers:** a one-line dismissible tooltip the first time each mechanic appears (Stealth Rock, Choice lock, Toxic, sleep, and so on). Shown once each, tracked in `settings.shownExplainers`.
- **Type-effectiveness labels** on move buttons against the opposing active Pokémon: the bottom line keeps the type and adds a short tag by the PP (Super, Super ×4, Neutral, Weak, Weak ×¼, No effect; Status for status moves), spelled out in the move's details card.
- **Team checklist** in the team builder (hazards, removal, attackers, defense) and the brief's tip line. With hints off, the builder never tells the player what their team is missing.
- **Speed range** line in Pokémon tooltips.
- **Team-builder checklist** and shared-weakness list (§12.2a).

- **Possible sets for the opponent:** an opponent's info on the brief lists the sets it might run (as tabs: moves, item, ability), and in battle its card lists the sets still possible given what it has revealed. No usage numbers or weights.
- **Coverage** in the team checklist: types none of your attacks hits super effectively, and types three or more of your team are weak to with nothing resisting (immunity abilities like Levitate count).

Never included: damage ranges, or usage numbers for the opponent's sets. With hints off, the opponent's sets stay hidden, as on Showdown.

### 12.2d Sheets and settings

- Bottom sheets close by swiping down from the handle or header (past 30% of their height, or a flick), as well as with ✕, a tap outside, or Back.
- Settings has **How to play**, which reopens the welcome sheet's rules.
- With **Animations** off (or the system asking for reduced motion), every sprite is a still image: the first frame of its GIF, from `sprites/front-still/` and `back-still/`.

### 12.2e Design language (Oct 2026)

Every screen outside the battle field wears the home screens' look: a Poké Ball split, warm and chunky. New screens follow it from the start. Before they ship, screenshot them at 360 and 375 px, in light and dark.

**Colour roles**

| Role | Colour | Used for |
|---|---|---|
| **Action (accent)** | Steel blue, `--accent` / `--btn-bg` (`#4a7088` light, `#8db2c5` dark) | Every big action: Start, Join, Let's play, That's me!, Next, Copy image, Learn's Start pills. It's the one colour that says "tap me", and it stands out against the clay. |
| **Game** | The game's lid colour (`LIDS` in `lib/genColors.ts`): Gen 3 green, Gen 4 blue, Gen 5 black and white, Gen 6 red | The game's header, and in place of steel blue for big actions on that game's own screens (team builder, lead pick, the battle's end card). Gen 5 uses its dark lid on light themes and its light button on dark ones. |
| **Clay** | `#a3646a` to `#8a4f58` | The home screens' lid, the Learn and Link Battle headers, the Poké Ball's centre. A surface colour, never a button. |
| **Seam** | `#2b2d36` | The Poké Ball's dark seam: under headers, along the top of sheets, cards and the end card. |

**Type.** Fraunces (serif) for screen and sheet titles, big actions, the name card's speech bubble, and headline numbers. The body font for everything else. The game's pixel font only for battle text.

**Buttons** (`styles.css`):
- `.btn-primary`: action colour, serif 17px (18px on game screens), 12px radius, and a pressed-down bottom edge (`0 4px 0` of the colour mixed with black). It sinks 2px when pressed.
- `.btn-secondary`: the surface colour with a 2px outline and a 3px pressed-down edge.
- `.cta-pill` for small actions in a list, and `.chunky-chip` (plus `.chip` on game screens) for chips.
- Battle controls (moves, switches, in-battle prompts) stay plain inside `.battle-ui`, so the field reads first. The end card (`.end-card`) is the exception.

**Danger.** A step that loses something gets `.btn-danger`: the same chunky serif button, in red (`--bad`). That covers forfeit, starting over with a new team, leaving a room, removing a player, and deleting the account. `ConfirmDialog` takes `danger` for these.

**Toggles, chips and fields.**
- Segmented toggles (difficulty, battle speed, a Pokémon's sets) are a chunky tray (`.seg`), with the picked option in the action colour.
- Option chips (a room's rules) are `.chunky-chip`, with the pressed one in the action colour.
- Every text field is `.field`: a 2px outline and a 12px radius, turning the action colour while you type. Field text is 16px or larger, or iPhones zoom in when a field is tapped.
- Settings rows are one line, a label and its control, with no descriptions. The welcome sheet explains them.

**Cards and sheets.** Sheets (`ui/Sheet.tsx`, `.menu-sheet`) and the end card have a 22px top radius and the seam drawn inside their top edge, so nothing grows taller. Sheet titles are serif. The first-open name card is the model for a card over a screen: the screen dimmed with a light blur, the card rising from the bottom, and a Pokémon standing on its edge when one is speaking.

**Motion.** Screens change with the lid, seam and ball gliding together (view transitions, §12.2). New content rises in and old content fades out. Nothing pops in ahead of its frame.

### 12.3 Rendering the battle

- Evaluate `@pkmn/client` and `@pkmn/view` for parsing/rendering protocol vs a minimal custom renderer. Pick the option that gets closest to Showdown's own look and flow (§12.2b) with the least custom work, and supports clear HP, status, hazards, weather, and move reveals.

Behind a substitute, the Pokémon's sprite is replaced by Showdown's substitute doll (front and back GIFs from play.pokemonshowdown.com, downloaded by `scripts/sprites.ts` with the other sprites, and credited with them) until the substitute breaks.

### 12.3a Sprites

This is a free, non-commercial fan project, and the priority is the best player experience. The images are Nintendo/Game Freak artwork (or Smogon community art in the Showdown style), so there is no open license; use them with credit and a disclaimer, as the rest of the fan community does.

- **Default (best UX): animated Showdown-style sprites.** The `PokeAPI/sprites` repo (cloneable or installable from GitHub) includes a `showdown` set of animated GIFs, front and back, made by the Smogon community in the Gen 5 style. These are what Showdown players already recognize, they give battles movement without extra work, and they cover every Gen 4 OU species. Expected path is under `sprites/pokemon/other/showdown/`; verify the exact folders and naming.
- **Alternative: authentic Gen 4 sprites.** The same repo should have per-version folders (Diamond/Pearl, Platinum, HeartGold/SoulSilver) with static front and back PNGs. Nostalgic and consistent with the Gen 4 setting, but static. Keep it behind the sprite interface as a user setting ("Classic sprites").
- **Self-host** the files you ship, limited to the species in the pool, with a CDN in front. Do not hotlink `raw.githubusercontent.com` (daily-red.com does; it is slow, fragile, and can be rate-limited). Preload the opponent's six sprites on the daily brief screen so the battle starts without pop-in.
- **Sprite interface:** all sprite access goes through `getSprite(species, side, style)` so styles and sources can be swapped without touching the UI.
- **Animations:** no custom animation layer. Do it the way Showdown does: animated sprites, plus whatever battle effects the chosen renderer provides (evaluate what `@pkmn/view` includes). Moves without an effect get Showdown-style simple fallbacks, not bespoke art. Provide an "Animations off" setting (instant HP changes and text only), like Showdown's, and respect `prefers-reduced-motion`.
- **Icons:** use small box icons for the team builder, lineup, and switch panel. Check whether the repo's icon set covers all species; otherwise crop from the sprites.
- **Attribution:** credits page and footer disclaimer (see §16). One note: a community spriter has objected to Showdown using their later-generation work without credit, so credit Smogon sprite artists generally and do not strip any watermarks.

### 12.4 Accessibility and mobile

- Touch targets, readable contrast, not color-only HP/result indicators, keyboard support on desktop.

## 13. Milestones

Each milestone is shippable on its own and has acceptance criteria.

**M0 — Repo and tooling**
Monorepo, TS config, lint, test runner, CI. _Accept:_ `pnpm test` runs; CI green.

**M1 — Data snapshot**
Script builds `sets.json` from `@smogon/sets` (with `@pkmn/smogon` and Smogon usage stats as supplements) for gen4ou with 1–4 weighted sets per species. Includes the set-weight derivation from §5.1 and a short write-up of the method chosen. Also generates a role label and one-line description per set (§5.2). _Accept:_ all sets pass the sim's validator; weights sum to 1 per species; documented source and refresh command; data redistribution/licensing question resolved or flagged in the README.

**M2 — Headless battle harness**
First step: confirm `gen4ou` is available in `@pkmn/sim` (§7), and wire in `formats.ts` or vendor Showdown if not. Then run a full gen4ou battle in Node between two trivial policies (start from `RandomPlayerAI`), with side-specific views. _Accept:_ 1,000 battles complete without errors; AI/policy code cannot access hidden info (test enforces it).

**M3 — Seeded generation**
Weekly pool and daily opponent generators with constraints and `generatorVersion`. _Accept:_ same key → identical output across runs; constraint tests pass over 10,000 seeds; no illegal teams.

**M4 — Opponent AI v1**
Belief model, utility scoring, softmax choice, style presets. _Accept:_ beats the naive bot clearly; behavior tests pass (takes available KO, doesn't use unrevealed info); win rate vs naive/mid/strong bots logged.

**M5 — Validation pipeline and schedule emitter**
Pool and opponent validation, reports, schedule files for N weeks. _Accept:_ produces schedule files with validation reports; rejects an intentionally bad opponent in a test.

**M6 — Web client: team building and state**
Weekly pool UI, role-named set picker, suggested-teams row, lock, daily brief with lead picker and daily swap, Beginner hints toggle and settings, localStorage. See §12.2a and §12.2c. _Accept:_ a team can be built and locked in under a minute; suggested teams are selectable and editable; state persists across reloads; swap limited to one per day; storage-unavailable path works; turning hints off removes all hint UI.

**M7 — Web client: battle UI**
Worker-based battle, move/switch UI, protocol rendering, AI turns, win/loss detection, attempts recording, run it back. Uses the sprite interface and self-hosted sprites from M6 (§12.3a; brought forward so the team builder could show them). _Accept:_ full playthrough on mobile and desktop; mid-battle reload handled per §7; no runtime requests to third-party image hosts; layout and flow follow §12.2b; speed control and tap-to-skip work; single-choice turns wait for your tap; Animations off setting works.

**M8 — Result and share**
Share text per §11, clipboard/Web Share; result card and daily-brief summary; derived streak and stats (§4.4); practice changes (§4.2). _Accept:_ snapshot tests for share output: first-try win, won on try 3, not cleared in 3, practice clear, mid-day, and swap marker; never any opponent species. Streak logic tests: only a first-try win extends, a lost first try (forfeits included) resets at once, a win on try 2+ does not extend, a missed day resets, and an unfinished today doesn't break yesterday's streak.

**M9 — Polish and calibration**
Playtest, tune AI parameters and validation thresholds, accessibility pass, legal/disclaimer page. _Accept:_ playtest notes incorporated; thresholds documented.

**M10 (later) — Puzzle mode**
See §14.

## 14. Second mode: mid-battle puzzles (later)

- Start at turn N of a battle with partial reveals (some opponent moves/items known). Player's side fully known. Goal: finish the win.
- Position source: bot-vs-bot games filtered for non-obvious winning lines.
- Verification: expectimax/MCTS solver offline; publish only positions where the best line wins at a high rate across opponent sets consistent with the reveals, and where the obvious greedy move fails.
- Reuses the engine, data, AI, and pipeline. Needs a position generator, a solver, and a position serializer.

## 15. Risks and open questions

- **Data source fit:** set-level usage weights are not available off the shelf (§5.1). Needs a derivation method and playtesting to confirm the weighted opponents feel realistic.
- **`gen4ou` in `@pkmn/sim`:** the package bundles only popular stable formats; verify early (§7).
- **Sprites:** see §12.3a. Non-commercial fan project; animated Showdown-style sprites by default, credited, behind a swappable interface.
- **AI realism:** hardest part to get right; budget playtest time and keep parameters data-driven.
- **Difficulty with hidden info and variance:** some losses come from wrong guesses and RNG; thresholds need real-player data.
- **Mid-battle persistence:** resolved by seed + choice-log replay (§7). Risk: any nondeterminism in the sim, AI, or a dependency upgrade breaks resume. Pin `@pkmn/sim` per release, and if a stored in-progress attempt was made under a different engine version, record it as a forfeit rather than resuming.
- **Assets and IP:** this is an unofficial fan project. Include a clear disclaimer, and resolve sprite and name licensing.
- **Streak fragility:** M8 counted a day won within 3 tries, but retries leak the opponent's sets and made the streak too easy to keep, so it now counts first-try wins only. One unlucky first attempt (crit, miss, or a wrong read) breaks it; that's the point of a streak. Tries 2–3 still clear the day. No streak freezes in v1.
- **Time zones:** local-date keyed content means players in different zones see different days at the same moment. Accepted for v1.
- **Retries leak sets:** intentional. Retries help the clear, but cannot keep the streak or earn the ⭐, and the share shows every try that counted.

## 15a. Open decisions

### Product decisions

| #   | Question             | Status                  | Decision                                                                                                                                                                                                                                                                                           |
| --- | -------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Name and branding    | Decided                 | **Pokémon Daily** (first Daily Battle), served from a subdomain of an existing domain. The owner chose to put "Pokémon" in the name, with its logo on the landing (`public/logo.webp`), knowing the trademark risk; About says it is unofficial and unaffiliated. The share header names the game (`Pokémon Daily · Gen 5 OU · Oct 21`) and the link opens that game. The installed app's short name is "Poké Daily". Saved progress keeps its `daily-battle:` storage keys, so nobody loses a streak              |
| D2  | Target difficulty    | Decided                 | About 50% first-attempt win rate for an average player; 2–3 attempts to clear. Validation bands in §9.3                                                                                                                                                                                            |
| D3  | Streak definition    | Decided (revised again) | Consecutive days won on the first try; a lost first try or a missed day breaks it. A first-try win is marked with a ⭐ in the share and on the result card; tries 2–3 still clear the day                                                                                                         |
| D4  | In-battle assistance | Decided                 | One "Beginner hints" toggle, on by default for new players, easy to turn off (§12.2c). Hints cover first-time explainers, type-effectiveness labels, speed range, and the team-builder checklist. With hints off, the battle mirrors classic Showdown. No damage ranges and no "usually runs" info |
| D5  | Telemetry            | Decided                 | None in v1 (static site). Calibrate difficulty with friends and manual feedback; consider an opt-in anonymous endpoint after launch                                                                                                                                                                |

### Proposed defaults (change if you disagree)

- **Ruleset:** use the sim's `gen4ou` clauses and bans as-is for both sides. The AI must respect them (e.g. sleep and freeze clauses).
- **Customization:** preset sets only. No custom EVs, moves, or items.
- **Suggested teams:** 2–3 validated teams offered as a selection in the team builder (§12.2a). Never applied by default; always editable before locking.
- **Weekly pool timing:** visible to everyone at the start of the week. Late joiners get the same pool and the same daily swap rule.
- **Opponent style hint:** not shown in v1. It would give away information.
- **Streak freezes:** none (see the streak fragility risk in §15).
- **Audio:** off by default, optional sound effects, no music in v1.
- **Anti-cheat:** none. The game is client-side and single-player; state can be edited in dev tools. Accepted.
- **Forfeit and reload:** per §7 (forfeit counts as an attempt; reload resumes).

## 16. Legal

Unofficial fan project, not affiliated with or endorsed by Nintendo, Creatures Inc., GAME FREAK inc., The Pokémon Company, or Smogon. Pokémon, Pokémon character names, and sprites are © Nintendo, Creatures Inc., and GAME FREAK inc.

- Code: `@pkmn/*` packages and Pokémon Showdown code are MIT licensed. Keep license notices as required. The Hard AI's engine is poke-engine by pmariglia (MIT), built from our fork; credited in About.
- The Pokémon Showdown _client_ (`smogon/pokemon-showdown-client`) is AGPL-3.0. Pokémon Daily uses none of its AGPL code (no CSS, no UI). It does vendor the animation engine's data files, which are separately licensed: the move animations (`battle-animations-moves.ts`, CC0) and the effect table with the shared and status animations (`battle-animations.ts`, MIT), pinned to one client commit and sliced to Gen 1–6 moves by `scripts/anims.ts` (headers kept, in `src/battle/anim/vendor/`). The battle text comes from `@pkmn/view`'s MIT-licensed `LogFormatter`. The backgrounds, hazard sprites, weather overlays, and effect images are from the client's `fx/` folder (`scripts/fx.ts`), which it dedicates to the public domain (CC0) except `icicle.png` and `lightning.png` (GPL/CC-BY-SA, by Clint Bellanger) and `rock1.png`, `rock2.png`, `rocks.png` (GPLv3, by Gilad); those are credited in About, and `bone.png` (no license) isn't shipped: a plain wisp stands in. Everything is self-hosted. The animations are drawn with the Web Animations API by our own scene adapter (`src/battle/anim/scene.ts`): effects are placed in Showdown's scene space and mapped onto our field, anchored on the two sprites, and run synchronously per `move` event; the turn waits for the animation, tap skips it, speed scales it (Fast uses Showdown's quick generic animations), and Animations off or reduced motion draws none. Showdown's CSS-drawn effects (screens, Protect) are not ported.
- Data: confirm redistribution terms for Smogon set and usage data; credit Smogon.
- Sprites: see §12.3a. Credit Nintendo/Game Freak/Creatures and the Smogon sprite community on the credits page.
- Keep the project free and non-commercial (no ads, paywalls, or merchandise). Revisit this section if that changes.

## 17. Gen 5 OU (added Oct 2026)

A second daily game beside Gen 4 OU, built in phases G1–G6 on the `gen5` branch. Each phase kept Gen 4's published content byte-for-byte: its seed keys, golden fixtures, set ids, and AI choices.

- **Format as a parameter.** `packages/data/src/formats.ts` lists each format (sim id, dex generation, name, lower tier, Team Preview). Set data records its format (`meta.format`), and the generator, AI calc, sim bridge, and pipeline jobs all take it from there. Gen 4 OU keeps its bare seed keys; other formats prefix theirs (`gen5ou:gen4:week:…`).
- **Data** (`gen5ou/`, see `packages/data/README.md`): 108 species with 2–4 sets each. Hidden abilities are legal. Ditto and Zoroark are left out, since Imposter and Illusion break "species visible, sets hidden". No set uses Swift Swim or Chlorophyll, so no pool can hold a team that breaks Drizzle ++ Swift Swim or Drought ++ Chlorophyll. 40 hand-written sets fill out species whose Gen 5 analyses had a single distinct set, and the labels were reviewed by hand.
- **Team Preview.** The sim asks each side for `team N…` before turn 1. The AI scores each of its six as the lead by its average matchup against the foe's six (sets by prior), plus part of a hazard's early value, and samples with its usual noise; the player's lead comes from the brief. Foes seen only in preview count as healthy. The AI also weighs Magic Bounce and Regenerator.
- **Hidden blocks.** Imprison blocks moves without the request saying so. The sim rejects the choice as unavailable and sends an updated request, and the side chooses again. The rejected choice isn't recorded, and the player sees "That move can't be used right now. Choose another."
- **Schedules** live in `schedule/gen5ou/` and `reports/gen5ou/`, built with `schedule --format gen5ou`. A trial week met the existing bands with no AI retuning. Gen 5 opponents come out too hard more often (the resampling absorbs it), and its pools are weaker against random probes (about 60% of sampled teams viable, against Gen 4's 85%).
- **Web.** The title (`Gen 5 · Wed, Oct 28 ▾`) opens a picker with each game's streak and today's status. A first-time player picks a game on the welcome sheet; returning players land on the last one played. Gen 5 battles use Showdown's 15 Gen 5 backgrounds, and the sprites are shared. With hints on, the brief notes that the opponent sees your six too.

## 18. Versus rooms (Oct 2026)

A room where friends play live battles against each other, Super Auto Pets style. Same pools, sets, builder, and battle screen as the daily games; the opponent is a friend instead of the AI.

### 18.1 Rules

- **Room.** The host creates a room and shares its short code; friends join with the code and a display name. No accounts: a token in localStorage reconnects you. The host picks the game (any supported format, §17), the lives, the turn timer, and handicaps, then starts.
- **Pool.** A new random pool of 12 per room, drawn by `generatePool` from the room's seed. The host can redraw it before starting, or pick the current week's daily pool for that game instead.
- **Build.** Everyone builds 6 from the 12 at once, on a timer, with the daily builder.
- **Rounds.** Each round pairs living players at random, avoiding last round's rematch where possible. Then:
  1. **Swap phase.** You see who you face and their current six species (never their sets, even ones revealed in earlier rounds). You may make one change: replace one Pokémon from the 12 (choosing a set) or change one set, the same rule as the daily change (§4.2). Both players swap at once, on a timer, and swaps stay hidden until the battle starts. Unused changes don't accumulate.
  2. **Lead.** You pick your lead, as on the daily brief.
  3. **Battle.** A live battle with a turn timer.
- **Your team carries over** from round to round, changes included.
- **Lives.** 2 by default (host setting). A loss costs one; a tie (the turn cap, or both sides' last Pokémon fainting together) costs both players one. At 0 you're out and can spectate.
- **Odd counts.** One living player each round faces the AI with a generated opponent team. A loss to it costs a life, the same as any other.
- **End.** The last player standing wins. If the last players all reach 0 in the same round, they share the win.
- **Handicaps.** A team size per player (6, 5, 4, or 3), set by the host. The sim doesn't require six in these formats.

### 18.2 Live play

- **Turn timer.** Like Showdown's: a time bank plus a cap per turn. Running out loses the battle.
- **Disconnects.** A player's clock keeps running while they're away, so an abandoned battle ends when their time does (at most one turn's cap). A reconnect, or a reload, resumes the battle where it was.
- **Length.** A live 6v6 takes 10–20 minutes, so a room of four with 2 lives runs several rounds. The timer, the lives default, and handicap teams keep it in bounds.

### 18.3 Architecture

- **Server.** A Cloudflare Worker with one Durable Object per room, deployed with the existing `wrangler` config. The room object holds the room state and each player's websocket, and runs the battles itself on `@pkmn/sim` through `BattleSession`, so a player's browser never receives the other side's sets or request (the same hiding rule as §7). Hosting a battle in one player's browser would expose the other player's sets to them.
- **Messages.** After each choice the room sends each player a `SideUpdate`: that side's new protocol lines, its pending request, and whether the battle is over (`apps/web/src/battle/presenter.ts`). It never sends the spectator log to players in the battle.
- **Client.** `SidePresenter` turns one side's updates into the battle screen's frames, team, and controls. The daily engine uses it for p1 in the worker; a versus battle uses it for whichever side you are, fed from the websocket. The battle screen doesn't know which.
- **Resume.** The room stores each battle's seed and both sides' choices, and rebuilds the battle by replaying them when the object restarts (the §7 design, on the server).
- **Daily mode is unaffected.** The daily games stay client-side and work without the server.
- **Rooms (V2).** `POST /api/rooms` picks a free code (5 letters from 20 consonants, so no words and no I/O look-alikes) and sets up that code's Durable Object; `GET /api/rooms/CODE/socket` is the room's websocket. Both refuse requests whose `Origin` isn't the site. The room's rules are pure functions in `packages/versus` (join, leave, host-only settings, team sizes, removal), and the Durable Object (`apps/server`) applies them and broadcasts the room to everyone in it. Up to 8 players, with unique names of 1–16 characters. The first to join is the host; when the host leaves, the next to have joined takes over. A room nobody has been connected to for 24 hours is deleted.
- **Seats.** Joining returns a token, kept in localStorage (`daily-battle:versus`, apart from the daily save) with the name you play under. A reload or a dropped connection rejoins with it, retrying with backoff, so you keep your seat; the lobby shows who's away. Opening the room in a second tab moves you there. A removed player's token stops working, and they can join again as a new player.
- **Battles (V3).** Each battle starts lead first. The room runs each battle on `BattleSession` and records every accepted choice on the match, so the battle is rebuilt by replay when the Durable Object wakes. Choices are checked against the request first; a move hidden information blocks (Imprison) comes back to its player to choose again, as in §17. After each choice both players get their side's new lines and request (`WireUpdate`), so a choice is always answered: waiting for the foe shows as "Waiting for …" over the controls. Clocks are Showdown-style per `TIMERS`: each side's runs while it has a request, and the room's alarm goes off at the next deadline (the swap, a clock, the build, or the break) to move the game on, ending a battle for whoever ran out. Giving up, leaving, or being removed mid-round loses that battle. Each player keeps their end card until they go back to the room.
- **The game (V4).** The lobby shows the room's 12; the host can redraw a random pool or switch to this week's (read from the published schedule through the Worker's `ASSETS` binding, with the host's week; a week with no schedule keeps a random pool and says so). **Start the game** opens the build: everyone builds their team size from the 12 in the daily builder, for 3 minutes; anyone still building then gets the pool's most used Pokémon with their most used sets. Each round pairs players by lives (fewest rematches first, then the smallest gap in lives, over every possible pairing), and an odd player out faces the AI ("Rival", a daily-style generated team at their team size, played by the daily AI with that team's style), rotating to whoever has faced it least. Before each battle, both players have 60 s to make one change (another Pokémon from the pool, or another set; checked against the set data and the validator), pick a lead, and ready up; the change stays on their team for good. A loss costs a life, a tie costs both, a loss to the AI costs one too. When every battle is over the room shows the round's results, the standings with hearts, and your next opponent for 8 s, then starts the next round. A player out of lives gets a placement (players out in the same round share it); the last one in wins, and if the last ones go out together they share the win. Leaving or being removed mid-game puts you out at once (your battle counts as a loss) and keeps you in the standings. The host can **Play again** with the same players. Rooms carry a version: a room saved by an older server goes back to the lobby with its players and settings.
- **Cost.** Measured locally, a turn takes about 2 ms of CPU, setting up a battle 3–17 ms, and rebuilding a whole battle from its choices about 100 ms. The Worker bundles the simulator (about 10.6 MB, under the 64 MiB limit). The Durable Objects limit is 30 s of CPU per message; if Workers Free's 10 ms per request applies to Durable Objects too, the setup and rebuild steps would need the paid plan.
- **Rival difficulty (added Oct 2026).** The host picks the Rival's difficulty in the lobby (`RoomSettings.rivalDifficulty`, Normal by default; Hard only for games with an engine, §4.6). The match records it (`aiDifficulty`), so it holds for the whole battle. The server bundles the four engine modules (`apps/server/src/engines.ts`, loaded on first use so Normal rooms never compile them). The Worker is about 2.3 MB gzipped, under Workers Free's 3 MB. A Hard decision takes about 0.3 s of CPU, within a Durable Object's 30 s per message. The AI's choices are recorded like the players', so rebuilding a battle never searches again. A room whose game has no engine plays the Rival on Normal.
- **Entry.** The game picker (tap the title) ends with **Versus with friends**, which opens `#versus`; invite links are `#versus/CODE`.

### 18.3a Elimination, spectating, and between rounds (decided Oct 2026)

- **Out.** A knocked-out player gets a short card in the break ("You’re out", placement, wins and losses), then goes straight to watching when the next round starts. They stay in the room as "Out (5th)", see every round's results and pairings, and can leave at any time. The last player standing gets a winner screen with light confetti, a podium for the top three, and the full standings; the host can **Play again** with the same players.
- **Who watches (revised).** As in Showdown tournaments, players still in the game can't watch battles in progress. Full spectating is for players who are out, and for people who join a game already under way as spectators: they enter a name, take no part in this game, and become players when the host plays again (if the room has space). At most 8 spectators. Spectators see what the public log shows (moves, items, and abilities as they're revealed, HP as percentages), never hidden sets or exact HP, with no delay.
- **The room drawer.** A drawer on every in-game screen (the swap, a battle, the break), like Super Auto Pets' versus rooms: each player with their hearts and their team as Poké Balls (no species), fainted ones greyed while they battle, plus who's battling whom and how each battle stands. For spectators, each battle in it opens that battle.
- **The spectator feed.** The room sends spectators a third view of each battle, its spectator log (`BattleSession.spectatorLog`), drawn with a spectator presenter: p1 at the bottom, p2 at the top, both named. Players still in never receive it.
- **Layout.** On desktop, a grid of every live battle. With at most 8 players there are at most 4 battles, so a 2×2 grid shows them all. Each card has a compact field, both names with hearts, team balls, and the last couple of log lines; clicking one focuses it full size with the full log, and the rest move to a side rail. On phones, two battles are stacked, each a compact field with one line of text, with chips to switch quickly between battles. Full move animations play only on the focused battle; compact cards animate HP, faints, and switches. A "Last Pokémon!" badge marks a battle down to one Pokémon on either side, and on phones the closest battle moves to the top.
- **Reactions.** Spectators can send a few fixed emoji (😮 🔥 😂 💀 💩 👀), which float over the battle for everyone watching it, including its two players. One a second per person; no text chat. A player sees reactions once their battle screen is up (one sent while it loads is dropped).
- **Pairing.** Players with the same number of lives are paired when possible, avoiding last round's rematch. An odd player out faces the AI.
- **Between rounds.** A sequence of about 8 s that everyone sees together, driven by the room (an `intermission` phase on the alarm):
  1. results, with each battle's card sliding in, the winner lit and the loser's heart cracking, and eliminations stamped "Out" with a placement;
  2. the standings, sliding in;
  3. a VS reveal, where a quick shuffle of names lands on "You vs …" with both players' hearts (the species come in the swap phase); players who are out see every pairing instead.
  The swap timer starts for everyone when the sequence ends. Tapping skips ahead on your own screen only. Reduced motion uses fades only.

### 18.4 Phases

| Phase | What                                                                                                                   | Done when                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| V1    | Split the frame building out of `BattleEngine` into `SidePresenter`, working from either side                          | Daily battles unchanged; tests drive a battle from both sides (done) |
| V2    | Worker, room Durable Object, websocket protocol, lobby (create, join, settings), reconnect tokens                       | Friends can join a room and see each other (done)                   |
| V3    | One live battle between two players in a room: server-side sim, turn timer, disconnect grace, resume                    | Two browsers play a battle to the end (done)                        |
| V4    | The room loop: pool and build phase, pairing by lives, swap phase, lives, elimination, the AI for odd counts, results   | A room of three plays to a winner (done)                             |
| V5    | The room drawer, spectating for players out and late joiners (multi-battle grid, reactions), the between-round sequence, elimination and winner screens, an entry from the daily game | A late joiner watches two battles at once on a phone, and an eliminated player watches the next round (done) |

## 19. Gen 6 OU (added Oct 2026)

A third daily game, built in seven phases the same way as Gen 5 (§17). Each phase kept Gen 4's and Gen 5's output byte-for-byte: seed keys, golden fixtures, set ids, schedules, and AI choices. Nothing in `GENERATOR_VERSION` or the AI changed for them; every new rule is gated on Gen 6 data or format.

- **Format.** `gen6ou` in `formats.ts` (Team Preview on). Showdown's Gen 6 OU bans are the validator's: Baton Pass, Swagger, King's Rock, Quick Claw, Razor Fang, Arena Trap, Shadow Tag, and the Uber Megas. Gen 5's team-wide `++` bans don't exist in Gen 6, so Swift Swim and Chlorophyll sets are back. Sleep moves are legal under the sim's Sleep Clause Mod.
- **Megas in the data** (`gen6ou/`, see `packages/data/README.md`): 106 species and 288 sets. Mega forms aren't species of their own: their sets and usage fold into the base species, with the stone as the set's item and a "Mega …" role label. 26 species have Mega sets (47 sets). A species' tier is the higher of its base and Mega tiers (Mega Venusaur makes Venusaur OU), and its usage is base plus Megas. A species keeps only its viable sets, so Pidgeot is Mega-only with one set; the 2–4 target is relaxed for Mega species. `species.json` records each Mega's forme, stone, types, stats, ability, and tier.
- **One Mega per team** (our rule; Showdown has none). `oneMegaProblem` in `@daily-battle/data/species` is the one check, used by the sim bridge's `teamProblems`, the opponent generator (redraws a team with two stones), the pipeline's sampled teams, the team builder and the daily swap (blocked with "Only one Mega per team."), and tests.
- **Pools** always offer at least one Mega species, and at least five that don't need one. Type-coverage checks count a Mega set's typing.
- **Sim bridge.** With a Mega available, `legalChoices` adds `move N mega` for each move. A foe's stone stays hidden until it Mega Evolves (tested).
- **AI.** Mega Evolution is a scored choice: the move's score in Mega form plus a preset bonus for keeping the boost all battle, sampled with the usual noise. It moves at its old Speed on the turn it Mega Evolves. Pokémon are tracked by base species; a revealed Mega narrows the foe's sets to that stone, and once one foe has Mega Evolved, no other is assumed to. Damage is calculated in Mega form when a Pokémon has Mega Evolved or is assumed able to, and leads are rated the same way. Gen 6 mechanics it scores: Sticky Web, Defog clearing both sides, terrains, 5-turn ability weather, Sleep Clause, Grass types ignoring powder, Electric types immune to paralysis, and Gale Wings and Prankster priority. Fairy, Assault Vest, and the damage changes come from `@smogon/calc`; trapping (Ghosts escape it from Gen 6) comes from the sim's own legal choices.
- **Schedules** live in `schedule/gen6ou/` and `reports/gen6ou/`, built with `schedule --format gen6ou` from 2026-10-19. The player bots Mega Evolve too, and the archetypes know Assault Vest, Weakness Policy, Geomancy, and Sticky Web.
- **Web.**
  - **Font:** Nunito 700 (`@fontsource/nunito`, OFL), a clean rounded face close to X/Y's battle text, for Gen 6 only (`[data-gen='6']`).
- **Home screen.** A Poké Ball split: the top card (about 56% of the height, the primary mode) has the Pokémon Daily logo, a mascot for each generation on a small platform (Swampert in its Emerald sprite, Lucario, Volcarona, Sylveon; a tap opens that generation, and a green check appears only once it's cleared today), and Play, which opens the generation picker. Below, With friends, with a crowd of cute first stages (Eevee in the middle; `src/lib/friends.ts`), as many as fit across the screen so none is cut off.
- **Battle text (all gens).** The text under the field is a box showing as much of the log as fits, ending at the newest line, with a thin divider at each turn (`battle/ui/BattleLog.tsx`; the lines between `== Turn N ==` markers are one turn, `battle/ui/turns.ts`). Scroll up for earlier turns, or tap the arrow at the top (it goes back a turn at a time; one at the bottom comes forward); it follows the newest line until you scroll up. There's no expand button. Lines are ranked as on Showdown (`battle/ui/lineKind.ts`): moves used, who came in or out, and faints are big; stat and status changes are medium; damage percentages and effectiveness are small; ability pop-ups, weather, Leftovers, and poison are smallest and gray. Spacing is tight, and tighter on screens under 720px tall, where the turn dividers take almost no height. The box takes the spare height under the field and controls, the same in every generation (the field never shrinks for it). On screens under 720px tall (the `short:` variant) the controls give it room: the moves are shorter, the bench tiles shrink, and the forced-switch cards are shorter, with names kept whole; a 360×640 phone's box goes from about 106px to 150px. Gens 3 to 5 share one font, VT323 (`@fontsource/vt323`, OFL): a narrow terminal face with finer pixels than the games' own, so it reads easily while still looking retro. The games' fonts are Nintendo's, so it stands in for them. Small print stays on one line (it shrinks a little to fit). The switch row starts with your Pokémon in battle, outlined, which shows its details on a tap but has nothing to switch to, then the rest of the team. Each side's stat bar shows its Pokémon's types (a Mega's as it looks now), and a foe's hover/tap card lists the abilities its species can have until the battle shows one, then only that one. Finishing a day (the end card, the daily brief, the share sheet) offers the other generations in a "Play another generation" row, with today's status for each.
  - **Sprites:** the shared battle sprites were already Showdown's animated 3D (X/Y model) sprites, placed Showdown's way, so Gen 6 needed no separate folder: `scripts/sprites.ts` added the new species and every Mega forme.
  - **Backgrounds:** Showdown's Gen 6 backdrops aren't in its client repo and aren't CC0, so Gen 6 uses the CC0 Gen 5 set, picked by its own hash.
  - **Battle:** a Mega toggle above the moves (keyboard-reachable, disabled once used), the Mega sprite swap and Showdown's Mega Evolution animation, a Mega badge on the stat bar, Sticky Web on the ground, Grassy and Misty Terrain overlays, Fairy's type color, move animations through Gen 6, and first-time explainers for Mega Evolution, Sticky Web, and terrains.
  - **Hidden info:** foe Megas stay hidden, as on Showdown. With Beginner hints on, the brief, popover, and info sheet say "Can Mega Evolve" for foes with Mega sets. Usage is never shown.
  - **Builder:** a Mega set previews its Mega (sprite, typing, ability, stats) next to the base form, and the team checklist uses Mega typing.
  - **News:** players from before Gen 6 see "New: Gen 6 OU" once (`gen6-news`), with Try or Stay; a player who missed the Gen 5 sheet sees only this one. The welcome sheet offers all three games. `#gen6` links open it. Saves need no new version: a missing game is added empty on load.

## 20. Gen 3 OU (added Oct 2026)

A fourth daily game, ADV OU, built in the same phases as Gen 5 and 6. Gen 4, 5, and 6 output is unchanged: golden fixtures, set ids, schedules, and AI choices (the Gen 4 AI eval matches `main` exactly). Every new rule is gated on Gen 3.

- **Format.** `gen3ou` (no Team Preview, like Gen 4), listed first in `formats.ts` so the picker and welcome sheet run by generation. Showdown's ADV rules apply: Ubers, Sand Veil, Soundproof, Quick Claw, Assist, and Swagger banned, Sleep Clause Mod and Freeze Clause Mod, and the One Boost Passer, Speed Pass, and Accuracy Trap clauses. Physical or special follows the move's type, and Spikes is the only hazard.
- **Data** (`gen3ou/`, see `packages/data/README.md`): 76 species, 197 sets, 2–4 each. Ditto and Wobbuffet are left out: Shadow Tag with Counter and Mirror Coat plays as a coin flip against a hidden set. The One Boost Passer Clause is team-wide, so Baton Pass sets that can raise their stats are dropped and any 6 of a pool stay legal (every cross-species pair passes the validator). 23 hand-written sets fill out species with a single distinct set, and 63 labels were rewritten by hand. Stats come from pkmn's mirror, as for Gen 6.
- **Pools** need a Spikes setter where later gens need Stealth Rock.
- **AI.** Sleep moves are scored under Sleep Clause (ADV is full of Spore, Hypnosis, and Lovely Kiss), and Electric types can be paralyzed. The calc handles type-based categories, Explosion halving Defense, and the Gen 3 items. The eval (`--format gen3ou`) meets every threshold; strong beats mid narrowly (51%), but the pipeline's skill check rejected only one candidate in the trial week.
- **Schedules** live in `schedule/gen3ou/` and `reports/gen3ou/`. A trial week met the bands with no retuning and no turn caps (ADV stall doesn't stall the pipeline). Opponents land far from the band more often than in Gen 4, and the resampling absorbs it (up to 18 candidates for a day). A week takes about 17 minutes on 4 workers.
- **Web.** Gen 3 battles look like the games: Emerald's own front and back sprites (still, from PokeAPI's `generation-iii/emerald`, in `sprites/gen3/`, drawn 1.5× to stand on the platforms like the other gens'), Showdown's six Gen 3 backgrounds (CC0), and the shared Gen 3 to 5 battle font (VT323, below). Box icons stay shared. Returning players see "New: Gen 3 OU" once (`gen3-news`), and `#gen3` links open it. Versus rooms can pick Gen 3 too.

## 21. Sound (added Oct 2026)

Battle music and Pokémon cries, as on Showdown, across every game, plus a select sound on taps and team builder music. Off by default: until a player turns it on, no audio is downloaded or played.

- **Settings.** A **Sound** switch, and separate **Music volume** and **Effects volume** sliders (0–100%, default 50%; each at 0 silences just that kind). They're in `settings` (`sound`, `musicVolume`, `effectsVolume`); saves from before pick up the defaults on load, so there's no new version.
- **Music** plays in battles (daily battles, versus battles, and watching) and in the team builder. Each generation has the games' trainer battle theme (Ruby and Sapphire, Diamond and Pearl, Black and White, X and Y). It starts with the battle, loops with a 2.5 s crossfade (the tracks end in a fade-out), fades out when the battle ends, and pauses while the tab is hidden. The four tracks were supplied as files and prepared once: `ffmpeg -i <in> -map 0:a -map_metadata -1 -af "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-18:TP=-1.5:LRA=11" -ar 44100 -ac 2 -b:a 96k public/audio/music/gen<N>.mp3` (trimmed, loudness-matched, about 2 MB each).
- **Team builder music.** One track for every generation (`public/audio/music/teambuilder.mp3`, supplied as a file), playing while the team is picked, daily or versus. It's mastered about 3 dB quieter than the battle tracks (ffmpeg `silenceremove`, `loudnorm=I=-21:TP=-1.5:LRA=11`, 96 kbps stereo) so it sits under the menus at the same Music volume. Locking in hands over to the battle's track; the builder closing never stops a battle's music.
- **Cries** play when a Pokémon comes out, when it Mega Evolves, and lower and slower when it faints. Gen 3 to 5 use the game-era cries (PokeAPI's `legacy`, falling back to `latest` for formes without one); Gen 6 and every Mega use the current ones. `scripts/audio.ts` downloads them for exactly the species and Megas in the set data and converts them to small MP3s (302 files, 3.7 MB). Only turns that play out make sound: skipped, resumed, and instant turns are silent, and a new cry cuts the last one off, so fast turns don't pile up. Watching several battles plays music but no cries.
- **Versus** adds a short synthesized chime (no file) when your battle starts, and when it's your turn while you're on another tab.
- **Select sound.** Every tap on a control, in menus and battles alike (landing, game picker, brief, team builder, moves and switches, Learn, versus, sheets), plays a short select sound (`public/audio/sfx/select.mp3`, supplied as a file and prepared once: silence trimmed, mono, +6 dB, 0.6 s, 5 KB). One capture-phase listener does it (`menuSounds`), skipping disabled controls. It's an effect, so it follows Sound and Effects volume, and it never cuts off a cry.
- **Code.** `src/lib/audio.ts` is the only place audio is touched. Battles call `startMusic` and `stopMusic` and play cries from their frames' events.
- **Rights.** The music and cries are Nintendo's, like the sprites, and are credited in About. The site stays free and non-commercial (§16).

## 22. Tutorial and coach (Gen 3, added Oct 2026)

A **Learn** mode teaches Gen 3 OU from the basics, and a **coach** helps in real battles. EVs, IVs, and natures are out of scope.

- **The course** (`packages/tutorial/src/gen3/course`): 18 short lessons in 7 units, then graduation, taught on the battle screen. Each lesson has looks and demos (the spotlight points at what matters, one turn plays on Watch), two practice positions (your pick plays out, then Show better), and a short battle against the Easy AI with the coach. **#learn** opens the course map; every lesson can be opened, and the next is suggested. Lessons 1–8 are built; the rest show as Soon. It replaced the first 12 text-and-quiz lessons in Oct 2026, and everyone started it fresh (a graduation from before stays in saved progress).
- **Lesson screens.**
  - **Outlines:** a practice lights every graded answer equally, with no ring, and rings only the info to look at, so the best answer never stands out (the content validator rejects a practice spotlight that names an answer). On the bench, your active Pokémon carries a small **In battle** tag, not a ring.
  - **Moving around:** demos and practices have `‹ 2 of 7 ›` in the header (and ←/→): back to any earlier slide, forward only to the furthest reached (`tutorial.current.reached`). The practice battle's intro and end card have **Previous slide**. Every way out of a lesson reads **Back to lessons**.
  - **Practice battles:** a battle may start foes part-way down (`hp`), so the lesson's idea decides it. A loss shows the step's **hint**. After 2 losses, the end card offers **Replay with help**: each turn a tip names the coach judge's top move (or the teammate to send in), seeded per decision as in the content tests (`coach/guide.ts`). The tests check that this guided line wins every battle on its own seed and at least 90% of seed variants.

- **Type matchups**, outside the numbered course:
  - **Type trainer** (`#learn/types`, a small pill beside the Learn title): rounds of 10 questions, each a real OU Pokémon (sprite and types) and an attack type. Answer ×4 to ×0, then see why, type by type. Spaced repetition: each matchup (an attack type against a typing) sits in a box from 1 to 5; a right answer moves it up, a miss sends it back to 1, and lower boxes come up more often (`settings.typeTrainer`, per game, `lib/typeTrainer.ts`). Questions whose answer would depend on an ability (Levitate, Flash Fire, Thick Fat, …) are skipped. A round ends with the score, a line for it, and every question with its answer.
  - **Type chart** (a sheet, from the trainer and the battle menu): pick a type to see what its moves hit hard, weakly or not at all, and what it takes double, half or nothing from, for the game being played (Fairy in Gen 6).
  - Lesson 2 anchors the chart on the starters' triangle (Water › Fire › Grass › Water) and points to the trainer.
- **Finding it.** A small **Battle basics** pill under Play on the landing, a **Battle basics** pill on the Gen 3 cartridge in the game picker, and a "New to competitive Pokémon?" card with **Start the tutorial** on the welcome sheet and in How to play (it opens the next unfinished lesson).

- **Coach.** Rule-based, from the player's own view only (it never sees the foe's real sets). It gives an occasional turn tip, asks before a clear blunder ("Do it anyway" / "Pick again"), and reviews up to 3 key turns after the battle. It's paced so it isn't distracting: at most one tip per turn, a gap of 3 turns between tips (2 for urgent ones: "this hit KOs you", "you can KO"), no tip while a lesson prompt or hint is showing, and a warning the player overrode isn't asked again that battle. Warnings only appear when the blunder is picked.
- **Where.** On in every lesson battle (the coach only talks about what the lessons so far have taught). In the daily, it's offered in Gen 3 on Easy and Normal (not Hard, until its search-based coach exists). Off by default; offered once on a game's first daily brief and again after graduation (`settings.coachOffered`).
- **Turning it on.** A **Coach** pill beside the difficulty picker on the brief (`settings.coach`, per game), or a switch in the battle menu mid-battle. Either asks first when it costs a streak. Once on, that attempt is `coached: true` for good; mid-battle, the battle restarts with the coach from the same turn.
- **Coached results.** Coached tries count in their own **Coached** bucket per game, shared across difficulties, with its own streak and stats (a first-try coached win extends it). A coached try before the day is cleared ends the regular streak of the difficulty it was played on; coached practice after a clear doesn't. The header, battle, Home card, and result show **Coached**, and the share header adds it after the level of the deciding try: `Gen 3 OU · Easy · Coached · Oct 21`.
