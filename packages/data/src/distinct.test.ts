import { describe, expect, it } from 'vitest';
import { jobOf, samePurpose } from './distinct';
import { sets } from './index';

const evs = (e: Partial<Record<'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe', number>>) => ({
  hp: 0,
  atk: 0,
  def: 0,
  spa: 0,
  spd: 0,
  spe: 0,
  ...e,
});

describe('distinct sets', () => {
  const np = {
    moves: ['Substitute', 'Nasty Plot', 'Shadow Ball', 'Hidden Power Fighting'],
    item: 'Leftovers',
    evs: evs({ spa: 252, spe: 252 }),
  };

  it('merges a one-move variant that does the same job', () => {
    const cm = {
      ...np,
      moves: ['Substitute', 'Calm Mind', 'Shadow Ball', 'Hidden Power Fighting'],
    };
    expect(samePurpose(np, cm)).toBe(true);
  });

  it('keeps sets apart when the item, setup, role moves, or EV spread change the job', () => {
    const scarf = {
      moves: ['Earthquake', 'Outrage', 'U-turn', 'Thunder Punch'],
      item: 'Choice Scarf',
      evs: evs({ atk: 252, spe: 252 }),
    };
    expect(samePurpose(scarf, { ...scarf, item: 'Choice Band' })).toBe(false);
    expect(
      samePurpose(scarf, { ...scarf, moves: ['Swords Dance', 'Earthquake', 'Outrage', 'U-turn'] }),
    ).toBe(false);
    const wall = {
      moves: ['Stealth Rock', 'Slack Off', 'Earthquake', 'Roar'],
      item: 'Leftovers',
      evs: evs({ hp: 252, def: 252 }),
    };
    expect(samePurpose(wall, { ...wall, evs: evs({ hp: 252, spd: 252 }) })).toBe(false);
    expect(jobOf(wall)).not.toBe(
      jobOf({ ...wall, moves: ['Curse', 'Slack Off', 'Earthquake', 'Roar'] }),
    );
  });

  it('ships no two sets of a species that do the same job', () => {
    for (const [name, entry] of Object.entries(sets.species)) {
      entry.sets.forEach((a, i) =>
        entry.sets.slice(i + 1).forEach((b) => {
          expect(samePurpose(a, b), `${name}: ${a.sourceName} / ${b.sourceName}`).toBe(false);
        }),
      );
    }
  });
});
