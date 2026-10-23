// Fetches fresh source data into sources/. Run `build-sets` afterwards and review the diff.
//   pnpm --filter @daily-battle/data refresh [--format gen4ou] [--month YYYY-MM]
import { writeFileSync } from 'node:fs';
import type { ChaosSpecies, ChaosStats, SourcesMeta } from '../src/types';
import { FORMAT, SOURCES } from './paths';

const SETS_URL = `https://data.pkmn.cc/sets/${FORMAT.id}.json`;
const UU_SETS_URL = `https://data.pkmn.cc/sets/${FORMAT.uu}.json`;
const STATS_INDEX = 'https://www.smogon.com/stats/';
const CUTOFF = 1500;

async function get(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function latestMonth(): Promise<string> {
  const html = await (await get(STATS_INDEX)).text();
  const months = [...html.matchAll(/href="(\d{4}-\d{2})\/"/g)].map((m) => m[1]!).sort();
  if (!months.length) throw new Error('No months found in the Smogon stats index');
  return months.at(-1)!;
}

const writeJson = (path: string, data: unknown) =>
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

const monthArg = process.argv.indexOf('--month');
const month = monthArg > 0 ? process.argv[monthArg + 1]! : await latestMonth();
const statsUrl = `${STATS_INDEX}${month}/chaos/${FORMAT.id}-${CUTOFF}.json`;

const curated = (await (await get(SETS_URL)).json()) as Record<string, unknown>;
const curatedUU = (await (await get(UU_SETS_URL)).json()) as Record<string, unknown>;
type RawChaosSpecies = Omit<ChaosSpecies, 'Natures'> & { Spreads: Record<string, number> };
const chaos = (await (await get(statsUrl)).json()) as Omit<ChaosStats, 'data'> & {
  data: Record<string, RawChaosSpecies>;
};

// Keep only the fields the build uses, so the checked-in snapshot stays small and diffable.
const data: Record<string, ChaosSpecies> = {};
for (const [name, s] of Object.entries(chaos.data)) {
  const natures: Record<string, number> = {};
  for (const [spread, n] of Object.entries(s.Spreads)) {
    const nature = spread.split(':')[0]!;
    natures[nature] = (natures[nature] ?? 0) + n;
  }
  data[name] = {
    'Raw count': s['Raw count'],
    usage: s.usage,
    Abilities: s.Abilities,
    Items: s.Items,
    Moves: s.Moves,
    Natures: natures,
  };
}

const fetchedAt = new Date().toISOString();
const meta: SourcesMeta = {
  sets: { url: SETS_URL, fetchedAt },
  uuSets: { url: UU_SETS_URL, fetchedAt },
  stats: {
    url: statsUrl,
    month,
    cutoff: CUTOFF,
    battles: chaos.info['number of battles'],
    fetchedAt,
  },
};

writeJson(SOURCES.sets, curated);
writeJson(SOURCES.uuSets, curatedUU);
writeJson(SOURCES.stats, { info: chaos.info, data });
writeJson(SOURCES.meta, meta);
console.log(
  `Fetched ${Object.keys(curated).length} OU and ${Object.keys(curatedUU).length} UU curated species and ${month} stats (${meta.stats.battles} battles).`,
);
