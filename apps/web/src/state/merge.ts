// Two saves of the same player's progress, from two devices, made one
// (DESIGN.md §10): nothing played on either is lost. Streaks and stats are
// derived from the days' attempts, so merging the attempts merges them too.
// `mine` is this device's: where both sides hold a preference, it wins.
import { mondayOf } from '@daily-battle/gen/dates';
import type { Attempt, DayState, GameState, Settings, State, TutorialProgress } from './schema';

const attemptKey = (a: Attempt) => `${a.ts}:${a.battleSeed}`;

function mergeDay(mine: DayState | undefined, theirs: DayState | undefined): DayState {
  if (!mine) return theirs!;
  if (!theirs) return mine;
  const seen = new Set(mine.attempts.map(attemptKey));
  const attempts = [...mine.attempts, ...theirs.attempts.filter((a) => !seen.has(attemptKey(a)))];
  attempts.sort((a, b) => a.ts - b.ts);
  // The day's other choices (lead, change) come from the side that played it more.
  const base = theirs.attempts.length > mine.attempts.length ? theirs : mine;
  return { ...base, swapUsed: mine.swapUsed || theirs.swapUsed, attempts };
}

function mergeGame(mine: GameState, theirs: GameState): GameState {
  const days: GameState['days'] = {};
  for (const day of new Set([...Object.keys(mine.days), ...Object.keys(theirs.days)])) {
    days[day] = mergeDay(mine.days[day], theirs.days[day]);
  }
  // A week built on both devices keeps the team that played more that week.
  const played = (game: GameState, week: string) =>
    Object.entries(game.days)
      .filter(([day]) => mondayOf(day) === week)
      .reduce((n, [, d]) => n + d.attempts.length, 0);
  const weeks: GameState['weeks'] = { ...theirs.weeks, ...mine.weeks };
  for (const week of Object.keys(theirs.weeks)) {
    if (mine.weeks[week] && played(theirs, week) > played(mine, week)) {
      weeks[week] = theirs.weeks[week]!;
    }
  }
  return { weeks, days };
}

function mergeTutorial(
  mine: TutorialProgress | undefined,
  theirs: TutorialProgress | undefined,
): TutorialProgress | undefined {
  if (!mine || !theirs) return mine ?? theirs;
  const completed = [
    ...mine.completed,
    ...theirs.completed.filter((l) => !mine.completed.includes(l)),
  ];
  const current = mine.current ?? theirs.current;
  return { completed, ...(current && { current }) };
}

/** Per game, each side's entries, combined with `pick`. */
function perGame<T>(
  mine: Partial<Record<string, T>> | undefined,
  theirs: Partial<Record<string, T>> | undefined,
  pick: (a: T | undefined, b: T | undefined) => T | undefined,
): Partial<Record<string, T>> | undefined {
  if (!mine && !theirs) return undefined;
  const out: Partial<Record<string, T>> = {};
  for (const k of new Set([...Object.keys(mine ?? {}), ...Object.keys(theirs ?? {})])) {
    const v = pick(mine?.[k], theirs?.[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function mergeSettings(mine: Settings, theirs: Settings): Settings {
  const tutorial = perGame(mine.tutorial, theirs.tutorial, mergeTutorial);
  // The trainer's boxes: the further one for each matchup.
  const typeTrainer = perGame(mine.typeTrainer, theirs.typeTrainer, (a, b) => {
    if (!a || !b) return a ?? b;
    const out = { ...b, ...a };
    for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k]!, v);
    return out;
  });
  const coachOffered = perGame(mine.coachOffered, theirs.coachOffered, (a, b) => a || b);
  const name = mine.name ?? theirs.name;
  return {
    ...theirs,
    ...mine,
    shownExplainers: [...new Set([...mine.shownExplainers, ...theirs.shownExplainers])],
    ...(name && { name }),
    ...(tutorial && { tutorial }),
    ...(typeTrainer && { typeTrainer }),
    ...(coachOffered && { coachOffered }),
  } as Settings;
}

export function mergeStates(mine: State, theirs: State): State {
  const games = { ...theirs.games, ...mine.games };
  for (const f of Object.keys(theirs.games) as (keyof State['games'])[]) {
    if (mine.games[f]) games[f] = mergeGame(mine.games[f], theirs.games[f]);
  }
  return { version: 4, games, settings: mergeSettings(mine.settings, theirs.settings) };
}
