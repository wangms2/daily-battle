// The advanced coach's win conditions (plan: concept 1), from counterfactual
// searches (facts/counterfactual.ts): the battle with one of the foe's seen
// Pokémon gone is near-won for us, and it hinges on one of ours.
// NOT USED IN THE GAME (owner, Nov 4): on the risk1 holdout the oracle confirmed the
// "near-won without it" claim for only ~27% of "take out" tips (~2/3 even as a softer
// "it's in your way"); "keep" and "plan" were weaker. Kept for the offline scan.
//   "Take out Swampert: once it's down, Salamence should be able to win this."
//   "Keep Salamence healthy: once Swampert is down, it should be able to win this."
import type { NetWorld } from '@daily-battle/engine-wasm';
import type { BranchWorld } from '../facts/branches';
import { faintWorld } from '../facts/counterfactual';

export interface WinconOptions {
  /** Searched only when we're at most this now (else there's nothing to win). */
  now: number;
  /** With the foe's Pokémon gone, we're at least this… */
  win: number;
  /** …and up by at least this. */
  gain: number;
  /** Our key Pokémon: losing it too costs at least this. */
  key: number;
  /** Counterfactuals use the likeliest worlds, up to this many. */
  worlds: number;
}

export const WINCON_DEFAULTS: WinconOptions = {
  now: 0.6,
  win: 0.8,
  gain: 0.2,
  key: 0.25,
  worlds: 2,
};

export interface WinconTip {
  /** remove: the top play attacks the foe's blocker; keep: it switches our key out; plan: neither. */
  kind: 'remove' | 'keep' | 'plan';
  /** The advice (the judge's top choice). */
  choice: string;
  /** The foe's blocker and our key Pokémon (species ids; no key if none stands out). */
  blocker: string;
  key?: string;
  /** Win chances now, with the blocker gone, and with our key gone too. */
  values: { now: number; without: number; withoutKey?: number };
}

const HP = 6;
const mons = (state: string, side: 0 | 1) =>
  state
    .split('/')
    [side]!.split('=')
    .slice(0, 7)
    .map((f) => f.split(','));

/** Our win chance in a searched world: its best searched choice. */
export const bestScore = (r: { score: number[]; value: number }) => {
  const s = r.score.filter((x) => Number.isFinite(x));
  return s.length ? Math.max(...s) : r.value;
};

/**
 * A win-condition tip, if one passes its gates. `value` searches a world and
 * returns our win chance; `damaging` says whether a choice is an attack.
 */
export function winconTip(
  worlds: readonly BranchWorld[],
  top: string,
  value: (w: NetWorld) => number,
  damaging: (choice: string) => boolean,
  options: Partial<WinconOptions> = {},
): WinconTip | undefined {
  const o = { ...WINCON_DEFAULTS, ...options };
  const ws = [...worlds]
    .filter((w) => w.world)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, o.worlds);
  if (!ws.length) return undefined;
  const total = ws.reduce((a, w) => a + w.weight, 0);
  const mean = (f: (w: BranchWorld) => number) =>
    ws.reduce((a, w) => a + w.weight * f(w), 0) / total;
  const now = mean((w) => bestScore(w.result));
  if (now > o.now) return undefined;
  const first = ws[0]!.world!;
  const foe = mons(first.state, 1);
  const own = mons(first.state, 0);
  const search = (w: NetWorld, side: 0 | 1, slot: number) => {
    const out = faintWorld(w, side, slot);
    if (!out) return undefined;
    return { world: out.world, v: out.over ? (side === 1 ? 1 : 0) : value(out.world) };
  };
  // The foe's blocker: a seen, standing Pokémon whose loss gains us the most.
  let blocker: { slot: number; v: number } | undefined;
  for (let i = 0; i < 6; i++) {
    if (!ws.every((w) => w.world!.known[i]?.seen) || !(Number(foe[i]![HP]) > 0)) continue;
    const v = mean((w) => search(w.world!, 1, i)?.v ?? NaN);
    if (v >= o.win && v - now >= o.gain && (!blocker || v > blocker.v)) blocker = { slot: i, v };
  }
  if (!blocker) return undefined;
  // Our key: the standing Pokémon whose loss (with the blocker gone) costs the most.
  let key: { slot: number; v: number } | undefined;
  for (let i = 0; i < 6; i++) {
    if (!(Number(own[i]![HP]) > 0)) continue;
    const v = mean((w) => {
      const gone = faintWorld(w.world!, 1, blocker!.slot)!.world;
      return search(gone, 0, i)?.v ?? NaN;
    });
    if (blocker.v - v >= o.key && (!key || v < key.v)) key = { slot: i, v };
  }
  const foeActive = Number(foe[6]![0]);
  const ownActive = Number(own[6]![0]);
  const kind =
    blocker.slot === foeActive && damaging(top)
      ? 'remove'
      : key && key.slot === ownActive && top.startsWith('switch ')
        ? 'keep'
        : 'plan';
  return {
    kind,
    choice: top,
    blocker: foe[blocker.slot]![0]!.toLowerCase(),
    ...(key ? { key: own[key.slot]![0]!.toLowerCase() } : {}),
    values: { now, without: blocker.v, ...(key ? { withoutKey: key.v } : {}) },
  };
}

/** A win-condition tip's text; `variant` picks the wording. */
export function winconText(
  kind: WinconTip['kind'],
  n: { blocker: string; key?: string },
  variant: number,
): string {
  const v = Math.abs(Math.trunc(variant)) % 2;
  const { blocker: y, key: x } = n;
  if (kind === 'remove')
    return x
      ? v
        ? `Take out ${y}: once it’s down, ${x} should be able to win this.`
        : `${y} is what stands between ${x} and the win. Knock it out.`
      : `Take out ${y}: once it’s down, you’re in great shape.`;
  if (kind === 'keep' && x)
    return v
      ? `Keep ${x} healthy: once ${y} is down, it should be able to win this.`
      : `${x} is your win condition once ${y} is gone, so don’t lose it now.`;
  return x
    ? v
      ? `${x} is your win condition: once ${y} is down, it should be able to win this.`
      : `Plan ahead: ${y} is what stands between ${x} and the win.`
    : `Plan ahead: ${y} is the main thing standing in your way. Once it’s down, you’re in great shape.`;
}
