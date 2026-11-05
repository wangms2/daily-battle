// The advanced coach's hazards & pacing tips (plan: concept 4): the top choice
// is a slow play (setting hazards, or a stalling or status move) that clearly
// beats the best direct alternative (another option, or attacking).
//   Hazards: "Stealth Rock now: Charizard and Zapdos lose HP every time they
//   switch in." Pacing: "No rush: Recover is stronger than attacking here."
import type { BranchWorld } from '../facts/branches';
import { sureTargets, type HazardMove, type HazardTarget } from '../facts/hazards';
import { choiceValues } from './risk';

export const HAZARD_MOVES = new Set(['spikes', 'stealthrock', 'toxicspikes', 'stickyweb']);
/** Stalling and status moves: healing, a Substitute, and wearing the foe down. (Not Protect: the network overrates it; the oracle often disagreed.) */
export const PACING_MOVES = new Set([
  'recover',
  'roost',
  'softboiled',
  'milkdrink',
  'slackoff',
  'moonlight',
  'morningsun',
  'synthesis',
  'wish',
  'rest',
  'substitute',
  'toxic',
  'leechseed',
  'willowisp',
  'thunderwave',
  'stunspore',
  'glare',
  'healbell',
  'aromatherapy',
]);

export interface SlowOptions {
  /** Hazards: the hazard is the top choice by at least this (a good time, not a clear win). */
  hazardLead: number;
  /** …hitting at least this many of the foe's seen Pokémon… */
  targets: number;
  /** …each in this share of worlds (by weight). */
  factShare: number;
  /** Pacing: the slow play beats attacking by at least this… */
  pacingLead: number;
  /** …by at least `margin` in this share of worlds (by weight). */
  margin: number;
  worlds: number;
}

// Tuned offline (scripts/advanced-scan.ts on searchset v2): a hazard is rarely
// clearly best (near ties), so its tip says only that it's a good time.
export const SLOW_DEFAULTS: SlowOptions = {
  hazardLead: 0.02,
  targets: 2,
  factShare: 0.9,
  pacingLead: 0.15,
  margin: 0.05,
  worlds: 0.9,
};

export interface SlowTip {
  kind: 'hazard' | 'pacing';
  /** The slow play (the judge's top choice). */
  choice: string;
  /** The best direct option it beats. */
  contrast: string;
  values: { choice: number; contrast: number };
  /** Share of worlds (by weight) where it leads by the margin. */
  worlds: number;
  /** Hazards: the foe's seen Pokémon it hits. */
  targets?: HazardTarget[];
}

/** Share of worlds (by weight) where `a` leads `b` by `margin` (both searched). */
export function leadShare(worlds: readonly BranchWorld[], a: string, b: string, margin: number) {
  let total = 0;
  let ahead = 0;
  for (const w of worlds) {
    const i = w.slots.indexOf(a);
    const j = w.slots.indexOf(b);
    const va = i < 0 ? NaN : w.result.score[i]!;
    const vb = j < 0 ? NaN : w.result.score[j]!;
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    total += w.weight;
    if (va - vb >= margin) ahead += w.weight;
  }
  return total ? ahead / total : 0;
}

/**
 * A hazards or pacing tip, if one passes its gates. `moveId` gives a move
 * choice's move id (undefined: not a move); `damaging` whether it deals damage.
 */
export function slowTip(
  worlds: readonly BranchWorld[],
  legal: readonly string[],
  top: string,
  moveId: (choice: string) => string | undefined,
  damaging: (choice: string) => boolean,
  gen: number,
  options: Partial<SlowOptions> = {},
): SlowTip | undefined {
  const o = { ...SLOW_DEFAULTS, ...options };
  const id = moveId(top);
  const kind = !id
    ? undefined
    : HAZARD_MOVES.has(id)
      ? 'hazard'
      : PACING_MOVES.has(id)
        ? 'pacing'
        : undefined;
  if (!kind) return undefined;
  const values = choiceValues(worlds, legal);
  // Hazards: against every other option. Pacing: against attacking.
  const rivals = legal.filter((c) => c !== top && (kind === 'hazard' || damaging(c)));
  const contrast = rivals
    .filter((c) => Number.isFinite(values[c]))
    .sort((a, b) => values[b]! - values[a]!)[0];
  if (!contrast) return undefined;
  const lead = values[top]! - values[contrast]!;
  const share = leadShare(worlds, top, contrast, o.margin);
  let targets: HazardTarget[] | undefined;
  if (kind === 'hazard') {
    if (!(lead >= o.hazardLead)) return undefined;
    targets = sureTargets(worlds, id as HazardMove, gen, o.factShare);
    if (!targets || targets.length < o.targets) return undefined;
  } else if (!(lead >= o.pacingLead) || share < o.worlds) return undefined;
  return {
    kind,
    choice: top,
    contrast,
    values: { choice: values[top]!, contrast: values[contrast]! },
    worlds: share,
    ...(targets ? { targets } : {}),
  };
}

const HEALS = new Set([
  'recover',
  'roost',
  'softboiled',
  'milkdrink',
  'slackoff',
  'moonlight',
  'morningsun',
  'synthesis',
  'wish',
  'rest',
]);
const STATUS_VERB: Record<string, string> = {
  toxic: 'badly poisoning',
  willowisp: 'burning',
  thunderwave: 'paralyzing',
  stunspore: 'paralyzing',
  glare: 'paralyzing',
  leechseed: 'seeding',
};

/** "A, B and C". */
export const list = (names: readonly string[]) =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
const fraction = (f: number) => `1/${Math.round(1 / f)}`;

export interface SlowNames {
  /** The slow play's move name, and the contrasted option's (pacing). */
  move: string;
  contrast: string;
  /** The foe's active Pokémon. */
  foe: string;
  /** Hazards: the targets' names, with their damage. */
  targets?: { name: string; frac?: number }[];
}

/** A hazards or pacing tip's text (`id`: the move's id); `variant` picks the wording. */
export function slowText(id: string, n: SlowNames, variant: number): string {
  const v = Math.abs(Math.trunc(variant)) % 2;
  if (HAZARD_MOVES.has(id)) {
    // Biggest hit first; at most three names.
    const all = [...(n.targets ?? [])].sort((a, b) => (b.frac ?? 0) - (a.frac ?? 0));
    const t = all.slice(0, 3);
    const more = all.length - t.length;
    const lead = v ? `${n.move} now` : `Good time for ${n.move}`;
    const who = list([...t.map((x) => x.name), ...(more ? [`${more} more`] : [])]);
    if (id === 'stealthrock') {
      if (t.every((x) => x.frac === t[0]!.frac))
        return `${lead}: ${who} you’ve seen would lose ${fraction(t[0]!.frac!)} of their HP every time they switch in.`;
      const [top, ...rest] = t;
      return `${lead}: every time they switch in, ${list([
        `${top!.name} would lose ${fraction(top!.frac!)} of its HP`,
        ...rest.map((x) => `${x.name} ${fraction(x.frac!)}`),
        ...(more ? [`${more} more you’ve seen`] : []),
      ])}.`;
    }
    if (id === 'spikes')
      return `${lead}: ${who} you’ve seen would lose ${fraction(t[0]!.frac!)} of their HP every time they switch in.`;
    if (id === 'toxicspikes')
      return `${lead}: ${who} you’ve seen would be poisoned every time they switch in.`;
    return `${lead}: ${who} you’ve seen would have their Speed lowered every time they switch in.`;
  }
  if (HEALS.has(id))
    return v
      ? `Heal up first: ${n.move} beats attacking with ${n.contrast} here.`
      : `No rush: ${n.move} is stronger than attacking with ${n.contrast} right now.`;
  if (id === 'substitute')
    return `Substitute first: it’s stronger than attacking with ${n.contrast} right now.`;
  const verb = STATUS_VERB[id];
  if (verb)
    return `${n.move} first: ${verb} ${n.foe} is worth more than ${n.contrast}’s damage right now.`;
  return `${n.move} first: curing your team beats attacking with ${n.contrast} right now.`;
}
