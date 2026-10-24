import { setsFor } from '@daily-battle/data';
import { findSet, toPokemonSet } from '@daily-battle/gen';
import { deriveSeed, RandomPolicy, runBattle, type Policy } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { candidates } from './belief';
import { UtilityPolicy } from './policy';
import { PRESETS } from './presets';
import type { FoeMon } from './state';

const data = setsFor('gen6ou');

const team = (...ids: string[]) =>
  ids.map((id) => {
    const species = Object.keys(data.species).find((s) =>
      data.species[s]!.sets.some((set) => set.id === id),
    );
    if (!species) throw new Error(`No set ${id}`);
    return toPokemonSet(species, findSet(data, { species, setId: id }));
  });

const foe = (species: string, extra: Partial<FoeMon> = {}): FoeMon => ({
  species,
  forme: species,
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

const FILLER = [
  'garchomp-choice-scarf',
  'ferrothorn-utility',
  'heatran-specially-defensive',
  'rotomwash-physically-defensive-pivot',
  'clefable-calm-mind',
];

/** The AI's (p2) first move choice after Team Preview, over several seeds. */
function firstMoves(aiTeam: string[], foeTeam: string[], seeds = 5): string[] {
  const out: string[] = [];
  for (let s = 0; s < seeds; s++) {
    const ai = new UtilityPolicy(
      { ...PRESETS.balance, temperature: 0.01, predictionRate: 0 },
      { data },
    );
    let first: string | undefined;
    const recorder: Policy = {
      choose(view, rng) {
        const c = ai.choose(view, rng);
        if (view.request.requestType === 'move') first ??= c;
        return c;
      },
    };
    runBattle({
      format: 'gen6ou',
      seed: deriveSeed('gen6-behavior', s),
      maxTurns: 1,
      p1: {
        team: team(...foeTeam),
        policy: new RandomPolicy(),
        seed: deriveSeed('gen6-behavior-p1', s),
      },
      p2: { team: team(...aiTeam), policy: recorder, seed: deriveSeed('gen6-behavior-p2', s) },
    });
    out.push(first!);
  }
  return out;
}

describe('Gen 6 AI', () => {
  it('Mega Evolves when it can', () => {
    const choices = firstMoves(['charizard-wallbreaker'], ['garchomp-tank-chomp', ...FILLER]);
    expect(choices.every((c) => c.endsWith(' mega'))).toBe(true);
  });

  it("narrows a foe's sets to its stone once it Mega Evolves", () => {
    const sets = candidates(
      foe('Charizard', { forme: 'Charizard-Mega-Y', item: 'charizarditey' }),
      data,
    );
    expect(sets.map((c) => c.set.item)).toEqual(['Charizardite Y']);
    const x = candidates(foe('Charizard', { forme: 'Charizard-Mega-X' }), data);
    expect(new Set(x.map((c) => c.set.item))).toEqual(new Set(['Charizardite X']));
  });

  it('drops stone sets once a teammate has Mega Evolved', () => {
    const all = candidates(foe('Latias'), data);
    expect(all.some((c) => c.set.item === 'Latiasite')).toBe(true);
    const after = candidates(foe('Latias'), data, undefined, true);
    expect(after.some((c) => c.set.item === 'Latiasite')).toBe(false);
    expect(after.reduce((a, c) => a + c.weight, 0)).toBeCloseTo(1, 6);
  });
});
