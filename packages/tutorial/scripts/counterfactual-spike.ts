// Spike: counterfactual worlds by editing the state string. Faints each living
// Pokémon in turn (an active one leaves its side to choose a replacement) and
// checks the network's searched value moves the right way: down when it's ours,
// up when it's the foe's.
//   pnpm exec tsx scripts/counterfactual-spike.ts --set <dir> --net <file.dbnet> [--limit N]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MASTER_DEFAULTS, type NetRecord } from '@daily-battle/ai';
import { FORMATS } from '@daily-battle/data';
import type { Engine, NetWorld } from '@daily-battle/engine-wasm';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { faintWorld } from '../src/coach/facts/counterfactual';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SET = arg('set');
const NET = arg('net');
if (!SET || !NET) throw new Error('usage: --set <dir> --net <file.dbnet>');
const LIMIT = Number(arg('limit') ?? 200);

const records: (NetRecord & { format: string })[] = [];
for (const f of readdirSync(SET).filter((f) => f.endsWith('.jsonl')))
  for (const line of readFileSync(join(SET, f), 'utf8').split('\n'))
    if (line.trim()) records.push(JSON.parse(line) as NetRecord & { format: string });
const step = Math.max(1, Math.floor(records.length / LIMIT));
const picked = records.filter((_, i) => i % step === 0).slice(0, LIMIT);

const net = new Uint8Array(readFileSync(NET));
const engines = new Map<number, Engine>();
const engineFor = (format: string) => {
  const gen = FORMATS[format as keyof typeof FORMATS].gen;
  let e = engines.get(gen);
  if (!e) {
    engines.set(gen, (e = loadEngine(gen)));
    e.netLoad(net);
  }
  return e;
};

const best = (engine: Engine, w: NetWorld) => {
  const [r] = engine.netSearch(MASTER_DEFAULTS.search, [{ ...w, legal: w.legal.map(() => true) }]);
  return Math.max(...r!.score.filter((s) => !Number.isNaN(s)), r!.value);
};

type Key = 'own active' | 'own bench' | 'foe active' | 'foe bench';
const stats = new Map<Key, { n: number; right: number; sum: number; over: number }>();
let ms = 0;
let searches = 0;
let failed = 0;
for (const rec of picked) {
  const engine = engineFor(rec.format);
  const world = rec.worlds[0]!;
  let base: number;
  try {
    base = best(engine, world);
  } catch {
    failed++;
    continue;
  }
  for (const side of [0, 1] as const)
    for (let slot = 0; slot < 6; slot++) {
      const edit = faintWorld(world, side, slot);
      if (!edit) continue;
      const t = performance.now();
      let v: number;
      try {
        v = edit.over ? side : best(engine, edit.world);
      } catch {
        failed++;
        continue;
      }
      ms += performance.now() - t;
      searches++;
      const key = `${side ? 'foe' : 'own'} ${edit.active ? 'active' : 'bench'}` as Key;
      const s = stats.get(key) ?? { n: 0, right: 0, sum: 0, over: 0 };
      const d = v - base;
      s.n++;
      s.sum += d;
      if (side ? d > 0 : d < 0) s.right++;
      if (v === 0 || v === 1) s.over++;
      stats.set(key, s);
    }
}
console.log(`${picked.length} decisions, ${searches} counterfactuals, ${failed} failed`);
console.log(`${(ms / Math.max(1, searches)).toFixed(1)} ms per counterfactual search`);
for (const [k, s] of [...stats].sort())
  console.log(
    `${k.padEnd(11)} n=${String(s.n).padStart(4)}  right way ${((100 * s.right) / s.n).toFixed(1)}%  mean change ${(s.sum / s.n).toFixed(3)}  battle over ${s.over}`,
  );
