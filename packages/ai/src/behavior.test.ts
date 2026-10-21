import { sets } from '@daily-battle/data';
import { findSet, toPokemonSet } from '@daily-battle/gen';
import {
  deriveSeed,
  RandomPolicy,
  runBattle,
  type Policy,
  type SideView,
} from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { UtilityPolicy } from './policy';
import { PRESETS } from './presets';
import { scoreActions } from './score';
import { extractState } from './state';

/** A near-greedy AI so behavior tests aren't at the mercy of noise. */
const greedy = () =>
  new UtilityPolicy({ ...PRESETS.balance, temperature: 0.01, predictionRate: 0 });

const team = (...ids: string[]) =>
  ids.map((id) => {
    const species = Object.keys(sets.species).find((s) =>
      sets.species[s]!.sets.some((set) => set.id === id),
    );
    if (!species) throw new Error(`No set ${id}`);
    return toPokemonSet(species, findSet(sets, { species, setId: id }));
  });

const FILLER = [
  'tyranitar-choice-scarf',
  'jirachi-utility',
  'zapdos-physically-defensive',
  'latias-choice-specs',
];

/** The AI's (p2) first choice, over several seeds. */
function firstChoices(aiTeam: string[], foeTeam: string[], seeds = 5): string[] {
  const out: string[] = [];
  for (let s = 0; s < seeds; s++) {
    const ai = greedy();
    let first: string | undefined;
    const recorder: Policy = {
      choose(view, rng) {
        const c = ai.choose(view, rng);
        first ??= c;
        return c;
      },
    };
    runBattle({
      seed: deriveSeed('behavior', s),
      maxTurns: 1,
      p1: {
        team: team(...foeTeam),
        policy: new RandomPolicy(),
        seed: deriveSeed('behavior-p1', s),
      },
      p2: { team: team(...aiTeam), policy: recorder, seed: deriveSeed('behavior-p2', s) },
    });
    out.push(first!);
  }
  return out;
}

describe('AI behavior', () => {
  it('takes an available KO', () => {
    // Fire Blast (move 1) OHKOs Scizor.
    const choices = firstChoices(['heatran-choice-scarf'], ['scizor-choice-band', ...FILLER]);
    expect(choices.every((c) => c === 'move 1')).toBe(true);
  });

  it('prefers a super-effective attack over a resisted one', () => {
    // Thunderbolt (move 2) is 4x on Gyarados; Surf is resisted.
    const choices = firstChoices(
      ['starmie-offensive-rapid-spin'],
      ['gyarados-choice-band', ...FILLER],
    );
    expect(choices.every((c) => c === 'move 2')).toBe(true);
  });

  it('sets Stealth Rock on turn 1 when it is safe', () => {
    // Blissey can barely hurt Hippowdon; Stealth Rock is move 1.
    const choices = firstChoices(
      ['hippowdon-physically-defensive', ...FILLER],
      ['blissey-standard', ...FILLER],
    );
    expect(choices.every((c) => c === 'move 1')).toBe(true);
  });

  it('switches out of a hopeless matchup to a resist', () => {
    // Swampert's Earthquake OHKOs Magnezone; Gyarados (slot 2) is immune.
    const choices = firstChoices(
      ['magnezone-choice-scarf', 'gyarados-offensive-dragon-dance', 'heatran-utility'],
      ['swampert-physically-offensive-stealth-rock', ...FILLER],
    );
    expect(choices.every((c) => c === 'switch 2')).toBe(true);
  });

  it('recovers when low on HP against a passive foe', () => {
    let view: SideView | undefined;
    const capture: Policy = {
      choose(v, rng) {
        view ??= v;
        return new RandomPolicy().choose(v, rng);
      },
    };
    runBattle({
      seed: deriveSeed('recover', 0),
      maxTurns: 1,
      p1: {
        team: team('blissey-standard', ...FILLER),
        policy: new RandomPolicy(),
        seed: '1,1,1,1',
      },
      p2: { team: team('celebi-utility', ...FILLER), policy: capture, seed: '2,2,2,2' },
    });
    const state = extractState(view!);
    state.ownActive!.hpFrac = 0.35;
    const params = { ...PRESETS.balance, predictionRate: 0 };
    const actions = scoreActions(view!, state, params, () => 0.5, sets);
    const best = actions.reduce((a, b) => (b.score > a.score ? b : a));
    expect(best.move).toBe('recover');
  });
});
