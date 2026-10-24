import { Dex } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import { jobOf, samePurpose } from './distinct';
import { FORMATS } from './formats';
import { setsFor } from './index';

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

  it('never merges sets that Mega Evolve into different forms', () => {
    const dd = {
      moves: ['Dragon Dance', 'Flare Blitz', 'Dragon Claw', 'Roost'],
      item: 'Charizardite X',
      evs: evs({ atk: 252, spe: 252 }),
    };
    expect(samePurpose(dd, { ...dd, item: 'Charizardite Y' })).toBe(false);
  });

  it('merges a one-move variant that does the same job', () => {
    const cm = {
      ...np,
      moves: ['Substitute', 'Calm Mind', 'Shadow Ball', 'Hidden Power Fighting'],
    };
    expect(samePurpose(np, cm)).toBe(true);
  });

  it('merges sets that only shuffle EVs a little (Rhyperior Substitute vs Physical Attacker)', () => {
    const sub = {
      moves: ['Substitute', 'Earthquake', 'Stone Edge', 'Ice Punch'],
      item: 'Leftovers',
      evs: evs({ hp: 136, atk: 208, spe: 164 }),
    };
    const physical = {
      moves: ['Earthquake', 'Stone Edge', 'Megahorn', 'Substitute'],
      item: 'Leftovers',
      evs: evs({ hp: 140, atk: 252, def: 32, spe: 84 }),
    };
    expect(samePurpose(sub, physical)).toBe(true);
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

  it.each(Object.keys(FORMATS))('offers every %s species 2 to 4 sets (1 with a Mega)', (format) => {
    for (const [name, entry] of Object.entries(setsFor(format).species)) {
      // A species with a Mega set keeps only its viable sets (Mega Lopunny alone).
      const mega = entry.sets.some((s) => Dex.items.get(s.item).megaStone);
      expect(entry.sets.length, name).toBeGreaterThanOrEqual(mega ? 1 : 2);
      expect(entry.sets.length, name).toBeLessThanOrEqual(4);
    }
  });

  it.each(Object.keys(FORMATS))(
    'ships no two %s sets of a species that do the same job',
    (format) => {
      for (const [name, entry] of Object.entries(setsFor(format).species)) {
        entry.sets.forEach((a, i) =>
          entry.sets.slice(i + 1).forEach((b) => {
            expect(samePurpose(a, b), `${name}: ${a.sourceName} / ${b.sourceName}`).toBe(false);
          }),
        );
      }
    },
  );
});
