// Fetches fresh source data into sources/. Run `build-sets` afterwards and review the diff.
//   pnpm --filter @daily-battle/data refresh [--format gen4ou] [--month YYYY-MM] [--mirror]
//
// `--mirror` reads the same data from the pkmn/smogon repo on GitHub instead:
// the curated sets data.pkmn.cc serves, and pkmn's processed copy of Smogon's
// latest monthly stats (shares rather than counts, converted below). Use it
// where data.pkmn.cc or smogon.com can't be reached, with `--month` set to the
// month of the repo's latest "Stats (YYYY-MM)" commit. The mirror carries
// pkmn's pick of the month's stats for the format (not the 1500 file, and it
// doesn't say which cutoff), so the cutoff is recorded as unknown.
import { writeFileSync } from 'node:fs';
import type { ChaosSpecies, ChaosStats, SourcesMeta } from '../src/types';
import { FORMAT, SOURCES } from './paths';

const MIRROR = process.argv.includes('--mirror');
const PKMN = 'https://raw.githubusercontent.com/pkmn/smogon/main/data';
const SETS_URL = MIRROR
  ? `${PKMN}/sets/${FORMAT.id}.json`
  : `https://data.pkmn.cc/sets/${FORMAT.id}.json`;
const UU_SETS_URL = MIRROR
  ? `${PKMN}/sets/${FORMAT.uu}.json`
  : `https://data.pkmn.cc/sets/${FORMAT.uu}.json`;
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

const curated = (await (await get(SETS_URL)).json()) as Record<string, unknown>;
const curatedUU = (await (await get(UU_SETS_URL)).json()) as Record<string, unknown>;

const { statsUrl, month, cutoff, battles, info, data } = MIRROR
  ? await mirrorStats()
  : await chaosStats();

/** Smogon's chaos file for a month, trimmed to the fields the build uses. */
async function chaosStats() {
  const monthArg = process.argv.indexOf('--month');
  const month = monthArg > 0 ? process.argv[monthArg + 1]! : await latestMonth();
  const statsUrl = `${STATS_INDEX}${month}/chaos/${FORMAT.id}-${CUTOFF}.json`;
  type RawChaosSpecies = Omit<ChaosSpecies, 'Natures'> & { Spreads: Record<string, number> };
  const chaos = (await (await get(statsUrl)).json()) as Omit<ChaosStats, 'data'> & {
    data: Record<string, RawChaosSpecies>;
  };
  // Keep only the fields the build uses, so the checked-in snapshot stays small and diffable.
  const data: Record<string, ChaosSpecies> = {};
  for (const [name, s] of Object.entries(chaos.data)) {
    data[name] = {
      'Raw count': s['Raw count'],
      usage: s.usage,
      Abilities: s.Abilities,
      Items: s.Items,
      Moves: s.Moves,
      Natures: byNature(s.Spreads),
    };
  }
  return {
    statsUrl,
    month,
    cutoff: CUTOFF,
    battles: chaos.info['number of battles'],
    info: chaos.info,
    data,
  };
}

/**
 * pkmn's processed stats: per species, each option's share of that species'
 * teams rather than a count. Shares times the species' weighted usage (and
 * the team count) give counts on the chaos file's scale, so species and
 * forms (a Mega and its base) weigh against each other as they would there.
 */
async function mirrorStats() {
  interface PkmnSpecies {
    usage: { weighted: number };
    count: number;
    abilities: Record<string, number>;
    items: Record<string, number>;
    moves: Record<string, number>;
    spreads: Record<string, number>;
  }
  const statsUrl = `${PKMN}/stats/${FORMAT.id}.json`;
  const raw = (await (await get(statsUrl)).json()) as {
    battles: number;
    pokemon: Record<string, PkmnSpecies>;
  };
  // The mirror holds only the latest month; the repo's commit for the file names it.
  const monthArg = process.argv.indexOf('--month');
  if (monthArg < 0) throw new Error('--mirror needs --month YYYY-MM (the "Stats (…)" commit)');
  const month = process.argv[monthArg + 1]!;
  const teams = raw.battles * 2;
  const data: Record<string, ChaosSpecies> = {};
  for (const [name, s] of Object.entries(raw.pokemon)) {
    const scale = s.usage.weighted * teams;
    const counts = (shares: Record<string, number>) =>
      Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, v * scale]));
    data[name] = {
      'Raw count': s.count,
      usage: s.usage.weighted,
      Abilities: counts(s.abilities),
      Items: counts(s.items),
      Moves: counts(s.moves),
      Natures: counts(byNature(s.spreads)),
    };
  }
  const info = { metagame: FORMAT.id, cutoff: null, 'number of battles': raw.battles };
  return { statsUrl, month, cutoff: null, battles: raw.battles, info, data };
}

function byNature(spreads: Record<string, number>): Record<string, number> {
  const natures: Record<string, number> = {};
  for (const [spread, n] of Object.entries(spreads)) {
    const nature = spread.split(':')[0]!;
    natures[nature] = (natures[nature] ?? 0) + n;
  }
  return natures;
}

const fetchedAt = new Date().toISOString();
const meta: SourcesMeta = {
  sets: { url: SETS_URL, fetchedAt },
  uuSets: { url: UU_SETS_URL, fetchedAt },
  stats: {
    url: statsUrl,
    month,
    cutoff,
    battles,
    fetchedAt,
  },
};

writeJson(SOURCES.sets, curated);
writeJson(SOURCES.uuSets, curatedUU);
writeJson(SOURCES.stats, { info, data });
writeJson(SOURCES.meta, meta);
console.log(
  `Fetched ${Object.keys(curated).length} OU and ${Object.keys(curatedUU).length} UU curated species and ${month} stats (${meta.stats.battles} battles).`,
);
