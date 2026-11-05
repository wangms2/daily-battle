// The advanced coach's reads (plan: concept 5), from the light check's
// per-reply table: the network's predicted foe reply mix, and each of our
// choices' win chance against each reply. Advanced players pick a play that
// holds up whether the foe stays in or switches, so a wrong read costs little:
//   "Gengar could stay in or switch to Skarmory. Thunderbolt works against
//   both; Shadow Ball is better only if Gengar stays in."
import type { BranchWorld } from '../facts/branches';

export interface ReadOptions {
  /** The foe stays in with at least this chance… */
  stay: number;
  /** …and switches to one Pokémon with at least this chance. */
  target: number;
  /** The advice's worst case (over those two replies) beats the greedy play's by at least this. */
  gap: number;
  /** The greedy play beats the advice against its own reply by at least this (a real temptation). */
  tempt: number;
}

export const READ_DEFAULTS: ReadOptions = { stay: 0.2, target: 0.15, gap: 0.05, tempt: 0.03 };

export interface ReadTip {
  /** read: the advice is best against the switch and holds up if the foe stays;
   *  safe: best if the foe stays and holds up against the switch;
   *  cover: best against neither alone, but fine against both. */
  kind: 'read' | 'safe' | 'cover';
  /** The advice (the judge's top choice). */
  choice: string;
  /** The greedy play: best against one reply, poor against the other. */
  contrast: string;
  /** The reply the greedy play is for. */
  greedyFor: 'stay' | 'switch';
  /** The foe's active Pokémon, and its likeliest switch-in (species ids). */
  foe: string;
  target: string;
  /** The foe's chance to stay in, and to switch to `target`. */
  pStay: number;
  pTarget: number;
  /** Win chances against the switch to `target` and against staying in. */
  vsSwitch: { choice: number; contrast: number };
  vsStay: { choice: number; contrast: number };
}

const speciesAt = (state: string, i: number) =>
  state.split('/')[1]!.split('=')[i]!.split(',')[0]!.toLowerCase();

/** The foe's reply mix (switches by species) and each choice's value against a reply group. */
export function replyTable(worlds: readonly BranchWorld[], choices: readonly string[]) {
  const total = worlds.reduce((a, w) => a + w.weight, 0);
  const groups = new Map<string, { p: number; sum: Map<string, number>; n: Map<string, number> }>();
  let foe: string | undefined;
  for (const w of worlds) {
    if (!w.world) return undefined;
    const side = w.world.state.split('/')[1]!.split('=');
    const active = speciesAt(w.world.state, Number(side[6]));
    if (foe && foe !== active) return undefined;
    foe = active;
    for (const r of w.result.replies) {
      const key = r.slot !== null && r.slot >= 8 ? speciesAt(w.world.state, r.slot - 8) : 'stay';
      const g = groups.get(key) ?? { p: 0, sum: new Map(), n: new Map() };
      const p = (w.weight / total) * r.p;
      g.p += p;
      for (const c of choices) {
        const q = r.q[w.slots.indexOf(c)];
        if (q === undefined || !Number.isFinite(q)) continue;
        g.sum.set(c, (g.sum.get(c) ?? 0) + p * q);
        g.n.set(c, (g.n.get(c) ?? 0) + p);
      }
      groups.set(key, g);
    }
  }
  if (!foe) return undefined;
  const value = (key: string, c: string) => {
    const g = groups.get(key);
    const n = g?.n.get(c);
    return g && n ? g.sum.get(c)! / n : NaN;
  };
  const mix = new Map([...groups].map(([k, g]) => [k, g.p]));
  return { foe, mix, value };
}

const best = (choices: readonly string[], v: (c: string) => number) =>
  choices.filter((c) => Number.isFinite(v(c))).sort((a, b) => v(b) - v(a))[0];

/**
 * A tip for a play that works whether the foe stays in or switches (`top`: the
 * judge's top choice), next to the greedy play that bets on one of the two.
 */
export function readTip(
  worlds: readonly BranchWorld[],
  legal: readonly string[],
  top: string,
  options: Partial<ReadOptions> = {},
): ReadTip | undefined {
  const o = { ...READ_DEFAULTS, ...options };
  const t = replyTable(worlds, legal);
  if (!t) return undefined;
  const pStay = t.mix.get('stay') ?? 0;
  const [target, pTarget] = [...t.mix]
    .filter(([k]) => k !== 'stay')
    .sort((a, b) => b[1] - a[1])[0] ?? ['', 0];
  if (pStay < o.stay || pTarget < o.target) return undefined;
  const vsX = (c: string) => t.value(target, c);
  const vsStay = (c: string) => t.value('stay', c);
  const worst = (c: string) => Math.min(vsX(c), vsStay(c));
  if (!Number.isFinite(worst(top))) return undefined;
  const S = best(legal, vsStay);
  const X = best(legal, vsX);
  if (!S || !X || S === X) return undefined;
  // The greedy play: the single-reply best that isn't the advice, the more tempting one first.
  const greedy = [
    { c: X, for: 'switch' as const, tempt: vsX(X) - vsX(top) },
    { c: S, for: 'stay' as const, tempt: vsStay(S) - vsStay(top) },
  ]
    .filter((g) => g.c !== top && g.tempt >= o.tempt && worst(top) - worst(g.c) >= o.gap)
    .sort((a, b) => b.tempt - a.tempt)[0];
  if (!greedy) return undefined;
  return {
    kind: top === X ? 'read' : top === S ? 'safe' : 'cover',
    choice: top,
    contrast: greedy.c,
    greedyFor: greedy.for,
    foe: t.foe,
    target,
    pStay,
    pTarget,
    vsSwitch: { choice: vsX(top), contrast: vsX(greedy.c) },
    vsStay: { choice: vsStay(top), contrast: vsStay(greedy.c) },
  };
}

/** Names for a read tip's text. */
export interface ReadNames {
  choice: string;
  contrast: string;
  foe: string;
  target: string;
}

/** A read tip's text; `variant` picks the wording. Plays may be phrases ("switching to Starmie"). */
export function readText(
  tip: Pick<ReadTip, 'kind' | 'greedyFor'>,
  n: ReadNames,
  variant: number,
): string {
  const cap = (t: string) =>
    t.replace(/(^|\. )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());
  return cap(readWords(tip, n, variant));
}

function readWords(
  tip: Pick<ReadTip, 'kind' | 'greedyFor'>,
  n: ReadNames,
  variant: number,
): string {
  const v = Math.abs(Math.trunc(variant)) % 2;
  const only =
    tip.greedyFor === 'stay' ? `if ${n.foe} stays in` : `if ${n.foe} switches to ${n.target}`;
  const other = tip.greedyFor === 'stay' ? `if it switches to ${n.target}` : `if it stays in`;
  if (tip.kind === 'read')
    return v
      ? `${n.foe} will likely switch to ${n.target}, and ${n.choice} is your best play against that, yet still fine if ${n.foe} stays in. ${n.contrast} is better only ${only}.`
      : `Good read: ${n.choice} punishes a switch to ${n.target} and doesn’t cost much if ${n.foe} stays in. ${n.contrast} is better only ${only}.`;
  if (tip.kind === 'safe')
    return v
      ? `${n.foe} might stay in or switch to ${n.target}. ${n.contrast} would be best ${only}, but bad ${other}. ${n.choice} holds up either way.`
      : `Don’t over-read: ${n.contrast} is better only ${only}. ${n.choice} works whether ${n.foe} stays in or switches to ${n.target}.`;
  return v
    ? `${n.foe} could stay in or switch to ${n.target}. ${n.choice} works against both; ${n.contrast} is better only ${only}.`
    : `Cover both options: ${n.choice} isn’t the best against either one alone, but it’s fine whether ${n.foe} stays in or switches to ${n.target}. ${n.contrast} is a gamble that pays off only ${only}.`;
}
