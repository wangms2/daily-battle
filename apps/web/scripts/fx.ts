// Downloads the battle effects the client ships: Gen 4 and Gen 5 backgrounds, hazard
// sprites, weather overlays, and the Poké Ball team mark, from Pokémon
// Showdown's fx/ folder at a pinned commit. Showdown dedicates the fx/ images
// to the public domain (CC0; see the header of src/battle-animations.ts),
// except icicle.png, lightning.png, and bone.png, which we don't use. Files
// are committed and self-hosted; nothing is hotlinked.
//   pnpm --filter web fx [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BACKGROUNDS } from '../src/lib/backgrounds';

const COMMIT = '0de26d2ef7258e5619057f63b3774240b45cecbd';
const RAW = `https://raw.githubusercontent.com/smogon/pokemon-showdown-client/${COMMIT}/play.pokemonshowdown.com/fx`;
const FX_FILES = [
  ...Object.values(BACKGROUNDS).flat(),
  'rock1.png',
  'rock2.png',
  'caltrop.png',
  'poisoncaltrop.png',
  'pokeball.png',
  'weather-sandstorm.png',
  'weather-raindance.jpg',
  'weather-sunnyday.jpg',
  'weather-hail.png',
];

const force = process.argv.includes('--force');
const out = fileURLToPath(new URL('../public/fx/', import.meta.url));
mkdirSync(out, { recursive: true });
for (const file of FX_FILES) {
  if (!force && existsSync(out + file)) continue;
  const res = await fetch(`${RAW}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  writeFileSync(out + file, Buffer.from(await res.arrayBuffer()));
  console.log('fx', file);
}
