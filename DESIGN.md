# Daily Battle — Design Doc

Name: **Daily Battle**, hosted on a subdomain of an existing domain, so the name does not need to be unique or separately registrable. A daily Pokémon battle game built on Gen 4 OU, inspired by daily-red.com but with competitive Smogon sets, a player-built weekly team, a generated opponent each day, and a realistic ladder-style AI.

This doc is written to be split into implementation chunks. Section 13 lists milestones with acceptance criteria. Verify package APIs and licenses against current docs before relying on them; names below are from memory.

---

## 1. Summary

- Each **week**, the player builds a team of 6 from a pool of 12 Pokémon, choosing a set for each. The team is locked for the week.
- Each **day**, the player faces a generated opponent team. Opponent **species are visible; sets are hidden**.
- The goal is to win a 6v6 Gen 4 OU battle. No other objective.
- **Unlimited attempts** per day, but the **first attempt is the scored one**: it decides the day's result and the streak. Retries ("run it back") are allowed and still count as clearing the day, but they cannot rescue the streak. Sets are fixed for the day, so retries leak information.
- **Difficulty target:** about a 50% first-attempt win rate for an average player, and typically 2–3 attempts to clear a day.
- Once per day, the player may **swap one Pokémon or one set**.
- The opponent AI plays like an average ladder player: imperfect, sometimes wrong, never omniscient.
- Fully client-side, self-hosted, no accounts. State in localStorage.

## 2. Locked decisions

| Area | Decision |
|---|---|
| Format | Gen 4 OU, singles, 6v6, Showdown mechanics |
| Engine | `@pkmn/sim` (standalone Showdown simulator), self-hosted, no Showdown server |
| Set data | Smogon data (usage-weighted). 1–4 most common sets per species, weighted by usage |
| Player team | Weekly. Pick 6 of 12, choose a role-named set for each, lock for the week. Optional suggested teams are a selection, not a default. No lineup ordering; the lead is picked on the daily brief |
| Daily swap | One per day: replace one Pokémon (from the original 12) OR change one set. Not both. Done on the daily brief screen |
| Opponent | New each day. Species visible, sets hidden |
| Attempts | Unlimited, with "run it back". The first attempt of the day is the scored result; retries still count as a clear but never change the streak |
| Battle RNG | Fresh random seed per attempt, stored for resume (§7), never shared, so replays cannot be memorized. Team and set generation ARE seeded by date |
| Streak | Consecutive days with a first-attempt win. Breaks on a first-attempt loss or a missed day. No freezes |
| Difficulty | ~50% first-attempt win rate for an average player; typically 2–3 attempts to clear |
| AI | Utility scoring + softmax noise, tuned to average ladder behavior, acts only on revealed info plus set priors |
| Share | Team (species only), first-try result as the headline, final result and attempt count if cleared later, Pokémon remaining, streak. No opponent info, no sets, no turn counts |
| Battle UI | Mirrors Pokémon Showdown's battle layout and flow, simplified where it makes sense. Classic experience with no extra clutter when Beginner hints are off |
| Beginner hints | A clearly labeled toggle, on by default for new players, persisted. Covers first-time explainers, type-effectiveness labels, speed range in tooltips, and the team-builder checklist. Easy to turn off |
| Pacing | Quick like Showdown, with speed control and tap-to-skip |
| Animations | Whatever Showdown does (animated sprites, its own battle effects), nothing custom, with an off setting like Showdown's |
| Second mode (later) | Mid-battle puzzles on the same engine |

## 3. Non-goals

- No accounts, server-side storage, or leaderboards in v1.
- No multiplayer or PvP.
- No other generations or formats in v1 (keep the format configurable internally).
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

### 4.3 Daily battle
1. Player sees the **daily brief**: the opponent's 6 species (no sets), their own locked team, and the daily swap ("1 change left").
2. Player picks which Pokémon **leads** for this attempt (free, not a swap). After a faint, the player chooses the next Pokémon as in any singles battle.
3. Battle runs turn by turn. Win = all opponent Pokémon fainted.
4. On finish, record the attempt (result + player's Pokémon remaining) and offer "Run it back" or share. The first attempt of the day is the scored result; later attempts are recorded as retries.
5. Gen 4 has no team preview in the simulator; the brief is a UI screen, not a sim feature.

### 4.4 Stats
- Per day: attempts, result of each, and whether the day has been cleared.
- **The first attempt is the scored result.** Its win or loss is fixed once that attempt ends and cannot be changed by retries. A first attempt that is forfeited or abandoned counts as a loss (reload resumes it, §7, so a reload cannot be used to dodge a loss).
- **Streak:** consecutive days whose first attempt was a win. It resets on a first-attempt loss or a missed day. No streak freezes.
- Also track: first-try win rate, clears (days eventually won), average attempts per clear, best streak.
- A day shows one of: not played, first-try win, cleared on retry, or not cleared yet. Cleared-on-retry does not extend the streak.

## 5. Data pipeline

### 5.1 Source
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
- Coverage constraints so at least one viable team exists:
  - ≥1 Stealth Rock setter and ≥1 Spikes or Toxic Spikes setter among possible sets (or at least SR)
  - ≥1 hazard remover (Rapid Spin or Defog)
  - ≥1 Pokémon that checks each of the major offensive types in the pool
  - A mix of offensive, defensive, and utility roles
- After constraints, run the validation in §9.2.

### 6.3 Daily opponent
- 6 species by usage-weighted draw, then for each species a set drawn by set weight.
- Coherence constraints (soft, via rejection sampling): at most 1–2 hazard setters, a remover likely present, role balance, no doubled restricted items (Item clause: no repeated items; Species clause: no repeated species).
- Assign a **style** label (`offense`, `balance`, `stall`) derived from the team's role mix; the AI uses it (§8.5).
- The generator outputs the full team including sets. The client shows only species.

### 6.4 Schedule file
- Prefer **pre-generating a published schedule** over generating at runtime: a build-time script emits `schedule/2026-W44.json` etc. containing the weekly pool and the 7 daily opponents. The client reads the file for the current date.
- Benefits: one source of truth, validated content only, easy to roll back, no cross-browser divergence.
- Pre-generate several weeks ahead. Fall back to runtime generation with the same seed only if a schedule file is missing (log it).

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

Versioned schema `state.v1`:
```ts
{
  version: 1,
  weeks: { [weekKey]: { team: Slot[6], poolId: string } },
  days: { [dayKey]: { swapUsed: boolean, attempts: Attempt[] } },
  stats: { daysPlayed, firstTryWins, firstTryStreak, bestFirstTryStreak, lastScoredDay, clears, totalAttempts },
  settings: { beginnerHints: boolean, battleSpeed: 'normal'|'fast'|'instant', animations: boolean, shownExplainers: string[] }
}
Slot = { species, setId }
Attempt = { result: 'win'|'loss'|'forfeit'|'inProgress', remaining: number, ts: number, lead: string,
            battleSeed: string, aiSeed: string, choices: string[] }  // seeds + choices enable resume (§7)
```
- Wrap all reads/writes in try/catch; the game must work if storage is unavailable (in-memory fallback with a notice).
- Migration function per version bump.
- Export/import of state as JSON (nice-to-have, since there are no accounts).

## 11. Share format

First attempt lost, cleared on a retry:
```
Daily Battle · Oct 20
Team: Garchomp, Heatran, Gliscor, Rotom-W, Scizor, Gyarados
First try ❌ 🟩⬛⬛⬛⬛⬛
Cleared on try 3 ✅ 🟩🟩🟩⬛⬛⬛
Streak: 0
```

First attempt won:
```
Daily Battle · Oct 20
Team: Garchomp, Heatran, Gliscor, Rotom-W, Scizor, Gyarados
First try ✅ 🟩🟩🟩🟩⬛⬛
Streak: 5
```

Not cleared yet or given up: the second line reads `Not cleared · 4 tries`.

- The **first-try row is the headline** and always comes first. The streak is the first-try win streak.
- Species only, lead first, as used that day. Asterisk on a species swapped in that day (optional).
- Each row shows the result and Pokémon remaining out of 6 (green = alive).
- Intermediate attempts are not listed; the second row gives the final result and the attempt number. Keep the share to four lines or fewer.
- Plain text by default (pastes anywhere). Use the Web Share API/clipboard.
- Never include opponent species, sets, or turn counts.

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
1. **Home**: today's status (first-try result once played, cleared or not), attempts, first-try streak, countdown to next day.
2. **Weekly team builder**: pool of 12, role-named set picker, suggested teams, lock (§12.2a).
3. **Daily brief**: opponent species, your team, lead picker, daily swap ("1 change left"), Start.
4. **Battle**: Showdown-style layout and flow (§12.2b). Mobile-first.
5. **Result**: outcome and Pokémon remaining, with the day's first-try result as the headline. Run it back, Share.

### 12.2a Team builder (should be a pleasure to use)

Goals: fast, tactile, and clear to someone new to competitive Pokémon. The whole flow should take under a minute.

- **Pool:** the 12 as large cards: sprite, name, type badges, and a role tag or two. Tap a card to add it to the next empty slot; tap again to remove. Six slots stay visible at the bottom with a "4/6" count. Interactions are instant and snappy; no heavy animation.
- **Set picker:** tapping a team member opens a swipeable list of role cards. Each shows the role name ("Choice Scarf attacker"), a one-line description, and the four moves. A "Details" tap reveals item, ability, nature, and EVs. No usage numbers.
- **Suggested teams:** a row of 2–3 suggested teams labeled by archetype (e.g. Balanced, Offense, Stall). Selecting one fills the slots, and the team stays fully editable. These come from simulation-validated candidates (§9.2); the player chooses to use one, it is never applied automatically.
- **Beginner hints (when on):** a compact checklist under the slots (hazards, hazard removal, physical attacker, special attacker, defensive Pokémon) with checkmarks, and a tap-to-view list of shared weaknesses. Hidden when hints are off.
- **Lock in:** a "Lock in team" button opens a confirmation showing the six sprites, then goes straight to the daily brief.

### 12.2b Battle UI

Mirror Pokémon Showdown's battle layout and flow, simplified where it makes sense. With Beginner hints off, the experience should feel like classic Showdown with nothing extra.

- **Layout (Showdown-style):** field with both active Pokémon, HP bars (name, level, HP %, status and stat-boost badges), weather and hazard indicators, a move grid (name, type color, PP), a switch row with team icons, and Showdown's text battle log visible beside or below the field (stacked on mobile).
- **Simplified vs Showdown:** no timer, chat, user list, ladder rating, or spectators. No team preview screen. Forfeit is a "Give up" item in a menu.
- **Tooltips:** tap (or hover on desktop) a Pokémon for Showdown-style details. For the opponent, show only revealed information: types, HP %, status, boosts, revealed moves, and the item or ability if revealed. No "usually runs" or usage hints. Own Pokémon show full info.
- **Pacing (quick, like Showdown):**
  - Default speed is fast. A speed control (Normal / Fast / Instant) is always reachable.
  - Tap anywhere to skip the rest of the current turn's animation and text.
  - Forced actions with a single legal choice are submitted automatically (for example, switching in the last Pokémon).
  - The next turn's choices appear as soon as the previous turn ends; no extra confirmation steps.

### 12.2c Beginner hints

One toggle, clearly labeled, available on the home screen and in the battle menu, persisted in settings. On by default for new players, with a short note on first run that it can be turned off. Turning it off hides all hint UI immediately, including any pending explainers.

When on:
- **First-time explainers:** a one-line dismissible tooltip the first time each mechanic appears (Stealth Rock, Choice lock, Toxic, sleep, and so on). Shown once each, tracked in `settings.shownExplainers`.
- **Type-effectiveness labels** on move buttons against the opposing active Pokémon.
- **Speed range** line in Pokémon tooltips.
- **Team-builder checklist** and shared-weakness list (§12.2a).

Never included: damage ranges, or usage-based set hints for the opponent.

### 12.3 Rendering the battle
- Evaluate `@pkmn/client` and `@pkmn/view` for parsing/rendering protocol vs a minimal custom renderer. Pick the option that gets closest to Showdown's own look and flow (§12.2b) with the least custom work, and supports clear HP, status, hazards, weather, and move reveals.

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
Monorepo, TS config, lint, test runner, CI. *Accept:* `pnpm test` runs; CI green.

**M1 — Data snapshot**
Script builds `sets.json` from `@smogon/sets` (with `@pkmn/smogon` and Smogon usage stats as supplements) for gen4ou with 1–4 weighted sets per species. Includes the set-weight derivation from §5.1 and a short write-up of the method chosen. Also generates a role label and one-line description per set (§5.2). *Accept:* all sets pass the sim's validator; weights sum to 1 per species; documented source and refresh command; data redistribution/licensing question resolved or flagged in the README.

**M2 — Headless battle harness**
First step: confirm `gen4ou` is available in `@pkmn/sim` (§7), and wire in `formats.ts` or vendor Showdown if not. Then run a full gen4ou battle in Node between two trivial policies (start from `RandomPlayerAI`), with side-specific views. *Accept:* 1,000 battles complete without errors; AI/policy code cannot access hidden info (test enforces it).

**M3 — Seeded generation**
Weekly pool and daily opponent generators with constraints and `generatorVersion`. *Accept:* same key → identical output across runs; constraint tests pass over 10,000 seeds; no illegal teams.

**M4 — Opponent AI v1**
Belief model, utility scoring, softmax choice, style presets. *Accept:* beats the naive bot clearly; behavior tests pass (takes available KO, doesn't use unrevealed info); win rate vs naive/mid/strong bots logged.

**M5 — Validation pipeline and schedule emitter**
Pool and opponent validation, reports, schedule files for N weeks. *Accept:* produces schedule files with validation reports; rejects an intentionally bad opponent in a test.

**M6 — Web client: team building and state**
Weekly pool UI, role-named set picker, suggested-teams row, lock, daily brief with lead picker and daily swap, Beginner hints toggle and settings, localStorage. See §12.2a and §12.2c. *Accept:* a team can be built and locked in under a minute; suggested teams are selectable and editable; state persists across reloads; swap limited to one per day; storage-unavailable path works; turning hints off removes all hint UI.

**M7 — Web client: battle UI**
Worker-based battle, move/switch UI, protocol rendering, AI turns, win/loss detection, attempts recording, run it back. Includes the sprite interface and self-hosted Gen 4 sprites per §12.3a. *Accept:* full playthrough on mobile and desktop; mid-battle reload handled per §7; no runtime requests to third-party image hosts; layout and flow follow §12.2b; speed control and tap-to-skip work; single-choice forced actions auto-submit; Animations off setting works.

**M8 — Result and share**
Share text per §11, clipboard/Web Share. *Accept:* snapshot tests for share output: first-try win, first-try loss then cleared on a later try, never cleared, and swap marker. Streak logic tests: first-try win extends, first-try loss or forfeit resets, retry clear does not extend, missed day resets.

**M9 — Polish and calibration**
Playtest, tune AI parameters and validation thresholds, accessibility pass, legal/disclaimer page. *Accept:* playtest notes incorporated; thresholds documented.

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
- **First-try streak fragility:** one unlucky first attempt (crit, miss, or a wrong read) breaks the streak and retries cannot repair it. Variance matters more than under a retry-based score. Mitigated by validating matchups over many simulated first attempts (§9.3). If playtests show it feels unfair, consider options later (streak shield earned by clears, or limiting crit-dependent matchups further). No streak freezes in v1.
- **Time zones:** local-date keyed content means players in different zones see different days at the same moment. Accepted for v1.
- **Retries leak sets:** intentional. Retries help the clear but cannot change the first-try result or the streak, and the share screen shows the attempt count.

## 15a. Open decisions

### Product decisions

| # | Question | Status | Decision |
|---|---|---|---|
| D1 | Name and branding | Decided | **Daily Battle**, served from a subdomain of an existing domain (e.g. `battle.<yourdomain>`). Keep "Pokémon" out of the name and subdomain. The share header and credits page use the name. The format ("Gen 4 OU") is not part of the share text; it can appear elsewhere in the UI |
| D2 | Target difficulty | Decided | About 50% first-attempt win rate for an average player; 2–3 attempts to clear. Validation bands in §9.3 |
| D3 | Streak definition | Decided | Consecutive days with a first-attempt win. The first attempt is the scored result and is emphasized in the UI and the share |
| D4 | In-battle assistance | Decided | One "Beginner hints" toggle, on by default for new players, easy to turn off (§12.2c). Hints cover first-time explainers, type-effectiveness labels, speed range, and the team-builder checklist. With hints off, the battle mirrors classic Showdown. No damage ranges and no "usually runs" info |
| D5 | Telemetry | Decided | None in v1 (static site). Calibrate difficulty with friends and manual feedback; consider an opt-in anonymous endpoint after launch |

### Proposed defaults (change if you disagree)

- **Ruleset:** use the sim's `gen4ou` clauses and bans as-is for both sides. The AI must respect them (e.g. sleep and freeze clauses).
- **Customization:** preset sets only. No custom EVs, moves, or items.
- **Suggested teams:** 2–3 validated teams offered as a selection in the team builder (§12.2a). Never applied by default; always editable before locking.
- **Weekly pool timing:** visible to everyone at the start of the week. Late joiners get the same pool and the same daily swap rule.
- **Opponent style hint:** not shown in v1. It would give away information.
- **Streak freezes:** none (see the first-try streak fragility risk in §15).
- **Audio:** off by default, optional sound effects, no music in v1.
- **Anti-cheat:** none. The game is client-side and single-player; state can be edited in dev tools. Accepted.
- **Forfeit and reload:** per §7 (forfeit counts as an attempt; reload resumes).

## 16. Legal

Unofficial fan project, not affiliated with or endorsed by Nintendo, Creatures Inc., GAME FREAK inc., The Pokémon Company, or Smogon. Pokémon, Pokémon character names, and sprites are © Nintendo, Creatures Inc., and GAME FREAK inc.

- Code: `@pkmn/*` packages and Pokémon Showdown code are MIT licensed. Keep license notices as required.
- Data: confirm redistribution terms for Smogon set and usage data; credit Smogon.
- Sprites: see §12.3a. Credit Nintendo/Game Freak/Creatures and the Smogon sprite community on the credits page.
- Keep the project free and non-commercial (no ads, paywalls, or merchandise). Revisit this section if that changes.
