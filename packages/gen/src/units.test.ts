import { sets } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { addDays, dayKey, mondayOf, weekDays, weekKey } from './dates';
import { rngFor, weightedSample } from './rng';
import { checksType, setTraits, stabTypes } from './traits';

describe('dates', () => {
  it('maps a local date to its day key', () => {
    expect(dayKey(new Date(2026, 9, 21, 23, 59))).toBe('2026-10-21');
    expect(dayKey(new Date(2026, 9, 21, 0, 0))).toBe('2026-10-21');
  });

  it('finds the Monday of a week, Sunday included', () => {
    expect(mondayOf('2026-10-19')).toBe('2026-10-19'); // Monday
    expect(mondayOf('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekKey(new Date(2026, 9, 25, 12))).toBe('2026-10-19');
  });

  it('rolls over months and years', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(mondayOf('2027-01-03')).toBe('2026-12-28');
    expect(weekDays('2026-12-28')).toEqual([
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
      '2027-01-03',
    ]);
  });

  it('crosses a DST change without shifting', () => {
    // US DST ends 2026-11-01; the week still has 7 distinct days.
    expect(new Set(weekDays('2026-10-26')).size).toBe(7);
    expect(weekDays('2026-10-26').at(-1)).toBe('2026-11-01');
  });

  it('rejects a non-Monday week key', () => {
    expect(() => weekDays('2026-10-21')).toThrow(/Monday/);
  });
});

describe('rng', () => {
  it('is deterministic per key and differs between keys', () => {
    const a = rngFor('k');
    const b = rngFor('k');
    const seq = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seq);
    expect(rngFor('k2')()).not.toBe(seq[0]);
    for (const x of seq) expect(x >= 0 && x < 1).toBe(true);
  });

  it('samples distinct items, favoring heavy weights', () => {
    const rng = rngFor('sample');
    let heavy = 0;
    for (let i = 0; i < 2000; i++) {
      const picked = weightedSample(['a', 'b', 'c'], (x) => (x === 'a' ? 8 : 1), 2, rng);
      expect(new Set(picked).size).toBe(2);
      if (picked[0] === 'a') heavy++;
    }
    expect(heavy / 2000).toBeGreaterThan(0.7);
  });
});

describe('traits', () => {
  it('detects hazards, removal, and categories', () => {
    const skarm = sets.species['Skarmory']!.sets[0]!;
    expect(setTraits(skarm)).toMatchObject({ spikes: true, remover: false });
    expect(setTraits(skarm).categories.has('defense')).toBe(true);
    const starmie = sets.species['Starmie']!.sets.find((s) => s.moves.includes('Rapid Spin'))!;
    expect(setTraits(starmie).remover).toBe(true);
  });

  it('counts resistances, type immunities, and immunity abilities', () => {
    const entry = (name: string) => sets.species[name]!;
    expect(checksType('Skarmory', entry('Skarmory'), 'Ground')).toBe(true); // Flying immunity
    expect(checksType('Heatran', entry('Heatran'), 'Fire')).toBe(true); // resist + Flash Fire
    expect(checksType('Gengar', entry('Gengar'), 'Ground')).toBe(true); // Levitate
    expect(checksType('Tyranitar', entry('Tyranitar'), 'Water')).toBe(false);
  });

  it('finds STAB attacking types only', () => {
    const scizor = sets.species['Scizor']!.sets.find((s) => s.moves.includes('Bullet Punch'))!;
    expect(stabTypes('Scizor', scizor)).toContain('Steel');
    expect(stabTypes('Scizor', scizor)).not.toContain('Fighting');
  });
});
