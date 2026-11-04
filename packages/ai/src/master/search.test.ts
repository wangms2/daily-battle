// The network search's coach outputs (engine net_search): `must` searches a
// held choice, and `replies` break each searched choice's score down by the
// foe's reply. Uses the shipped network (apps/web/public).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setsFor } from '@daily-battle/data';
import type { NetSearchParams, NetWorld } from '@daily-battle/engine-wasm';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { deriveSeed, makeRng, randomTeam, runBattle, type Policy } from '@daily-battle/sim-bridge';
import { describe, expect, it, vi } from 'vitest';
import { strongBot } from '../bots';
import { MASTER_NET_PATH } from '../version';
import { MASTER_DEFAULTS, NetPolicy } from './policy';

const NET = join(fileURLToPath(import.meta.url), '../../../../../apps/web/public', MASTER_NET_PATH);

describe.skipIf(!engineBuilt(4))('net search for the coach', () => {
  it('searches a held choice, and its replies add up to its score', () => {
    const data = setsFor('gen4ou');
    const engine = loadEngine(4);
    const search = vi.spyOn(engine, 'netSearch');
    const rng = makeRng(deriveSeed('net-search-test:teams', 0));
    runBattle({
      format: 'gen4ou',
      seed: deriveSeed('net-search-test:battle', 0),
      maxTurns: 12,
      p1: {
        team: randomTeam(rng, data),
        policy: strongBot({ data }),
        seed: deriveSeed('net-search-test:p1', 0),
      },
      p2: {
        team: randomTeam(rng, data),
        policy: new NetPolicy({
          engine,
          net: new Uint8Array(readFileSync(NET)),
          data,
          ...MASTER_DEFAULTS,
        }),
        seed: deriveSeed('net-search-test:p2', 0),
      },
    });
    const calls = search.mock.calls as [NetSearchParams, NetWorld[]][];
    expect(calls.length).toBeGreaterThan(3);
    search.mockRestore();

    let held = 0;
    for (const [params, worlds] of calls) {
      for (const [w, result] of engine.netSearch(params, worlds).entries()) {
        // With robust 0, a score is its win chance against each reply, by the reply's chance.
        const searched = result.score.flatMap((s, slot) => (Number.isNaN(s) ? [] : [slot]));
        expect(result.replies.reduce((t, r) => t + r.p, 0)).toBeCloseTo(1, 4);
        for (const slot of searched) {
          const mean = result.replies.reduce((t, r) => t + r.p * r.q[slot]!, 0);
          expect(mean).toBeCloseTo(result.score[slot]!, 4);
        }
        // A legal choice the prior left out is searched when held, and the
        // others' scores don't move.
        const left = worlds[w]!.legal.findIndex((ok, slot) => ok && !searched.includes(slot));
        if (left < 0) continue;
        const must = worlds[w]!.legal.map((_, slot) => slot === left);
        const [again] = engine.netSearch(params, [{ ...worlds[w]!, must }]);
        expect(again!.score[left]).not.toBeNaN();
        for (const slot of searched) expect(again!.score[slot]).toBeCloseTo(result.score[slot]!, 4);
        held++;
      }
    }
    expect(held).toBeGreaterThan(0);
  }, 120_000);
});

describe.skipIf(!engineBuilt(4))('Master a world at a time', () => {
  it('plays the same battle when worlds are searched elsewhere, out of order', () => {
    const data = setsFor('gen4ou');
    const net = new Uint8Array(readFileSync(NET));
    const play = (split: boolean) => {
      const master = new NetPolicy({ engine: loadEngine(4), net, data, ...MASTER_DEFAULTS });
      const helper = loadEngine(4);
      helper.netLoad(net);
      // As the web's helper workers do: two worlds given back out of order, one never.
      const policy: Policy = split
        ? {
            choose: (view, rng) => {
              const job = master.think(view, rng);
              const claims = [job.claim(), job.claim(), job.claim()];
              job.step();
              for (const claim of [claims[2], claims[0]])
                if (claim) claim.give(helper.netSearch(claim.net.params, [claim.net.world])[0]!);
              return job.result();
            },
          }
        : master;
      const rng = makeRng(deriveSeed('net-job-test:teams', 0));
      return runBattle({
        format: 'gen4ou',
        seed: deriveSeed('net-job-test:battle', 0),
        maxTurns: 15,
        p1: {
          team: randomTeam(rng, data),
          policy: strongBot({ data }),
          seed: deriveSeed('net-job-test:p1', 0),
        },
        p2: { team: randomTeam(rng, data), policy, seed: deriveSeed('net-job-test:p2', 0) },
      }).spectatorLog.filter((l) => !l.startsWith('|t:|'));
    };
    expect(play(true)).toEqual(play(false));
  }, 120_000);
});
