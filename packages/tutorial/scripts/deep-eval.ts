// The advanced coach's deep pass, offline: on recorded decisions graded by an
// oracle (strength-gate --a-record: poke-engine held to each choice on the
// true state), how well each search setting's judgments hold up. For each
// setting, every legal choice is searched (as the coach's judge does), then:
//   - pick: the oracle's regret for the setting's top choice;
//   - flags: pairs (top, c) the judge would call clearly worse (gap >= margin,
//     ahead in >= agree of the worlds), and how often the oracle agrees that
//     top beats c (and by how much); "bad" counts the ones it has c ahead by
//     more than 0.05;
//   - key: the share of decisions whose spread (top minus the median choice)
//     reaches each triage threshold;
//   - time: milliseconds and network positions per decision, one thread.
//   pnpm exec tsx scripts/deep-eval.ts --set <dir> --net <file.dbnet>
//     [--variants "light:worlds=4;deep:worlds=8,foeK=4,branches=8"] [--margins 0.05,0.07,0.1]
//     [--jobs 8] [--limit N]
import { fork } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASTER_DEFAULTS, pickSearched, type NetRecord } from '@daily-battle/ai';
import { FORMATS } from '@daily-battle/data';
import type { Engine, NetSearchParams, NetSearchResult } from '@daily-battle/engine-wasm';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { agreement } from '../src/coach/judge';

interface Position extends NetRecord {
  format: string;
  i: number;
  swap: boolean;
  turn: number;
  oracle: Record<string, number>;
}
interface Variant {
  label: string;
  worlds: number;
  search: NetSearchParams;
}
/** One setting's judgment of a decision. */
interface Judged {
  top?: string;
  /** Weighted mean win chance per legal choice (NaN: never searched). */
  value: Record<string, number>;
  /** Share of worlds (by weight) where top beats each choice. */
  agree: Record<string, number>;
  ms: number;
  positions: number;
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
const MARGINS = (arg('margins') ?? '0.05,0.07,0.1').split(',').map(Number);
const AGREE = Number(arg('agree') ?? 0.9);
const KEYS = [0.05, 0.1, 0.15, 0.2];
const VARIANTS: Variant[] = (arg('variants') ?? 'light:worlds=4;deep:worlds=8,foeK=4,branches=8')
  .split(';')
  .map((v) => {
    const [label, spec = ''] = v.split(':');
    const search: Record<string, number> = { ...MASTER_DEFAULTS.search };
    let worlds = 4;
    for (const kv of spec.split(',').filter(Boolean)) {
      const [k, x] = kv.split('=');
      if (k === 'worlds') worlds = Number(x);
      else search[k!] = Number(x);
    }
    return { label: label!, worlds, search };
  });

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

function judge(engine: Engine, p: Position, v: Variant): Judged | undefined {
  const n = Math.min(v.worlds, p.worlds.length);
  const worlds = p.worlds.slice(0, n);
  const slots = p.slots.slice(0, n).map((s) => s.map((c) => c ?? undefined));
  const weights = p.weights.slice(0, n);
  const t = performance.now();
  const results: NetSearchResult[] = [];
  for (const w of worlds) {
    try {
      results.push(engine.netSearch(v.search, [{ ...w, must: w.legal }])[0]!);
    } catch {
      return undefined;
    }
  }
  const ms = performance.now() - t;
  const top = pickSearched(p.legal, slots, weights, results, MASTER_DEFAULTS.priorWeight);
  const scores = (c: string) =>
    results.map((r, k) => {
      const i = slots[k]!.indexOf(c);
      return i < 0 ? NaN : r.score[i]!;
    });
  const value: Record<string, number> = {};
  const agree: Record<string, number> = {};
  const topScores = top ? scores(top) : [];
  for (const c of p.legal) {
    const s = scores(c);
    const ok = s.map((x, k) => Number.isFinite(x) && Number.isFinite(topScores[k] ?? NaN));
    const w = weights.filter((_, k) => ok[k]);
    const total = w.reduce((a, b) => a + b, 0);
    value[c] = total
      ? s.filter((_, k) => ok[k]).reduce((a, x, j) => a + x * w[j]!, 0) / total
      : NaN;
    agree[c] = top
      ? agreement(
          topScores.filter((_, k) => ok[k]),
          s.filter((_, k) => ok[k]),
          w,
        )
      : 0;
  }
  return { top, value, agree, ms, positions: results.reduce((a, r) => a + r.positions, 0) };
}

const child = process.argv.indexOf('--child');
if (child > 0) {
  const [shard, jobs] = process.argv.slice(child + 1).map(Number);
  const all = load();
  for (let k = shard!; k < all.length; k += jobs!) {
    const p = all[k]!;
    const engine = engineFor(p.format);
    process.send!({ k, judged: VARIANTS.map((v) => judge(engine, p, v) ?? null) });
  }
  process.exit(0);
}

const all = load();
console.log(
  `deep-eval: ${all.length} positions from ${SET}\n  variants: ${VARIANTS.map((v) => `${v.label} ${v.worlds}w ${JSON.stringify(v.search)}`).join(' | ')}`,
);
const t0 = performance.now();
const judged: (Judged | null)[][] = Array(all.length);
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
          const { k, judged: j } = m as { k: number; judged: (Judged | null)[] };
          judged[k] = j;
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

const used = all.flatMap((p, k) =>
  judged[k]?.every((j) => j?.top && j.top in p.oracle) ? [k] : [],
);
const pct = (x: number) => (100 * x).toFixed(1);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};
console.log(
  `done in ${((performance.now() - t0) / 60000).toFixed(1)} min; ${used.length} of ${all.length} decisions graded`,
);
VARIANTS.forEach((v, r) => {
  const js = used.map((k) => judged[k]![r]!);
  const best = (k: number) => Math.max(...Object.values(all[k]!.oracle));
  const regret =
    used.reduce((a, k) => a + all[k]!.oracle[judged[k]![r]!.top!]! - best(k), 0) / used.length;
  const top =
    used.filter((k) => all[k]!.oracle[judged[k]![r]!.top!]! === best(k)).length / used.length;
  console.log(
    `\n${v.label}: regret ${pct(regret)} top ${pct(top)}% | ms median ${quantile(
      js.map((j) => j.ms),
      0.5,
    ).toFixed(0)} p90 ${quantile(
      js.map((j) => j.ms),
      0.9,
    ).toFixed(0)} max ${Math.max(...js.map((j) => j.ms)).toFixed(0)} | positions median ${quantile(
      js.map((j) => j.positions),
      0.5,
    )}`,
  );
  for (const m of MARGINS) {
    let flags = 0;
    let right = 0;
    let bad = 0;
    let gap = 0;
    let decisions = 0;
    for (const k of used) {
      const j = judged[k]![r]!;
      const o = all[k]!.oracle;
      let any = false;
      for (const c of all[k]!.legal) {
        if (c === j.top || !(c in o)) continue;
        if (!(j.value[j.top!]! - j.value[c]! >= m && j.agree[c]! >= AGREE)) continue;
        any = true;
        flags++;
        const d = o[j.top!]! - o[c]!;
        gap += d;
        if (d > 0) right++;
        if (d < -0.05) bad++;
      }
      if (any) decisions++;
    }
    console.log(
      `  margin ${m}: ${flags} flags on ${pct(decisions / used.length)}% of decisions; oracle agrees ${pct(right / flags)}%, bad ${pct(bad / flags)}%, mean oracle gap ${pct(gap / flags)}`,
    );
  }
  const spread = js.map((j) => {
    const vals = Object.values(j.value).filter(Number.isFinite);
    return j.value[j.top!]! - quantile(vals, 0.5);
  });
  console.log(
    `  key turns (top minus median choice): ${KEYS.map((t) => `>=${t} ${pct(spread.filter((s) => s >= t).length / js.length)}%`).join(', ')}`,
  );
});
