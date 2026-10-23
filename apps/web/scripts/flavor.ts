// Bakes one Pokédex entry per species the sets cover into src/lib/flavor.json,
// from PokeAPI (Gen 4 and 5 game versions, newest first). Shown on wide screens
// only. Committed; nothing is fetched at runtime.
//   pnpm --filter web flavor [--force]
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import { Dex } from '@pkmn/sim';

const out = fileURLToPath(new URL('../src/lib/flavor.json', import.meta.url));
if (!process.argv.includes('--force') && existsSync(out)) {
  console.log('flavor: already baked (use --force to refresh)');
  process.exit(0);
}

/** Game versions in order of preference: the newest Gen 5 and Gen 4 games first. */
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
];

const names = new Set<string>();
for (const id of Object.keys(FORMATS))
  for (const species of Object.keys(setsFor(id).species)) names.add(species);

const entries: Record<string, string> = {};
const byNum = new Map<number, string | null>();
const missing: string[] = [];
for (const name of [...names].sort()) {
  const species = Dex.species.get(name);
  const num = species.num;
  if (!byNum.has(num)) {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${num}`);
    if (!res.ok) {
      byNum.set(num, null);
    } else {
      const data = (await res.json()) as {
        flavor_text_entries: {
          flavor_text: string;
          language: { name: string };
          version: { name: string };
        }[];
      };
      const english = data.flavor_text_entries.filter((e) => e.language.name === 'en');
      const pick =
        VERSIONS.map((v) => english.find((e) => e.version.name === v)).find(Boolean) ?? english[0];
      byNum.set(
        num,
        pick
          ? pick.flavor_text
              .replace(/[\n\f\r]+/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
          : null,
      );
    }
  }
  const text = byNum.get(num);
  if (text) entries[name] = text;
  else missing.push(name);
}
writeFileSync(out, JSON.stringify(entries, null, 1) + '\n');
console.log(`flavor: ${Object.keys(entries).length} entries, ${missing.length} missing`, missing);
