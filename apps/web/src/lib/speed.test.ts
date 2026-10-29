import { describe, expect, it } from 'vitest';
import {
  battleSpeed,
  foeSpeed,
  lessonSet,
  showdownRange,
  speedStat,
  speedVerdict,
  theoreticalRange,
  showdownNote,
  showdownNow,
} from './speed';

const set = (spe: number, nature = 'Serious', item = '', ability = '') => ({
  nature,
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe },
  ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  item,
  ability,
});

describe('Speed', () => {
  it('computes level 100 stats with EVs and nature', () => {
    // Lesson Pokémon: neutral nature, 85 EVs.
    expect(speedStat(85, 85)).toBe(227); // Heracross
    expect(speedStat(100, 85)).toBe(257); // Zapdos
    expect(speedStat(130, 252, 31, 'Timid')).toBe(394); // Jolteon, max
    // As Showdown shows Zapdos: 0 IVs and a slowing nature at the bottom.
    expect(showdownRange(100)).toEqual([184, 236, 299, 328]);
    expect(theoreticalRange(100)).toEqual([184, 328]);
  });

  it('applies boosts, paralysis and the weather abilities as the coach does', () => {
    expect(battleSpeed(200, { boost: 1 })).toBe(300);
    expect(battleSpeed(200, { boost: -1 })).toBe(133);
    expect(battleSpeed(200, { status: 'par' })).toBe(50);
    expect(battleSpeed(200, { status: 'par', ability: 'Quick Feet' })).toBe(300);
    expect(battleSpeed(200, { ability: 'Swift Swim', weather: 'RainDance' })).toBe(400);
    expect(battleSpeed(200, { ability: 'Swift Swim' })).toBe(200);
  });

  it('applies the foe’s visible Speed stage and paralysis to Showdown’s line', () => {
    // Tyranitar after a Dragon Dance.
    const dd = showdownNow(61, 1);
    expect(dd.showdown).toEqual([171, 237, 331, 364]);
    expect(showdownNote(dd.shown)).toBe('with its +1 Speed, before items and abilities');
    const par = showdownNow(61, -1, 'par');
    expect(par.showdown).toEqual([19, 26, 36, 40]);
    expect(showdownNote(par.shown)).toBe(
      'with its -1 Speed and paralysis, before items and abilities',
    );
    expect(showdownNow(61).showdown).toEqual([114, 158, 221, 243]);
    expect(showdownNote(showdownNow(61, 0, 'brn').shown)).toBe(
      'before boosts, items and abilities',
    );
  });

  it('ranges over the sets the foe could be running', () => {
    expect(foeSpeed('Zapdos', [set(0), set(252, 'Timid')], {})).toEqual({ lo: 236, hi: 328 });
    // A lesson foe: one known set, one number.
    expect(
      foeSpeed('Zapdos', [lessonSet({ species: 'Zapdos', moves: ['Thunderbolt'] })], {}),
    ).toEqual({ lo: 257, hi: 257 });
    // No set data: the theoretical range.
    expect(foeSpeed('Zapdos', [], {})).toEqual({ lo: 184, hi: 328 });
  });

  it('keeps a possible Choice Scarf apart, and uses it once it is all that fits', () => {
    const plain = set(252, 'Jolly');
    const scarf = set(252, 'Jolly', 'Choice Scarf');
    expect(foeSpeed('Tyranitar', [plain, scarf], {})).toEqual({ lo: 243, hi: 243, scarf: 364 });
    expect(foeSpeed('Tyranitar', [scarf], {})).toEqual({ lo: 364, hi: 364 });
  });

  it('says faster, slower, a tie, or either', () => {
    const mine = { species: 'Heracross', speed: 227 };
    expect(speedVerdict({ lo: 257, hi: 257, mine })).toBe('faster');
    expect(speedVerdict({ lo: 100, hi: 200, mine })).toBe('slower');
    expect(speedVerdict({ lo: 227, hi: 227, mine })).toBe('tie');
    expect(speedVerdict({ lo: 200, hi: 300, mine })).toBe('either');
    expect(speedVerdict({ lo: 200, hi: 300 })).toBeUndefined();
  });
});
