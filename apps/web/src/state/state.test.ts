import { describe, expect, it } from 'vitest';
import { reducer } from './reducer';
import { initialState, type DayChange, type Slot } from './schema';
import { createStorage, migrate, STORAGE_KEY } from './storage';

const TEAM: Slot[] = [
  { species: 'Heatran', setId: 'heatran-utility' },
  { species: 'Scizor', setId: 'scizor-choice-band' },
  { species: 'Jirachi', setId: 'jirachi-utility' },
  { species: 'Lucario', setId: 'lucario-swords-dance' },
  { species: 'Celebi', setId: 'celebi-utility' },
  { species: 'Azelf', setId: 'azelf-standard-lead' },
];
const WEEK = '2026-10-19';
const DAY = '2026-10-21';

/** A fake localStorage; `broken` makes every call throw like a blocked one. */
function fakeBackend(broken = false): globalThis.Storage {
  const data = new Map<string, string>();
  const guard = <T>(f: () => T) => {
    if (broken) throw new Error('blocked');
    return f();
  };
  return {
    get length() {
      return data.size;
    },
    clear: () => guard(() => data.clear()),
    getItem: (k) => guard(() => data.get(k) ?? null),
    key: (i) => guard(() => [...data.keys()][i] ?? null),
    removeItem: (k) => guard(() => void data.delete(k)),
    setItem: (k, v) => guard(() => void data.set(k, v)),
  };
}

const locked = () =>
  reducer(initialState(), { type: 'lockTeam', week: WEEK, poolId: `${WEEK}:c0`, team: TEAM });

describe('storage', () => {
  it('round-trips state', () => {
    const backend = fakeBackend();
    const storage = createStorage(backend);
    const state = locked();
    storage.save(state);
    expect(createStorage(backend).load()).toEqual(state);
  });

  it('falls back to memory when storage is blocked', () => {
    const storage = createStorage(fakeBackend(true));
    expect(storage.available).toBe(false);
    expect(storage.load()).toEqual(initialState());
    expect(() => storage.save(locked())).not.toThrow();
  });

  it('starts fresh on corrupt or unknown saved data', () => {
    const backend = fakeBackend();
    backend.setItem(STORAGE_KEY, '{not json');
    expect(createStorage(backend).load()).toEqual(initialState());
    expect(migrate({ version: 99 })).toEqual(initialState());
  });

  it('fills in fields added since a v1 save', () => {
    const migrated = migrate({
      version: 1,
      weeks: {},
      days: {},
      settings: { beginnerHints: false },
    });
    expect(migrated.settings).toEqual({ ...initialState().settings, beginnerHints: false });
    expect(migrated.stats).toEqual(initialState().stats);
  });
});

describe('weekly team', () => {
  it('locks once per week', () => {
    const state = locked();
    expect(state.weeks[WEEK]!.team).toEqual(TEAM);
    const again = reducer(state, {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: [...TEAM].reverse(),
    });
    expect(again).toBe(state);
  });

  it('needs exactly 6 Pokémon', () => {
    const state = reducer(initialState(), {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: TEAM.slice(0, 5),
    });
    expect(state.weeks[WEEK]).toBeUndefined();
  });

  it('starts empty in a new week', () => {
    expect(locked().weeks['2026-10-26']).toBeUndefined();
  });
});

describe('daily change', () => {
  const replace: DayChange = {
    kind: 'replace',
    slot: 1,
    from: TEAM[1]!,
    to: { species: 'Gyarados', setId: 'gyarados-offensive-dragon-dance' },
  };
  const changeSet: DayChange = {
    kind: 'set',
    slot: 0,
    from: TEAM[0]!,
    to: { species: 'Heatran', setId: 'heatran-choice-scarf' },
  };

  it('replaces a Pokémon for the rest of the week and marks the day', () => {
    const state = reducer(locked(), { type: 'applyChange', day: DAY, week: WEEK, change: replace });
    expect(state.weeks[WEEK]!.team[1]).toEqual(replace.to);
    expect(state.days[DAY]).toMatchObject({ swapUsed: true, change: replace });
  });

  it('allows one change per day: a swap and a set change are mutually exclusive', () => {
    const once = reducer(locked(), { type: 'applyChange', day: DAY, week: WEEK, change: replace });
    expect(reducer(once, { type: 'applyChange', day: DAY, week: WEEK, change: changeSet })).toBe(
      once,
    );
  });

  it('resets the next day', () => {
    const once = reducer(locked(), { type: 'applyChange', day: DAY, week: WEEK, change: replace });
    const tomorrow = reducer(once, {
      type: 'applyChange',
      day: '2026-10-22',
      week: WEEK,
      change: changeSet,
    });
    expect(tomorrow.weeks[WEEK]!.team[0]).toEqual(changeSet.to);
  });

  it('rejects stale or invalid changes', () => {
    const state = locked();
    const wrongFrom = { ...replace, from: { species: 'Blissey', setId: 'blissey-standard' } };
    expect(reducer(state, { type: 'applyChange', day: DAY, week: WEEK, change: wrongFrom })).toBe(
      state,
    );
    const duplicate = { ...replace, to: TEAM[2]! };
    expect(reducer(state, { type: 'applyChange', day: DAY, week: WEEK, change: duplicate })).toBe(
      state,
    );
    const setToOtherSpecies = { ...changeSet, to: replace.to };
    expect(
      reducer(state, { type: 'applyChange', day: DAY, week: WEEK, change: setToOtherSpecies }),
    ).toBe(state);
  });

  it('hands the lead to whoever replaces it', () => {
    const led = reducer(locked(), { type: 'setLead', day: DAY, species: 'Scizor' });
    const state = reducer(led, { type: 'applyChange', day: DAY, week: WEEK, change: replace });
    expect(state.days[DAY]!.lead).toBe('Gyarados');
  });
});

describe('settings', () => {
  it('updates settings and records explainers once', () => {
    let state = reducer(initialState(), { type: 'setSetting', key: 'beginnerHints', value: false });
    expect(state.settings.beginnerHints).toBe(false);
    state = reducer(state, { type: 'markExplainer', id: 'welcome' });
    expect(reducer(state, { type: 'markExplainer', id: 'welcome' })).toBe(state);
    expect(state.settings.shownExplainers).toEqual(['welcome']);
  });
});
