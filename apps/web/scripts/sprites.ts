// Downloads the sprites the client ships (DESIGN.md §12.3a): animated
// Showdown-style front and back GIFs plus a box icon for every species in
// every format's set data (one shared folder: a species looks the same in each),
// plus front and back art for every Mega forme (Gen 6 on). These are Showdown's
// animated 3D sprites (its `ani` and `ani-back` folders, as mirrored by PokeAPI),
// the X/Y models. Files are committed and self-hosted; nothing is hotlinked.
// Also writes a still first frame of each front and back GIF for when
// animations are off.
//   pnpm --filter web sprites [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import { speciesDataFor } from '@daily-battle/data/species';
import { chromium } from '@playwright/test';

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
/** Where each animated kind's still first frames go. */
const STILL = { front: 'front-still', back: 'back-still' } as const;

/** Showdown's substitute doll, which stands in for a Pokémon behind a substitute. */
const SUBSTITUTE = {
  front: 'https://play.pokemonshowdown.com/sprites/ani/substitute.gif',
  back: 'https://play.pokemonshowdown.com/sprites/ani-back/substitute.gif',
};

const force = process.argv.includes('--force');
const out = (dir: string) => fileURLToPath(new URL(`../public/sprites/${dir}/`, import.meta.url));
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const slug = (s: string) => s.toLowerCase().replace(/[.']/g, '').replace(/\s+/g, '-');

const CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
let ids: Map<string, number> | undefined;

/** Identifier → id from one of PokeAPI's CSV tables (`id,identifier,...`). */
async function csvIds(table: string): Promise<[string, number][]> {
  const res = await fetch(`${CSV}/${table}.csv`);
  if (!res.ok) throw new Error(`Could not fetch PokeAPI ${table}.csv`);
  return (await res.text())
    .split('\n')
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [id, identifier] = line.split(',');
      return [identifier!, Number(id)];
    });
}

/**
 * PokeAPI pokemon id for a species name, e.g. Rotom-Wash → 10009. Species whose
 * default form has its own name (Thundurus → thundurus-incarnate) use the
 * species id, which is also its default form's id.
 */
async function pokeapiId(species: string): Promise<number> {
  if (!ids) {
    ids = new Map([...(await csvIds('pokemon_species')), ...(await csvIds('pokemon'))]);
  }
  const id = ids.get(slug(species));
  if (!id) throw new Error(`No PokeAPI entry for ${species}`);
  return id;
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
  'Substitute',
];
/** Mega formes need battle art only; the box icon is the base species'. */
const megas = [
  ...new Set(
    Object.keys(FORMATS).flatMap((f) =>
      Object.values(speciesDataFor(f).species).flatMap((s) =>
        Object.values(s.megas ?? {}).map((m) => m.forme),
      ),
    ),
  ),
];
for (const kind of ['front', 'back'] as const) {
  const file = `${out(kind)}substitute.gif`;
  if (!force && existsSync(file)) continue;
  if (!(await download([SUBSTITUTE[kind]], file))) missing.push(`Substitute ${kind}`);
}
for (const species of [...allSpecies.filter((s) => s !== 'Substitute'), ...megas]) {
  const kinds = (Object.keys(SOURCES) as (keyof typeof SOURCES)[]).filter(
    (k) =>
      !(k === 'icons' && megas.includes(species)) &&
      (force || !existsSync(`${out(k)}${toId(species)}.${EXT[k]}`)),
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

// Still versions (the first frame as a PNG) for when animations are off. A
// browser draws an animated GIF's first frame to a canvas right after it loads.
const stills = (Object.keys(STILL) as (keyof typeof STILL)[]).flatMap((kind) =>
  [...allSpecies, ...megas]
    .map((species) => ({ kind, id: toId(species) }))
    .filter(({ kind, id }) => force || !existsSync(`${out(STILL[kind])}${id}.png`)),
);
if (stills.length) {
  for (const dir of Object.values(STILL)) mkdirSync(out(dir), { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const { kind, id } of stills) {
    const gif = readFileSync(`${out(kind)}${id}.gif`).toString('base64');
    const png = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d')!.drawImage(img, 0, 0);
      return canvas.toDataURL('image/png').split(',')[1]!;
    }, `data:image/gif;base64,${gif}`);
    writeFileSync(`${out(STILL[kind])}${id}.png`, Buffer.from(png, 'base64'));
  }
  await browser.close();
  console.log(`Wrote ${stills.length} still sprites.`);
}
console.log('All sprites present.');
