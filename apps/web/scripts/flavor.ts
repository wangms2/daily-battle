// Bakes one Pokédex entry per species the sets cover into src/lib/flavor.json,
// from PokeAPI's data tables (Gen 4 and 5 game versions newest first, then
// X and Y for species those games don't have). Shown on wide screens only.
// Committed; nothing is fetched at runtime. Entries already baked are kept, so
// a new format only adds its new species.
//   pnpm --filter web flavor [--force]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import { Dex } from '@pkmn/sim';

const out = fileURLToPath(new URL('../src/lib/flavor.json', import.meta.url));
const force = process.argv.includes('--force');
const entries: Record<string, string> =
  !force && existsSync(out)
    ? (JSON.parse(readFileSync(out, 'utf8')) as Record<string, string>)
    : {};

/**
 * Game versions in order of preference: the newest Gen 5 and Gen 4 games
 * first, then Gen 6 (appended, so older species keep the entries they had).
 */
const VERSIONS = [
  'white-2',
  'black-2',
  'white',
  'black',
  'platinum',
  'heartgold',
  'soulsilver',
  'diamond',
  'pearl',
  'y',
  'x',
  'omega-ruby',
  'alpha-sapphire',
];
const ENGLISH = '9';
const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';

/** Rows of a CSV file, with quoted fields that may span lines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') field += ch;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows.slice(1);
}

async function table(name: string): Promise<string[][]> {
  const res = await fetch(`${CSV}/${name}.csv`);
  if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
  return parseCsv(await res.text());
}

const names = new Set<string>();
for (const id of Object.keys(FORMATS))
  for (const species of Object.keys(setsFor(id).species)) names.add(species);
const wanted = [...names].sort().filter((name) => !entries[name]);

const missing: string[] = [];
if (wanted.length) {
  const versionId = new Map(
    (await table('versions')).map(([id, , identifier]) => [identifier!, id!]),
  );
  const rank = new Map(VERSIONS.map((v, i) => [versionId.get(v)!, i]));
  /** species id → [preference rank, text] of the best entry so far. */
  const best = new Map<string, [number, string]>();
  for (const [species, version, language, text] of await table('pokemon_species_flavor_text')) {
    if (language !== ENGLISH || !rank.has(version!)) continue;
    const r = rank.get(version!)!;
    const prev = best.get(species!);
    if (!prev || r < prev[0]) best.set(species!, [r, text!]);
  }
  for (const name of wanted) {
    const text = best.get(String(Dex.species.get(name).num))?.[1];
    if (text) {
      entries[name] = text
        .replace(/[\n\f\r]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    } else missing.push(name);
  }
}
const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(out, JSON.stringify(sorted, null, 1) + '\n');
console.log(`flavor: ${Object.keys(sorted).length} entries, ${missing.length} missing`, missing);
