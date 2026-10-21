import {
  emptyDay,
  type Attempt,
  type DayChange,
  type DayState,
  type Settings,
  type Slot,
  type State,
} from './schema';

export type Action =
  | { type: 'lockTeam'; week: string; poolId: string; team: Slot[] }
  | { type: 'setLead'; day: string; species: string }
  | { type: 'applyChange'; day: string; week: string; change: DayChange }
  | { type: 'setSetting'; key: keyof Settings; value: Settings[keyof Settings] }
  | { type: 'markExplainer'; id: string }
  | { type: 'startAttempt'; day: string; attempt: Attempt }
  | { type: 'recordChoice'; day: string; choice: string }
  | { type: 'endAttempt'; day: string; result: 'win' | 'loss' | 'forfeit'; remaining: number }
  /** Unfinished attempts from past days, or from another engine version, become forfeits. */
  | { type: 'expireAttempts'; today: string; engine: string };

/** Today's attempt still being played, if any. */
export function attemptInProgress(day: DayState | undefined): Attempt | undefined {
  const last = day?.attempts.at(-1);
  return last?.result === 'inProgress' ? last : undefined;
}

function updateLast(day: DayState, change: (a: Attempt) => Attempt): DayState {
  const attempts = [...day.attempts];
  attempts[attempts.length - 1] = change(attempts[attempts.length - 1]!);
  return { ...day, attempts };
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'lockTeam': {
      if (state.weeks[action.week]) return state; // locked for the week
      if (action.team.length !== 6) return state;
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
      if (day.swapUsed || !week) return state; // one change per day
      if (attemptInProgress(day)) return state; // not mid-battle
      const { slot, from, to } = action.change;
      const current = week.team[slot];
      if (!current || current.species !== from.species || current.setId !== from.setId)
        return state;
      if (action.change.kind === 'set' && to.species !== from.species) return state;
      if (action.change.kind === 'replace' && week.team.some((s) => s.species === to.species))
        return state;
      const team = week.team.map((s, i) => (i === slot ? to : s));
      // A replaced lead hands the lead to whoever takes its slot.
      const lead = day.lead === from.species ? to.species : day.lead;
      return {
        ...state,
        weeks: { ...state.weeks, [action.week]: { ...week, team } },
        days: {
          ...state.days,
          [action.day]: { ...day, swapUsed: true, change: action.change, lead },
        },
      };
    }
    case 'setSetting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };
    case 'startAttempt': {
      const day = state.days[action.day] ?? emptyDay();
      if (attemptInProgress(day)) return state;
      return {
        ...state,
        days: {
          ...state.days,
          [action.day]: { ...day, attempts: [...day.attempts, action.attempt] },
        },
      };
    }
    case 'recordChoice': {
      const day = state.days[action.day];
      if (!attemptInProgress(day)) return state;
      return {
        ...state,
        days: {
          ...state.days,
          [action.day]: updateLast(day!, (a) => ({ ...a, choices: [...a.choices, action.choice] })),
        },
      };
    }
    case 'endAttempt': {
      const day = state.days[action.day];
      if (!attemptInProgress(day)) return state;
      return {
        ...state,
        days: {
          ...state.days,
          [action.day]: updateLast(day!, (a) => ({
            ...a,
            result: action.result,
            remaining: action.remaining,
          })),
        },
      };
    }
    case 'expireAttempts': {
      let days = state.days;
      for (const [key, day] of Object.entries(state.days)) {
        const a = attemptInProgress(day);
        if (a && (key < action.today || a.engine !== action.engine)) {
          days = { ...days, [key]: updateLast(day, (x) => ({ ...x, result: 'forfeit' })) };
        }
      }
      return days === state.days ? state : { ...state, days };
    }
    case 'markExplainer':
      if (state.settings.shownExplainers.includes(action.id)) return state;
      return {
        ...state,
        settings: {
          ...state.settings,
          shownExplainers: [...state.settings.shownExplainers, action.id],
        },
      };
  }
}
