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
- **Engine builds.** `packages/engine-wasm/dist` isn't committed. After pulling the step 2 commit, rebuild it (`search_fixed` is new): `PATH="$HOME/.cargo/bin:$PATH" pnpm --filter @daily-battle/engine-wasm build:wasm` (cargo isn't on the Git Bash PATH by default).
- **Checks.** Run from the repo root: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (~45 s). For one package: `npx tsc --noEmit` and `npx vitest run <file>`. `packages/sim-bridge/src/noluck.test.ts` is occasionally flaky.

## Waiting on the user (2026-10-26 morning)

Questions prepared overnight, with the data behind them in "Step 2 results" below:

1. **Judge settings.** Keep margin 0.1, agree 0.9, 20k iterations per search? (0.15 halves the warnings with about the same real gain per warning; 0.1 catches twice as many real mistakes.)
2. **How often warnings may appear once every judged mistake can be explained (step 3).** Warning rate per decision (`coach-rate`, 40 battles each, decisions with a real choice):

   |                                              | beginner (Easy-like) vs Easy    | mid player vs Normal   |
   | -------------------------------------------- | ------------------------------- | ---------------------- |
   | rules alone (before the judge)               | 7.9%                            | 5.7%                   |
   | shipped now: rule + judge, margin 0.1        | 3.6% (median 1 a battle, max 4) | 1.3% (median 0, max 2) |
   | judge alone, margin 0.1 (what step 3 allows) | 16.7% (about 4 a battle)        | 7.7%                   |
   | judge alone, margin 0.15                     | 9.9% (about 2.4 a battle)       | 3.9%                   |

   Each judged warning is worth +6 to +8 points of win rate on average. Show every one, only the bigger ones (0.15), or pace them like tips? (Tips run at 20–23% of decisions, as before.)

3. **Explosion.** Quiet on picks of Explosion / Self-Destruct until step 4 has enough samples, or keep judging them? And may the coach _recommend_ Explosion? The judge often prefers it (e.g. a 44% Cloyster exploding on a 53% Starmie: 100% vs 61% in rollouts). If so, the text must say the cost ("Explosion knocks out Cloyster too").
4. **Resume.** After a reload, a warning the player already overrode can be asked again. Acceptable, or save the overridden warnings with the attempt?
5. **Only true, relevant reasons.** In wording drafts (`scripts/wording-demo.ts` on real judged warnings), most read well, e.g. "Risky: if Donphan uses Earthquake, Raikou is knocked out as it comes in. Heracross takes Donphan's hits much better." But some judged gaps have no reason the facts show (Moltres's Fire Blast vs a Substitute Smeargle: the draft "Sceptile takes Smeargle's hits much better" is invented). Proposal: warn only when a template's reason is true and relevant; otherwise stay quiet.
6. **Won either way.** Some judged warnings change nothing (rollouts 100% vs 100%: the player wins anyway). Skip warnings when both choices already look winning (say both values ≥ 0.85)?

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
  - `src/coach/simple.ts`: the `Coach` class. `CoachRule` is one of `noEffect | canKo | staysKo | switchKo | koThreat | foeAsleep | locked | spikes | walled | setupWindow`. Key methods:
    - `turn(view)` returns a `CoachTurn` with an optional tip and the warnings keyed by choice.
    - `record(choice)` notes the player's choice (and any warning they overrode).
    - `forget()` drops the cached result when a choice is blocked.

    The tip is cached per request, and the tip cooldown is applied there too.

  - `src/coach/review.ts`: `decision()` records the scores for each player decision; `buildReview()` picks up to 3 key turns (gap ≥ `KEY_GAP` = 0.3).
  - `src/coach/coach.test.ts`: rule tests, pacing, and the rate test.
- **`apps/web`:**
  - `src/battle/engine.ts`: `EngineStart.coach?: 'simple'`. The engine runs the coach before `session.choose` (in the resume replay too). `TurnPackage` carries `coach` and `review`.
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
- **Provisional settings** (`JUDGE_DEFAULTS`, awaiting the user's OK): 20k iterations per search, 8 worlds, margin 0.1, agree 0.9.
- **Resume:** a warning the player overrode before a reload can be asked again after it (the shown warnings aren't saved).

### 3. `tut-coach-messages`: rules explain, the judge decides

- Each rule becomes an **explanation** for a judged gap, not a trigger. A warning needs the judge to say the pick is clearly worse; the rule supplies the plain reason. A judged gap that no rule explains gets a generic reason from the facts ("Swampert takes much less damage here"); keep these rare.
- **Risk wording (decided).** Name the risk plainly, one concept at a time, no odds: "Risky: if Salamence attacks, Heracross is knocked out. Swampert takes the hit safely." The foe's likely replies come from the search's foe-side visits; what each does comes from the damage calc.
- **Tips** (setup window, walled, switch tips) need the judge to agree too. Fact tips with no decision in them (Spikes are up, a Choice lock, the foe is asleep) stay as they are.
- **Review** uses the judge's values instead of the utility scores, so it never contradicts what the coach said in battle.
- **Simple and Advanced are wording levels.** Simple never mentions reads, predictions, or plans over several turns (keep the banned-words test).
- Self-KO moves (Explosion, Self-Destruct) don't count as a "switch-in gets knocked out" threat: they knock out whatever stays in too.

### 4. `tut-coach-eval`: offline check of every message shown

- `packages/tutorial/scripts/coach-eval.ts` (started; proof of concept for switchKo vs Easy) and `BattleSession.reseed`.
- **Collect** the messages the coach actually shows (warnings with their alternative, tips that imply an action) in Gen 3 battles: weekly-pool teams, played by beginner-ish bots (Easy, mid), against the daily opponent on Easy, Normal, and Hard.
- **Roll out** each case to the end R times per branch with the **real opponent AI**, the strong bot for the player, and shared luck between branches (`reseed`).
- **Bar:** almost no shown message is worse than its alternative. Report the pooled gain with its CI, and the share of messages clearly worse (by more than 2 SE), per message kind and difficulty. Exact targets to agree after the first full run.
- **Report** (`--report`, Markdown): worst cases first, with the position, the text, and both branches' win rates.
- **Cost:** Hard rollouts are slow (full search: about 40 CPU-hours per kind of message). Use a reduced Hard budget for the _opponent_ only if it matches full budget on a sample, and say so. Parallelise across processes. Report the run time.
- **CI:** a small smoke sample on PRs; the full run as a manual or scheduled job.
- **Lesson content check:** each quiz's "best" answer must win at least as often as the alternatives against the lesson's own foe, and the same for mini-battle prompts that recommend an action.

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
