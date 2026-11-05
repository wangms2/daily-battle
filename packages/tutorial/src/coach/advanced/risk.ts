// The advanced coach's risk tips (plan: concept 3), from the light check's
// searches with their chance outcomes (facts/branches.ts): a tempting move that
// can miss, where a miss costs a lot, next to the top choice, which is safe
// and ahead anyway. "Hydro Pump misses 20% of the time, and a miss here costs
// you a lot: Thunderbolt is the safer play."
//
// Tuned offline (scripts/advanced-scan.ts on searchset v2). Kept out: "a
// painful branch" (mostly the foe's crit or lucky hit: no honest one-line why),
// and "only a lucky turn saves this" (the oracle often had a better choice).
import { risk, type BranchWorld } from '../facts/branches';

export interface RiskOptions {
  /** How far below the safe choice's value a branch must land to count. */
  drop: number;
  /** The risky move's chance of such a branch, at least. */
  bad: number;
  /** The safe choice's own chance of one (against itself), at most. */
  safeBad: number;
  /** The safe choice leads the risky move by at least this… */
  lead: number;
  /** …and at most this (so the risky move is tempting). */
  close: number;
  /** Share of worlds (by weight) the risk holds in. */
  worlds: number;
  /** Share of the bad branches that are misses. */
  kindShare: number;
}

export const RISK_DEFAULTS: RiskOptions = {
  drop: 0.15,
  bad: 0.08,
  safeBad: 0.05,
  lead: 0.1,
  close: 0.3,
  worlds: 0.9,
  kindShare: 0.5,
};

export interface RiskTip {
  safe: string;
  risky: string;
  /** The risky move's chance of a costly miss. */
  bad: number;
  values: { safe: number; risky: number };
}

const isMove = (c: string) => c.startsWith('move ');

/** Each choice's value over the worlds, by weight (NaN: never searched). */
export function choiceValues(worlds: readonly BranchWorld[], choices: readonly string[]) {
  return Object.fromEntries(
    choices.map((c) => {
      let total = 0;
      let sum = 0;
      for (const w of worlds) {
        const i = w.slots.indexOf(c);
        const s = i < 0 ? NaN : w.result.score[i]!;
        if (!Number.isFinite(s)) continue;
        total += w.weight;
        sum += w.weight * s;
      }
      return [c, total ? sum / total : NaN];
    }),
  ) as Record<string, number>;
}

/**
 * A risk tip for this decision, if one passes its gates. `top` is the judge's
 * top choice; `accuracy` gives a move choice's accuracy in percent (100 or
 * undefined: it can't miss).
 */
export function riskTip(
  worlds: readonly BranchWorld[],
  legal: readonly string[],
  top: string,
  accuracy: (choice: string) => number | undefined,
  options: Partial<RiskOptions> = {},
): RiskTip | undefined {
  const o = { ...RISK_DEFAULTS, ...options };
  if (!worlds.length || !isMove(top)) return undefined;
  const own = risk(worlds, top, o.drop);
  if (!own || own.bad > o.safeBad) return undefined;
  const values = choiceValues(worlds, legal);
  const safe = values[top]!;
  let best: RiskTip | undefined;
  for (const c of legal) {
    if (c === top || !isMove(c) || !((accuracy(c) ?? 100) < 100)) continue;
    const lead = safe - values[c]!;
    if (!(lead >= o.lead && lead <= o.close)) continue;
    const r = risk(worlds, c, o.drop, top);
    if (r?.kind !== 'miss' || r.bad < o.bad || r.worlds < o.worlds || r.kindShare < o.kindShare)
      continue;
    if (best && best.bad >= r.bad) continue;
    best = { safe: top, risky: c, bad: r.bad, values: { safe, risky: values[c]! } };
  }
  return best;
}

/** Risk tip wordings: `safe`/`risky` are move names, `acc` the risky move's accuracy (dex, percent). */
const RISK_TEXTS = [
  (safe: string, risky: string, acc: number) =>
    `${risky} is only ${acc}% accurate, and a miss here costs you a lot. ${safe} is the safer play.`,
  (safe: string, risky: string, acc: number) =>
    `${safe} is the safer play: ${risky} misses ${100 - acc}% of the time, and a miss here would hurt.`,
  (safe: string, risky: string, acc: number) =>
    `Careful with ${risky}: at ${acc}% accuracy, a miss here is costly. Stick with ${safe}.`,
];

/** A risk tip's text; `variant` picks the wording (any integer, e.g. a hash of the decision key). */
export function riskText(safe: string, risky: string, acc: number, variant: number): string {
  return RISK_TEXTS[Math.abs(Math.trunc(variant)) % RISK_TEXTS.length]!(safe, risky, acc);
}
