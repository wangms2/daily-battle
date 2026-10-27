# @daily-battle/pipeline

The offline validation pipeline and schedule emitter (DESIGN.md §6.4, §9). For each week, it validates the generated pool and every daily opponent by simulation, then writes the schedule file the client reads, plus a report.

```sh
pnpm --filter @daily-battle/pipeline schedule --from 2026-10-19 [--weeks 8] [--workers N] [--force]
```

- **Output:** `apps/web/public/schedule/<monday>.json` (the published schedule) and `packages/pipeline/reports/<monday>.{json,md}` (win rates, confidence intervals, rejected candidates and reasons).
- **Published weeks never change:** existing week files are skipped unless `--force`. Generate on one machine and commit the files, because floating-point results can differ slightly between machines.
- **Speed:** battles run across `worker_threads` (cores − 1 by default). Results don't depend on the worker count. A week takes about 2.5–12 minutes on 19 workers.

## Weekly pool (§9.2)

Each pool candidate (`generatePool(week, data, candidate)`) is checked like this:

- **Screening:** 60 sampled pool teams (6 of 12, sets by weight) each play 8 off-schedule generated opponents twice, as the mid bot against the opponent AI.
- **Pass requires:**
  - At least 50% of teams are viable (win rate ≥ 35%).
  - The best team isn't dominant. The top 5 teams are re-tested with 40 battles each before this is judged, since a best-of-60 rate over 16 battles is mostly luck.
  - Viable random teams come in at least 2 styles (by `styleOf`).
  - The week's **recommended team** is searched for (`src/recommend.ts`, DESIGN.md §9.2) and goes into the schedule's `suggestedTeams` (none or one) for the builder. `pnpm recommend [--format f] [--from date --weeks n]` re-picks it for existing weeks without touching anything else.
- **Fallback:** if a candidate fails, try the next one (up to 8); if none pass, keep the closest.

## Daily opponent (§9.3)

Each opponent candidate (`generateOpponent(day, data, candidate)`) plays 200 teams sampled from that week's pool. It must pass these checks, in order:

1. **No hard counter:** every opponent Pokémon takes at least 30% expected damage from some pool set (a static calc check, no battles).
2. **First try:** the uninformed mid bot wins **45–55%** of 400 battles. It plays 100 battles first and stops early if that result is more than 12 points outside the band.
3. **Retries:** the informed mid bot, which knows the opponent's real sets, wins **35–55%** of 400 battles.
4. **Skill matters:** the strong bot beats the naive bot's win rate by at least 10 points (200 battles each).
5. **No stalemates:** at most 3% of battles hit the 300-turn cap.

- **Luck (report only):** crits and misses per battle are logged; a rule can follow playtests.
- **Fallback:** if a candidate fails, try the next one (up to 20); if none pass, keep the closest and mark it `"accepted": "closest"`.
- **Thresholds and sample sizes:** all in `src/config.ts`.

## Difficulty report (informational)

Schedules are validated against Normal only. To see how a week plays on every difficulty (DESIGN.md §4.6):

```sh
pnpm --filter @daily-battle/pipeline difficulty-report --week 2026-10-19 --format gen3ou [--n 20] [--hard-iterations 150000] [--difficulties easy,normal,hard]
```

It plays the mid bot on `n` sampled pool teams against each day's opponent, prints a Markdown table of win rates per day and difficulty, and skips Hard if the format's WASM isn't built. A smoke run (Gen 3, week of Oct 19, n=6, Hard at 20k iterations) gave Easy 76%, Normal 48%, Hard 12%.

## Current schedule

8 weeks are published, Oct 19 to Dec 7, 2026. Every pool and every day passed (no closest-candidate fallbacks). Details are in `reports/`.

**Gen 3 OU** schedules are built with `schedule --format gen3ou --from 2026-10-19` into `schedule/gen3ou/` and `reports/gen3ou/`. Sampled pool teams pass `legalTeam` like every format; the set data already leaves out the boost passers ADV's clauses would make illegal in pairs. Seven weeks are published so far, Oct 19 to Nov 30, 2026, starting with the trial week. Every pool passed on its first candidate with no retuning, and no battle hit the turn cap. One day kept its closest candidate, just outside the first-try band (Nov 9 at 43.0%); the rest passed (first try 45.1–54.9%), though a day took up to 18 candidates. A week takes 10–22 minutes on 4 workers.

**Gen 6 OU** schedules are built with `schedule --format gen6ou --from 2026-10-19` into `schedule/gen6ou/` and `reports/gen6ou/`. Sampled pool teams pass `legalTeam` (the validator plus one Mega per team), the player bots Mega Evolve like the AI, and the team checklist counts Sticky Web. All 24 weeks are published, Oct 19, 2026 to Apr 4, 2027. Two pools needed a second candidate; the rest passed on their first. Three days kept their closest candidate, just outside the target band (Nov 8 at 44.5% first-try, Dec 1 at 55.5%, and Dec 25, whose first-try rate is 52.3% but whose retry rate is 55.5%). A week takes about 14–29 minutes on 4 workers.

## Tests

- **Bad opponent:** a deliberately harmless opponent is rejected as too easy.
- **Hard counter:** a Pokémon the pool can't touch (Wonder Guard Shedinja against a Seismic Toss pool) is flagged.
- **Sampling and workers:** sampled teams are deterministic and legal, and results match with 0 and 4 workers.
- **Published files:** every schedule file is well formed, uses known legal sets, and its recommended team (if any) is drawn from its pool.
