import type { Rng } from '../rng';
import type { Policy, SideView } from '../types';

const pick = <T>(options: T[], rng: Rng): T => options[Math.floor(rng() * options.length)]!;

/** Lists the legal choices in a request. */
export function legalChoices(request: SideView['request']): string[] {
  if (request.requestType === 'wait' || request.requestType === 'team') return [];
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
