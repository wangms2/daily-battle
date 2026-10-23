// Downloads the sprites the client ships (DESIGN.md §12.3a): animated
// Showdown-style front and back GIFs plus a box icon for every species in
// every format's set data (one shared folder: a species looks the same in each). Files are committed and self-hosted; nothing is hotlinked.
//   pnpm --filter web sprites [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';

const RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon';
const SOURCES = {
  front: (id: number) => [`${RAW}/other/showdown/${id}.gif`],
  back: (id: number) => [`${RAW}/other/showdown/back/${id}.gif`],
  icons: (id: number) => [
    `${RAW}/versions/generation-vii/icons/${id}.png`,
    `${RAW}/versions/generation-viii/icons/${id}.png`,
  ],
};
const EXT = { front: 'gif', back: 'gif', icons: 'png' } as const;

const force = process.argv.includes('--force');
const out = (dir: string) => fileURLToPath(new URL(`../public/sprites/${dir}/`, import.meta.url));
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.toLowerCase().replace(/[.']/g, '').replace(/\s+/g, '-');

async function json(
  url: string,
): Promise<{ id: number; varieties?: { is_default: boolean; pokemon: { url: string } }[] } | null> {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as never) : null;
}

/** PokeAPI pokemon id for a species name, e.g. Rotom-Wash → 10009. */
async function pokeapiId(species: string): Promise<number> {
  const direct = await json(`https://pokeapi.co/api/v2/pokemon/${slug(species)}`);
  if (direct) return direct.id;
  // Species whose default form has its own name (e.g. Shaymin → shaymin-land).
  const s = await json(`https://pokeapi.co/api/v2/pokemon-species/${slug(species)}`);
  const url = s?.varieties?.find((v) => v.is_default)?.pokemon.url;
  if (!url) throw new Error(`No PokeAPI entry for ${species}`);
  return Number(url.split('/').filter(Boolean).at(-1));
}

async function download(urls: string[], file: string): Promise<boolean> {
  for (const url of urls) {
    const res = await fetch(url);
    if (res.ok) {
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      return true;
    }
  }
  return false;
}

for (const dir of Object.keys(SOURCES)) mkdirSync(out(dir), { recursive: true });
const missing: string[] = [];
const allSpecies = [
  ...new Set(Object.keys(FORMATS).flatMap((f) => Object.keys(setsFor(f).species))),
];
for (const species of allSpecies) {
  const kinds = (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).filter(
    (k) => force || !existsSync(`${out(k)}${toId(species)}.${EXT[k]}`),
  );
  if (!kinds.length) continue;
  const id = await pokeapiId(species);
  for (const kind of kinds) {
    const ok = await download(SOURCES[kind](id), `${out(kind)}${toId(species)}.${EXT[kind]}`);
    if (!ok) missing.push(`${species} ${kind} (id ${id})`);
  }
  console.log(`${species} (${id})`);
}
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('All sprites present.');
