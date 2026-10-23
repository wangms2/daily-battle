import type { Rng } from '../rng';
import type { Policy, SideView } from '../types';

const pick = <T>(options: T[], rng: Rng): T => options[Math.floor(rng() * options.length)]!;

/**
 * Team Preview (Gen 5 on): `team N…` leads with Pokémon N and keeps the rest in
 * their original order, e.g. `team 312456`.
 */
export function leadChoice(slot: number, size: number): string {
  const rest = Array.from({ length: size }, (_, i) => i + 1).filter((n) => n !== slot);
  return `team ${[slot, ...rest].join('')}`;
}

/** Lists the legal choices in a request; at Team Preview, one per possible lead. */
export function legalChoices(request: SideView['request']): string[] {
  if (request.requestType === 'wait') return [];
  if (request.requestType === 'team') {
    const size = request.side.pokemon.length;
    return request.side.pokemon.map((_, i) => leadChoice(i + 1, size));
  }
  const switches = request.side.pokemon.flatMap((p, i) =>
    !p.active && !p.condition.endsWith(' fnt') ? [`switch ${i + 1}`] : [],
  );
  if (request.requestType === 'switch') return switches;

  const active = request.active[0];
  if (!active) return [];
  const moves = active.moves.flatMap((m, i) =>
    ('disabled' in m && m.disabled) || ('pp' in m && m.pp <= 0) ? [] : [`move ${i + 1}`],
  );
  return active.trapped || active.maybeTrapped ? moves : [...moves, ...switches];
}

/** Picks uniformly among legal choices. The baseline policy for the harness. */
export class RandomPolicy implements Policy {
  choose({ request }: SideView, rng: Rng): string {
    const options = legalChoices(request);
    return options.length ? pick(options, rng) : 'default';
  }
}
