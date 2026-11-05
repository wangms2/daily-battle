// Fetches who-plays-with-whom and who-beats-whom from Smogon's chaos stats for
// the month the set data was built from, trimmed to the species in the set data
// (a Mega's entry counts for its base species), into sources/<fmt>-teammates.json.
// The daily opponent's team builder (generator v7) reads it.
//   pnpm --filter @daily-battle/data fetch-teammates [--format gen4ou] [--month YYYY-MM]
// Run after `build-sets`.
import { readFileSync, writeFileSync } from 'node:fs';
import type { SetsFile, SourcesMeta, TeammatesFile } from '../src/types';
import { FORMAT, OUTPUT, SOURCES, TEAMMATES } from './paths';

const CUTOFF = 1500;
/** Teammates kept per species, and the least share of its teams they must appear on. */
const MAX_MATES = 40;
const MIN_SHARE = 0.02;
/** Checks and counters kept per species, and the least number of encounters behind each. */
const MAX_COUNTERS = 30;
const MIN_ENCOUNTERS = 20;

interface RawSpecies {
  Abilities: Record<string, number>;
  Teammates: Record<string, number>;
  'Checks and Counters': Record<string, { n: number; p: number; d: number }>;
}

const meta = JSON.parse(readFileSync(SOURCES.meta, 'utf8')) as SourcesMeta;
const known = new Set(Object.keys((JSON.parse(readFileSync(OUTPUT, 'utf8')) as SetsFile).species));
const monthArg = process.argv.indexOf('--month');
const month = monthArg > 0 ? process.argv[monthArg + 1]! : meta.stats.month;
const url = `https://www.smogon.com/stats/${month}/chaos/${FORMAT.id}-${CUTOFF}.json`;
const res = await fetch(url);
if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
const chaos = (await res.json()) as { data: Record<string, RawSpecies> };

/** The set data's name for a stats name: itself, or its base species for a Mega (`Pinsir-Mega`). */
const nameOf = (name: string) =>
  known.has(name)
    ? name
    : known.has(name.replace(/-Mega(-[XY])?$/, ''))
      ? name.replace(/-Mega(-[XY])?$/, '')
      : undefined;

// Sum each species' entries (base and Mega) as counts first, then turn them into shares.
const teams = new Map<string, number>();
const mates = new Map<string, Map<string, number>>();
const counters = new Map<string, Map<string, { n: number; p: number; d: number }>>();
for (const [raw, s] of Object.entries(chaos.data)) {
  const name = nameOf(raw);
  if (!name) continue;
  // Weighted teams carrying the species: every team gives it exactly one ability.
  teams.set(name, (teams.get(name) ?? 0) + Object.values(s.Abilities).reduce((a, b) => a + b, 0));
  const m = mates.get(name) ?? new Map<string, number>();
  for (const [rawMate, n] of Object.entries(s.Teammates ?? {})) {
    const mate = nameOf(rawMate);
    if (mate && mate !== name) m.set(mate, (m.get(mate) ?? 0) + n);
  }
  mates.set(name, m);
  const c = counters.get(name) ?? new Map<string, { n: number; p: number; d: number }>();
  for (const [rawFoe, x] of Object.entries(s['Checks and Counters'] ?? {})) {
    const foe = nameOf(rawFoe);
    // Keep the better-sampled entry when a base and its Mega both appear.
    if (foe && (!c.has(foe) || c.get(foe)!.n < x.n)) c.set(foe, x);
  }
  counters.set(name, c);
}

const round = (x: number) => Math.round(x * 1000) / 1000;
const data: TeammatesFile['data'] = {};
for (const name of [...teams.keys()].sort()) {
  const total = teams.get(name)!;
  if (total <= 0) continue;
  const teammates = [...mates.get(name)!]
    .map(([mate, n]) => [mate, n / total] as const)
    .filter(([, share]) => share >= MIN_SHARE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_MATES)
    .map(([mate, share]) => [mate, round(share)] as const);
  // [encounters, how often the foe KOs or forces it out, standard deviation]; Smogon ranks by p - 4d.
  const checks = [...counters.get(name)!]
    .filter(([, c]) => c.n >= MIN_ENCOUNTERS)
    .sort((a, b) => b[1].p - 4 * b[1].d - (a[1].p - 4 * a[1].d))
    .slice(0, MAX_COUNTERS)
    .map(([foe, { n, p, d }]): [string, number[]] => [foe, [Math.round(n), round(p), round(d)]]);
  data[name] = { teammates: Object.fromEntries(teammates), counters: Object.fromEntries(checks) };
}

const out: TeammatesFile = {
  source: { url, month, cutoff: CUTOFF, fetchedAt: new Date().toISOString() },
  data,
};
writeFileSync(TEAMMATES, `${JSON.stringify(out, null, 1)}\n`);
console.log(`${FORMAT.id}: ${Object.keys(data).length}/${known.size} species -> ${TEAMMATES}`);
