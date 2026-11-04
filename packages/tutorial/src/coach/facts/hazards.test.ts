import { MASTER_DEFAULTS, NetPolicy } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import type { NetWorld } from '@daily-battle/engine-wasm';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { deriveSeed, makeRng } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../../battle';
import { hazardTargets } from './hazards';

describe.skipIf(!engineBuilt(3))('hazard facts', () => {
  const view = startPosition('gen3ou', {
    p1: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
    p2: [
      { species: 'Salamence', setId: 'salamence-dragon-dance' },
      { species: 'Tyranitar', setId: 'tyranitar-choice-band' },
    ],
    seed: 'hazards',
  }).view('p1')!;
  const world = new NetPolicy({
    engine: loadEngine(3),
    data: setsFor('gen3ou'),
    ...MASTER_DEFAULTS,
  }).prepare(view, makeRng(deriveSeed('hazards', 0)))!.worlds[0]!;
  // Tyranitar seen too.
  const both: NetWorld = {
    ...world,
    known: world.known.map((k, i) => (i === 1 ? { ...k, seen: true } : k)),
  };

  it('counts only the Pokémon you have seen', () => {
    expect(hazardTargets(world, 'stealthrock', 3)).toEqual([{ species: 'salamence', frac: 1 / 4 }]);
    expect(hazardTargets(both, 'stealthrock', 3)).toEqual([
      { species: 'salamence', frac: 1 / 4 },
      { species: 'tyranitar', frac: 1 / 8 },
    ]);
  });

  it('skips Flying types for Spikes, and stops at the maximum', () => {
    expect(hazardTargets(both, 'spikes', 3)).toEqual([{ species: 'tyranitar', frac: 1 / 8 }]);
    const sides = both.state.split('/');
    const foe = sides[1]!.split('=');
    const cond = foe[7]!.split(';');
    cond[12] = '3';
    foe[7] = cond.join(';');
    const full = { ...both, state: [sides[0], foe.join('='), ...sides.slice(2)].join('/') };
    expect(hazardTargets(full, 'spikes', 3)).toBeUndefined();
  });
});
