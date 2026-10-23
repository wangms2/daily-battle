import { sets, setsFor } from '@daily-battle/data';
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

describe('AI behavior with Team Preview (Gen 5)', () => {
  const data = setsFor('gen5ou');
  const team5 = (...ids: string[]) =>
    ids.map((id) => {
      const species = Object.keys(data.species).find((s) =>
        data.species[s]!.sets.some((set) => set.id === id),
      );
      if (!species) throw new Error(`No set ${id}`);
      return toPokemonSet(species, findSet(data, { species, setId: id }));
    });
  /** Leads with the first Pokémon, then moves at random. */
  const leadFirst: Policy = {
    choose: (view, rng) =>
      view.request.requestType === 'team' ? 'default' : new RandomPolicy().choose(view, rng),
  };
  const FILLER5 = [
    'latios-choice-scarf',
    'tentacruel-utility',
    'blissey-special-wall',
    'politoed-defensive',
    'chansey-support',
  ];

  it('leads with the Pokémon that matches up best against the foe six', () => {
    // Against six Steel-types, Heatran (slot 6) walls them and hits them super effectively.
    const steels = team5(
      'ferrothorn-standard',
      'scizor-choice-band',
      'skarmory-defensive',
      'forretress-entry-hazard-control',
      'jirachi-utility',
      'magnezone-choice-scarf',
    );
    for (let s = 0; s < 5; s++) {
      const ai = new UtilityPolicy(
        { ...PRESETS.balance, temperature: 0.01, predictionRate: 0 },
        { data },
      );
      const result = runBattle({
        format: 'gen5ou',
        seed: deriveSeed('lead', s),
        maxTurns: 1,
        p1: { team: steels, policy: leadFirst, seed: deriveSeed('lead-p1', s) },
        p2: {
          team: team5(...FILLER5, 'heatran-offensive'),
          policy: ai,
          seed: deriveSeed('lead-p2', s),
        },
      });
      expect(result.choices.p2[0]).toBe('team 612345');
    }
  });

  it('does not set Stealth Rock into Magic Bounce', () => {
    const srScore = (foeLead: string) => {
      // Scored at the AI's first move decision: the view is live and keeps changing.
      let score: number | undefined;
      const params = { ...PRESETS.balance, predictionRate: 0 };
      const capture: Policy = {
        choose(v, rng) {
          if (v.request.requestType === 'move' && score === undefined) {
            const state = extractState(v, data);
            score = scoreActions(v, state, params, () => 0.5, data).find(
              (a) => a.move === 'stealthrock',
            )!.score;
          }
          return leadFirst.choose(v, rng);
        },
      };
      runBattle({
        format: 'gen5ou',
        seed: deriveSeed('bounce', 0),
        maxTurns: 1,
        p1: { team: team5(foeLead, ...FILLER5), policy: leadFirst, seed: '1,1,1,1' },
        p2: {
          team: team5('hippowdon-physically-defensive', ...FILLER5),
          policy: capture,
          seed: '2,2,2,2',
        },
      });
      return score!;
    };
    // Espeon's sets all have Magic Bounce; Latias's don't.
    expect(srScore('espeon-expert-belt')).toBeLessThan(0);
    expect(srScore('latias-choice-scarf')).toBeGreaterThan(0);
  });
});
