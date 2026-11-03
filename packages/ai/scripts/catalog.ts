// The self-play env's team catalog (tools/net/env): every set in each
// format's pool as a fresh engine Pokémon, plus varied copies of the pool
// (vary.ts) so the network doesn't memorize today's sets. Today's pool also has
// each species' fun set, at the share Hard expects (playerSetPrior). One TSV per gen:
//   species  set  weight  varied  engine-pokemon
// Rerun whenever the pools change:
//   npx tsx scripts/catalog.ts [--out ../../tools/net/data/catalog] [--varied 3] [--seed catalog1]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FORMATS, playerSetPrior, setsFor, type SetsFile } from '@daily-battle/data';
import { rngFor } from '@daily-battle/gen';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import { genFor } from '../src/calc';
import { engineMonFromSet } from '../src/hard/translate';
import { engineId } from '../src/hard/names';
import { varyPool } from './vary';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = resolve(arg('out') ?? '../../tools/net/data/catalog');
/** Varied copies of each pool. */
const VARIED = Number(arg('varied') ?? 3);
const SEED = arg('seed') ?? 'catalog1';

mkdirSync(OUT, { recursive: true });
for (const [format, info] of Object.entries(FORMATS)) {
  const engine = loadEngine(info.gen);
  const lines: string[] = [];
  const add = (sets: SetsFile, varied: number) => {
    for (const [species, entry] of Object.entries(sets.species)) {
      // Today's pool includes the fun set, at the share Hard expects a player to bring it.
      (varied ? entry.sets : playerSetPrior(entry)).forEach((set, i) => {
        const mon = engineMonFromSet(species, set, format);
        lines.push([species, i, set.weight, varied, mon].join('\t'));
      });
    }
  };
  const base = setsFor(format);
  add(base, 0);
  for (let v = 1; v <= VARIED; v++) {
    add(varyPool(base, info.gen, engine, rngFor(`${SEED}:${format}:${v}`)), v);
  }
  // Every line must load in the engine.
  const bad = lines.filter((l) => {
    try {
      engine.roundtrip(stateOf(l.split('\t')[4]!));
      return false;
    } catch {
      return true;
    }
  });
  if (bad.length)
    throw new Error(`${format}: ${bad.length} sets the engine can't load, e.g. ${bad[0]}`);
  writeFileSync(join(OUT, `gen${info.gen}.tsv`), lines.join('\n') + '\n');
  // Public base stats per engine species id, for the foe's stats the viewer can know.
  const stats = [...genFor(format).species]
    .map((s) => [engineId(s.name), ...Object.values(s.baseStats)].join('\t'))
    .sort();
  writeFileSync(join(OUT, `gen${info.gen}-base.tsv`), [...new Set(stats)].join('\n') + '\n');
  console.log(`gen${info.gen} (${format}): ${lines.length} sets, ${stats.length} species`);
}

/** A minimal state with this Pokémon on both sides, to check it parses. */
function stateOf(mon: string): string {
  const side = [...Array(6).fill(mon), 0, Array(19).fill(0).join(';'), '', '0;0;0;0;0;0']
    .concat(Array(12).fill(0))
    .concat(['false', 'NONE', 'false', 'false', 'false', 'switch:0', 'false'])
    .join('=');
  return [side, side, 'NONE;0', 'NONE;0', 'false;0', 'false'].join('/');
}
