// Downloads the Pokémon cries the client plays (DESIGN.md §21), from PokeAPI's
// cries repository, and converts them to small MP3s every browser plays. Gen 3
// to 5 use the game-era cries (`legacy`) where PokeAPI has one; Gen 6 and the
// Megas use the current ones (`latest`). Files are committed and self-hosted.
// The battle music isn't fetched: its four tracks were supplied as files and
// prepared once with the ffmpeg command in DESIGN.md §21.
//   pnpm --filter web audio [--force]
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import { speciesDataFor } from '@daily-battle/data/species';
import { pokeapiId } from './pokeapi';

const RAW = 'https://raw.githubusercontent.com/PokeAPI/cries/main/cries/pokemon';
const force = process.argv.includes('--force');
const out = (style: string) =>
  fileURLToPath(new URL(`../public/audio/cries/${style}/`, import.meta.url));
const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const formats = Object.values(FORMATS);
const speciesOf = (gens: (g: number) => boolean) => [
  ...new Set(formats.filter((f) => gens(f.gen)).flatMap((f) => Object.keys(setsFor(f.id).species))),
];
const megas = [
  ...new Set(
    formats.flatMap((f) =>
      Object.values(speciesDataFor(f.id).species).flatMap((s) =>
        Object.values(s.megas ?? {}).map((m) => m.forme),
      ),
    ),
  ),
];
/** The cries each style needs: game-era for Gen 3 to 5, current for Gen 6 and the Megas. */
const WANTED = {
  legacy: speciesOf((g) => g <= 5),
  latest: [...speciesOf((g) => g >= 6), ...megas],
};

const work = join(tmpdir(), 'daily-battle-cries');
mkdirSync(work, { recursive: true });
const missing: string[] = [];
let wrote = 0;
for (const [style, species] of Object.entries(WANTED)) {
  mkdirSync(out(style), { recursive: true });
  for (const name of species) {
    const file = `${out(style)}${toId(name)}.mp3`;
    if (!force && existsSync(file)) continue;
    const id = await pokeapiId(name);
    // A form without a game-era cry of its own (a Gen 4+ forme) falls back to the current one.
    const urls = [
      ...(style === 'legacy' ? [`${RAW}/legacy/${id}.ogg`] : []),
      `${RAW}/latest/${id}.ogg`,
    ];
    let ogg: Buffer | undefined;
    for (const url of urls) {
      const res = await fetch(url);
      if (res.ok) {
        ogg = Buffer.from(await res.arrayBuffer());
        break;
      }
    }
    if (!ogg) {
      missing.push(`${name} ${style} (id ${id})`);
      continue;
    }
    const src = join(work, `${id}.ogg`);
    writeFileSync(src, ogg);
    // Mono 64 kbps: a cry is a second or two, so each file is a few kilobytes.
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      src,
      '-map_metadata',
      '-1',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-b:a',
      '64k',
      file,
    ]);
    wrote++;
  }
}
rmSync(work, { recursive: true, force: true });
if (missing.length) {
  console.error(`Missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log(`Wrote ${wrote} cries; all present.`);
