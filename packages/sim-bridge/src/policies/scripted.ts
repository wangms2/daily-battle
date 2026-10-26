// A foe that follows a script, for tutorial mini-battles: the lesson's point
// always happens. Steps name moves and Pokémon ("move Earthquake", "switch
// Skarmory") or use indices ("move 2"); each is resolved against the request.
import type { Rng } from '../rng';
import type { Policy, SideView } from '../types';
import { legalChoices } from './random';

export interface Script {
  /** Used in order on move turns (a turn's move or a voluntary switch). */
  moves?: readonly string[];
  /** Used in order when a faint forces a switch. */
  switches?: readonly string[];
  /** Decides when the script runs out or a step isn't legal (default: the first legal choice). */
  fallback?: Policy;
}

const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/** The legal choice a script step means here, if any. */
export function resolveStep(step: string, request: SideView['request']): string | undefined {
  const legal = legalChoices(request);
  if (legal.includes(step)) return step;
  if (request.requestType === 'wait' || request.requestType === 'team') return undefined;
  const [kind, ...rest] = step.split(' ');
  const name = toId(rest.join(' '));
  let choice: string | undefined;
  if (kind === 'move' && request.requestType === 'move') {
    // Requests give some moves' power or type in the id: return102, hiddenpowerfire60.
    const base = (id: string) => toId(id).replace(/\d+$/, '');
    const i = request.active[0]?.moves.findIndex(
      (m) =>
        base(m.id) === name ||
        toId(m.name) === name ||
        (name === 'hiddenpower' && base(m.id).startsWith(name)),
    );
    if (i !== undefined && i >= 0) choice = `move ${i + 1}`;
  } else if (kind === 'switch') {
    const i = request.side.pokemon.findIndex(
      (p) => toId(p.speciesForme) === name || toId(p.name) === name,
    );
    if (i >= 0) choice = `switch ${i + 1}`;
  }
  return choice && legal.includes(choice) ? choice : undefined;
}

export class ScriptedPolicy implements Policy {
  private move = 0;
  private switch = 0;
  /** Steps that couldn't be played (for content tests). */
  readonly skipped: string[] = [];

  constructor(private readonly script: Script) {}

  choose(view: SideView, rng: Rng): string {
    const forced = view.request.requestType === 'switch';
    const queue = forced ? this.script.switches : this.script.moves;
    const step = queue?.[forced ? this.switch++ : this.move++];
    if (step !== undefined) {
      const choice = resolveStep(step, view.request);
      if (choice) return choice;
      this.skipped.push(step);
    }
    if (this.script.fallback) return this.script.fallback.choose(view, rng);
    return legalChoices(view.request)[0] ?? 'default';
  }
}
