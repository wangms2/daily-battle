// Branch odds for the advanced coach's risk tips: how a choice's chance
// outcomes (a miss, a crit, a damage roll; engine netSearch `outcomes`) spread
// its win chance, against the foe's likely replies, over the sampled worlds.
import type { NetOutcome, NetSearchResult } from '@daily-battle/engine-wasm';

/** One searched world: its search (with outcomes), weight and our choices' slots. */
export interface BranchWorld {
  result: NetSearchResult;
  weight: number;
  /** Our choice at each slot (undefined: none there). */
  slots: readonly (string | undefined)[];
}

/** What happened in a bad branch, next to the pair's likeliest outcome. */
export type BranchKind =
  /** Our attack did nothing (a miss, or it failed). */
  | 'miss'
  /** We took much more damage, or lost a Pokémon we otherwise keep. */
  | 'hurt'
  /** Anything else (a low roll, a missed KO, a status). */
  | 'other';

export interface Risk {
  /** The chance (over worlds, replies and outcomes) of a branch that loses `drop` or more. */
  bad: number;
  /** The likeliest kind of bad branch, and its share of the bad mass. */
  kind?: BranchKind;
  kindShare: number;
  /** The worlds (by weight) where `bad` is at least half its overall value: how general it is. */
  worlds: number;
}

const HIT = 0.08;

/** The kind of outcome `o` is, next to `usual` (its pair's likeliest outcome). */
export function branchKind(o: NetOutcome, usual: NetOutcome): BranchKind {
  if (usual.foeHp >= HIT && o.foeHp < 0.02 && o.foeKo === 0) return 'miss';
  if (o.ownKo > usual.ownKo || o.ownHp - usual.ownHp >= 0.25) return 'hurt';
  return 'other';
}

/**
 * The risk of `choice`: the chance its outcome lands `drop` or more below
 * `against`'s value in the same world and reply (default: its own value
 * there), with what kind of branch that mostly is.
 */
export function risk(
  worlds: readonly BranchWorld[],
  choice: string,
  drop: number,
  against: string = choice,
): Risk | undefined {
  let total = 0;
  let bad = 0;
  const kinds = new Map<BranchKind, number>();
  const per: { w: number; bad: number }[] = [];
  for (const { result, weight, slots } of worlds) {
    const a = slots.indexOf(choice);
    const b = slots.indexOf(against);
    if (a < 0 || b < 0 || !result.outcomes.length) continue;
    let worldBad = 0;
    let worldMass = 0;
    for (const reply of result.replies) {
      const base = reply.q[b];
      if (base === undefined || !Number.isFinite(base)) continue;
      const pair = result.outcomes.filter((o) => o.own === a && o.foe === reply.slot);
      if (!pair.length) continue;
      const usual = pair.reduce((m, o) => (o.p > m.p ? o : m));
      worldMass += reply.p;
      for (const o of pair) {
        if (o.value > base - drop) continue;
        const m = reply.p * o.p;
        worldBad += m;
        const k = branchKind(o, usual);
        kinds.set(k, (kinds.get(k) ?? 0) + weight * m);
      }
    }
    if (!worldMass) continue;
    total += weight;
    bad += weight * (worldBad / worldMass);
    per.push({ w: weight, bad: worldBad / worldMass });
  }
  if (!total) return undefined;
  const share = bad / total;
  const top = [...kinds].sort((x, y) => y[1] - x[1])[0];
  const mass = [...kinds.values()].reduce((s, x) => s + x, 0);
  return {
    bad: share,
    ...(top ? { kind: top[0] } : {}),
    kindShare: top && mass ? top[1] / mass : 0,
    worlds: share ? per.reduce((s, x) => s + (x.bad >= share / 2 ? x.w : 0), 0) / total : 0,
  };
}
