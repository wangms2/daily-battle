// The advanced coach's detectors, offline: on recorded decisions graded by an
// oracle (strength-gate --a-record: poke-engine held to each choice on the
// true state), runs the coach's light check (with chance outcomes) and each
// detector, then reports how often each tip fires and how often the oracle
// backs it (agrees: the advice is ahead; contradicts: another choice is ahead
// by more than 0.05). Writes every tip, with its position, to --out (JSONL).
//   pnpm exec tsx scripts/advanced-scan.ts --set <dir> --net <file.dbnet> [--jobs 8] [--limit N] [--out tips.jsonl]
//     [--risk drop=0.2,worlds=0.75]
import { fork } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASTER_DEFAULTS, pickSearched, type NetRecord } from '@daily-battle/ai';
import { FORMATS } from '@daily-battle/data';
import type { Engine, NetSearchResult } from '@daily-battle/engine-wasm';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { Dex } from '@pkmn/sim';
import { riskTip, type RiskOptions, type RiskTip } from '../src/coach/advanced/risk';
import type { BranchWorld } from '../src/coach/facts/branches';
import { NET_JUDGE_DEFAULTS } from '../src/coach/net-judge';

interface Position extends NetRecord {
  format: string;
  i: number;
  swap: boolean;
  turn: number;
  oracle: Record<string, number>;
}
type Tip = { concept: 'risk'; kind: 'miss' } & RiskTip;
interface Found {
  k: number;
  top?: string;
  tips: Tip[];
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SET = arg('set');
const NET = arg('net');
if (!SET || !NET) throw new Error('usage: --set <dir> --net <file.dbnet>');
const JOBS = Number(arg('jobs') ?? 8);
const LIMIT = Number(arg('limit') ?? Infinity);
const OUT = arg('out');
const WORLDS = NET_JUDGE_DEFAULTS.worlds;
const RISK = Object.fromEntries(
  (arg('risk') ?? '')
    .split(',')
    .filter(Boolean)
    .map((kv) => [kv.split('=')[0]!, Number(kv.split('=')[1])]),
) as Partial<RiskOptions>;

function load(): Position[] {
  const out: Position[] = [];
  for (const f of readdirSync(SET!)
    .filter((f) => f.endsWith('.jsonl'))
    .sort())
    for (const line of readFileSync(join(SET!, f), 'utf8').split('\n'))
      if (line.trim()) out.push(JSON.parse(line) as Position);
  out.sort((a, b) =>
    `${a.format}:${a.i}:${a.swap}:${a.turn}`.localeCompare(
      `${b.format}:${b.i}:${b.swap}:${b.turn}`,
    ),
  );
  return out.slice(0, LIMIT);
}

const engines = new Map<number, Engine>();
const net = new Uint8Array(readFileSync(NET));
function engineFor(format: string): Engine {
  const gen = FORMATS[format as keyof typeof FORMATS].gen;
  let e = engines.get(gen);
  if (!e) {
    engines.set(gen, (e = loadEngine(gen)));
    e.netLoad(net);
  }
  return e;
}

/** Our active's move choices' accuracy, from the true state (poke-engine move ids). */
function accuracyOf(p: Position) {
  const side = p.worlds[0]!.state.split('/')[0]!.split('=');
  const mon = side[Number(side[6])]!.split(',');
  const dex = Dex.forGen(FORMATS[p.format as keyof typeof FORMATS].gen);
  return (choice: string) => {
    const m = /^move (\d)/.exec(choice);
    const id = m ? mon[21 + Number(m[1])]?.split(';')[0] : undefined;
    const acc = id ? dex.moves.get(id).accuracy : undefined;
    return acc === true ? 100 : acc;
  };
}

function scan(engine: Engine, p: Position, k: number): Found {
  const n = Math.min(WORLDS, p.worlds.length);
  const slots = p.slots.slice(0, n).map((s) => s.map((c) => c ?? undefined));
  const results: NetSearchResult[] = [];
  for (const w of p.worlds.slice(0, n)) {
    try {
      results.push(engine.netSearch(NET_JUDGE_DEFAULTS.search, [{ ...w, must: w.legal }])[0]!);
    } catch {
      return { k, tips: [] };
    }
  }
  const weights = p.weights.slice(0, n);
  const top = pickSearched(p.legal, slots, weights, results, MASTER_DEFAULTS.priorWeight);
  if (!top) return { k, tips: [] };
  const worlds: BranchWorld[] = results.map((result, i) => ({
    result,
    weight: weights[i]!,
    slots: slots[i]!,
  }));
  const tips: Tip[] = [];
  const r = riskTip(worlds, p.legal, top, accuracyOf(p), RISK);
  if (r) tips.push({ concept: 'risk', kind: 'miss', ...r });
  return { k, top, tips };
}

const child = process.argv.indexOf('--child');
if (child > 0) {
  const [shard, jobs] = process.argv.slice(child + 1).map(Number);
  const all = load();
  for (let k = shard!; k < all.length; k += jobs!)
    process.send!(scan(engineFor(all[k]!.format), all[k]!, k));
  process.exit(0);
}

const all = load();
console.log(`advanced-scan: ${all.length} positions from ${SET}`);
const t0 = performance.now();
const found: Found[] = [];
const self = fileURLToPath(import.meta.url);
await Promise.all(
  Array.from(
    { length: JOBS },
    (_, shard) =>
      new Promise<void>((resolve, reject) => {
        const p = fork(self, [...process.argv.slice(2), '--child', String(shard), String(JOBS)], {
          execArgv: process.execArgv,
        });
        p.on('message', (m) => {
          found.push(m as Found);
          if (found.length % 500 === 0)
            console.log(
              `  ${found.length}/${all.length}, ${((performance.now() - t0) / 60000).toFixed(1)} min`,
            );
        });
        p.on('error', reject);
        p.on('exit', (code) =>
          code ? reject(new Error(`shard ${shard} exited ${code}`)) : resolve(),
        );
      }),
  ),
);
found.sort((a, b) => a.k - b.k);

const pct = (x: number) => (100 * x).toFixed(1);
/** The oracle's view of a tip: the advised choice's lead over the one it's contrasted with. */
function grade(t: Tip, o: Record<string, number>): number | undefined {
  if (!(t.safe in o) || !(t.risky in o)) return undefined;
  return o[t.safe]! - o[t.risky]!;
}
const groups = new Map<string, { n: number; graded: number; agree: number; contra: number }>();
const lines: string[] = [];
for (const f of found) {
  const p = all[f.k]!;
  for (const t of f.tips) {
    const key = `${t.concept}/${t.kind}`;
    const g = groups.get(key) ?? { n: 0, graded: 0, agree: 0, contra: 0 };
    const d = grade(t, p.oracle);
    g.n++;
    if (d !== undefined) {
      g.graded++;
      if (d >= 0) g.agree++;
      if (d < -0.05) g.contra++;
    }
    groups.set(key, g);
    lines.push(
      JSON.stringify({
        format: p.format,
        i: p.i,
        swap: p.swap,
        turn: p.turn,
        top: f.top,
        legal: p.legal,
        oracle: p.oracle,
        tip: t,
        oracleLead: d,
        state: p.worlds[0]?.state,
      }),
    );
  }
}
console.log(
  `done in ${((performance.now() - t0) / 60000).toFixed(1)} min; ${found.filter((f) => f.top).length} decisions judged`,
);
for (const [key, g] of [...groups].sort())
  console.log(
    `  ${key.padEnd(18)} ${String(g.n).padStart(4)} tips (${pct(g.n / found.length)}% of decisions); oracle agrees ${pct(g.agree / g.graded)}%, contradicts ${pct(g.contra / g.graded)}% (${g.graded} graded)`,
  );
if (OUT) writeFileSync(OUT, lines.join('\n') + '\n');
