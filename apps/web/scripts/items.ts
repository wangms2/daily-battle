// Downloads an icon for every item the sets hold, from PokeAPI/sprites (the
// same source as the Pokémon sprites), into public/items/. Files are committed
// and self-hosted; nothing is hotlinked. Items with no icon are listed, and the
// UI shows just their name.
//   pnpm --filter web items [--force]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor } from '@daily-battle/data';
import { itemSlug } from '../src/lib/items';

const RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';
const force = process.argv.includes('--force');
const out = fileURLToPath(new URL('../public/items/', import.meta.url));
mkdirSync(out, { recursive: true });

const items = new Set<string>();
for (const id of Object.keys(FORMATS))
  for (const entry of Object.values(setsFor(id).species))
    for (const set of entry.sets) if (set.item) items.add(set.item);

const missing: string[] = [];
for (const item of [...items].sort()) {
  const file = `${itemSlug(item)}.png`;
  if (!force && existsSync(out + file)) continue;
  const res = await fetch(`${RAW}/${file}`);
  if (!res.ok) {
    missing.push(`${item} (${file}: HTTP ${res.status})`);
    continue;
  }
  writeFileSync(out + file, Buffer.from(await res.arrayBuffer()));
  console.log('item', file);
}
console.log(`${items.size} items, ${missing.length} without an icon`);
for (const m of missing) console.log('  missing:', m);
