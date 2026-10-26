// poke-engine's root options ↔ Showdown choices. The AI's side is serialized
// in request order, so engine indices line up with the request's.
import type { SideView } from '@daily-battle/sim-bridge';
import { moveId } from '../state';

type Request = Exclude<SideView['request'], { requestType: 'wait' }>;

/**
 * The Showdown choice for an engine option (`move:I`, `mega:I`, `switch:I`),
 * or undefined if it has none. `move:I` is the active Pokémon's I-th move
 * slot; the request may list fewer moves (when locked in), so it's matched by id.
 */
export function toChoice(key: string, request: Request): string | undefined {
  const [kind, index] = key.split(':');
  const i = Number(index);
  if (!Number.isInteger(i)) return undefined;
  if (kind === 'switch') return `switch ${i + 1}`;
  if (kind !== 'move' && kind !== 'mega') return undefined;
  if (request.requestType !== 'move') return undefined;
  const active = request.side.pokemon.find((p) => p.active);
  const id = active?.moves[i];
  if (!id) return undefined;
  const slot = request.active[0]?.moves.findIndex((m) => moveId(m.id) === moveId(id)) ?? -1;
  if (slot < 0) return undefined;
  return `move ${slot + 1}${kind === 'mega' ? ' mega' : ''}`;
}
