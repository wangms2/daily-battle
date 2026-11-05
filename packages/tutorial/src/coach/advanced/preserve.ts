// The advanced coach's preserve / sacrifice tips (plan: concept 2): our active
// Pokémon is likely to faint if it stays in; a counterfactual search (it's
// already gone) says whether we need it.
//   Preserve: "Don't trade Gengar here: you'll need it later. Switching out keeps it."
//   Sacrifice: "It's fine to let Blissey go: you don't need it against what's left."
import type { NetWorld } from '@daily-battle/engine-wasm';
import type { BranchWorld } from '../facts/branches';
import { faintWorld } from '../facts/counterfactual';
import { choiceValues } from './risk';
import { bestScore } from './wincon';

export interface PreserveOptions {
  /** Our active faints this turn with at least this chance if it attacks. */
  danger: number;
  /**
   * Offer preserve tips at all. Off: on the risk1 holdout the oracle contradicted ~22%
   * at every gate tried (owner, Nov 4: sacrifice only).
   */
  preserve: boolean;
  /** Preserve: losing it costs at least this. */
  need: number;
  /** Sacrifice: losing it costs at most this. */
  spare: number;
  /** The advice leads the other way (switch vs attack) by at least this: preserve, sacrifice. */
  keepLead: number;
  lead: number;
  /** Counterfactuals use the likeliest worlds, up to this many. */
  worlds: number;
}

export const PRESERVE_DEFAULTS: PreserveOptions = {
  danger: 0.5,
  preserve: false,
  need: 0.15,
  spare: 0.05,
  keepLead: 0.15,
  lead: 0.05,
  worlds: 2,
};

export interface PreserveTip {
  kind: 'preserve' | 'sacrifice';
  /** The advice (the judge's top choice) and the best play the other way. */
  choice: string;
  contrast: string;
  /** Our active (species id). */
  mon: string;
  /** Its chance to faint this turn if it attacks with its best move. */
  danger: number;
  /** Win chances now and with it already gone. */
  values: { now: number; without: number };
}

/** Our active's chance to faint this turn after `choice`, over the foe's reply mix and the worlds. */
export function faintChance(worlds: readonly BranchWorld[], choice: string): number {
  let sum = 0;
  let total = 0;
  for (const w of worlds) {
    const slot = w.slots.indexOf(choice);
    const replies = new Map(w.result.replies.map((r) => [r.slot, r.p]));
    for (const o of w.result.outcomes) {
      if (o.own !== slot) continue;
      const p = w.weight * (replies.get(o.foe) ?? 0) * o.p;
      sum += p * (o.ownKo >= 1 ? 1 : 0);
      total += p;
    }
  }
  return total ? sum / total : 0;
}

/** A preserve or sacrifice tip, if one passes its gates; `damaging` says whether a choice is an attack. */
export function preserveTip(
  worlds: readonly BranchWorld[],
  legal: readonly string[],
  top: string,
  value: (w: NetWorld) => number,
  damaging: (choice: string) => boolean,
  options: Partial<PreserveOptions> = {},
): PreserveTip | undefined {
  const o = { ...PRESERVE_DEFAULTS, ...options };
  const values = choiceValues(worlds, legal);
  const by = (cs: string[]) => cs.sort((a, b) => (values[b] ?? -1) - (values[a] ?? -1))[0];
  const attack = by(legal.filter((c) => damaging(c) && Number.isFinite(values[c])));
  const swap = by(legal.filter((c) => c.startsWith('switch ') && Number.isFinite(values[c])));
  if (!attack || !swap) return undefined;
  const kind = top === swap ? 'preserve' : damaging(top) ? 'sacrifice' : undefined;
  if (!kind || (kind === 'preserve' && !o.preserve)) return undefined;
  const contrast = kind === 'preserve' ? attack : swap;
  if (!(values[top]! - values[contrast]! >= (kind === 'preserve' ? o.keepLead : o.lead)))
    return undefined;
  const danger = faintChance(worlds, attack);
  if (danger < o.danger) return undefined;
  const ws = [...worlds]
    .filter((w) => w.world)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, o.worlds);
  if (!ws.length) return undefined;
  const total = ws.reduce((a, w) => a + w.weight, 0);
  const mean = (f: (w: BranchWorld) => number) =>
    ws.reduce((a, w) => a + w.weight * f(w), 0) / total;
  const side = ws[0]!.world!.state.split('/')[0]!.split('=');
  const active = Number(side[6]);
  const now = mean((w) => bestScore(w.result));
  const without = mean((w) => {
    const gone = faintWorld(w.world!, 0, active);
    return !gone ? NaN : gone.over ? 0 : value(gone.world);
  });
  if (!Number.isFinite(without)) return undefined;
  const cost = now - without;
  if (kind === 'preserve' ? cost < o.need : cost > o.spare) return undefined;
  return {
    kind,
    choice: top,
    contrast,
    mon: side[active]!.split(',')[0]!.toLowerCase(),
    danger,
    values: { now, without },
  };
}

/** A preserve or sacrifice tip's text; `variant` picks the wording. Plays may be phrases. */
export function preserveText(
  kind: PreserveTip['kind'],
  n: { mon: string; choice: string; contrast: string },
  variant: number,
): string {
  const cap = (t: string) =>
    t.replace(/(^|\. )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return cap(preserveWords(kind, n, variant));
}

function preserveWords(
  kind: PreserveTip['kind'],
  n: { mon: string; choice: string; contrast: string },
  variant: number,
): string {
  const v = Math.abs(Math.trunc(variant)) % 2;
  if (kind === 'preserve')
    return v
      ? `Don’t trade ${n.mon} here: it’s likely to go down if it stays in, and you’ll need it later.`
      : `${n.mon} is too valuable to lose now. ${n.choice} keeps it safe for later.`;
  return v
    ? `It’s fine to let ${n.mon} go: you don’t need it against what’s left, so get damage in with ${n.choice}.`
    : `${n.mon} will likely go down, but that’s OK: it isn’t needed for the rest of the battle. ${n.choice} makes the most of it.`;
}
