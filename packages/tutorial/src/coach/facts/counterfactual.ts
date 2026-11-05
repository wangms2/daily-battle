// Counterfactual worlds for the advanced coach: the same battle with some
// Pokémon gone, for "once X is down…" (win conditions) and "is Y needed?"
// (preserve or sacrifice). An edit of poke-engine's state string
// (State::serialize: sides by '/', a side's fields by '=', the first six its
// Pokémon, a Pokémon's fields by ',').
import type { NetWorld } from '@daily-battle/engine-wasm';

const HP = 6;
const ACTIVE = 6;
const FORCE_SWITCH = 22;

export interface Fainted {
  state: string;
  /** An active Pokémon went, so its side must choose a replacement. */
  active: boolean;
  /** The side has nothing left: the battle is over. */
  over: boolean;
}

/**
 * The world `state` with `slots` of `side` (0: ours, 1: the foe's) fainted.
 * Undefined if none of them is still standing.
 */
export function faint(
  state: string,
  side: 0 | 1,
  slots: number | readonly number[],
): Fainted | undefined {
  const sides = state.split('/');
  const fields = sides[side]!.split('=');
  if (fields[FORCE_SWITCH] !== 'true' && fields[FORCE_SWITCH] !== 'false')
    throw new Error(`faint: unexpected state layout (force_switch "${fields[FORCE_SWITCH]}")`);
  const mons = fields.slice(0, 6).map((m) => m.split(','));
  let changed = false;
  for (const s of typeof slots === 'number' ? [slots] : slots) {
    const mon = mons[s];
    if (!mon || Number(mon[HP]) <= 0) continue;
    mon[HP] = '0';
    changed = true;
  }
  if (!changed) return undefined;
  const active = Number(mons[Number(fields[ACTIVE])]![HP]) <= 0;
  const over = mons.every((m) => Number(m[HP]) <= 0);
  for (let i = 0; i < 6; i++) fields[i] = mons[i]!.join(',');
  if (active && !over) fields[FORCE_SWITCH] = 'true';
  sides[side] = fields.join('=');
  return { state: sides.join('/'), active, over };
}

/**
 * A searchable world with `slots` of `side` fainted. A fainted foe Pokémon is
 * marked seen: the network only reads the foe Pokémon it has seen.
 */
export function faintWorld<W extends NetWorld>(
  world: W,
  side: 0 | 1,
  slots: number | readonly number[],
): (Omit<Fainted, 'state'> & { world: W }) | undefined {
  const out = faint(world.state, side, slots);
  if (!out) return undefined;
  const gone = typeof slots === 'number' ? [slots] : slots;
  const known =
    side === 1
      ? world.known.map((k, i) => (gone.includes(i) ? { ...k, seen: true } : k))
      : world.known;
  return { active: out.active, over: out.over, world: { ...world, state: out.state, known } };
}
