// Vendors Pokémon Showdown's battle animations: the move animations
// (battle-animations-moves.ts, CC0), and the effect table plus the shared
// "other" and status animations from battle-animations.ts (MIT), at the pinned
// client commit. Only moves that exist through Gen 5 are kept (plus whatever
// they build on), so the lazy chunk stays small. The output goes to
// src/battle/anim/vendor/ with the license notes intact and is committed.
//   pnpm --filter web anims [--force]
import { Dex } from '@pkmn/sim';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMIT = '0de26d2ef7258e5619057f63b3774240b45cecbd';
const RAW = `https://raw.githubusercontent.com/smogon/pokemon-showdown-client/${COMMIT}/play.pokemonshowdown.com/src`;

const out = fileURLToPath(new URL('../src/battle/anim/vendor/', import.meta.url));
mkdirSync(out, { recursive: true });
if (!process.argv.includes('--force') && existsSync(out + 'moves.ts')) {
  console.log('anims: already vendored (use --force to refresh)');
  process.exit(0);
}

const get = async (file: string) => {
  const res = await fetch(`${RAW}/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.text()).replace(/\r\n/g, '\n');
};
const lines = (s: string) => s.split('\n');
/** The 1-based line range [from, to] of `s`, inclusive. */
const slice = (s: string[], from: number, to: number) => s.slice(from - 1, to).join('\n');
const findLine = (s: string[], re: RegExp, after = 0) => {
  const i = s.findIndex((l, n) => n >= after && re.test(l));
  if (i < 0) throw new Error(`no line matching ${re}`);
  return i;
};

const NOTE = (
  file: string,
  license: string,
) => `// Vendored from Pokémon Showdown's client, ${file} at ${COMMIT.slice(0, 7)}
// (see scripts/anims.ts). License: ${license}.
// @ts-nocheck
/* eslint-disable */
`;

const FX_NOTE = `/*
Most of this file is: CC0 (public domain)
  <http://creativecommons.org/publicdomain/zero/1.0/>

This license DOES extend to all images in the fx/ folder, with the exception of icicle.png, lightning.png, and bone.png.

icicle.png and lightning.png by Clint Bellanger are triple-licensed GPLv2/GPLv3/CC-BY-SA-3.0.
  <http://opengameart.org/content/icicle-spell>
  <http://opengameart.org/content/lightning-shock-spell>

rocks.png, rock1.png, rock2.png by PO user "Gilad" is licensed GPLv3.
*/
`;

// battle-animations.ts: the effect table, and the other and status animations.
const scene = lines(await get('battle-animations.ts'));
const effStart = findLine(scene, /^const BattleEffects:/);
const effEnd = findLine(scene, /^};/, effStart);
const otherStart = findLine(scene, /^export const BattleOtherAnims/);
const otherEnd = scene.length;

writeFileSync(
  out + 'effects.ts',
  `${NOTE('battle-animations.ts', 'MIT')}${FX_NOTE}
import type { SpriteData } from './types';

export ${slice(scene, effStart + 1, effEnd + 1)}
`,
);
writeFileSync(
  out + 'other.ts',
  `${NOTE('battle-animations.ts', 'MIT')}${FX_NOTE}
import type { AnimTable } from './types';

${slice(scene, otherStart + 1, otherEnd)}
`,
);

// battle-animations-moves.ts: keep the moves that exist in Gen 5 or earlier.
const moves = lines(await get('battle-animations-moves.ts'));
const tableStart = findLine(moves, /^export const BattleMoveAnims/);
const tableEnd = findLine(moves, /^};/, tableStart);
const entries = new Map<string, string>();
for (let i = tableStart + 1; i < tableEnd;) {
  const m = /^\t([a-z0-9]+): \{(?: \/\/.*)?$/.exec(moves[i]!);
  if (!m) {
    if (moves[i]!.trim() && !moves[i]!.trim().startsWith('//'))
      throw new Error(`unexpected line ${i + 1}: ${moves[i]}`);
    i++;
    continue;
  }
  const end = findLine(moves, /^\t\},?(?: \/\/.*)?$/, i);
  entries.set(m[1]!, slice(moves, i + 1, end + 1));
  i = end + 1;
}
const aliases = new Map<string, string>();
for (const l of moves.slice(tableEnd + 1)) {
  const m = /^BattleMoveAnims\['([a-z0-9]+)'\] = /.exec(l);
  if (m) aliases.set(m[1]!, l);
}
console.log(`anims: ${entries.size} entries, ${aliases.size} aliases in the source`);

const gen5 = Dex.mod('gen5');
const wanted = new Set(
  gen5.moves
    .all()
    .filter((mv) => mv.gen <= 5)
    .map((mv) => mv.id as string),
);
const keep = new Set<string>();
const need = (id: string) => {
  if (keep.has(id)) return;
  keep.add(id);
  const body = entries.get(id) ?? aliases.get(id) ?? '';
  for (const m of body.matchAll(/BattleMoveAnims(?:\['([a-z0-9]+)'\]|\.([a-z0-9]+))/g))
    need(m[1] ?? m[2]!);
};
for (const id of wanted) if (entries.has(id) || aliases.has(id)) need(id);
// The fallback for moves without an animation of their own.
need('tackle');

const keptEntries = [...entries].filter(([id]) => keep.has(id)).map(([, body]) => body);
const keptAliases = [...aliases].filter(([id]) => keep.has(id)).map(([, l]) => l);
console.log(`anims: keeping ${keptEntries.length} entries, ${keptAliases.length} aliases`);
const missing = [...wanted].filter((id) => !keep.has(id));
console.log(
  `anims: ${missing.length} Gen 1–5 moves use the fallback (e.g. ${missing.slice(0, 8).join(', ')})`,
);

writeFileSync(
  out + 'moves.ts',
  `${NOTE('battle-animations-moves.ts', 'CC0-1.0')}
/**
 * Pokemon Showdown Move Animations
 *
 * @author Guangcong Luo <guangcongluo@gmail.com>
 * @license CC0-1.0
 */

import type { AnimTable } from './types';
import { BattleOtherAnims } from './other';
import { Config } from './config';

export const BattleMoveAnims: AnimTable = {
${keptEntries.join('\n')}
};
${keptAliases.join('\n')}
`,
);
console.log('anims: written to', out);
