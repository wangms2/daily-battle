// Offline scoring of the Master network's pick rules on recorded decisions
// (strength-gate --a-record): each variant's pick is graded by the oracle's
// value for it, so variants compare paired on the same positions, with far
// less noise than a gate.
//   pnpm exec tsx scripts/search-eval.ts --set <dir> --net <file.dbnet>
//     [--variants "net;s:worlds=4,robust=0"] [--betas 0,0.02,0.05] [--jobs 4] [--limit N]
// A variant is `net` (the network alone, its averaged policy) or
// `label:key=value,...` with `worlds` (the first N of the recorded worlds) and
// any NetSearchParams; each search variant is scored at every beta (the
// prior's weight). Differences are against the first variant listed, with
// 95% intervals clustered by game.
import { fork } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATS } from '@daily-battle/data';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import type { Engine, NetSearchParams } from '@daily-battle/engine-wasm';
import { pickSearched, type NetRecord } from '../src/index';

interface Position extends NetRecord {
  format: string;
  i: number;
  swap: boolean;
  turn: number;
  played: string;
  oracle: Record<string, number>;
}
interface Variant {
  label: string;
  worlds: number;
  search?: NetSearchParams;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const SET = arg('set');
const NET = arg('net');
if (!SET || !NET) throw new Error('usage: --set <dir> --net <file.dbnet>');
const BETAS = (arg('betas') ?? '0.02').split(',').map(Number);
const JOBS = Number(arg('jobs') ?? 4);
const LIMIT = Number(arg('limit') ?? Infinity);
const VARIANTS: Variant[] = (arg('variants') ?? 'net;s:worlds=4').split(';').map((v) => {
  if (v === 'net') return { label: 'net', worlds: 4 };
  const [label, spec = ''] = v.split(':');
  const search: Record<string, number> = {};
  let worlds = 4;
  for (const kv of spec.split(',').filter(Boolean)) {
    const [k, x] = kv.split('=');
    if (k === 'worlds') worlds = Number(x);
    else search[k!] = Number(x);
  }
  return { label: label!, worlds, search };
});
/** Every scored pick rule: `net`, and each search variant at each beta. */
const RULES = VARIANTS.flatMap((v) =>
  v.search ? BETAS.map((b) => `${v.label} b${b}`) : [v.label],
);

function load(): Position[] {
  const out: Position[] = [];
  for (const f of readdirSync(SET!)
    .filter((f) => f.endsWith('.jsonl'))
    .sort())
    for (const line of readFileSync(join(SET!, f), 'utf8').split('\n'))
      if (line.trim()) out.push(JSON.parse(line) as Position);
  // A fixed order, so --limit and the shards don't depend on the files.
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

/** The network alone: its policy, averaged over the worlds by weight. */
function pickNet(engine: Engine, p: Position, n: number): string | undefined {
  const worlds = p.worlds.slice(0, n);
  const outs = engine.netForward(
    worlds.map((w) => ({
      ...engine.observe(w.state, w.turn, w.known, w.events),
      mask: [...w.legal],
    })),
  );
  const prob = new Map<string, number>();
  outs.forEach((out, k) => {
    const slots = p.slots[k]!;
    const legal = slots.flatMap((c, i) => (c ? [i] : []));
    const max = Math.max(...legal.map((i) => out.policy[i]!));
    const exp = legal.map((i) => Math.exp(out.policy[i]! - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    legal.forEach((i, j) => {
      const c = slots[i]!;
      prob.set(c, (prob.get(c) ?? 0) + (p.weights[k]! * exp[j]!) / sum);
    });
  });
  let best: string | undefined;
  let bestP = -1;
  for (const c of p.legal) {
    const q = prob.get(c);
    if (q !== undefined && q > bestP) [best, bestP] = [c, q];
  }
  return best;
}

/** Each rule's pick (undefined: the engine failed on every world). */
function picks(p: Position): (string | undefined)[] {
  const engine = engineFor(p.format);
  // JSON turned the unset slots into null.
  p.slots = p.slots.map((s) => s.map((c) => c ?? undefined));
  const out: (string | undefined)[] = [];
  for (const v of VARIANTS) {
    if (!v.search) {
      out.push(pickNet(engine, p, v.worlds));
      continue;
    }
    const n = Math.min(v.worlds, p.worlds.length);
    let results;
    try {
      results = engine.netSearch(v.search, p.worlds.slice(0, n));
    } catch {
      for (const _ of BETAS) out.push(undefined);
      continue;
    }
    for (const b of BETAS)
      out.push(pickSearched(p.legal, p.slots.slice(0, n), p.weights.slice(0, n), results, b));
  }
  return out;
}

const child = process.argv.indexOf('--child');
if (child > 0) {
  const [shard, jobs] = process.argv.slice(child + 1).map(Number);
  const all = load();
  for (let k = shard!; k < all.length; k += jobs!) process.send!({ k, picks: picks(all[k]!) });
  process.exit(0);
}

const all = load();
console.log(
  `search-eval: ${all.length} positions from ${SET}, net ${NET}\n  rules: ${RULES.join(' | ')}`,
);
const t0 = performance.now();
const results: (string | undefined)[][] = Array(all.length);
let done = 0;
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
          const { k, picks } = m as { k: number; picks: (string | null)[] };
          results[k] = picks.map((c) => c ?? undefined);
          if (++done % 500 === 0)
            console.log(
              `  ${done}/${all.length}, ${((performance.now() - t0) / 60000).toFixed(1)} min`,
            );
        });
        p.on('error', reject);
        p.on('exit', (code) =>
          code ? reject(new Error(`shard ${shard} exited ${code}`)) : resolve(),
        );
      }),
  ),
);

// Grades: the oracle's value of each pick, minus the position's best (regret <= 0).
const used = all.flatMap((p, k) => (results[k]?.every((c) => c && c in p.oracle) ? [k] : []));
const grade = (k: number, r: number) => all[k]!.oracle[results[k]![r]!]!;
const best = (k: number) => Math.max(...Object.values(all[k]!.oracle));
const game = (k: number) => `${all[k]!.format}:${all[k]!.i}:${all[k]!.swap}`;
/** Mean and 95% half-width of x over the used positions, clustered by game. */
function stat(x: (k: number) => number) {
  const mean = used.reduce((a, k) => a + x(k), 0) / used.length;
  const byGame = new Map<string, number>();
  for (const k of used) byGame.set(game(k), (byGame.get(game(k)) ?? 0) + x(k) - mean);
  const se = Math.sqrt([...byGame.values()].reduce((a, s) => a + s * s, 0)) / used.length;
  return { mean, half: 1.96 * se };
}
const pct = (x: number) => (100 * x).toFixed(2);
console.log(
  `done in ${((performance.now() - t0) / 60000).toFixed(1)} min; ${used.length} positions graded ` +
    `(${all.length - used.length} skipped), ${new Set(used.map(game)).size} games\n` +
    `  regret: oracle win% given up vs its best choice; top: picks its best; vs ${RULES[0]}: paired difference`,
);
for (const [r, label] of RULES.entries()) {
  const regret = stat((k) => grade(k, r) - best(k));
  const top = stat((k) => (grade(k, r) === best(k) ? 1 : 0));
  const diff = stat((k) => grade(k, r) - grade(k, 0));
  console.log(
    `  ${label.padEnd(24)} regret ${pct(regret.mean)} ±${pct(regret.half)}  top ${pct(top.mean)}%` +
      (r
        ? `  vs ${RULES[0]} ${diff.mean >= 0 ? '+' : ''}${pct(diff.mean)} ±${pct(diff.half)}`
        : ''),
  );
}
for (const format of [...new Set(used.map((k) => all[k]!.format))].sort()) {
  const ks = used.filter((k) => all[k]!.format === format);
  console.log(
    `  ${format} (${ks.length}): ` +
      RULES.map(
        (label, r) =>
          `${label} ${pct(ks.reduce((a, k) => a + grade(k, r) - best(k), 0) / ks.length)}`,
      ).join(' | '),
  );
}
