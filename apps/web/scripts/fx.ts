// Downloads the battle effects the client ships: Gen 3 to 6 backgrounds, hazard
// sprites, weather and terrain overlays, the Poké Ball team mark, and every image the move
// animations draw with (the table in src/battle/anim/vendor/effects.ts), from
// Pokémon Showdown's fx/ folder at a pinned commit. Showdown dedicates the fx/
// images to the public domain (CC0; see the header of src/battle-animations.ts),
// except icicle.png and lightning.png (GPL/CC-BY-SA: credited in About), the
// rock images (GPLv3: credited in About), and bone.png, which has no license and
// isn't downloaded (the scene substitutes another effect). Files are committed
// and self-hosted; nothing is hotlinked.
//   pnpm --filter web fx [--force]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BACKGROUNDS } from '../src/lib/backgrounds';

const COMMIT = '0de26d2ef7258e5619057f63b3774240b45cecbd';
const RAW = `https://raw.githubusercontent.com/smogon/pokemon-showdown-client/${COMMIT}/play.pokemonshowdown.com/fx`;
/** Every image the vendored move animations use. */
const ANIM_FILES = [
  ...readFileSync(
    new URL('../src/battle/anim/vendor/effects.ts', import.meta.url),
    'utf8',
  ).matchAll(/url: '([^']+)'/g),
].map((m) => m[1]!);
const FX_FILES = [
  ...ANIM_FILES.filter((f) => f !== 'bone.png'),
  'bg-space.jpg',
  'weather-trickroom.png',
  'weather-psychicterrain.png',
  'weather-electricterrain.png',
  'weather-grassyterrain.png',
  'weather-mistyterrain.png',
  'web.png',
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
