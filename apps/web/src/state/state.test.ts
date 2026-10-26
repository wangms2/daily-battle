import { describe, expect, it } from 'vitest';
import { computeStats } from '../lib/results';
import { attemptEngine, attemptInProgress, dayLost, gameReducer, reducer } from './reducer';
import {
  emptyGame,
  initialState,
  type Attempt,
  type DayChange,
  type GameState,
  type Slot,
  type State,
} from './schema';
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
  gameReducer(emptyGame(), { type: 'lockTeam', week: WEEK, poolId: `${WEEK}:c0`, team: TEAM });

/** A whole saved state with a locked Gen 4 OU week. */
const lockedState = (): State => ({
  ...initialState(),
  games: { ...initialState().games, gen4ou: locked() },
});

describe('storage', () => {
  it('round-trips state', () => {
    const backend = fakeBackend();
    const storage = createStorage(backend);
    const state = lockedState();
    storage.save(state);
    expect(createStorage(backend).load()).toEqual(state);
  });

  it('falls back to memory when storage is blocked', () => {
    const storage = createStorage(fakeBackend(true));
    expect(storage.available).toBe(false);
    expect(storage.load()).toEqual(initialState());
    expect(() => storage.save(lockedState())).not.toThrow();
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
    expect(migrated.settings).toEqual({
      ...initialState().settings,
      beginnerHints: false,
      format: 'gen4ou',
    });
    expect(migrated.version).toBe(4);
  });

  it('drops the stored stats of a v1 save and keeps everything else', () => {
    const v1 = {
      version: 1,
      weeks: { [WEEK]: { team: TEAM, poolId: `${WEEK}:c0` } },
      days: { [DAY]: { swapUsed: true, attempts: [] } },
      stats: { daysPlayed: 0, firstTryStreak: 0 },
      settings: initialState().settings,
    };
    const migrated = migrate(v1);
    expect(migrated).not.toHaveProperty('stats');
    expect(migrated).toEqual({
      version: 4,
      games: { ...initialState().games, gen4ou: { weeks: v1.weeks, days: v1.days } },
      settings: { ...v1.settings, format: 'gen4ou' },
    });
  });
});

describe('a game per format (v4)', () => {
  it('moves a v3 save into Gen 4 OU and keeps the player on it', () => {
    const v3 = {
      version: 3,
      weeks: { [WEEK]: { team: TEAM, poolId: `${WEEK}:c0` } },
      days: { [DAY]: { swapUsed: true, attempts: [] } },
      settings: initialState().settings,
    };
    const migrated = migrate(v3);
    expect(migrated.games.gen4ou).toEqual({ weeks: v3.weeks, days: v3.days });
    expect(migrated.games.gen5ou).toEqual(emptyGame());
    expect(migrated.settings.format).toBe('gen4ou');
  });

  it('starts a new player with no game picked', () => {
    expect(initialState().settings.format).toBeUndefined();
    expect(migrate(null).settings.format).toBeUndefined();
  });

  it('adds an empty game for a format a v4 save predates', () => {
    const { gen5ou: _, ...games } = lockedState().games;
    const migrated = migrate({ ...lockedState(), games });
    expect(migrated.games.gen5ou).toEqual(emptyGame());
    expect(migrated.games.gen4ou).toEqual(locked());
  });

  it('adds an empty Gen 6 game to a save from before Gen 6, without a new version', () => {
    const { gen6ou: _, ...games } = lockedState().games;
    const migrated = migrate({ ...lockedState(), games });
    expect(migrated.games.gen6ou).toEqual(emptyGame());
    expect(migrated.games.gen4ou).toEqual(locked());
    expect(migrated.version).toBe(lockedState().version);
  });

  it('applies game actions to their own format only', () => {
    const state = reducer(initialState(), {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: TEAM,
      format: 'gen5ou',
    });
    expect(state.games.gen5ou.weeks[WEEK]!.team).toEqual(TEAM);
    expect(state.games.gen4ou).toEqual(emptyGame());
  });

  it('expires unfinished attempts in every game', () => {
    const attempt = {
      result: 'inProgress' as const,
      remaining: 6,
      ts: 1,
      lead: 'Heatran',
      team: TEAM,
      battleSeed: '1',
      aiSeed: '2',
      choices: [],
      engine: 'e',
    };
    let state = lockedState();
    for (const format of ['gen4ou', 'gen5ou'] as const) {
      state = reducer(state, { type: 'startAttempt', day: DAY, attempt, format });
    }
    const next = reducer(state, { type: 'expireAll', today: '2026-10-22', engine: 'e' });
    expect(next.games.gen4ou.days[DAY]!.attempts[0]!.result).toBe('forfeit');
    expect(next.games.gen5ou.days[DAY]!.attempts[0]!.result).toBe('forfeit');
    expect(reducer(next, { type: 'expireAll', today: '2026-10-22', engine: 'e' })).toBe(next);
  });
});

describe('speed settings (v3)', () => {
  it('moves older saves to the new default speed and keeps v3 choices', () => {
    const settings = { ...initialState().settings, battleSpeed: 'instant' as const };
    expect(migrate({ version: 2, weeks: {}, days: {}, settings }).settings.battleSpeed).toBe(
      'normal',
    );
    expect(
      migrate({ version: 3, weeks: {}, days: {}, settings: { ...settings, battleSpeed: 'slow' } })
        .settings.battleSpeed,
    ).toBe('slow');
    expect(initialState().settings.battleSpeed).toBe('normal');
  });
});

describe('weekly team', () => {
  it('locks once per week', () => {
    const state = locked();
    expect(state.weeks[WEEK]!.team).toEqual(TEAM);
    const again = gameReducer(state, {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: [...TEAM].reverse(),
    });
    expect(again).toBe(state);
  });

  it('needs exactly 6 Pokémon', () => {
    const state = gameReducer(emptyGame(), {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: TEAM.slice(0, 5),
    });
    expect(state.weeks[WEEK]).toBeUndefined();
  });

  it('keeps Species Clause: no two forms of a Pokémon (Rotom-Wash, Rotom-Frost)', () => {
    const twoRotoms = [...TEAM.slice(0, 5), { species: 'Rotom-Wash', setId: 'x' }].map((s, i) =>
      i === 0 ? { species: 'Rotom-Frost', setId: 'y' } : s,
    );
    const state = gameReducer(emptyGame(), {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: twoRotoms,
    });
    expect(state.weeks[WEEK]).toBeUndefined();
    // A daily swap can't bring in a second form either, but can replace one with the other.
    const withWash = gameReducer(emptyGame(), {
      type: 'lockTeam',
      week: WEEK,
      poolId: 'x',
      team: TEAM.map((s, i) => (i === 5 ? { species: 'Rotom-Wash', setId: 'x' } : s)),
    });
    const frost = { species: 'Rotom-Frost', setId: 'y' };
    const intoOther = { kind: 'replace' as const, slot: 1, from: TEAM[1]!, to: frost };
    expect(
      gameReducer(withWash, { type: 'applyChange', day: DAY, week: WEEK, change: intoOther }),
    ).toBe(withWash);
    const intoWash = {
      kind: 'replace' as const,
      slot: 5,
      from: withWash.weeks[WEEK]!.team[5]!,
      to: frost,
    };
    expect(
      gameReducer(withWash, { type: 'applyChange', day: DAY, week: WEEK, change: intoWash }).weeks[
        WEEK
      ]!.team[5],
    ).toEqual(frost);
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
    const state = gameReducer(locked(), {
      type: 'applyChange',
      day: DAY,
      week: WEEK,
      change: replace,
    });
    expect(state.weeks[WEEK]!.team[1]).toEqual(replace.to);
    expect(state.days[DAY]).toMatchObject({ swapUsed: true, change: replace });
  });

  it('allows one change per day: a swap and a set change are mutually exclusive', () => {
    const once = gameReducer(locked(), {
      type: 'applyChange',
      day: DAY,
      week: WEEK,
      change: replace,
    });
    expect(
      gameReducer(once, { type: 'applyChange', day: DAY, week: WEEK, change: changeSet }),
    ).toBe(once);
  });

  it('resets the next day', () => {
    const once = gameReducer(locked(), {
      type: 'applyChange',
      day: DAY,
      week: WEEK,
      change: replace,
    });
    const tomorrow = gameReducer(once, {
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
    expect(
      gameReducer(state, { type: 'applyChange', day: DAY, week: WEEK, change: wrongFrom }),
    ).toBe(state);
    const duplicate = { ...replace, to: TEAM[2]! };
    expect(
      gameReducer(state, { type: 'applyChange', day: DAY, week: WEEK, change: duplicate }),
    ).toBe(state);
    const setToOtherSpecies = { ...changeSet, to: replace.to };
    expect(
      gameReducer(state, { type: 'applyChange', day: DAY, week: WEEK, change: setToOtherSpecies }),
    ).toBe(state);
  });

  it('hands the lead to whoever replaces it', () => {
    const led = gameReducer(locked(), { type: 'setLead', day: DAY, species: 'Scizor' });
    const state = gameReducer(led, { type: 'applyChange', day: DAY, week: WEEK, change: replace });
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

  it('saves the lesson step to resume, and finishing a lesson checks it once', () => {
    const at = (lesson: string, step: number) =>
      ({ type: 'lessonStep', format: 'gen3ou', lesson, step }) as const;
    const done = (lesson: string) => ({ type: 'lessonDone', format: 'gen3ou', lesson }) as const;
    let state = reducer(initialState(), at('gen3-basics', 2));
    expect(state.settings.tutorial?.gen3ou).toEqual({
      completed: [],
      current: { lesson: 'gen3-basics', step: 2 },
    });
    state = reducer(reducer(state, done('gen3-basics')), done('gen3-basics'));
    expect(state.settings.tutorial?.gen3ou).toEqual({ completed: ['gen3-basics'] });
    state = reducer(state, at('gen3-types', 1));
    expect(state.settings.tutorial?.gen3ou?.completed).toEqual(['gen3-basics']);
    expect(state.settings.tutorial?.gen4ou).toBeUndefined();
  });
});

describe('attempts', () => {
  const ENGINE = 'sim 0.10.11 ai 1';
  const attempt = (over: Partial<Attempt> = {}): Attempt => ({
    result: 'inProgress',
    remaining: 6,
    ts: 1,
    lead: 'Azelf',
    team: [TEAM[5]!, ...TEAM.slice(0, 5)],
    battleSeed: '1,2,3,4',
    aiSeed: '5,6,7,8',
    choices: [],
    engine: ENGINE,
    ...over,
  });
  const started = () =>
    gameReducer(locked(), { type: 'startAttempt', day: DAY, attempt: attempt() });

  it('records choices and the result of the battle in progress', () => {
    let state = started();
    expect(attemptInProgress(state.days[DAY])).toBeDefined();
    state = gameReducer(state, { type: 'recordChoice', day: DAY, choice: 'move 1' });
    state = gameReducer(state, { type: 'recordChoice', day: DAY, choice: 'switch 3' });
    state = gameReducer(state, { type: 'endAttempt', day: DAY, result: 'win', remaining: 2 });
    expect(state.days[DAY]!.attempts).toEqual([
      attempt({ choices: ['move 1', 'switch 3'], result: 'win', remaining: 2 }),
    ]);
    expect(attemptInProgress(state.days[DAY])).toBeUndefined();
    // Nothing to record into once it is over.
    expect(gameReducer(state, { type: 'recordChoice', day: DAY, choice: 'move 2' })).toBe(state);
    expect(gameReducer(state, { type: 'endAttempt', day: DAY, result: 'loss', remaining: 0 })).toBe(
      state,
    );
  });

  it('saves the coach’s memos in step with the choices', () => {
    let state = gameReducer(started(), { type: 'recordChoice', day: DAY, choice: 'move 1' });
    const memo = { ignored: 'Earthquake will do nothing.' };
    state = gameReducer(state, { type: 'recordChoice', day: DAY, choice: 'move 2', memo });
    state = gameReducer(state, { type: 'recordChoice', day: DAY, choice: 'move 3' });
    expect(state.days[DAY]!.attempts[0]!.coachLog).toEqual([null, memo, null]);
    // Without memos, no log.
    const plain = gameReducer(started(), { type: 'recordChoice', day: DAY, choice: 'move 1' });
    expect(plain.days[DAY]!.attempts[0]!.coachLog).toBeUndefined();
  });

  it('marks the battle in progress coached, for good', () => {
    let state = gameReducer(started(), { type: 'recordChoice', day: DAY, choice: 'move 1' });
    state = gameReducer(state, { type: 'coachAttempt', day: DAY });
    expect(state.days[DAY]!.attempts).toEqual([attempt({ choices: ['move 1'], coached: true })]);
    state = gameReducer(state, { type: 'endAttempt', day: DAY, result: 'win', remaining: 2 });
    expect(gameReducer(state, { type: 'coachAttempt', day: DAY })).toBe(state);
  });

  it('runs one attempt at a time; a finished one can be run back', () => {
    const state = started();
    expect(
      gameReducer(state, { type: 'startAttempt', day: DAY, attempt: attempt({ ts: 2 }) }),
    ).toBe(state);
    const over = gameReducer(state, { type: 'endAttempt', day: DAY, result: 'loss', remaining: 0 });
    const again = gameReducer(over, {
      type: 'startAttempt',
      day: DAY,
      attempt: attempt({ ts: 2 }),
    });
    expect(again.days[DAY]!.attempts.map((a) => a.result)).toEqual(['loss', 'inProgress']);
  });

  it('turns unfinished attempts from past days or another engine into forfeits', () => {
    const state = started();
    expect(gameReducer(state, { type: 'expireAttempts', today: DAY, engine: ENGINE })).toBe(state);
    const nextDay = gameReducer(state, {
      type: 'expireAttempts',
      today: '2026-10-22',
      engine: ENGINE,
    });
    expect(nextDay.days[DAY]!.attempts[0]!.result).toBe('forfeit');
    const upgraded = gameReducer(state, {
      type: 'expireAttempts',
      today: DAY,
      engine: 'sim 0.10.12 ai 1',
    });
    expect(upgraded.days[DAY]!.attempts[0]!.result).toBe('forfeit');
  });

  it('expires an Easy or Hard battle against its own engine string', () => {
    const hard = gameReducer(locked(), {
      type: 'startAttempt',
      day: DAY,
      attempt: attempt({ difficulty: 'hard', engine: attemptEngine(ENGINE, 'hard') }),
    });
    expect(gameReducer(hard, { type: 'expireAttempts', today: DAY, engine: ENGINE })).toBe(hard);
    // Saved under an older Hard (or as Normal's string): forfeited.
    const stale = gameReducer(locked(), {
      type: 'startAttempt',
      day: DAY,
      attempt: attempt({ difficulty: 'hard', engine: `${ENGINE} hard 0 e1` }),
    });
    const expired = gameReducer(stale, { type: 'expireAttempts', today: DAY, engine: ENGINE });
    expect(expired.days[DAY]!.attempts[0]!.result).toBe('forfeit');
  });

  it("saves Hard's AI choices, replacing any from where a batch starts", () => {
    let state = started();
    state = gameReducer(state, {
      type: 'recordChoice',
      day: DAY,
      choice: 'move 1',
      ai: { from: 0, choices: ['move 2', 'move 3'] },
    });
    state = gameReducer(state, {
      type: 'recordChoice',
      day: DAY,
      choice: 'move 1',
      ai: { from: 1, choices: ['switch 2'] },
    });
    state = gameReducer(state, { type: 'recordChoice', day: DAY, choice: 'move 4' });
    expect(state.days[DAY]!.attempts[0]).toMatchObject({
      choices: ['move 1', 'move 1', 'move 4'],
      aiChoices: ['move 2', 'switch 2'],
    });
  });

  it('frees the team only after a Normal loss', () => {
    const lose = (difficulty?: 'easy' | 'hard') => {
      const s = gameReducer(locked(), {
        type: 'startAttempt',
        day: DAY,
        attempt: attempt(difficulty ? { difficulty } : {}),
      });
      return gameReducer(s, { type: 'endAttempt', day: DAY, result: 'loss', remaining: 0 });
    };
    expect(dayLost(lose().days[DAY])).toBe(true);
    expect(dayLost(lose('hard').days[DAY])).toBe(false);
    expect(dayLost(lose('easy').days[DAY])).toBe(false);
  });

  it('locks the daily change mid-battle', () => {
    const change: DayChange = {
      kind: 'replace',
      slot: 1,
      from: TEAM[1]!,
      to: { species: 'Gyarados', setId: 'gyarados-offensive-dragon-dance' },
    };
    const state = started();
    expect(gameReducer(state, { type: 'applyChange', day: DAY, week: WEEK, change })).toBe(state);
    const over = gameReducer(state, { type: 'endAttempt', day: DAY, result: 'loss', remaining: 0 });
    // After a loss the streak is gone: changes are free and don't use up the daily one.
    const after = gameReducer(over, { type: 'applyChange', day: DAY, week: WEEK, change });
    expect(after.weeks[WEEK]!.team[1]).toEqual(change.to);
    expect(after.days[DAY]!.swapUsed).toBe(false);
  });
});

describe('after a first-try loss', () => {
  const lost = () => {
    const game = locked();
    const day = {
      swapUsed: false,
      attempts: [
        {
          result: 'loss' as const,
          remaining: 0,
          ts: 1,
          lead: 'Heatran',
          team: TEAM,
          battleSeed: '1',
          aiSeed: '2',
          choices: [],
          engine: '',
        },
      ],
    };
    return { ...game, days: { [DAY]: day } };
  };
  const swap = (slot: number, species: string, setId: string): DayChange => ({
    kind: 'replace',
    slot,
    from: TEAM[slot]!,
    to: { species, setId },
  });

  it('allows any number of swaps, and the swapped team stays for the week', () => {
    let state = gameReducer(lost(), {
      type: 'applyChange',
      day: DAY,
      week: WEEK,
      change: swap(1, 'Gyarados', 'gyarados-offensive-dragon-dance'),
    });
    state = gameReducer(state, {
      type: 'applyChange',
      day: DAY,
      week: WEEK,
      change: {
        kind: 'replace',
        slot: 2,
        from: TEAM[2]!,
        to: { species: 'Tyranitar', setId: 'tyranitar-utility' },
      },
    });
    expect(state.weeks[WEEK]!.team[1]!.species).toBe('Gyarados');
    expect(state.weeks[WEEK]!.team[2]!.species).toBe('Tyranitar');
    // Tomorrow starts from the swapped team.
    const tomorrow = gameReducer(state, { type: 'setLead', day: '2026-10-22', species: 'Heatran' });
    expect(tomorrow.weeks[WEEK]!.team[1]!.species).toBe('Gyarados');
  });

  it('ditching the team unlocks the week and ends a live streak', () => {
    const won = (ts: number) => ({
      result: 'win' as const,
      remaining: 3,
      ts,
      lead: 'Heatran',
      team: TEAM,
      battleSeed: '1',
      aiSeed: '2',
      choices: [],
      engine: '',
    });
    const game = {
      ...locked(),
      days: {
        '2026-10-20': { swapUsed: false, attempts: [won(1)] },
      },
    };
    expect(computeStats(game.days, DAY).streak).toBe(1);
    const ditched = gameReducer(game, { type: 'ditchTeam', week: WEEK, day: DAY });
    expect(ditched.weeks[WEEK]).toBeUndefined();
    expect(ditched.days[DAY]).toMatchObject({ ditched: true, swapUsed: false });
    expect(computeStats(ditched.days, DAY).streak).toBe(0);
    // A first-try win later the same day doesn't bring it back.
    const again = {
      ...ditched,
      days: { ...ditched.days, [DAY]: { ...ditched.days[DAY]!, attempts: [won(2)] } },
    };
    expect(computeStats(again.days, DAY).streak).toBe(0);
    // Tomorrow can start a new one.
    const tomorrow = { ...again.days, '2026-10-22': { swapUsed: false, attempts: [won(3)] } };
    expect(computeStats(tomorrow, '2026-10-22').streak).toBe(1);
  });

  it('cannot ditch mid-battle', () => {
    const state = gameReducer(lost(), {
      type: 'startAttempt',
      day: DAY,
      attempt: { ...lost().days[DAY]!.attempts[0]!, result: 'inProgress', ts: 2 },
    });
    expect(gameReducer(state, { type: 'ditchTeam', week: WEEK, day: DAY })).toBe(state);
  });
});

describe('practice runs', () => {
  const attempt = (ts: number, over: Partial<Attempt> = {}): Attempt => ({
    result: 'inProgress',
    remaining: 6,
    ts,
    lead: 'Heatran',
    team: TEAM,
    battleSeed: '1,2,3,4',
    aiSeed: '5,6,7,8',
    choices: [],
    engine: 'e',
    ...over,
  });
  const swap: DayChange = {
    kind: 'replace',
    slot: 1,
    from: TEAM[1]!,
    to: { species: 'Gyarados', setId: 'gyarados-offensive-dragon-dance' },
  };
  /** Plays a try to the end. */
  const play = (
    state: GameState,
    ts: number,
    result: 'win' | 'loss',
    over: Partial<Attempt> = {},
  ): GameState =>
    gameReducer(
      gameReducer(state, { type: 'startAttempt', day: DAY, attempt: attempt(ts, over) }),
      {
        type: 'endAttempt',
        day: DAY,
        result,
        remaining: result === 'win' ? 2 : 0,
      },
    );
  // A decided day is one that's been won: here, after a loss and a win.
  const decided = () => play(play(locked(), 1, 'loss'), 2, 'win');

  it('only offers practice changes once the day is won, and never the daily change', () => {
    const fresh = play(locked(), 1, 'loss');
    const practice = { type: 'setPracticeChange', day: DAY, week: WEEK, change: swap } as const;
    expect(gameReducer(fresh, practice)).toBe(fresh);
    const done = decided();
    expect(gameReducer(done, { type: 'applyChange', day: DAY, week: WEEK, change: swap })).toBe(
      done,
    );
    const changed = gameReducer(done, practice);
    expect(changed.days[DAY]!.practiceChange).toEqual(swap);
    expect(changed.weeks[WEEK]!.team).toEqual(TEAM); // the weekly team is untouched
    expect(changed.days[DAY]!.swapUsed).toBe(false);
    // Undo, and decide again.
    const undone = gameReducer(changed, { ...practice, change: null });
    expect(undone.days[DAY]!.practiceChange).toBeUndefined();
  });

  it('decides afresh for each run: starting one clears the practice change', () => {
    const changed = gameReducer(decided(), {
      type: 'setPracticeChange',
      day: DAY,
      week: WEEK,
      change: swap,
    });
    const lost = play(changed, 4, 'loss', { practiceChange: swap });
    expect(lost.days[DAY]!.practiceChange).toBeUndefined();
    expect(lost.weeks[WEEK]!.team).toEqual(TEAM); // a lost practice run changes nothing
  });

  it('keeps the change of a practice run that wins, from tomorrow on', () => {
    const won = play(decided(), 4, 'win', { practiceChange: swap });
    expect(won.weeks[WEEK]!.team[1]).toEqual(swap.to);
    const tomorrow = '2026-10-22';
    expect(
      gameReducer(won, { type: 'setLead', day: tomorrow, species: 'Gyarados' }).weeks[WEEK]!.team,
    ).toContainEqual(swap.to);
  });
});

describe('sound defaults', () => {
  it('starts on for a new player, a little quieter than half volume', () => {
    const { settings } = initialState();
    expect(settings.sound).toBe(true);
    expect(settings.musicVolume).toBeLessThan(0.5);
    expect(settings.effectsVolume).toBeLessThan(0.5);
  });

  it('keeps what a returning player saved', () => {
    const saved = {
      ...initialState(),
      settings: { ...initialState().settings, sound: false, musicVolume: 0.8 },
    };
    const { settings } = migrate(JSON.parse(JSON.stringify(saved)));
    expect(settings.sound).toBe(false);
    expect(settings.musicVolume).toBe(0.8);
  });
});
