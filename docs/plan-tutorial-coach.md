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
- **Checks.** Run from the repo root: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (56 files, 1437 tests, ~40 s). For one package: `npx tsc --noEmit` and `npx vitest run <file>`. `packages/sim-bridge/src/noluck.test.ts` is occasionally flaky.

## Product decisions (from the user; don't revisit without asking)

- **The coach must never give advice that's bad against the opponent the player is actually facing.** This drives the remaining work: per-difficulty validation offline (`coach-eval`) plus a runtime judge.
- **It must not be annoying.** At most one tip per turn, and a 3-turn gap between tips (`TIP_GAP`). Urgent tips (`koThreat`, `canKo`) need only a 2-turn gap (`URGENT_GAP`). No tip shows while a lesson prompt or beginner-hint explainer is up, and a warning the player overrode isn't repeated that battle. Warnings appear only when the blunder is actually picked. Severity still matters: the goal is "not spammy on average", not a hard cap. Measured on 20 Easy-vs-Easy battles: tips on 13% of decisions, warnings on 5%, no repeats.
- **No per-turn move suggestions.** The coach gives tips, blunder warnings, and a post-battle review only.
- **Two levels:**
  - **Simple:** one-turn, visible facts only. It never mentions reads, predictions, or multi-turn plans. It's the only level in lessons, graduation, Easy, and Normal (by default).
  - **Advanced:** uses the Hard search. It's the only level against Hard, and optional on Normal. It's never offered on Easy or in lessons.
- **Daily coach (built):**
  - Gen 3 only. Offered on Easy and Normal. **Hidden on Hard until Advanced exists**; it's enabled there by `tut-coach-advanced`.
  - Off by default. Offered once on a game's first daily brief and again after graduation.
  - Coached tries form a separate **Coached** bucket per game, shared across difficulties, with its own streak and stats.
  - A coached try before the day is cleared ends only **that difficulty's** regular streak. Coached practice after a clear doesn't affect it.
  - Turning the coach on mid-battle is sticky for that attempt and needs a confirmation when it would cost a streak.
- **Versus:** the coach is allowed, and every player in the room clearly sees who has it on.
- **AI-model coach:** rejected. A paid or token-based LLM is out; the coach is rules plus our own AI's scores and search.
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

### 1. `tut-gen3-recommend`: recommend Gen 3 to beginners (small; good warm-up)

- **`WelcomeSheet`** (`apps/web/src/sheets/misc.tsx`, both first run and the "How to play" review mode): add a "New to competitive Pokémon? Start with Gen 3" block, with **Start the tutorial** (→ `#learn`, lesson 1) and **Play Gen 3** (set format `gen3ou` → `#play`; the existing one-time offer then appears). Add one line saying Gen 3 has lessons and a coach.
- **Home / game picker:** add a "Recommended for beginners" tag on the Gen 3 card. It shows until the tutorial is finished (graduation completed) or the player has played 3 Gen 3 dailies, then disappears. This only recommends and links: never change the default format.
- **Tests:** the welcome and How to play sheets show the block and buttons; the tag hides once either condition is met.

### 2. `tut-coach-eval`: offline coach-quality validation (the core quality gate)

Goal: each rule × opponent difficulty × level is proven not to hurt against **that exact AI**. Rules that fail are switched off for that difficulty by a generated gates file that the coach reads at runtime.

- **Script:** `packages/tutorial/scripts/coach-eval.ts` (add a `coach-eval` package script), modelled on `packages/ai/scripts/eval.ts`.
  1. **Collect advice.** Play Gen 3 battles, using teams from weekly pools vs daily opponents. The player bot is beginner-ish (Easy and mid presets); the opponent is each of Easy, Normal, and Hard. At every player decision, run the coach (each level available for that opponent) and record each warning ("not X", with its suggested alternative) and each tip that implies an action.
  2. **Counterfactual rollouts.** Fork at the decision by replaying the seed plus the choice log. Branch A plays the advised action; branch B plays the action it argues against. If a warning has no explicit alternative, use the best other option by the coach's ranking. Play each branch to the end R times (R ≈ 30–50) with the **real opponent policy**. Continue the player's side with a fixed `STRONG` policy. Use **common random numbers**: the same continuation seeds in both branches. Only the opponent sees real sets.
  3. **Score.** A case passes when the advised branch's win rate is at least the other branch's minus 2 points; a tie passes.
  4. **Gates:**
     - **Simple:** passes in ≥ 90% of cases, with at least 50 samples.
     - **Advanced:** passes in ≥ 85% of cases.

     Otherwise the rule is disabled for that difficulty. Write `packages/tutorial/src/coach/coach-gates.gen3.json` with entries `{ rulesHash, gates: { [rule]: { [difficulty]: { simple?, advanced? } } } }`.

  5. **Report:** `--report` writes Markdown. For each rule × difficulty, show sample positions (both actives, HP, field), the advice text, both branches' win rates with confidence intervals, and the verdict, with the worst failures first.
- **Runtime:** the `Coach` takes the opponent's `difficulty` and drops gated-off rules (add `gates.ts`). Lesson battles use the Easy gates. Scripted foes need no gates; their prompts are authored.
- **CI** (`.github/workflows/ci.yml`):
  - Fail if `rulesHash` doesn't match the current rule set, so changing rules forces a re-run.
  - Run a small smoke sample on PRs that fails if an enabled rule falls below its bar.
  - Run the full eval as a manual or scheduled job.
- **Lesson content check:** each quiz's "best" answer must win at least as often as the alternatives against the lesson's own foe (scripted or Easy). The same goes for mini-battle prompts that recommend an action.
- **Cost:** Hard rollouts are slow. Use a reduced Hard search budget for the _opponent_ only if the results match full budget on a sample, and document that choice. Parallelise across worker threads or processes. Report the run time.
- Before writing much code, sanity-check the approach on one rule (`switchKo` vs Easy) end to end.

### 3. `tut-coach-advanced`: the Advanced coach (Hard search on the player's view)

- Run `HardPolicy`'s search with the **player** as side one, using the player's own `SideView` and sampling foe worlds from beliefs plus the weekly pool, exactly as Hard does for itself. Run it in the battle worker **while the player is choosing**, so it adds no wait, with a budget of about 20–40k iterations. Cache the result per request; blunder checks reuse it.
- **Text from the search:**
  - **Reads** come from the foe-side visit distribution: "Likely foe move: Earthquake (≈60%)."
  - **Better lines** come from the player-side values: "Switching to Skarmory scores best."

  Use templates only, and check wording with a test that lists the banned concepts per level.

- If the WASM isn't loaded yet or the search fails, fall back to Simple **for that turn**.
- **Availability:**
  - **Hard:** Advanced only (enable Hard in `coachAvailable`).
  - **Normal:** opt-in via `settings.coachLevelNormal: 'simple' | 'advanced'`. The toggle shows a Simple/Advanced choice only there. Picking Advanced loads the Gen 3 WASM, as Hard does.
  - **Easy and lessons:** never.
  - The level doesn't affect streaks: any coached attempt counts as Coached.
- The review on Advanced adds the stronger line and the foe reply it expects.
- **Tests:**
  - Simple never emits Advanced-tagged rules or banned wording.
  - Advanced produces a read tip on a known position vs Hard.
  - Falls back to Simple without the engine.
  - Hidden-info: swapping the foe's hidden sets gives identical output until they're revealed.
- Re-run `coach-eval` with Advanced and commit the updated gates. Advanced read rules that fail against Normal are gated off there; their Simple counterparts stay.

### 4. `tut-coach-judge`: the runtime judge for each position

- A warning shows only if the judge agrees that the flagged choice is clearly worse than the suggested alternative **against this opponent**. If they disagree, the coach stays quiet.
  - **Easy/Normal:** a reply-aware one-turn check using the **opponent's own preset params** (its likely replies over the foe's possible sets), not full rollouts. Budget ≤ 500 ms on a phone, run while the player chooses.
  - **Hard:** the Advanced search is the judge.
- **AI-only warnings:** when the judge sees a large gap that no rule explains, warn anyway with a generic reason built from the score breakdown ("Swampert takes much less damage here"). Keep these rare; they go through `coach-eval` like any rule.
- Re-run the rate test (warnings < 0.1, tips < 0.2 per decision) and `coach-eval`.

### 5. `tut-versus-coach`: coach in Versus

- Add a per-player `coached` flag to the room protocol in `packages/versus` / `apps/server`. Show a coach badge for that player in the lobby, battle header, standings, and spectate view. Reuse `CoachBadge`. No streak effect.
- The coach runs client-side from the player's own view, as in the daily, with the level picked by the room's opponent type.
- Tests: the protocol round-trips the flag, and the badge renders for others.

### 6. `tut-e2e-docs`: E2E and docs

- **Playwright:** open Learn → finish lesson 1 → answer a quiz → start a coached Gen 3 daily (see the warning or offer) → see the review on the end card.
- **DESIGN.md:** §22 exists. Update §10 (state: `coach`, `coachOffered`, `coachLevelNormal`, `Attempt.coached`, `tutorial`), §11 (share: Coached), §12.2c (beginner hints vs the coach), and §18 (the Versus badge). Add a Learn mode section to the web README. Fold anything still useful from this file into DESIGN.md, then delete it.

## Accepted edge cases (known, not bugs)

- On a day the coach helped, a later uncoached win reads "Won on try 1" in the headline.
- The Coached bucket's "first try" is the day's first _coached_ try, so an uncoached loss followed by a coached win counts as a Coached first try.
- `dayLost` / `dayDecided` (which decide when the team can change) look only at the Normal bucket, so a coached Normal loss doesn't unlock a team change, just as Easy and Hard losses don't.

## Gotchas

- Windows + PowerShell. When editing LF files with string replacement, check the needle matched (PowerShell `.Replace` fails silently). Don't name a PowerShell helper `R` (it's an alias).
- Vitest in `packages/tutorial` hides `console.log`. Write scratch measurements to a file.
- In App tests, `TopBar`'s back button is found by its `title="Back"`, not an `aria-label`, because existing tests find it by text. Gen 3 App tests need the Gen 3 schedule fixture (`public/schedule/gen3ou/2026-10-19.json`); Gen 4 species crash Gen 3 tiles.
- Commit messages: write them to a file and use `git commit -F`, ending with `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`. (Claude Code can use its own trailer.)
