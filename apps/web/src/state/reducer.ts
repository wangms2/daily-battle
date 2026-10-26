import { difficultyTag, type Difficulty } from '@daily-battle/ai/version';
import type { FormatId } from '@daily-battle/data/formats';
import { mondayOf } from '@daily-battle/gen/dates';
import { applyAiChoices, type AiChoices } from '../battle/frames';
import { sameSpecies } from '../lib/data';
import { attemptDifficulty, summarizeDay } from '../lib/results';
import {
  emptyDay,
  type Attempt,
  type DayChange,
  type DayState,
  type GameState,
  type Settings,
  type Slot,
  type State,
  type TutorialProgress,
} from './schema';

/** Actions on one format's game. */
export type GameAction =
  | { type: 'lockTeam'; week: string; poolId: string; team: Slot[] }
  | { type: 'setLead'; day: string; species: string }
  | { type: 'applyChange'; day: string; week: string; change: DayChange }
  /** A change for the next practice run only (after today's counted tries). */
  | { type: 'setPracticeChange'; day: string; week: string; change: DayChange | null }
  | { type: 'startAttempt'; day: string; attempt: Attempt }
  /** The coach was turned on mid-battle: the battle in progress is coached from now on. */
  | { type: 'coachAttempt'; day: string }
  | { type: 'recordChoice'; day: string; choice: string; ai?: AiChoices }
  | { type: 'endAttempt'; day: string; result: 'win' | 'loss' | 'forfeit'; remaining: number }
  /** Unfinished attempts from past days, or from another engine version, become forfeits. */
  | { type: 'expireAttempts'; today: string; engine: string }
  /**
   * The week's pool was regenerated and the locked team no longer fits it:
   * unlock the week and drop today's unfinished battle and changes, which were
   * for the old team. Finished tries stay.
   */
  | { type: 'resetWeek'; week: string; day: string }
  /** Throws the weekly team away to build a new one: ends the streak. */
  | { type: 'ditchTeam'; week: string; day: string };

export type Action =
  /** A game action, for the game of `format`. */
  | (GameAction & { format: FormatId })
  | { type: 'setSetting'; key: keyof Settings; value: Settings[keyof Settings] }
  | { type: 'markExplainer'; id: string }
  /** Learn mode: the player reached a lesson's step (saved to resume). */
  | { type: 'lessonStep'; format: FormatId; lesson: string; step: number }
  | { type: 'lessonDone'; format: FormatId; lesson: string }
  /** Expires unfinished attempts in every game. */
  | { type: 'expireAll'; today: string; engine: string };

/** Today's attempt still being played, if any. */
export function attemptInProgress(day: DayState | undefined): Attempt | undefined {
  const last = day?.attempts.at(-1);
  return last?.result === 'inProgress' ? last : undefined;
}

/** The engine string an attempt at `difficulty` is saved with, given Normal's. */
export const attemptEngine = (normal: string, difficulty: Difficulty): string =>
  normal + difficultyTag(difficulty);

/** The team with a change applied. */
export function withChange(team: Slot[], change: DayChange | undefined): Slot[] {
  return change ? team.map((s, i) => (i === change.slot ? change.to : s)) : team;
}

/**
 * Whether a change still fits the team: the slot holds `from`, and no species
 * twice (Species Clause: forms like Rotom-Wash and Rotom-Frost count as one).
 */
function changeFits(team: Slot[], change: DayChange): boolean {
  const { slot, from, to } = change;
  const current = team[slot];
  if (!current || current.species !== from.species || current.setId !== from.setId) return false;
  if (change.kind === 'set') return to.species === from.species;
  return !team.some((s, i) =>
    i === slot ? s.species === to.species : sameSpecies(s.species, to.species),
  );
}

// Team rules follow Normal's tries only: the team is shared, and an Easy or Hard
// loss doesn't free it up (DESIGN.md §4.5).

/** Tried today and not won yet: the streak is over for today, so the team may change freely. */
export function dayLost(day: DayState | undefined): boolean {
  return summarizeDay(day, true).status === 'pending';
}

/** Today's counted tries are over (won, or a past day never won): further runs are practice. */
export function dayDecided(day: DayState | undefined): boolean {
  const status = summarizeDay(day, true).status;
  return status === 'firstTry' || status === 'won' || status === 'failed';
}

function updateLast(day: DayState, change: (a: Attempt) => Attempt): DayState {
  const attempts = [...day.attempts];
  attempts[attempts.length - 1] = change(attempts[attempts.length - 1]!);
  return { ...day, attempts };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'setSetting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case 'markExplainer':
      if (state.settings.shownExplainers.includes(action.id)) return state;
      return {
        ...state,
        settings: {
          ...state.settings,
          shownExplainers: [...state.settings.shownExplainers, action.id],
        },
      };
    case 'lessonStep':
    case 'lessonDone': {
      const progress = state.settings.tutorial?.[action.format] ?? { completed: [] };
      const next: TutorialProgress =
        action.type === 'lessonStep'
          ? { ...progress, current: { lesson: action.lesson, step: action.step } }
          : {
              completed: progress.completed.includes(action.lesson)
                ? progress.completed
                : [...progress.completed, action.lesson],
            };
      const tutorial = { ...state.settings.tutorial, [action.format]: next };
      return { ...state, settings: { ...state.settings, tutorial } };
    }
    case 'expireAll': {
      let games = state.games;
      for (const [format, game] of Object.entries(state.games) as [FormatId, GameState][]) {
        const next = gameReducer(game, { ...action, type: 'expireAttempts' });
        if (next !== game) games = { ...games, [format]: next };
      }
      return games === state.games ? state : { ...state, games };
    }
    default: {
      const game = state.games[action.format];
      const next = gameReducer(game, action);
      return next === game ? state : { ...state, games: { ...state.games, [action.format]: next } };
    }
  }
}

/** One game's state under a game action. */
export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'resetWeek': {
      const { [action.week]: _, ...weeks } = state.weeks;
      const day = state.days[action.day];
      const days = day
        ? {
            ...state.days,
            [action.day]: {
              swapUsed: false,
              attempts: day.attempts.filter((a) => a.result !== 'inProgress'),
            },
          }
        : state.days;
      return { ...state, weeks, days };
    }
    case 'ditchTeam': {
      if (attemptInProgress(state.days[action.day])) return state;
      const { [action.week]: _, ...weeks } = state.weeks;
      const day = state.days[action.day] ?? emptyDay();
      const { change: _c, lead: _l, practiceChange: _p, ...rest } = day;
      return {
        ...state,
        weeks,
        days: { ...state.days, [action.day]: { ...rest, swapUsed: false, ditched: true } },
      };
    }
    case 'lockTeam': {
      if (state.weeks[action.week]) return state; // locked for the week
      if (action.team.length !== 6) return state;
      const clash = action.team.some((s, i) =>
        action.team.slice(i + 1).some((t) => sameSpecies(s.species, t.species)),
      );
      if (clash) return state; // Species Clause
      return {
        ...state,
        weeks: { ...state.weeks, [action.week]: { team: action.team, poolId: action.poolId } },
      };
    }
    case 'setLead': {
      const day = state.days[action.day] ?? emptyDay();
      return { ...state, days: { ...state.days, [action.day]: { ...day, lead: action.species } } };
    }
    case 'applyChange': {
      const day = state.days[action.day] ?? emptyDay();
      const week = state.weeks[action.week];
      const lost = dayLost(day); // after a loss the streak is gone: swap as much as you like
      if ((day.swapUsed && !lost) || !week) return state; // otherwise one change per day
      if (attemptInProgress(day)) return state; // not mid-battle
      if (dayDecided(day)) return state; // after the counted tries, changes are practice only
      if (!changeFits(week.team, action.change)) return state;
      const { from, to } = action.change;
      const team = withChange(week.team, action.change);
      // A replaced lead hands the lead to whoever takes its slot.
      const lead = day.lead === from.species ? to.species : day.lead;
      return {
        ...state,
        weeks: { ...state.weeks, [action.week]: { ...week, team } },
        days: {
          ...state.days,
          [action.day]: lost
            ? { ...day, lead }
            : { ...day, swapUsed: true, change: action.change, lead },
        },
      };
    }
    case 'setPracticeChange': {
      const day = state.days[action.day];
      const week = state.weeks[action.week];
      if (!day || !week || !dayDecided(day) || attemptInProgress(day)) return state;
      if (action.change && !changeFits(week.team, action.change)) return state;
      const { practiceChange: _, ...rest } = day;
      return {
        ...state,
        days: {
          ...state.days,
          [action.day]: action.change ? { ...rest, practiceChange: action.change } : rest,
        },
      };
    }
    case 'startAttempt': {
      const day = state.days[action.day] ?? emptyDay();
      if (attemptInProgress(day)) return state;
      // A practice change goes with the run that uses it; the next run decides afresh.
      const { practiceChange: _, ...rest } = day;
      return {
        ...state,
        days: {
          ...state.days,
          [action.day]: { ...rest, attempts: [...day.attempts, action.attempt] },
        },
      };
    }
    case 'coachAttempt': {
      const day = state.days[action.day];
      if (!attemptInProgress(day)) return state;
      return {
        ...state,
        days: { ...state.days, [action.day]: updateLast(day!, (a) => ({ ...a, coached: true })) },
      };
    }
    case 'recordChoice': {
      const day = state.days[action.day];
      if (!attemptInProgress(day)) return state;
      return {
        ...state,
        days: {
          ...state.days,
          [action.day]: updateLast(day!, (a) => ({
            ...a,
            choices: [...a.choices, action.choice],
            // The AI's choices so far (Hard saves them, to resume without searching again).
            ...(action.ai ? { aiChoices: applyAiChoices(a.aiChoices, action.ai) } : {}),
          })),
        },
      };
    }
    case 'endAttempt': {
      const day = state.days[action.day];
      const attempt = attemptInProgress(day);
      if (!attempt) return state;
      const days = {
        ...state.days,
        [action.day]: updateLast(day!, (a) => ({
          ...a,
          result: action.result,
          remaining: action.remaining,
        })),
      };
      // Winning a practice run keeps its change: the team carries it from tomorrow.
      const weekKey = mondayOf(action.day);
      const week = state.weeks[weekKey];
      const change = attempt.practiceChange;
      if (action.result === 'win' && change && week && changeFits(week.team, change)) {
        return {
          ...state,
          days,
          weeks: { ...state.weeks, [weekKey]: { ...week, team: withChange(week.team, change) } },
        };
      }
      return { ...state, days };
    }
    case 'expireAttempts': {
      let days = state.days;
      for (const [key, day] of Object.entries(state.days)) {
        const a = attemptInProgress(day);
        if (
          a &&
          (key < action.today || a.engine !== attemptEngine(action.engine, attemptDifficulty(a)))
        ) {
          days = { ...days, [key]: updateLast(day, (x) => ({ ...x, result: 'forfeit' })) };
        }
      }
      return days === state.days ? state : { ...state, days };
    }
  }
}
