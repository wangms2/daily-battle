import { sets } from '@daily-battle/data';
import { deriveSeed, makeRng, randomTeam, runBattle } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { candidates } from './belief';
import { midBot } from './bots';
import { hit, makeField, makeMon } from './calc';
import { sample, softmax } from './choose';
import type { FoeMon } from './state';

const foe = (species: string, extra: Partial<FoeMon> = {}): FoeMon => ({
  species,
  active: true,
  fainted: false,
  hpFrac: 1,
  status: '',
  boosts: {},
  substitute: false,
  moves: [],
  item: '',
  ability: '',
  ...extra,
});

describe('belief', () => {
  it('starts from the usage-weighted sets', () => {
    const cands = candidates(foe('Scizor'));
    expect(cands.map((c) => c.set.id).sort()).toEqual(
      sets.species['Scizor']!.sets.map((s) => s.id).sort(),
    );
    expect(cands.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1);
  });

  it('drops sets that contradict a revealed item or move', () => {
    const band = candidates(foe('Scizor', { item: 'choiceband' }));
    expect(band.map((c) => c.set.item)).toEqual(['Choice Band']);
    const roost = candidates(foe('Scizor', { moves: ['roost'] }));
    expect(roost.every((c) => c.set.moves.includes('Roost'))).toBe(true);
    expect(roost.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1);
  });

  it('falls back to a synthetic set instead of an empty belief', () => {
    const odd = candidates(foe('Scizor', { moves: ['splash'] }));
    expect(odd).toHaveLength(1);
    expect(odd[0]!.set.moves).toContain('splash');
  });

  it('uses known sets in informed mode', () => {
    const set = sets.species['Scizor']!.sets.at(-1)!;
    expect(candidates(foe('Scizor'), sets, { Scizor: set })).toEqual([{ set, weight: 1 }]);
  });
});

describe('calc wrapper', () => {
  const conds = { sr: false, spikes: 0, tspikes: 0, reflect: false, lightScreen: false };
  const mon = (species: string, setIndex = 0, hpFrac = 1) => {
    const s = sets.species[species]!.sets[setIndex]!;
    return makeMon({ species, ...s, boosts: {}, status: '', hpFrac });
  };

  it('knows Fire Blast OHKOs Scizor', () => {
    const h = hit(mon('Heatran'), mon('Scizor'), 'Fire Blast', makeField('', conds, conds));
    expect(h).toEqual({ frac: 1, ko: 1 });
  });

  it('respects immunities and caps damage at current HP', () => {
    const field = makeField('', conds, conds);
    expect(hit(mon('Swampert'), mon('Gyarados'), 'Earthquake', field).frac).toBe(0);
    expect(hit(mon('Heatran'), mon('Scizor', 0, 0.2), 'Fire Blast', field).frac).toBeCloseTo(
      0.2,
      1,
    );
  });
});

describe('softmax', () => {
  it('is near-argmax when cold and near-uniform when hot', () => {
    expect(softmax([1, 0.5, 0], 0.01)[0]).toBeGreaterThan(0.999);
    const hot = softmax([1, 0.5, 0], 1000);
    for (const p of hot) expect(p).toBeCloseTo(1 / 3, 2);
  });

  it('samples in proportion', () => {
    const rng = makeRng('3,1,4,1');
    let first = 0;
    for (let i = 0; i < 2000; i++) if (sample([0.8, 0.2], rng) === 0) first++;
    expect(first / 2000).toBeGreaterThan(0.75);
    expect(first / 2000).toBeLessThan(0.85);
  });
});

describe('determinism', () => {
  it('makes the same choices for the same seeds', () => {
    const play = () => {
      const rng = makeRng(deriveSeed('ai-det', 0));
      return runBattle({
        seed: deriveSeed('ai-det:battle', 0),
        p1: { team: randomTeam(rng), policy: midBot(), seed: deriveSeed('ai-det:p1', 0) },
        p2: { team: randomTeam(rng), policy: midBot(), seed: deriveSeed('ai-det:p2', 0) },
      }).choices;
    };
    expect(play()).toEqual(play());
  });
});
