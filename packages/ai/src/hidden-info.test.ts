// The AI must not use information it hasn't seen (DESIGN.md §8.4, §13 M4).
// Two battles that differ only in the foe's hidden sets must get identical AI
// choices until the AI's own log shows a difference.
import { sets } from '@daily-battle/data';
import { toPokemonSet } from '@daily-battle/gen';
import {
  deriveSeed,
  makeRng,
  RandomPolicy,
  randomTeam,
  runBattle,
  type Policy,
} from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { midBot } from './bots';

type PokemonSet = ReturnType<typeof toPokemonSet>;

/** The same species with a different set wherever the species has one. */
function resetTeam(team: PokemonSet[]): PokemonSet[] {
  return team.map((p) => {
    const options = sets.species[p.species]!.sets;
    const other = options.find((s) => s.item !== p.item || s.moves.join() !== p.moves.join());
    return other ? toPokemonSet(p.species, other) : p;
  });
}

interface Decision {
  log: string;
  choice: string;
}

function record(aiTeam: PokemonSet[], foeTeam: PokemonSet[], i: number): Decision[] {
  const ai = midBot();
  const decisions: Decision[] = [];
  const recorder: Policy = {
    choose(view, rng) {
      const choice = ai.choose(view, rng);
      decisions.push({
        log: view.log.filter((l) => !l.startsWith('|t:|')).join('\n'),
        choice,
      });
      return choice;
    },
  };
  runBattle({
    seed: deriveSeed('ai-hidden:battle', i),
    maxTurns: 40,
    p1: { team: foeTeam, policy: new RandomPolicy(), seed: deriveSeed('ai-hidden:p1', i) },
    p2: { team: aiTeam, policy: recorder, seed: deriveSeed('ai-hidden:p2', i) },
  });
  return decisions;
}

describe('AI hidden information', () => {
  it('chooses identically until the foe reveals something different', () => {
    let compared = 0;
    for (let i = 0; i < 20; i++) {
      const rng = makeRng(deriveSeed('ai-hidden:teams', i));
      const aiTeam = randomTeam(rng);
      const foeTeam = randomTeam(rng);
      const a = record(aiTeam, foeTeam, i);
      const b = record(aiTeam, resetTeam(foeTeam), i);
      for (let k = 0; k < Math.min(a.length, b.length); k++) {
        if (a[k]!.log !== b[k]!.log) break;
        expect(b[k]!.choice, `battle ${i}, decision ${k}`).toBe(a[k]!.choice);
        compared++;
      }
    }
    // Every battle compares at least its first decision.
    expect(compared).toBeGreaterThanOrEqual(20);
  }, 60_000);
});
