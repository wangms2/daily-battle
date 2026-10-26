# Plan: Gen 3 tutorial and coach — remaining work

Working plan for the `tutorial` branch. It records what's built, the decisions behind it, and what's left, so work can pick up in a new session with full context. The shipped behaviour is documented in DESIGN.md §22; this file covers the build plan. Delete it (or fold anything still useful into DESIGN.md) once the work is done.

## Status

- **Branches.** `difficulty` (PR #17) adds Easy/Normal/Hard CPU difficulties, with Hard using the poke-engine WASM search. `tutorial` is built on top of it and is **local only, not pushed**. Don't push or open a PR unless asked.
- **Done on `tutorial`** (oldest first):
  - `5d8af54` tutorial content model, Gen 3 lessons 1–3
  - `591cabb` Learn mode in the web app
  - `9785222` lessons 4–12 and graduation
  - `57b6830` Simple coach brain in lesson battles; fixed Hidden Power/Return names in the AI (Gen 3 names carry power, e.g. "Return 102")
  - `29c0462` the header title is a back button
  - `1303003`, `a565664` coach pacing (see below)
  - `25a4a54` Coached daily results, streaks, coach toggle, one-time offer
  - step 1 `tut-gen3-recommend`: Battle basics on the landing, the tutorial on the welcome sheet
  - `d4a5628` coach fix: our own items and abilities by name in the calc (Levitate, Choice Band were ignored)
  - `f135fd2` coach-eval proof of concept, `BattleSession.reseed`
  - step 2 `tut-coach-judge`: the judge (see "Step 2 results" below)
  - step 3 `tut-coach-messages`: warnings explained, judged tips, the judged review with turn replays, reviews on request (see "Step 3 results" below)
  - step 4 `tut-coach-eval`: every reason shown checked against Easy and Normal; two turned off where they failed (see "Step 4 results" below)
- **Engine builds.** `packages/engine-wasm/dist` isn't committed. After pulling the step 2 commit, rebuild it (`search_fixed` is new): `PATH="$HOME/.cargo/bin:$PATH" pnpm --filter @daily-battle/engine-wasm build:wasm` (cargo isn't on the Git Bash PATH by default).
- **Checks.** Run from the repo root: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (~45 s). For one package: `npx tsc --noEmit` and `npx vitest run <file>`. `packages/sim-bridge/src/noluck.test.ts` is occasionally flaky.

## Waiting on the user

Nothing open. Next: step 4b, walking through the lessons with the user (screenshots), then refactoring them. Queued for a quiet night (low concurrency): the targeted Explosion run vs Normal (step 4).

## Decided 2026-10-26 (morning answers)

- **Explosion:** the coach may recommend Explosion / Self-Destruct, and the text must say the cost ("Explosion knocks out Cloyster too").
- **Only true reasons:** warn only when a template's reason is true and relevant in the position; otherwise stay quiet.
- **Won anyway:** skip warnings when the player is already winning. The judge's values can't tell this (they sit at 0.3–0.6 even in won positions; 1 of 149 warnings vs Easy had a pick valued ≥ 0.85). A board measure works: **skip when the player leads by at least 2 Pokémon's worth of HP** (sum of HP fractions, own minus foe's, from the player's view). Of the 149 robust warnings vs Easy, it skips 9 whose rollout gain was 0.0 (8 were won either way); vs Normal, 3 with gain 0.0. Most "won either way" cases vs Easy (63 of 149, gain +2.1) are won because Easy plays badly, which the board can't show; they stay.
- **Judged tips:** appear late (when the judge finishes after the controls show).
- **Review on resume:** save the judge's values with the attempt.
- `Verdict` now carries `value` and `topValue` (search values) for saving and the review.
- **Frequency:** margin 0.1, no cap or pacing. Warnings follow the player's mistakes (`coach-rate`, 40 battles each, judge alone at margin 0.1, ahead in 90% of worlds):

  | player                   | warned picks | per battle (median, max) | battles with none |
  | ------------------------ | ------------ | ------------------------ | ----------------- |
  | beginner (Easy bot)      | 16.7%        | 4, 10                    | 2 of 40           |
  | mid (Normal bot)         | 7.7%         | 2, 7                     | 8 of 40           |
  | strong (Hard search bot) | 0.6%         | 0, 1                     | 34 of 40          |

  The old rules alone warned the strong player on 6.2% of picks. In rollouts, warnings at gaps of 0.10–0.15 gained +7 points each, as much as bigger gaps; under 0.10, +1 to +3.

- **Resume:** save the warnings the player overrode with the attempt (next to the judge's values), so a reload never asks again.
- **Hazards (the user asked whether the coach values them).** The search does: poke-engine's Gen 3 score counts each layer of Spikes against every grounded Pokémon still alive on that side (−12 / −16 / −25 per Pokémon for 1 / 2 / 3 layers, against 100 for full HP), and it plays out the Spikes damage on switches within its 2–3 turns. So clearing Spikes from a full team is worth about half a Pokémon's HP to it. Gen 3 has no other hazards. In the 1,200 judged decisions:
  - Every warning against Rapid Spin (5) came when the player's side had no Spikes (+22 points for the alternative). Every judged preference _for_ Rapid Spin (5) came with 2 layers on the player's side (+6.5). The text must say why ("No Spikes to clear").
  - Recommending **Spikes** is not proven: 21 warnings where the judge preferred Spikes gained only +1.1 on average, mostly over Explosion (mixed, from −30 to +15). The fixed per-Pokémon penalty is a rough stand-in for Spikes' long-run value.
  - So in step 4, laying Spikes, Rapid Spin, and Explosion are separate message kinds, each with its own larger sample. A kind that doesn't pass stays quiet.

## Decided 2026-10-26 (afternoon, during step 3)

- **Review replay:** each review turn opens the battle screen itself in review mode (not a drawer): frozen at the decision, with the real move and switch buttons. The choice made is tagged **You**, the judge's choice **Better** (**You · Best** on a turn done well), and the rest fade. The coach's reason sits in the tip slot with **▶ Play** (the turn as it happened, with the real log and animations) and **↺ Again**. Arrows step through the review's turns.
- **Good catch:** a warning the player listened to (picked again) is a turn done well, listed first among them: "Good catch: you changed your pick after the coach's warning." and the reason. The first pick is tagged **Warned** (not "First pick", which read like "best"). Only when the new pick isn't clearly worse too.
- **Review on request:** after any Gen 3 daily played without the coach, the end card offers **Review this battle**. It judges then (only the choice made and the judge's top choice per decision: 4.4 s for 54 choices on desktop, about 20 s on a mid phone, with "The coach is reviewing your choices… 18 of 54"). Separate from the coach; no effect on streaks or Coached results. Not in Versus or lessons (lessons are coached already).
- **Explosion praise says the cost** too: "Good choice: Explosion could knock out Zapdos, though it knocks out Metagross too."
- **An LLM summary of the review:** rejected again (cost, and it could invent reasons, breaking "only true reasons").
- **Judged tips** (made by Claude, not asked): a tip that recommends an action (a knockout move, a better switch-in, a setup move) shows only when that action is the judge's top choice, not merely "not clearly worse".

## Product decisions (from the user; don't revisit without asking)

- **The coach must never give advice that's bad against the opponent the player is actually facing.** This drives the remaining work: per-difficulty validation offline (`coach-eval`) plus a runtime judge.
- **Only good, risk-based advice (decided 2026-10-25, after the switchKo proof run).** A rule being good _on average_ isn't enough: each message must be right in its own position.
  - **The search judges everything.** Every coached battle (lessons, Easy, Normal, Hard) runs the Hard search from the player's own view while they choose. A message shows only when the search agrees. The rules no longer decide; they only supply the plain reason.
  - **Robust bar.** Advise A over B only when A is clearly better on average _and_ not worse in the bad cases (the foe's dangerous likely replies, and the sets it might have). Otherwise the coach stays quiet.
  - **Risk in plain words.** Messages name the risk, one concept at a time, with no odds from the search: "Risky: if Salamence attacks, Heracross is knocked out. Swampert takes the hit safely."
  - **Messages kept:** blunder warnings, turn tips (setup and switch tips also need the search to agree), the post-battle review (judged by the same search, so it never contradicts the battle), and reads (Hard / Advanced wording only).
  - **Simple and Advanced are wording levels, not separate brains.** Simple never mentions reads or predictions.
  - This replaces the per-rule gates of step 2. `coach-eval` now checks every message the coach shows, not rules on average.
  - Proof-run result (switchKo vs Easy, 60 cases × 40 rollouts): following the advice won 71.9% vs 64.6% (+7.3 points, CI +3.8 to +10.8), with no case clearly worse. But only 72% of cases passed a per-case test, because one case's result is noisy at 40 rollouts.
- **It must not be annoying.** At most one tip per turn, and a 3-turn gap between tips (`TIP_GAP`). Urgent tips (`koThreat`, `canKo`) need only a 2-turn gap (`URGENT_GAP`). No tip shows while a lesson prompt or beginner-hint explainer is up, and a warning the player overrode isn't repeated that battle. Warnings appear only when the blunder is actually picked. Severity still matters: the goal is "not spammy on average", not a hard cap. Measured on 20 Easy-vs-Easy battles: tips on 13% of decisions, warnings on 5%, no repeats.
- **No per-turn move suggestions.** The coach gives tips, blunder warnings, and a post-battle review only.
- **Two wording levels** (both judged by the search, see above):
  - **Simple:** plain wording. It never mentions reads, predictions, or multi-turn plans. It's the only level in lessons, graduation, Easy, and Normal (by default).
  - **Advanced:** adds reads. It's the only level against Hard, and optional on Normal. It's never offered on Easy or in lessons.
- **Daily coach (built):**
  - Gen 3 only. Offered on Easy and Normal. **Hidden on Hard until Advanced wording exists**; it's enabled there by `tut-coach-plan`.
  - Off by default. Offered once on a game's first daily brief and again after graduation.
  - Coached tries form a separate **Coached** bucket per game, shared across difficulties, with its own streak and stats.
  - A coached try before the day is cleared ends only **that difficulty's** regular streak. Coached practice after a clear doesn't affect it.
  - Turning the coach on mid-battle is sticky for that attempt and needs a confirmation when it would cost a streak.
- **Versus:** the coach is allowed, and every player in the room clearly sees who has it on.
- **AI-model coach:** rejected. A paid or token-based LLM is out; the coach is rules plus our own AI's scores and search.
- **Pointing beginners to the lessons (step 1, decided):**
  - **Landing:** a small outlined **Battle basics** pill under Play (no emoji), opening `#learn`. Always shown. The landing's split is 63/37 (top/bottom).
  - **No tag on the game picker.** The picker keeps its existing Learn row under Gen 3.
  - **Welcome sheet and How to play:** short one-line rules and a "New to competitive Pokémon? Start with Gen 3. It has lessons and a coach." card with one button, **Start the tutorial** (opens the next unfinished lesson). No "Play Gen 3" button. The "Every game uses OU" line moved to About.
  - **UI process:** show screenshots and settle the design before wiring, tests, or the full check run.
- **Writing style** (lessons, UI text, comments, docs): plain, short sentences; concrete examples. Each lesson or example teaches one concept without mixing in others. Comments cite `DESIGN.md §N`.

## How the existing pieces fit

- **`packages/ai`:**
  - `src/facts.ts`: `turnFacts(view, data)` collects one-turn facts from the player's own `SideView`: per move, no-effect reasons, KOs, and threats; per switch, the facts too.
  - `src/score.ts`: `scoreActions` (the utility AI's scoring).
  - `src/presets.ts`: parameter presets `STRONG`, `EASY`, and the style `PRESETS`.
  - `src/difficulty.ts`: `aiFor({ difficulty })`.
  - `src/hard/policy.ts`: `HardPolicy`, with defaults `HARD_DEFAULTS = { iterations: 150_000, worlds: 8 }`. `worlds.ts` samples the foe's hidden sets from beliefs and the weekly pool; `translate.ts` converts to the engine's format.
  - `src/hidden-info.test.ts`: the AI never sees hidden sets.
  - `scripts/eval.ts`: AI-vs-bot evaluation harness, with flags `--hard`, `--hard-iterations`, and so on. **Reuse its match setup** (weekly pool teams vs the daily opponent) for `coach-eval`.
- **`packages/sim-bridge`:** `BattleSession`, the `noLuck` option, and `ScriptedPolicy` / `resolveStep`.
- **`packages/tutorial`:**
  - `src/types.ts`, `lessons.ts`, `gen3/*.ts`: content model, the 12 lessons, and graduation (`gen3-graduation`, `graduation: true`).
  - `src/validate.ts`, `lessons.test.ts`: content validation.
  - `src/coach/simple.ts`: the `Coach` class. `CoachRule` is the tip kinds (`canKo | koThreat | foeAsleep | locked | spikes | walled | setupWindow`); warnings have `WarningReason`s (explain.ts). Key methods:
    - `turn(view)` returns a `CoachTurn`: a tip now, or `pending` (a tip waits for the judge).
    - `confirm(view, top)`: the waiting tip, once the judge's top choice is known.
    - `warn(view, verdict)`: the warning on a pick, if the judge finds it clearly worse and a reason explains it.
    - `record(view, choice, shown, verdict, heeded)` notes the choice for the review; `ignore` / `ignored` carry overridden warnings across a reload.
    - `forget()` drops the cached result when a choice is blocked.
  - `src/coach/judge.ts`: `Judge` (step 2). `src/coach/explain.ts`: the warning reasons.
  - `src/coach/review.ts`: `decision()` keeps each judged decision; `buildReview()` picks the key turns and turns done well.
  - `src/coach/coach.test.ts`, `explain.test.ts`, `judge.test.ts`.
- **`apps/web`:**
  - `src/battle/engine.ts`: `EngineStart.coach?: 'simple'` and `coachLog`. The engine runs the coach before `session.choose` (in the resume replay too). `TurnPackage` carries `coach`, `coachMemo` and `review`. `coachCheck`, `coachWork`, `coachTip`, `replayTurn`, `reviewJob`.
  - `src/battle/battle.worker.ts` and `hardEngine.ts`: the worker, and how Hard loads the WASM. Advanced will reuse this.
  - `src/battle/ui/Coach.tsx`: `CoachTip`, `CoachWarning` (with a "don't warn again" option), `CoachReview`.
  - `src/screens/Battle.tsx`: coach UI state, the menu Coach switch, and the turn-on confirmation. `BattleRoute.tsx` passes `coach: 'simple'` when `attempt.coached`.
  - `src/lib/coach.ts`: `coachAvailable(format, difficulty)` (**edit here to enable Hard**), `coachOn`, `bucketOf`, and `coachWarning`.
  - `src/lib/results.ts`: buckets, `helped`, streaks and stats.
  - `src/lib/share.ts`: `coached` support in the share text.
  - `src/state/schema.ts`: `Attempt.coached`, and `Settings.coach` / `coachOffered` per format. The reducer has a `coachAttempt` action.
  - `App.tsx`: bucket wiring and the one-time offer.
  - `ui/Difficulty.tsx`: `CoachToggle` and `CoachBadge`.

## Remaining work (in order)

Each step is a separate commit with tests, and runs format, lint, typecheck, and tests before committing.

### 1. `tut-gen3-recommend`: recommend Gen 3 to beginners — done

Built as decided above (Product decisions). The original picker tag and "Play Gen 3" button were dropped.

### 2. `tut-coach-judge`: the search judges every message

- **Search on the player's view.** Run `HardPolicy`'s search with the **player** as side one, from the player's own `SideView`, sampling foe worlds from beliefs plus the weekly pool, exactly as Hard does for itself. It never sees the foe's real sets. Run it in the battle worker **while the player chooses**, about 20–40k iterations (measure on a phone). Cache per request; warnings, tips, and the review all reuse it. Used in every coached battle: lessons, Easy, Normal, Hard. Load the Gen 3 WASM whenever the coach is on.
- **Robust check.** A over B only when A's value beats B's by a clear margin overall **and** in nearly every sampled world (start with 7 of 8; tune with data). The search already lets the foe pick strong replies, so it leans cautious. Otherwise: quiet.
- **Timing (decided).** If the player taps before the search is done, hold the choice up to about 1 s with "Coach is checking…" on the controls, then warn if needed. Still not done: the choice goes through with no warning.
- **Fallback (decided).** No engine or a failed search means **silence** for that turn, never unchecked rules.
- **Foe model (decided).** Teach good play: advice must be good against a strong foe _and_ not worse against the real AI (checked offline in step 4). If they disagree, the coach stays quiet; it never teaches habits that only work on Easy.
- Keep the pacing rules (one tip a turn, `TIP_GAP`, no repeats, nothing over a lesson prompt or hint).
- **Tests:** the judge agrees on clear-cut positions (a switch into a knockout, a move that does nothing); silence without the engine; hidden info (swapping the foe's hidden sets gives the same output until they're revealed); the rate test still holds.

#### Step 2 results (built 2026-10-26)

- **How it's built.**
  - `packages/tutorial/src/coach/judge.ts` (`Judge`): an open search names the top choice, then searches **held** to one choice (`Engine.searchFixed`, a new wrapper export over poke-engine's MCTS with side one's options limited to one) value the top choice and the pick with the full budget, over the same worlds and luck. Warn when `gap ≥ margin` and the top is ahead in `≥ agree` of the worlds' weight. Seeded by `battleSeed:decision`, so a resume judges the same way.
  - `packages/ai`: `prepareWorlds` / `searchWorld` / `searchWorlds` factored out of `HardPolicy` (Hard's choices hash identically before and after; checked on 4 battles).
  - Web: the package carries only the tip; `BattleBackend.coachCheck(choice, 1000)` returns a warning only when a rule explains it **and** the judge agrees. The worker judges in 30 ms slices between messages (it starts when the turn's package is built, so it usually finishes during playback). "Coach is checking…" shows after 150 ms of a check. `Coach.record` takes the warning actually shown. Coached daily battles now get the week's pool (the judge's prior for unseen foes).
- **Why held searches.** With the open search alone, options it rarely tried scored too low: at 20k iterations it warned on 15% of picks where a 1M search warned on 3%. Held searches fixed that: 21% vs 19% for a 600k reference at margin 0.1, 90% agreement with the reference, 2% flips between runs. More budget barely helped (50k and 100k: 92%).
- **Speed** (Chrome, CPU throttled; ms per 20k search): desktop 38, mid phone (4×) 190, low-end (6×) 300. A judgment is 3 searches (about 0.6 s on a mid phone), plus one per other choice a rule flags. In a throttled browser run, warnings appeared about 1.2 s after the tap including the turn; "Coach is checking…" never showed, even at 25×, because the judge finished during playback.
- **Validated with rollouts** (`coach-eval --mode judge`, 600 decisions each, 40 rollouts per branch, the real opponent AI). Warnings at margin 0.1, ahead in ≥ 90% of worlds:
  - vs Easy: 149 warnings, **+7.9 points** for following the advice (95% CI +5.4 to +10.4), 3.4% clearly worse (about what noise alone gives at 40 rollouts).
  - vs Normal: 134 warnings, **+6.3 points** (CI +4.1 to +8.4), 1.5% clearly worse.
  - The judged gap predicts the real gain: under 0.05, +1 point (quiet is right); 0.10–0.15, +7 to +8; 0.15 and up, +5 to +10.
  - Watch item: steering a player _away from Explosion_ toward setup or a switch was slightly negative on small samples (6 and 2 cases vs Easy). The search lets the foe answer Explosion perfectly (switch to a Ghost, Protect); Easy and Normal don't. Re-check with more samples in step 4.
- **Settings** (`JUDGE_DEFAULTS`, agreed): 20k iterations per search, 8 worlds, margin 0.1, agree 0.9.

### 3. `tut-coach-messages`: rules explain, the judge decides — done

- Each rule becomes an **explanation** for a judged gap, not a trigger. A warning needs the judge to say the pick is clearly worse; the rule supplies the plain reason. A judged gap that no rule explains gets a generic reason from the facts ("Swampert takes much less damage here"); keep these rare.
- **Risk wording (decided).** Name the risk plainly, one concept at a time, no odds: "Risky: if Salamence attacks, Heracross is knocked out. Swampert takes the hit safely." The foe's likely replies come from the search's foe-side visits; what each does comes from the damage calc.
- **Tips** (setup window, walled, switch tips) need the judge to agree too. Fact tips with no decision in them (Spikes are up, a Choice lock, the foe is asleep) stay as they are.
- **Review** uses the judge's values instead of the utility scores, so it never contradicts what the coach said in battle.
- **Simple and Advanced are wording levels.** Simple never mentions reads, predictions, or plans over several turns (keep the banned-words test).
- Self-KO moves (Explosion, Self-Destruct) don't count as a "switch-in gets knocked out" threat: they knock out whatever stays in too. **Done** (`4a8a9e1`).

#### Step 3 results (built 2026-10-26)

- **Warnings** (`src/coach/explain.ts`, `explainWarning`): the judge decides a pick is clearly worse; a reason template says why, and only if it's true and relevant (the top choice avoids the risk named). Otherwise quiet. Reasons: `noEffect`, `switchKo`, `bigHit`, `staysKo` (not below 30% HP), `missedKo`, `noTime` (status/setup while the foe hits hard), `noSpikes` (Rapid Spin with nothing to clear), `weaker`, `fails` (healing at full HP, Sleep Talk awake), `selfKo` (Explosion that won't take the foe down), `explosion` (the judge prefers Explosion; the text says its cost). A second sentence names what the top choice does, when true. No warning when the player leads by 2 Pokémon's worth of HP (`winningAnyway`). The old rule-triggered warnings are gone (`Coach.warn(view, verdict)`).
- **Coverage and value** (`scripts/warning-texts.ts` over judged cases, rollouts vs the real AI): on the 283 cases used to write the reasons, 103 warnings shown, +9.4 points (±2.8), 2 clearly worse. On 279 fresh cases from battles never used for tuning (`coach-eval --first 2000`), 93 shown, **+7.5 points (±3.1)**, 1 clearly worse; the judge alone on the fresh set: +5.7 vs Easy, +6.9 vs Normal. About a third of the judge's clear mistakes get a reason; the rest stay quiet (they'd have gained +5.7, so the coach leaves value on the table rather than guess).
- **Tips:** fact tips (Spikes up, a Choice lock, the foe asleep, the foe is faster and can knock you out) show with the controls. Tips that recommend an action (`canKo`, `walled`, `setupWindow`) wait for the judge's top choice (`Coach.confirm`) and show late (the worker sends them; the log shrinks, so the move buttons don't move). Not shown means not used up.
- **Saved with the attempt** (`Attempt.coachLog`, one memo per choice): the judge's verdict, the warning overridden, the warning listened to. A resume neither judges again nor asks again.
- **Review** (`src/coach/review.ts`): built from the judge's verdicts. Key turns are the clearly worse picks with a reason (the warning's own words, so it never contradicts the battle), biggest gaps first, up to 3. Turns done well: good catches, then the judge's top choices with a reason the facts show. Each turn can be replayed (`BattleEngine.replayTurn`, review mode in `Battle.tsx`, `replay-backend.ts`). Uncoached Gen 3 dailies: `ReviewJob` replays the battle with the coach and judge on.
- `coach-eval` lost its rule mode (the proof of concept); it now records the warning the coach would show, and reports by reason. `coach-rate` measures what's shown, and takes `--player easy|mid|hard`.

### 4. `tut-coach-eval`: offline check of every message shown — done for Easy and Normal

#### Step 4 results (2026-10-26)

- **Run:** 4,147 warnings the coach shows, from 4,000 fresh battles (`coach-eval --shown --first 10000`, 20 shards); at most 80 per reason per difficulty sampled (815 vs Easy, 800 vs Normal), each rolled out 30 times per branch with the real AI (6 workers, 8 min per difficulty). `scripts/eval-report.ts` writes the table and the worst cases.
- **Overall:** +8.1 points vs Easy (CI +6.9 to +9.3), 2.0% clearly worse; +8.3 vs Normal (CI +7.0 to +9.5), 2.8%. Noise alone gives about 2.3% clearly worse.
- **By reason** (gain, CI low, clearly worse): every reason is positive on average. `noEffect` +11.6 / +5.5, `fails` +8.0 / +11.8, `missedKo` +6.4 / +7.8, `weaker` +12.4 / +9.4 (the earlier −5.6 on 4 cases was noise), `noTime` +12.8 / +9.6, `switchKo` +8.5 / +7.1, `bigHit` +6.4 / +8.3, `staysKo` +7.1 / +14.4, `noSpikes` +5.5 / +3.1, `selfKo` +2.6 (CI −0.2) / +5.8, `explosion` +7.5 (21 cases) / +5.2 (10 cases).
- **Bar (decided):** a reason passes for a difficulty when its gain's 95% CI is above zero and at most 5% of its cases are clearly worse; a borderline one gets a bigger sample before it's turned off.
- **Decided per reason:**
  - `selfKo` (warning against an Explosion pick) is **quiet vs Easy**: following it instead of Explosion gained +1.4 when the judge preferred another attack; Easy rarely answers Explosion.
  - `staysKo` vs Easy is **kept** as a core habit (+7.1), an accepted exception to the 5% bar: 6 of 80 cases clearly worse, half with Dugtrio, where Easy didn't use the knockout move.
  - `explosion` (recommending Explosion) is **quiet vs Normal** until a targeted run (about 10,000 battles, at low concurrency) has enough cases.
  - `QUIET_REASONS` in `explain.ts` holds this; `Coach` takes the opponent's difficulty (lesson foes count as Easy).
- **Hard** isn't checked (Advanced, step 5): the coach isn't offered there, and "Review this battle" isn't offered after Hard battles.
- **CI:** the sims job runs a 41 s smoke of `coach-eval --shown` (reported, not asserted).
- **Lesson content check:** moved to step 4b (`scripts/quiz-audit.ts`).

#### Step 4 plan (as written before the run)

- `packages/tutorial/scripts/coach-eval.ts` (started; proof of concept for switchKo vs Easy) and `BattleSession.reseed`.
- **Collect** the messages the coach actually shows (warnings with their alternative, tips that imply an action) in Gen 3 battles: weekly-pool teams, played by beginner-ish bots (Easy, mid), against the daily opponent on Easy, Normal, and Hard.
- **Roll out** each case to the end R times per branch with the **real opponent AI**, the strong bot for the player, and shared luck between branches (`reseed`).
- **Bar:** almost no shown message is worse than its alternative. Report the pooled gain with its CI, and the share of messages clearly worse (by more than 2 SE), per message kind and difficulty. Exact targets to agree after the first full run.
- **Report** (`--report`, Markdown): worst cases first, with the position, the text, and both branches' win rates.
- **Cost:** Hard rollouts are slow (full search: about 40 CPU-hours per kind of message). Use a reduced Hard budget for the _opponent_ only if it matches full budget on a sample, and say so. Parallelise across processes. Report the run time.
  - **Sample run (2026-10-26):** 120 judged cases vs Hard, 20 rollouts per branch, the same cases at Hard's own 150k and at 20k (`--save-cases` / `--load-cases`). Full budget: 38 min on 18 processes; 20k: 6 min.
    - Robust warnings at margin 0.1 (32 cases): **+3.4 points** at full budget (CI −1.4 to +8.1), +3.7 at 20k (CI +0.3 to +7.0); one case clearly worse at full budget, none at 20k.
    - Per-case gains correlate 0.65 between the budgets, and have the same sign in 78% of the cases where both moved (about what 20 rollouts allow). 20k Hard is a little weaker: the player wins 19% of rollouts vs 15%.
    - So 20k reproduces the pooled verdict. Use it for the bulk of Hard runs, with a full-budget spot check on each kind of message.
    - Against Hard the player's side loses about 85% either way, so gains are smaller and need more cases to show (this sample isn't enough at full budget). Hard's coaching is Advanced only, so this matters from step 5.
- **Watch items from step 3** (small samples; each reason gets its own larger run): `weaker` (−5.6 on 4 fresh cases, +6.7 on 8 earlier), `bigHit` (+2.0), `switchKo` (+3.7 fresh, +10.5 earlier), `selfKo` and `explosion` (Explosion either way: 2–4 cases each), `noSpikes`. Laying Spikes isn't a reason yet (judged preferences for Spikes gained only +1.1). A reason that doesn't pass is turned off, not reworded to fit.
- **CI:** a small smoke sample on PRs; the full run as a manual or scheduled job.
- **Lesson content check:** each quiz's "best" answer must win at least as often as the alternatives against the lesson's own foe, and the same for mini-battle prompts that recommend an action.

### 4b. `tut-lessons-review`: review the lessons with the user, and refactor them

Asked by the user (2026-10-26): they haven't seen the lessons yet, and want them to take up the principles built into the coach. Starts after step 4, before step 5. Walk through each lesson with the user (screenshots), then refactor. Candidates:

- **Grade quizzes with the judge and rollouts**, like the coach: a "best" answer must be the judge's top choice and win at least as often as the others against the lesson's foe (`scripts/quiz-audit.ts`). Audit (2026-10-26, 60 runs each): no "best" answer loses to a lower grade, but several quizzes don't discriminate at all (every answer wins 100%, or all 0%): `gen3-types` 4, `gen3-split` 4, `gen3-switching` 4, `gen3-spikes` 6 and 7, `gen3-winning` 2. There the grade rests only on the immediate effect, which can teach that it doesn't matter.
- **Risk wording:** answer explanations in the coach's plain risk style, one concept at a time.
- **Show, don't tell:** replay the answer's turn on the battle screen (review mode), with the same You / Better tags.
- **Lesson battles:** prompts that recommend an action also pass the judge.

### 5. `tut-coach-plan`: Advanced coaching with long-term plans and reads

Starts once the Simple coach is trusted (steps 2–4). Decided 2026-10-25.

- **Why.** The search plans only 2–3 turns ahead, and its position score is material only (alive, HP, boosts, status, screens, Substitute). It doesn't know roles: that a Pokémon is our last check to their sweeper, or that one foe stands between us and a sweep.
- **Game-plan model** (calc-based, on the phone, milliseconds per turn, updated as sets are revealed and HP drops). Built from both teams (the daily brief shows the foe's six) and the foe's possible sets:
  - checks and counters: who switches in safely on whom, who outspeeds, who KOs whom in one or two hits;
  - win conditions: which of ours sweeps once particular foes are gone or weakened;
  - threats: which foe beats us if a particular check falls;
  - endgame: with few Pokémon left, give the search more budget so the answer is near-exact.
- **Same trust bar.** Each plan message must pass the judge in its position; if the plan and the search disagree, the coach is quiet. Plan messages go through `coach-eval` like any other (more rollouts, since long-horizon advice is noisier). Ideas that don't hold up get cut.
- **Where it shows (Advanced only; mock up before building):** a short game plan on the brief (two or three lines), plan tips in battle when the plan changes, plan warnings ("Pick again?" when a choice throws the plan away), and the plan in the review (where it held, and the turn it was lost).
- **Reads** from the foe-side visits ("Likely foe move: Earthquake"), Advanced wording only.
- **Constraints (from the user):** no extra cost or wait, no change to the Simple coach, no inconsistency. A plan-aware engine score (valuing roles in our engine fork) is deferred, and only considered if the plan model proves itself in the eval; it would also change Hard.
- **Availability:** Advanced on Hard (enable Hard in `coachAvailable`), and opt-in on Normal via `settings.coachLevelNormal: 'simple' | 'advanced'` (the toggle shows the choice only there). Never on Easy or in lessons. The level doesn't affect streaks.

### 6. `tut-versus-coach`: coach in Versus

- Add a per-player `coached` flag to the room protocol in `packages/versus` / `apps/server`. Show a coach badge for that player in the lobby, battle header, standings, and spectate view. Reuse `CoachBadge`. No streak effect.
- The coach runs client-side from the player's own view, as in the daily.
- Tests: the protocol round-trips the flag, and the badge renders for others.

### 7. `tut-e2e-docs`: E2E and docs

- **Playwright:** open Learn → finish lesson 1 → answer a quiz → start a coached Gen 3 daily (see the warning or offer) → see the review on the end card.
- **DESIGN.md:** update §22 for the judge and risk wording, §10 (state: `coach`, `coachOffered`, `coachLevelNormal`, `Attempt.coached`, `tutorial`), §11 (share: Coached), §12.2c (beginner hints vs the coach), and §18 (the Versus badge). Add a Learn mode section to the web README. Fold anything still useful from this file into DESIGN.md, then delete it.

## Accepted edge cases (known, not bugs)

- On a day the coach helped, a later uncoached win reads "Won on try 1" in the headline.
- The Coached bucket's "first try" is the day's first _coached_ try, so an uncoached loss followed by a coached win counts as a Coached first try.
- `dayLost` / `dayDecided` (which decide when the team can change) look only at the Normal bucket, so a coached Normal loss doesn't unlock a team change, just as Easy and Hard losses don't.

## Gotchas

- Windows + PowerShell. When editing LF files with string replacement, check the needle matched (PowerShell `.Replace` fails silently). Don't name a PowerShell helper `R` (it's an alias).
- Python's text mode on Windows writes CRLF: open files with `newline=''`, or run prettier after.
- Vitest in `packages/tutorial` hides `console.log`. Write scratch measurements to a file.
- In App tests, `TopBar`'s back button is found by its `title="Back"`, not an `aria-label`, because existing tests find it by text. Gen 3 App tests need the Gen 3 schedule fixture (`public/schedule/gen3ou/2026-10-19.json`); Gen 4 species crash Gen 3 tiles.
- Commit messages: write them to a file and use `git commit -F`, ending with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. (Claude Code can use its own trailer.)
