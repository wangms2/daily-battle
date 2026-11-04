// The advanced coach's detectors, offline: on recorded decisions graded by an
// oracle (strength-gate --a-record: poke-engine held to each choice on the
// true state), runs the coach's light check (with chance outcomes) and each
// detector, then reports how often each tip fires and how often the oracle
// backs it (agrees: the advice is ahead; contradicts: another choice is ahead
// by more than 0.05). Writes every tip, with its position, to --out (JSONL).
//   pnpm exec tsx scripts/advanced-scan.ts --set <dir> --net <file.dbnet> [--jobs 8] [--limit N] [--out tips.jsonl]
//     [--risk drop=0.2,worlds=0.75] [--worlds 8] [--only tips.jsonl] [--oracle 100000]
import { fork } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASTER_DEFAULTS, pickSearched, type NetRecord } from '@daily-battle/ai';
import { FORMATS } from '@daily-battle/data';
import type { Engine, NetSearchResult, NetWorld } from '@daily-battle/engine-wasm';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { Dex } from '@pkmn/sim';
import {
  preserveTip,
  type PreserveOptions,
  type PreserveTip,
} from '../src/coach/advanced/preserve';
import { readTip, type ReadOptions, type ReadTip } from '../src/coach/advanced/reads';
import {
  bestScore,
  winconTip,
  type WinconOptions,
  type WinconTip,
} from '../src/coach/advanced/wincon';
import { choiceValues, riskTip, type RiskOptions, type RiskTip } from '../src/coach/advanced/risk';
import { slowTip, type SlowOptions, type SlowTip } from '../src/coach/advanced/slow';
import type { BranchWorld } from '../src/coach/facts/branches';
import { faint } from '../src/coach/facts/counterfactual';
import { NET_JUDGE_DEFAULTS } from '../src/coach/net-judge';

interface Position extends NetRecord {
  format: string;
  i: number;
  swap: boolean;
  turn: number;
  oracle?: Record<string, number>;
  /** Recorded without grades: the true state, each choice's option index, and the oracle's seed. */
  truth?: string;
  keys?: Record<string, number>;
  seed?: number;
}
type Tip =
  | ({ concept: 'risk'; kind: 'miss' } & RiskTip)
  | ({ concept: 'slow' } & SlowTip)
  | ({ concept: 'reads' } & ReadTip)
  | ({ concept: 'wincon'; contrast: string; claim?: Claim } & WinconTip)
  | ({ concept: 'preserve' } & PreserveTip);
/** The oracle's win chances on the true state: now, with the blocker gone, and with our key gone too. */
interface Claim {
  now: number;
  without: number;
  withoutKey?: number;
}
interface Found {
  k: number;
  top?: string;
  tips: Tip[];
  oracle?: Record<string, number>;
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
/** Oracle iterations for positions recorded without grades (the gate's default). */
const ORACLE = Number(arg('oracle') ?? 100_000);
/** `--worlds N`: worlds per decision (default: the light check's). */
const WORLDS = Number(arg('worlds') ?? NET_JUDGE_DEFAULTS.worlds);
/** --risk drop=0.2,worlds=0.75: a detector's options. */
const opts = (name: string) =>
  Object.fromEntries(
    (arg(name) ?? '')
      .split(',')
      .filter(Boolean)
      .map((kv) => [kv.split('=')[0]!, Number(kv.split('=')[1])]),
  );
const RISK = opts('risk') as Partial<RiskOptions>;
const SLOW = opts('slow') as Partial<SlowOptions>;
const READS = opts('reads') as Partial<ReadOptions>;
const WINCON = opts('wincon') as Partial<WinconOptions>;
const PRESERVE = opts('preserve') as Partial<PreserveOptions>;
const CONCEPTS = arg('concepts')?.split(',');
const on = (c: string) => !CONCEPTS || CONCEPTS.includes(c);
const keyOf = (p: { format: string; i: number; swap: boolean; turn: number }) =>
  `${p.format}:${p.i}:${p.swap}:${p.turn}`;
/** `--only a.jsonl[,b.jsonl]`: just the positions of earlier tips (e.g. to re-check them with more worlds). */
const ONLY = arg('only')
  ? new Set(
      arg('only')!
        .split(',')
        .flatMap((f) => readFileSync(f, 'utf8').split('\n'))
        .filter((l) => l.trim())
        .map((l) => keyOf(JSON.parse(l) as Position)),
    )
  : undefined;

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
  return out.slice(0, LIMIT).filter((p) => !ONLY || ONLY.has(keyOf(p)));
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

/** Our active's moves by choice, from the state (poke-engine move ids), in the dex. */
function movesOf(p: Position) {
  const side = p.worlds[0]!.state.split('/')[0]!.split('=');
  const mon = side[Number(side[6])]!.split(',');
  const dex = Dex.forGen(FORMATS[p.format as keyof typeof FORMATS].gen);
  return (choice: string) => {
    const m = /^move (\d)/.exec(choice);
    const id = m ? mon[21 + Number(m[1])]?.split(';')[0] : undefined;
    return id ? dex.moves.get(id) : undefined;
  };
}

/** Win-condition claims, checked by the oracle on the true state (sets recorded with truth only). */
function claimOf(t: WinconTip): { claim?: Claim } {
  const p = current!;
  if (!p.truth) return {};
  const engine = engineFor(p.format);
  const val = (state: string) => {
    const s = engine.search(state, ORACLE, p.seed ?? 1);
    const v = s.s1.reduce((a, o) => a + o.v, 0);
    return v ? s.s1.reduce((a, o) => a + o.s, 0) / v : NaN;
  };
  const slot = (side: 0 | 1, id: string) =>
    p
      .truth!.split('/')
      [side]!.split('=')
      .slice(0, 6)
      .findIndex((m) => m.split(',')[0]!.toLowerCase() === id);
  const y = slot(1, t.blocker);
  if (y < 0) return {};
  const gone = faint(p.truth, 1, y);
  if (!gone) return {};
  const without = gone.over ? 1 : val(gone.state);
  const x = t.key ? slot(0, t.key) : -1;
  const both = x >= 0 ? faint(gone.state, 0, x) : undefined;
  return {
    claim: {
      now: val(p.truth),
      without,
      ...(both ? { withoutKey: both.over ? 0 : val(both.state) } : {}),
    },
  };
}
let current: Position | undefined;

function scan(engine: Engine, p: Position, k: number): Found {
  current = p;
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
    world: p.worlds[i]!,
  }));
  const tips: Tip[] = [];
  const move = movesOf(p);
  const accuracy = (c: string) => {
    const a = move(c)?.accuracy;
    return a === true ? 100 : a;
  };
  const r = on('risk') ? riskTip(worlds, p.legal, top, accuracy, RISK) : undefined;
  if (r) tips.push({ concept: 'risk', kind: 'miss', ...r });
  const s = !on('slow')
    ? undefined
    : slowTip(
        worlds,
        p.legal,
        top,
        (c) => move(c)?.id,
        (c) => !!move(c) && move(c)!.category !== 'Status',
        FORMATS[p.format as keyof typeof FORMATS].gen,
        SLOW,
      );
  if (s) tips.push({ concept: 'slow', ...s });
  const rd = on('reads') ? readTip(worlds, p.legal, top, READS) : undefined;
  if (rd) tips.push({ concept: 'reads', ...rd });
  const value = (w: NetWorld) => {
    try {
      const [r] = engine.netSearch(NET_JUDGE_DEFAULTS.search, [
        { ...w, legal: w.legal.map(() => true) },
      ]);
      return bestScore(r!);
    } catch {
      return NaN;
    }
  };
  const damaging = (c: string) => !!move(c) && move(c)!.category !== 'Status';
  const wc = on('wincon') ? winconTip(worlds, top, value, damaging, WINCON) : undefined;
  if (wc) {
    const v = choiceValues(worlds, p.legal);
    const contrast = p.legal
      .filter((c) => c !== top)
      .sort((a, b) => (v[b] ?? -1) - (v[a] ?? -1))[0];
    if (contrast) tips.push({ concept: 'wincon', contrast, ...wc, ...claimOf(wc) });
  }
  const pr = on('preserve')
    ? preserveTip(worlds, p.legal, top, value, damaging, PRESERVE)
    : undefined;
  if (pr) tips.push({ concept: 'preserve', ...pr });
  // Recorded without grades (strength-gate --a-record dir,p,0): grade only tips' positions.
  let oracle = p.oracle;
  if (tips.length && !oracle && p.truth && p.keys) {
    oracle = {};
    for (const [c, key] of Object.entries(p.keys)) {
      const s = engine.searchFixed(p.truth, ORACLE, p.seed! + key, key);
      const v = s.s1.reduce((a, o) => a + o.v, 0);
      if (v) oracle[c] = s.s1.reduce((a, o) => a + o.s, 0) / v;
    }
  }
  return { k, top, tips, oracle };
}

const child = process.argv.indexOf('--child');
if (child > 0) {
  const [shard, jobs] = process.argv.slice(child + 1).map(Number);
  const all = load();
  for (let k = shard!; k < all.length; k += jobs!) {
    let f: Found;
    try {
      f = scan(engineFor(all[k]!.format), all[k]!, k);
    } catch (e) {
      // A rare engine failure (e.g. the oracle's stack overflow) skips the position.
      console.error(`  position ${k} skipped: ${String(e).slice(0, 120)}`);
      f = { k, tips: [] };
    }
    process.send!(f);
  }
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
  const [a, b] = t.concept === 'risk' ? [t.safe, t.risky] : [t.choice, t.contrast];
  if (!(a in o) || !(b in o)) return undefined;
  return o[a]! - o[b]!;
}
const groups = new Map<string, { n: number; graded: number; agree: number; contra: number }>();
const lines: string[] = [];
for (const f of found) {
  const p = all[f.k]!;
  for (const t of f.tips) {
    const key = `${t.concept}/${t.kind}`;
    const g = groups.get(key) ?? { n: 0, graded: 0, agree: 0, contra: 0 };
    const d = f.oracle ? grade(t, f.oracle) : undefined;
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
        oracle: f.oracle,
        tip: t,
        oracleLead: d,
        state: p.worlds[0]?.state,
        known: p.worlds[0]?.known,
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
