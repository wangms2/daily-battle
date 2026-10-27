import { describe, expect, it } from 'vitest';
import { computeStats } from '../lib/results';
import { mergeStates } from './merge';
import { initialState, type Attempt, type Slot, type State } from './schema';
import { migrate } from './storage';

const TEAM: Slot[] = [{ species: 'Swampert', setId: 'swampert-standard' }];
const win = (ts: number): Attempt => ({
  result: 'win',
  remaining: 3,
  ts,
  lead: 'Swampert',
  team: TEAM,
  battleSeed: `seed${ts}`,
  aiSeed: '1,2,3,4',
  choices: [],
  engine: 'e',
});

/** A save with first-try wins on the given days of Gen 3. */
function played(days: string[], settings: Partial<State['settings']> = {}): State {
  const s = initialState();
  s.games.gen3ou.weeks['2026-10-19'] = { team: TEAM, poolId: 'p' };
  for (const [i, day] of days.entries()) {
    s.games.gen3ou.days[day] = { swapUsed: false, attempts: [win(1000 + i)] };
  }
  s.settings = { ...s.settings, ...settings };
  return s;
}

describe('mergeStates', () => {
  it('keeps the days played on both devices, so the streak spans them', () => {
    const phone = played(['2026-10-19', '2026-10-20']);
    const laptop = played(['2026-10-21']);
    laptop.games.gen3ou.days['2026-10-21']!.attempts[0]!.ts = 5000;
    const merged = mergeStates(phone, laptop);
    expect(Object.keys(merged.games.gen3ou.days).sort()).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
    ]);
    expect(computeStats(merged.games.gen3ou.days, '2026-10-21', 'normal').streak).toBe(3);
  });

  it('keeps each try once, and a day played on both has every try', () => {
    const a = played(['2026-10-21']);
    const b = played(['2026-10-21']);
    b.games.gen3ou.days['2026-10-21']!.attempts.push({ ...win(9000), result: 'loss' });
    const merged = mergeStates(a, b);
    expect(merged.games.gen3ou.days['2026-10-21']!.attempts.map((t) => t.ts)).toEqual([1000, 9000]);
  });

  it('combines lessons finished and the trainer, keeping this device’s preferences', () => {
    const a = played([], {
      musicVolume: 0.1,
      name: 'Ash',
      tutorial: { gen3ou: { completed: ['l1'] } },
      typeTrainer: { gen3ou: { 'Fire>Grass': 1 } },
      shownExplainers: ['welcome'],
    });
    const b = played([], {
      musicVolume: 0.9,
      tutorial: { gen3ou: { completed: ['l1', 'l2'] } },
      typeTrainer: { gen3ou: { 'Fire>Grass': 3, 'Water>Fire': 2 } },
      shownExplainers: ['tour'],
    });
    const { settings } = mergeStates(a, b);
    expect(settings.musicVolume).toBe(0.1);
    expect(settings.name).toBe('Ash');
    expect(settings.tutorial?.gen3ou?.completed).toEqual(['l1', 'l2']);
    expect(settings.typeTrainer?.gen3ou).toEqual({ 'Fire>Grass': 3, 'Water>Fire': 2 });
    expect(settings.shownExplainers.sort()).toEqual(['tour', 'welcome']);
  });

  it('gives the same progress whichever device merges', () => {
    const a = played(['2026-10-19']);
    const b = played(['2026-10-20']);
    b.games.gen3ou.days['2026-10-20']!.attempts[0]!.ts = 7000;
    expect(mergeStates(a, b).games).toEqual(mergeStates(b, a).games);
  });
});

describe('existing players', () => {
  it('keep their streaks, team and settings when a save from before names loads', () => {
    // A save as players have it today: no name, no account.
    const before = played(['2026-10-19', '2026-10-20', '2026-10-21'], {
      battleSpeed: 'fast',
      coach: { gen3ou: true },
      difficulty: { gen3ou: 'hard' },
      tutorial: { gen3ou: { completed: ['l1'], current: { lesson: 'l2', step: 3 } } },
    });
    const loaded = migrate(JSON.parse(JSON.stringify(before)));
    expect(loaded).toEqual(before);
    // Merging with an empty account save (a fresh protect) changes nothing either.
    expect(mergeStates(loaded, initialState())).toEqual(before);
  });
});
