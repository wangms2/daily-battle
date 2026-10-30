// Varied set pools for the value network's training data (tools/net): the
// same species as the real pool, with some moves, items and abilities swapped
// for other legal ones. The net trains on these so it reads a Pokémon by what
// its set does rather than memorizing today's sets, and keeps working as the
// game's pools change. Teams and the AI's beliefs both use the varied pool,
// as they would with a future pool.
// An offline data script, not a policy: it only reads the dex's learnsets.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { Dex, toID } from '@pkmn/sim';
import type { SetEntry, SetsFile } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { engineId, engineMove } from '../src/hard/names';

const MOVE_SWAP = 0.6;
const SECOND_MOVE_SWAP = 0.3;
const ITEM_SWAP = 0.3;
const ABILITY_SWAP = 0.2;

interface Options {
  moves: Map<string, string[]>;
  items: string[];
  abilities: Map<string, string[]>;
}

const cache = new Map<string, Options>();

/** Candidate moves, items and abilities per species, legal in the gen and known to the engine. */
function optionsFor(sets: SetsFile, gen: number, engine: Engine): Options {
  const key = `${sets.meta.format}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const dex = Dex.forGen(gen);
  const known = (kind: string, names: string[], id: (n: string) => string) => {
    const bad = new Set(engine.unknown(names.map((n) => `${kind} ${id(n)}`)));
    return names.filter((n) => !bad.has(`${kind} ${id(n)}`));
  };
  const items = new Set<string>();
  for (const sp of Object.values(sets.species))
    for (const s of sp.sets) if (s.item && !dex.items.get(s.item).megaStone) items.add(s.item);
  const moves = new Map<string, string[]>();
  const abilities = new Map<string, string[]>();
  for (const name of Object.keys(sets.species)) {
    const species = dex.species.get(name);
    const learnset =
      (
        dex.species as unknown as {
          getLearnsetData(id: string): { learnset?: Record<string, string[]> };
        }
      ).getLearnsetData(species.id).learnset ?? {};
    const legal = Object.entries(learnset)
      .filter(([, sources]) => sources.some((s) => Number(s[0]) <= gen))
      .map(([id]) => dex.moves.get(id))
      .filter(
        (m) => m.exists && !m.isNonstandard && m.gen <= gen && !m.id.startsWith('hiddenpower'),
      )
      .map((m) => m.name);
    moves.set(
      name,
      known('move', legal, (n) => engineMove(n, gen)),
    );
    const abil = Object.entries(species.abilities)
      .filter(([slot]) => slot !== 'H' || gen >= 5)
      .map(([, a]) => a as string)
      .filter((a) => dex.abilities.get(a).exists);
    abilities.set(name, known('ability', abil, engineId));
  }
  const out = { moves, items: known('item', [...items], engineId), abilities };
  cache.set(key, out);
  return out;
}

const pick = <T>(list: readonly T[], rng: () => number): T | undefined =>
  list.length ? list[Math.floor(rng() * list.length)] : undefined;

function varySet(
  set: SetEntry,
  species: string,
  others: SetEntry[],
  o: Options,
  dex: ReturnType<typeof Dex.forGen>,
  rng: () => number,
): SetEntry {
  const moves = [...set.moves];
  const swaps = rng() < MOVE_SWAP ? (rng() < SECOND_MOVE_SWAP ? 2 : 1) : 0;
  for (let k = 0; k < swaps; k++) {
    // Half from the species' other pool sets, half from its whole learnset.
    const fromPool = others.flatMap((s) => s.moves);
    const source = rng() < 0.5 && fromPool.length ? fromPool : (o.moves.get(species) ?? []);
    const has = new Set(moves.map(toID));
    const candidates = source.filter((m) => !has.has(toID(m)));
    const next = pick(candidates, rng);
    if (next) moves[Math.floor(rng() * moves.length)] = next;
  }
  let item = set.item;
  if (!dex.items.get(item).megaStone && rng() < ITEM_SWAP) item = pick(o.items, rng) ?? item;
  let ability = set.ability;
  if (rng() < ABILITY_SWAP) ability = pick(o.abilities.get(species) ?? [], rng) ?? ability;
  return { ...set, id: `${set.id}~varied`, moves, item, ability };
}

/** A copy of `sets` with each set varied at random (same species, same weights). */
export function varyPool(sets: SetsFile, gen: number, engine: Engine, rng: () => number): SetsFile {
  const o = optionsFor(sets, gen, engine);
  const dex = Dex.forGen(gen);
  const species = Object.fromEntries(
    Object.entries(sets.species).map(([name, entry]) => [
      name,
      {
        ...entry,
        sets: entry.sets.map((s) =>
          varySet(
            s,
            name,
            entry.sets.filter((x) => x !== s),
            o,
            dex,
            rng,
          ),
        ),
      },
    ]),
  );
  return { ...sets, species };
}
