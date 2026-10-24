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
  - At least 2 suggested teams exist. These are the best viable team of each archetype (Balanced, Offense, Stall, by `styleOf`), and they go into the schedule for the builder's suggestions row.
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

## Current schedule

8 weeks are published, Oct 19 to Dec 7, 2026. Every pool and every day passed (no closest-candidate fallbacks). Details are in `reports/`.

**Gen 3 OU** schedules are built with `schedule --format gen3ou --from 2026-10-19` into `schedule/gen3ou/` and `reports/gen3ou/`. Sampled pool teams pass `legalTeam` like every format; the set data already leaves out the boost passers ADV's clauses would make illegal in pairs. Three weeks are published so far, Oct 19 to Nov 2, 2026, starting with the trial week. Every pool passed on its first candidate and every day passed with no retuning (first try 45.5–54.0%, no turn caps), though a day took up to 18 candidates. A week takes 10–17 minutes on 4 workers; the next weeks follow.

**Gen 6 OU** schedules are built with `schedule --format gen6ou --from 2026-10-19` into `schedule/gen6ou/` and `reports/gen6ou/`. Sampled pool teams pass `legalTeam` (the validator plus one Mega per team), the player bots Mega Evolve like the AI, and the archetypes count Assault Vest, Weakness Policy, Geomancy, and Sticky Web. Seven weeks are published so far, Oct 19 to Nov 30, 2026 (the rest of the 24 to Mar 29, 2027 follow). Every pool passed on its first candidate; two days kept their closest candidate, just outside the first-try band (Nov 8 at 44.5%, Dec 1 at 55.5%). A week takes about 14–26 minutes on 4 workers.

## Tests

- **Bad opponent:** a deliberately harmless opponent is rejected as too easy.
- **Hard counter:** a Pokémon the pool can't touch (Wonder Guard Shedinja against a Seismic Toss pool) is flagged.
- **Sampling and workers:** sampled teams are deterministic and legal, and results match with 0 and 4 workers.
- **Published files:** every schedule file is well formed, uses known legal sets, and has suggested teams drawn from its pool.
