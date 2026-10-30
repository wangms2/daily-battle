/**
 * Turns selfplay records (JSON lines from scripts/selfplay.ts) into flat
 * arrays for training the value network in tools/net. Features come from the
 * engine's own `features` export, the same code the WASM runs at play time.
 *
 *   npx tsx scripts/featurize.ts --out <dir> <files or dirs...>
 *
 * Writes to <dir>:
 * - x.bin: float16, FLOATS per row (the features);
 * - ids.bin: uint16, TOKENS * IDS per row (embedding ids);
 * - y.bin: float32, Y per row (targets, layout in meta.json);
 * - meta.json: the layout, row and battle counts, and each gen's id → name tables.
 */
import {
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { createReadStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setsFor } from '@daily-battle/data';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import type { Engine, FeaturesMeta } from '@daily-battle/engine-wasm';
import type { DecisionRecord } from '../src/index';
import { engineId, engineMove } from '../src/hard/names';

/** Option slots: moves 0–3, mega moves 4–7, switches to team slot 0–5 at 8–13. */
const SLOTS = 14;
const Y_LAYOUT = {
  policy: 0,
  mask: SLOTS,
  foePolicy: 2 * SLOTS,
  foeMask: 3 * SLOTS,
  value: 4 * SLOTS,
  turn: 4 * SLOTS + 1,
  /** The battle's split group (its matchup): train/validation split by this. */
  battle: 4 * SLOTS + 2,
  pick: 4 * SLOTS + 3,
  /** Per foe team slot in the state: the index of its set in the species' pool, or -1. */
  foeSets: 4 * SLOTS + 4,
  /** Per foe slot: its true item and ability embedding ids, or -1. */
  foeItems: 4 * SLOTS + 10,
  foeAbilities: 4 * SLOTS + 16,
  /** Per foe slot, 4 move embedding ids (unordered), or -1. */
  foeMoves: 4 * SLOTS + 22,
  /** 1 if the battle used a varied set pool (see vary.ts). */
  varied: 4 * SLOTS + 46,
} as const;
const Y = Y_LAYOUT.varied + 1;

interface Slot {
  species: string;
  set: number;
  moves: string[];
  item: string;
  ability: string;
}

interface Battle {
  format: string;
  gen: number;
  i: number;
  swap: boolean;
  varied?: boolean;
  players: { p1: string; p2: string };
  winner: 'p1' | 'p2' | null;
  turns: number;
  teams: Record<'p1' | 'p2', Slot[]>;
  decisions: (DecisionRecord & { side: 'p1' | 'p2' })[];
}

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
if (outAt < 0 || !args[outAt + 1]) throw new Error('usage: featurize --out <dir> <files...>');
const OUT = resolve(args[outAt + 1]!);
const inputs = args.filter((_, k) => k !== outAt && k !== outAt + 1);

const files = inputs.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p)
        .filter((f) => f.endsWith('.jsonl'))
        .sort()
        .map((f) => join(p, f))
    : [p],
);

export function slotOf(key: string): number {
  const [kind, n] = key.split(':');
  const i = Number(n);
  if (kind === 'move' && i >= 0 && i < 4) return i;
  if (kind === 'mega' && i >= 0 && i < 4) return 4 + i;
  if (kind === 'switch' && i >= 0 && i < 6) return 8 + i;
  return -1;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The species of each Pokémon on side two of an engine state, in slot order. */
function foeSpecies(state: string): string[] {
  const side2 = state.split('/')[1] ?? '';
  return side2
    .split('=')
    .slice(0, 6)
    .map((p) => norm(p.split(',')[0] ?? ''));
}

const engines = new Map<number, Engine>();
const metas = new Map<number, FeaturesMeta>();
/** Per gen, engine name → embedding id for items, abilities and moves. */
const idMaps = new Map<
  number,
  { items: Map<string, number>; abilities: Map<string, number>; moves: Map<string, number> }
>();
function engineFor(gen: number): Engine {
  let e = engines.get(gen);
  if (!e) {
    e = loadEngine(gen as 3 | 4 | 5 | 6);
    engines.set(gen, e);
    const m = e.featuresMeta();
    metas.set(gen, m);
    const index = (names: string[], offset: number) =>
      new Map(names.flatMap((n, k) => (n ? [[n, k + offset] as [string, number]] : [])));
    idMaps.set(gen, {
      items: index(m.names.items, m.names.itemOffset),
      abilities: index(m.names.abilities, m.names.abilityOffset),
      moves: index(m.names.moves, 0),
    });
  }
  return e;
}

mkdirSync(OUT, { recursive: true });
const fx = openSync(join(OUT, 'x.bin'), 'w');
const fids = openSync(join(OUT, 'ids.bin'), 'w');
const fy = openSync(join(OUT, 'y.bin'), 'w');

let rows = 0;
let battles = 0;
let skipped = 0;
const groups = new Map<string, number>();
let setsKnown = 0;
let setsTotal = 0;
let attrTotal = 0;
const attrMissing = new Set<string>();
const byGen: Record<number, number> = {};

for (const file of files) {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const b = JSON.parse(line) as Battle;
    const engine = engineFor(b.gen);
    const meta = metas.get(b.gen)!;
    const pool = setsFor(b.format as Parameters<typeof setsFor>[0]);
    battles++;
    // Split groups: both sides of a matchup (and its opponent team, set by the day) stay together.
    const key = `${b.format}:${b.i}`;
    if (!groups.has(key)) groups.set(key, groups.size);
    const battle = groups.get(key)!;
    for (const d of b.decisions) {
      let f: ReturnType<Engine['features']>;
      try {
        f = engine.features(d.state);
      } catch {
        skipped++;
        continue;
      }
      const y = new Float32Array(Y);
      for (const { c, p } of d.s1) {
        const s = slotOf(c);
        if (s < 0) continue;
        y[Y_LAYOUT.policy + s] = y[Y_LAYOUT.policy + s]! + p;
        y[Y_LAYOUT.mask + s] = 1;
      }
      for (const { c, p } of d.s2) {
        const s = slotOf(c);
        if (s < 0) continue;
        y[Y_LAYOUT.foePolicy + s] = y[Y_LAYOUT.foePolicy + s]! + p;
        y[Y_LAYOUT.foeMask + s] = 1;
      }
      y[Y_LAYOUT.value] = b.winner === null ? 0.5 : b.winner === d.side ? 1 : 0;
      y[Y_LAYOUT.turn] = d.turn;
      y[Y_LAYOUT.battle] = battle;
      y[Y_LAYOUT.pick] = d.pickKey ? slotOf(d.pickKey) : -1;
      const foeTeam = b.teams[d.side === 'p1' ? 'p2' : 'p1'];
      const ids = idMaps.get(b.gen)!;
      y.fill(-1, Y_LAYOUT.foeItems, Y_LAYOUT.varied);
      y[Y_LAYOUT.varied] = b.varied ? 1 : 0;
      foeSpecies(d.state).forEach((sp, k) => {
        // Prefix match so a Mega Evolved Pokémon still finds its base species.
        const slot = sp ? foeTeam.find((t) => sp.startsWith(norm(t.species))) : undefined;
        const ok = slot && pool.species[slot.species] ? slot.set : -1;
        y[Y_LAYOUT.foeSets + k] = ok;
        if (sp) {
          setsTotal++;
          if (ok >= 0) setsKnown++;
        }
        if (!slot?.moves) return;
        y[Y_LAYOUT.foeItems + k] = slot.item ? (ids.items.get(engineId(slot.item)) ?? -1) : -1;
        y[Y_LAYOUT.foeAbilities + k] = ids.abilities.get(engineId(slot.ability)) ?? -1;
        slot.moves.slice(0, 4).forEach((mv, j) => {
          const id = ids.moves.get(engineMove(mv, b.gen));
          y[Y_LAYOUT.foeMoves + 4 * k + j] = id ?? -1;
          attrTotal++;
          if (id === undefined) attrMissing.add(mv);
        });
      });
      if (f.floats.length !== meta.floats) throw new Error('feature size mismatch');
      writeSync(fx, new Uint8Array(new Float16Array(f.floats).buffer));
      writeSync(fids, new Uint8Array(f.ids.buffer, f.ids.byteOffset, f.ids.byteLength));
      writeSync(fy, new Uint8Array(y.buffer));
      rows++;
      byGen[b.gen] = (byGen[b.gen] ?? 0) + 1;
    }
  }
}
closeSync(fx);
closeSync(fids);
closeSync(fy);

const any = metas.values().next().value as FeaturesMeta | undefined;
if (!any) throw new Error('no battles found');
writeFileSync(
  join(OUT, 'meta.json'),
  JSON.stringify({
    rows,
    battles,
    byGen,
    floats: any.floats,
    tokens: any.tokens,
    ids: any.ids,
    monF: any.monF,
    fieldF: any.fieldF,
    featuresVersion: any.names.version,
    slots: SLOTS,
    y: Y,
    yLayout: Y_LAYOUT,
    names: Object.fromEntries([...metas].map(([g, m]) => [g, m.names])),
  }),
);
console.log(
  `${rows} rows from ${battles} battles (${skipped} skipped); by gen ${JSON.stringify(byGen)}; ` +
    `foe sets matched ${((100 * setsKnown) / Math.max(1, setsTotal)).toFixed(1)}%; ` +
    `move names unknown to the engine: ${attrMissing.size ? [...attrMissing].join(', ') : 'none'} (of ${attrTotal})`,
);
