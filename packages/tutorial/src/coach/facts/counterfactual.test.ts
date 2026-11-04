import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASTER_DEFAULTS, NetPolicy } from '@daily-battle/ai';
import { MASTER_NET_PATH } from '@daily-battle/ai/version';
import { setsFor } from '@daily-battle/data';
import type { NetWorld } from '@daily-battle/engine-wasm';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { deriveSeed, makeRng } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../../battle';
import { faintWorld } from './counterfactual';

const NET = join(
  fileURLToPath(import.meta.url),
  '../../../../../../apps/web/public',
  MASTER_NET_PATH,
);

describe.skipIf(!engineBuilt(3))('counterfactual worlds', () => {
  const data = setsFor('gen3ou');
  const engine = loadEngine(3);
  engine.netLoad(new Uint8Array(readFileSync(NET)));
  const view = startPosition('gen3ou', {
    p1: [
      { species: 'Swampert', setId: 'swampert-standard-defensive' },
      { species: 'Skarmory', setId: 'skarmory-standard' },
    ],
    p2: [
      { species: 'Salamence', setId: 'salamence-dragon-dance' },
      { species: 'Tyranitar', setId: 'tyranitar-choice-band' },
    ],
    seed: 'counterfactual',
  }).view('p1')!;
  const world = new NetPolicy({ engine, data, ...MASTER_DEFAULTS }).prepare(
    view,
    makeRng(deriveSeed('counterfactual', 0)),
  )!.worlds[0]!;
  const all = world.legal.map(() => true);
  const search = (w: NetWorld) =>
    engine.netSearch(MASTER_DEFAULTS.search, [{ ...w, legal: all, must: all }])[0]!;
  const searched = (w: NetWorld) =>
    search(w).score.flatMap((s, slot) => (Number.isNaN(s) ? [] : [slot]));

  it('takes a benched Pokémon out of the battle', () => {
    const before = searched(world);
    expect(before).toContain(9);
    const out = faintWorld(world, 0, 1)!;
    expect(out).toMatchObject({ active: false, over: false });
    expect(searched(out.world)).toEqual(before.filter((s) => s !== 9));
    expect(faintWorld(out.world, 0, 1)).toBeUndefined();
  });

  it('leaves a side to replace a fainted active Pokémon', () => {
    const out = faintWorld(world, 0, 0)!;
    expect(out).toMatchObject({ active: true, over: false });
    expect(searched(out.world)).toEqual([9]);
  });

  it("shows the network a foe Pokémon it hasn't seen yet, gone", () => {
    expect(world.known[1]!.seen).toBe(false);
    const out = faintWorld(world, 1, 1)!;
    expect(out.world.known[1]!.seen).toBe(true);
    expect(search(out.world).value).toBeGreaterThan(search(world).value + 0.1);
    expect(faintWorld(world, 1, [0, 1])).toMatchObject({ over: true });
  });
});
