// Sets must be distinct enough to be worth a choice: two sets that share most
// of their moves, invest EVs the same way, and do the same job are one set
// (the more used one), not two.
import type { ResolvedSet } from './resolve';

const STATS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
/** EV spreads closer than this (summed over stats) invest the same way. */
export const SAME_SPREAD = 192;

/** Setup moves by what they boost; two sets boosting the same way share a job. */
const SETUP: Record<string, string> = {
  'Swords Dance': 'physical',
  'Dragon Dance': 'physical',
  'Bulk Up': 'physical',
  Curse: 'physical',
  'Belly Drum': 'physical',
  'Nasty Plot': 'special',
  'Calm Mind': 'special',
  'Tail Glow': 'special',
  Agility: 'speed',
  'Rock Polish': 'speed',
  // Gen 5
  'Quiver Dance': 'special',
  Coil: 'physical',
  'Hone Claws': 'physical',
  'Shift Gear': 'physical',
  'Shell Smash': 'mixed',
  'Work Up': 'mixed',
};
/** Moves that give a set its own job on a team. */
const ROLE_MOVES = [
  'Stealth Rock',
  'Spikes',
  'Toxic Spikes',
  'Rapid Spin',
  'Trick',
  'Switcheroo',
  'Trick Room',
  'Rain Dance',
  'Sunny Day',
  'Reflect',
  'Light Screen',
  'Wish',
  'Baton Pass',
];

function itemJob(item: string): string {
  if (item === 'Choice Scarf') return 'speed';
  if (['Choice Band', 'Choice Specs', 'Life Orb', 'Expert Belt'].includes(item)) return 'power';
  if (item === 'Focus Sash') return 'lead';
  if (item.endsWith(' Berry')) return 'berry';
  return 'other';
}

/** What a set is for: its setup move, else what its item does, and its role moves. */
export function jobOf(set: Pick<ResolvedSet, 'moves' | 'item'>): string {
  const setup = [...new Set(set.moves.map((m) => SETUP[m]).filter(Boolean))].sort().join('+');
  const roles = ROLE_MOVES.filter((m) => set.moves.includes(m)).join('+');
  // A setup sweeper's item is flavour (Life Orb, Leftovers, a pinch berry): the
  // setup move is its job. Without setup, the item says what the set is for.
  return `${setup}|${setup ? '' : itemJob(set.item)}|${roles}`;
}

/** True if two sets of a species are the same set for a player's purposes. */
export function samePurpose(
  a: Pick<ResolvedSet, 'moves' | 'item' | 'evs'>,
  b: Pick<ResolvedSet, 'moves' | 'item' | 'evs'>,
): boolean {
  const shared = a.moves.filter((m) => b.moves.includes(m)).length;
  const spread = STATS.reduce((sum, s) => sum + Math.abs(a.evs[s] - b.evs[s]), 0);
  return shared >= 3 && spread < SAME_SPREAD + 1 && jobOf(a) === jobOf(b);
}
