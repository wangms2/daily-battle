// Downloads the sprites the client ships (DESIGN.md §12.3a): animated
// Showdown-style front and back GIFs plus a box icon for every species in
// every format's set data (one shared folder: a species looks the same in each),
// plus front and back art for every Mega forme (Gen 6 on). These are Showdown's
// animated 3D sprites (its `ani` and `ani-back` folders, as mirrored by PokeAPI),
// the X/Y models. Files are committed and self-hosted; nothing is hotlinked.
// Also writes a still first frame of each front and back GIF for when
// animations are off. Gen 3 battles use the games' own Emerald sprites
// (PokeAPI's `generation-iii/emerald`), still PNGs, in `gen3/front` and
// `gen3/back`; box icons stay shared.
//   pnpm --filter web sprites [--force]
// CHROMIUM_PATH points the still-frame step at a browser other than Playwright's own.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import { speciesDataFor } from '@daily-battle/data/species';
import { chromium } from '@playwright/test';
import { pokeapiId } from './pokeapi';

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
/** The Gen 3 games' sprites, for Gen 3 battles. */
const GEN3 = {
  front: (id: number) => [`${RAW}/versions/generation-iii/emerald/${id}.png`],
  back: (id: number) => [`${RAW}/versions/generation-iii/emerald/back/${id}.png`],
};
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
const gen3Species = [
  ...new Set(
    Object.values(FORMATS)
      .filter((f) => f.gen === 3)
      .flatMap((f) => Object.keys(setsFor(f.id).species)),
  ),
];
for (const kind of ['front', 'back'] as const) {
  mkdirSync(out(`gen3/${kind}`), { recursive: true });
  for (const species of gen3Species) {
    const file = `${out(`gen3/${kind}`)}${toId(species)}.png`;
    if (!force && existsSync(file)) continue;
    if (!(await download(GEN3[kind](await pokeapiId(species)), file))) {
      missing.push(`${species} Gen 3 ${kind}`);
    }
  }
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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
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
