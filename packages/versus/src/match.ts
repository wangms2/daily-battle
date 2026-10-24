// One battle in a round: who plays whom, the teams, the leads, the clocks,
// and every choice made, which is enough to rebuild the battle (§7's resume,
// on the server). Pure data and functions; the room server runs the sim.
import type { FormatId } from '@daily-battle/data/formats';
import type { PokemonSet } from '@pkmn/sim';

export type Side = 'p1' | 'p2';
export const SIDES: readonly Side[] = ['p1', 'p2'];
export const otherSide = (side: Side): Side => (side === 'p1' ? 'p2' : 'p1');

/** How long both players have to pick a lead. */
export const LEAD_MS = 45_000;

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
  players: Record<Side, string>;
  /** Names as of the start, for results after someone leaves. */
  names: Record<Side, string>;
  format: FormatId;
  /** The battle's PRNG seed. Never sent to players. */
  seed: string;
  /** Teams as dealt. The battle sends each one lead first. */
  teams: Record<Side, PokemonSet[]>;
  leads: Partial<Record<Side, string>>;
  stage: 'lead' | 'battle' | 'over';
  leadDeadline: number;
  /** Each side's accepted choices, in order. */
  choices: Record<Side, string[]>;
  clocks: Record<Side, Clock>;
  result?: { winner: Side | null; reason: MatchEnd };
}

export function newMatch(input: {
  id: string;
  players: Record<Side, string>;
  names: Record<Side, string>;
  format: FormatId;
  seed: string;
  teams: Record<Side, PokemonSet[]>;
  bankMs: number;
  now: number;
}): Match {
  const clock = (): Clock => ({ bankMs: input.bankMs, since: null });
  return {
    id: input.id,
    players: input.players,
    names: input.names,
    format: input.format,
    seed: input.seed,
    teams: input.teams,
    leads: {},
    stage: 'lead',
    leadDeadline: input.now + LEAD_MS,
    choices: { p1: [], p2: [] },
    clocks: { p1: clock(), p2: clock() },
  };
}

export const sideOf = (match: Match, player: string): Side | null =>
  match.players.p1 === player ? 'p1' : match.players.p2 === player ? 'p2' : null;

/** A team with its lead moved to the front. */
export function leadFirst(team: PokemonSet[], lead: string | undefined): PokemonSet[] {
  const i = team.findIndex((s) => s.species === lead);
  return i > 0 ? [team[i]!, ...team.slice(0, i), ...team.slice(i + 1)] : team;
}

/** Picks a side's lead (it can change its mind until the battle starts); null if not allowed. */
export function chooseLead(match: Match, side: Side, species: string): Match | null {
  if (match.stage !== 'lead' || !match.teams[side].some((s) => s.species === species)) return null;
  return { ...match, leads: { ...match.leads, [side]: species } };
}

/** Both leads are in, or time is up (an unpicked lead is the first Pokémon). */
export const leadsReady = (match: Match, now: number) =>
  match.stage === 'lead' && ((!!match.leads.p1 && !!match.leads.p2) || now >= match.leadDeadline);

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

/** The next time something in the match times out: lead picking, or a running clock. */
export function nextDeadline(match: Match, perTurnMs: number): number | null {
  if (match.stage === 'lead') return match.leadDeadline;
  if (match.stage !== 'battle') return null;
  const times = SIDES.flatMap((s) => clockDeadline(match.clocks[s], perTurnMs) ?? []);
  return times.length ? Math.min(...times) : null;
}

/** Shuffles players into pairs; with an odd count, one sits the round out. */
export function pairUp(
  players: readonly string[],
  random: () => number,
): { pairs: [string, string][]; sittingOut: string | null } {
  const order = [...players];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const pairs: [string, string][] = [];
  for (let i = 0; i + 1 < order.length; i += 2) pairs.push([order[i]!, order[i + 1]!]);
  return { pairs, sittingOut: order.length % 2 ? order.at(-1)! : null };
}

/** What one player sees of their own battle: their team, never the foe's sets. */
export interface MatchView {
  id: string;
  stage: Match['stage'];
  side: Side;
  format: FormatId;
  opponent: { id: string; name: string };
  /** Your team: as dealt while picking a lead, lead first once the battle starts. */
  team: PokemonSet[];
  foeSpecies: string[];
  lead: string | null;
  foeReady: boolean;
  /** Time left to pick a lead or make your choice; null while nothing is asked of you. */
  timeLeftMs: number | null;
  bankMs: number;
  result: { winner: 'you' | 'foe' | null; reason: MatchEnd } | null;
}

export function matchView(match: Match, side: Side, now: number, perTurnMs: number): MatchView {
  const foe = otherSide(side);
  const clock = match.clocks[side];
  const deadline =
    match.stage === 'lead'
      ? match.leads[side]
        ? null
        : match.leadDeadline
      : match.stage === 'battle'
        ? clockDeadline(clock, perTurnMs)
        : null;
  const winner = match.result?.winner;
  return {
    id: match.id,
    stage: match.stage,
    side,
    format: match.format,
    opponent: { id: match.players[foe], name: match.names[foe] },
    team:
      match.stage === 'lead' ? match.teams[side] : leadFirst(match.teams[side], match.leads[side]),
    foeSpecies: match.teams[foe].map((s) => s.species),
    lead: match.leads[side] ?? null,
    foeReady: !!match.leads[foe],
    timeLeftMs: deadline === null ? null : Math.max(0, deadline - now),
    bankMs: clock.bankMs,
    result: match.result
      ? { winner: winner ? (winner === side ? 'you' : 'foe') : null, reason: match.result.reason }
      : null,
  };
}
