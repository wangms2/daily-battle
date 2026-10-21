import { emptyDay, type DayChange, type Settings, type Slot, type State } from './schema';

export type Action =
  | { type: 'lockTeam'; week: string; poolId: string; team: Slot[] }
  | { type: 'setLead'; day: string; species: string }
  | { type: 'applyChange'; day: string; week: string; change: DayChange }
  | { type: 'setSetting'; key: keyof Settings; value: Settings[keyof Settings] }
  | { type: 'markExplainer'; id: string };

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
