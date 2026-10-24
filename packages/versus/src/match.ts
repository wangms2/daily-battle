// One battle in a round: who plays whom, each side's team and its swap, the
// leads, the clocks, and every choice made, which is enough to rebuild the
// battle (§7's resume, on the server). Pure data and functions; the room
// server runs the sim.
import type { FormatId } from '@daily-battle/data/formats';
import type { PokemonSet } from '@pkmn/sim';

export type Side = 'p1' | 'p2';
export const SIDES: readonly Side[] = ['p1', 'p2'];
export const otherSide = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1');

/** The player id the AI plays under, against an odd player out. */
export const AI_ID = 'ai';
export const AI_NAME = 'Rival';

/** How long both players have for the swap and the lead before a battle. */
export const PREP_MS = 60_000;

/** A team member: a species from the pool and one of its sets. */
export interface Slot {
  species: string;
  setId: string;
}

/**
 * The one change before a round (§4.2's daily change): another Pokémon from
 * the pool in a slot, or another set for the one there.
 */
export interface Change {
  slot: number;
  to: Slot;
}

/** A side's choices before the battle; hidden from the foe until it starts. */
export interface Prep {
  change: Change | null;
  lead: string | null;
  ready: boolean;
}

/**
 * A chess clock, like Showdown's timer: a bank for the whole battle, and a cap
 * on any one turn. It runs while its side has a choice to make.
 */
export interface Clock {
  bankMs: number;
  /** When it started running, or null while stopped. */
  since: number | null;
}

export type MatchEnd = 'win' | 'tie' | 'forfeit' | 'timeout';

export interface Match {
  id: string;
  /** Player ids; the AI plays as `AI_ID`. */
  players: Record<Side, string>;
  /** Names as of the start, for results after someone leaves. */
  names: Record<Side, string>;
  /** The side the AI plays, in a battle against an odd player out. */
  ai: Side | null;
  /** The AI's style (DESIGN.md §8.5), from its generated team. */
  aiStyle?: 'offense' | 'balance' | 'stall';
  format: FormatId;
  /** The battle's PRNG seed. Never sent to players. */
  seed: string;
  /** Each side's team going into the round, before its change. */
  slots: Record<Side, Slot[]>;
  prep: Record<Side, Prep>;
  stage: 'prep' | 'battle' | 'over';
  prepDeadline: number;
  /** The teams as they battle, lead first; filled in when the battle starts. */
  teams: Record<Side, PokemonSet[]>;
  /** Each side's accepted choices, in order. */
  choices: Record<Side, string[]>;
  /** How many of each side's Pokémon have fainted (for the room drawer's balls). */
  fainted: Record<Side, number>;
  clocks: Record<Side, Clock>;
  result?: { winner: Side | null; reason: MatchEnd };
}

export function newMatch(input: {
  id: string;
  players: Record<Side, string>;
  names: Record<Side, string>;
  ai?: Side | null;
  aiStyle?: Match['aiStyle'];
  format: FormatId;
  seed: string;
  slots: Record<Side, Slot[]>;
  bankMs: number;
  now: number;
}): Match {
  const ai = input.ai ?? null;
  const clock = (): Clock => ({ bankMs: input.bankMs, since: null });
  // The AI goes in as it is: no change, its first Pokémon leading.
  const prep = (side: Side): Prep =>
    side === ai
      ? { change: null, lead: input.slots[side][0]!.species, ready: true }
      : { change: null, lead: null, ready: false };
  return {
    id: input.id,
    players: input.players,
    names: input.names,
    ai,
    ...(input.aiStyle && { aiStyle: input.aiStyle }),
    format: input.format,
    seed: input.seed,
    slots: input.slots,
    prep: { p1: prep('p1'), p2: prep('p2') },
    stage: 'prep',
    prepDeadline: input.now + PREP_MS,
    teams: { p1: [], p2: [] },
    choices: { p1: [], p2: [] },
    fainted: { p1: 0, p2: 0 },
    clocks: { p1: clock(), p2: clock() },
  };
}

export const sideOf = (match: Match, player: string): Side | null =>
  match.players.p1 === player ? 'p1' : match.players.p2 === player ? 'p2' : null;

/** A team with one change made. */
export const withChange = (team: Slot[], change: Change | null): Slot[] =>
  change ? team.map((s, i) => (i === change.slot ? change.to : s)) : team;

/**
 * Why a change can't be made, or null if it can: the slot must exist, a new
 * Pokémon must come from the pool and not be on the team already, and a set
 * change keeps the species. (Set ids and Species Clause are checked by the
 * room server against the set data and the validator.)
 */
export function changeProblem(
  team: Slot[],
  change: Change,
  pool: readonly string[],
): string | null {
  const current = team[change.slot];
  if (!current) return 'no such slot';
  const { species } = change.to;
  if (species === current.species) return change.to.setId === current.setId ? 'no change' : null;
  if (!pool.includes(species)) return 'not in the pool';
  if (team.some((s) => s.species === species)) return 'already on the team';
  return null;
}

/** A team with its lead moved to the front. */
export function leadFirst<T extends { species: string }>(team: T[], lead: string | null): T[] {
  const i = team.findIndex((s) => s.species === lead);
  return i > 0 ? [team[i]!, ...team.slice(0, i), ...team.slice(i + 1)] : team;
}

/** Sets a side's prep (change, lead, ready) while the swap is open; null if not allowed. */
export function updatePrep(
  match: Match,
  side: Side,
  update: Partial<Prep>,
  pool: readonly string[],
): Match | null {
  if (match.stage !== 'prep' || side === match.ai) return null;
  const prep = { ...match.prep[side], ...update };
  if (prep.change && changeProblem(match.slots[side], prep.change, pool)) return null;
  const team = withChange(match.slots[side], prep.change);
  // A lead that the change swapped out goes back to unpicked.
  if (prep.lead && !team.some((s) => s.species === prep.lead)) {
    if (update.lead) return null;
    prep.lead = null;
  }
  return { ...match, prep: { ...match.prep, [side]: prep } };
}

/** Both sides are ready, or time is up. */
export const prepDone = (match: Match, now: number) =>
  match.stage === 'prep' &&
  ((match.prep.p1.ready && match.prep.p2.ready) || now >= match.prepDeadline);

/** A side's team as it goes into battle: its change made, its lead first. */
export const battleSlots = (match: Match, side: Side): Slot[] =>
  leadFirst(withChange(match.slots[side], match.prep[side].change), match.prep[side].lead);

/** This turn's limit: the per-turn cap, or what's left in the bank if that's less. */
export const turnLimit = (clock: Clock, perTurnMs: number) => Math.min(clock.bankMs, perTurnMs);

export const startClock = (clock: Clock, now: number): Clock =>
  clock.since === null ? { ...clock, since: now } : clock;

export const stopClock = (clock: Clock, now: number): Clock =>
  clock.since === null
    ? clock
    : { bankMs: Math.max(0, clock.bankMs - (now - clock.since)), since: null };

/** When a running clock runs out; null while stopped. */
export const clockDeadline = (clock: Clock, perTurnMs: number): number | null =>
  clock.since === null ? null : clock.since + turnLimit(clock, perTurnMs);

/** The next time something in the match times out: the swap, or a running clock. */
export function nextDeadline(match: Match, perTurnMs: number): number | null {
  if (match.stage === 'prep') return match.prepDeadline;
  if (match.stage !== 'battle') return null;
  const times = SIDES.flatMap((s) => clockDeadline(match.clocks[s], perTurnMs) ?? []);
  return times.length ? Math.min(...times) : null;
}

/** What one player sees of their own battle: their team, never the foe's sets or swap. */
export interface MatchView {
  id: string;
  stage: Match['stage'];
  side: Side;
  format: FormatId;
  opponent: { id: string; name: string; ai: boolean };
  /** Your team going into the round, before your change. */
  slots: Slot[];
  change: Change | null;
  lead: string | null;
  ready: boolean;
  foeReady: boolean;
  /** The foe's species as they stood before the swap. */
  foeSpecies: string[];
  /** Your sets as they battle, lead first; empty until the battle starts. */
  team: PokemonSet[];
  /** Time left for the swap or your choice; null while nothing is asked of you. */
  timeLeftMs: number | null;
  bankMs: number;
  result: { winner: 'you' | 'foe' | null; reason: MatchEnd } | null;
}

export function matchView(match: Match, side: Side, now: number, perTurnMs: number): MatchView {
  const foe = otherSide(side);
  const clock = match.clocks[side];
  const prep = match.prep[side];
  const deadline =
    match.stage === 'prep'
      ? prep.ready
        ? null
        : match.prepDeadline
      : match.stage === 'battle'
        ? clockDeadline(clock, perTurnMs)
        : null;
  const winner = match.result?.winner;
  return {
    id: match.id,
    stage: match.stage,
    side,
    format: match.format,
    opponent: { id: match.players[foe], name: match.names[foe], ai: match.ai === foe },
    slots: match.slots[side],
    change: prep.change,
    lead: prep.lead,
    ready: prep.ready,
    foeReady: match.prep[foe].ready,
    foeSpecies: match.slots[foe].map((s) => s.species),
    team: match.teams[side],
    timeLeftMs: deadline === null ? null : Math.max(0, deadline - now),
    bankMs: clock.bankMs,
    result: match.result
      ? { winner: winner ? (winner === side ? 'you' : 'foe') : null, reason: match.result.reason }
      : null,
  };
}
