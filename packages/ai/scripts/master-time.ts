// Where a Master decision's time goes (Node, one thread): world prep vs the
// network search, by decision kind, and each world's search on its own.
//   pnpm --filter @daily-battle/ai exec tsx scripts/master-time.ts [--n 6]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import {
  addDays,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import type { NetWorld } from '@daily-battle/engine-wasm';
import { deriveSeed, runBattle, type Policy } from '@daily-battle/sim-bridge';
import type { PokemonSet } from '@pkmn/sim';
import { MASTER_DEFAULTS, NetPolicy, aiFor } from '../src/index';
import { MASTER_NET_PATH } from '../src/version';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const N = Number(arg('n') ?? 6);
const net = new Uint8Array(
  readFileSync(
    fileURLToPath(new URL(`../../../apps/web/public${MASTER_NET_PATH}`, import.meta.url)),
  ),
);

interface Row {
  kind: string;
  ms: number;
  search: number;
  legal: number;
  positions: number;
  worldMax: number;
  worldSum: number;
}
const rows: Row[] = [];
let mismatches = 0;

for (const format of Object.keys(FORMATS)) {
  const gen = FORMATS[format as keyof typeof FORMATS].gen;
  let engine;
  try {
    engine = loadEngine(gen);
  } catch {
    continue;
  }
  const sets = setsFor(format);
  // A second engine times each world alone, without touching the policy's.
  const solo = loadEngine(gen);
  solo.netLoad(net);
  let cur: { search: number; positions: number; worldMax: number; worldSum: number } | undefined;
  const real = engine.netSearch.bind(engine);
  engine.netSearch = (params, worlds: NetWorld[]) => {
    const t0 = performance.now();
    const r = real(params, worlds);
    cur!.search += performance.now() - t0;
    cur!.positions += r.reduce((a, x) => a + x.positions, 0);
    worlds.forEach((w, k) => {
      const t1 = performance.now();
      const one = solo.netSearch(params, [w])[0]!;
      if (JSON.stringify(one.score) !== JSON.stringify(r[k]!.score)) mismatches++;
      const dt = performance.now() - t1;
      cur!.worldMax = Math.max(cur!.worldMax, dt);
      cur!.worldSum += dt;
    });
    return r;
  };
  for (let i = 0; i < N; i++) {
    const week = addDays('2026-03-02', 7 * i);
    const pool = generatePool(week, sets).species;
    const rng = rngFor(`time:${format}:${i}`);
    const left = [...pool];
    const mine: PokemonSet[] = [];
    for (let k = 0; k < 6; k++) {
      const name = left.splice(Math.floor(rng() * left.length), 1)[0]!;
      mine.push(toPokemonSet(name, sets.species[name]!.sets[0]!));
    }
    const daily = teamSets(sets, generateOpponent(addDays(week, 2), sets).team);
    const master = new NetPolicy({ engine, net, data: sets, pool, ...MASTER_DEFAULTS });
    const timed: Policy = {
      choose(view, r) {
        cur = { search: 0, positions: 0, worldMax: 0, worldSum: 0 };
        const t0 = performance.now();
        const c = master.choose(view, r);
        const ms = performance.now() - t0 - cur.worldSum;
        const req = view.request;
        const kind =
          req.requestType === 'move'
            ? 'move'
            : req.requestType === 'switch'
              ? 'switch'
              : req.requestType;
        const legal =
          'side' in req
            ? req.requestType === 'move'
              ? (req.active?.[0]?.moves.length ?? 0)
              : 0
            : 0;
        rows.push({ kind, ms, legal, ...cur });
        return c;
      },
    };
    runBattle({
      format,
      seed: deriveSeed(`time:${format}`, i),
      p1: {
        team: mine,
        policy: aiFor({ difficulty: 'normal', style: 'balance', data: sets }),
        seed: deriveSeed('time:p1', i),
      },
      p2: { team: daily, policy: timed, seed: deriveSeed('time:p2', i) },
    });
  }
  console.error(`${format}: ${rows.length} decisions so far`);
}

const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? NaN;
};
const r = (x: number) => Math.round(x);
for (const kind of [...new Set(rows.map((x) => x.kind))]) {
  const rs = rows.filter((x) => x.kind === kind);
  const col = (f: (x: Row) => number) =>
    `${r(q(rs.map(f), 0.5))}/${r(q(rs.map(f), 0.9))}/${r(Math.max(...rs.map(f)))}`;
  console.log(
    `${kind.padEnd(7)} n=${rs.length}  total ${col((x) => x.ms)}  search ${col((x) => x.search)}  ` +
      `prep ${col((x) => x.ms - x.search)}  worst world ${col((x) => x.worldMax)}  positions ${col((x) => x.positions)}  (median/p90/max ms)`,
  );
}

const sum = (f: (x: Row) => number) => rows.reduce((a, x) => a + f(x), 0);
console.log(
  `batched search total ${r(sum((x) => x.search))} ms vs world by world ${r(sum((x) => x.worldSum))} ms; worlds whose scores differ: ${mismatches}`,
);
