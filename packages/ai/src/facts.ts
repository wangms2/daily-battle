// One-turn facts about the player's position, for the coach (DESIGN.md §22):
// what each move does to the foe's active, what the foe's active does to each
// of ours, and who moves first. Like the AI, it sees only the player's own
// SideView plus the public possible sets, never the foe's real sets.
import type { SetsFile } from '@daily-battle/data';
import { legalChoices, type SideView } from '@daily-battle/sim-bridge';
import { Move, type Pokemon } from '@smogon/calc';
import {
  effectiveness,
  genFor,
  hit,
  makeField,
  makeMon,
  moveInfo,
  speed,
  typesOf,
  type Gen,
  type Hit,
} from './calc';
import { foeCands } from './score';
import {
  extractState,
  moveId,
  moveName,
  toId,
  type AIState,
  type FoeMon,
  type OwnMon,
} from './state';

/** Why a move would do nothing to the foe's active. */
export type NoEffect =
  | { kind: 'type'; type: string }
  | { kind: 'ability'; ability: string; type: string }
  | { kind: 'statused' }
  | { kind: 'statusImmune'; type: string; status: string }
  | { kind: 'sleepClause' }
  | { kind: 'substitute' }
  | { kind: 'hazardMax'; hazard: string };

export interface MoveFact {
  choice: string;
  name: string;
  id: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  /** Expected damage to the foe's active, as a fraction of its max HP. */
  damage: number;
  /** Chance it knocks the foe's active out, over damage rolls and possible sets. */
  ko: number;
  /** Chance it goes before the foe's move this turn. */
  first: number;
  /** Damage multiplier against the foe's active by typing; null for status moves. */
  effectiveness: number | null;
  noEffect?: NoEffect;
}

/** The foe's active's best hit on one of ours. */
export interface Threat extends Hit {
  /** Its likeliest best move, by name. */
  move: string;
  /** That move's type and its multiplier against ours. */
  type: string;
  effectiveness: number;
}

export interface SwitchFact {
  choice: string;
  slot: number;
  species: string;
  hpFrac: number;
  /** Spikes damage on the way in, as a fraction of max HP. */
  entry: number;
  /** The foe's hit on it as it comes in (after Spikes). */
  taken: Threat;
  /** Its own best expected damage to the foe's active. */
  best: number;
}

export interface Facts {
  state: AIState;
  /** The foe's active, as the player sees it (its forme). */
  foe?: string;
  /** Our active. */
  me?: string;
  /** The foe's best hit on our active this turn. */
  threat?: Threat;
  /** Chance the foe's active moves before ours with a normal-priority move. */
  foeFirst: number;
  moves: MoveFact[];
  switches: SwitchFact[];
  /** The request is a switch after a faint: nothing hits the one coming in. */
  forced: boolean;
  /** Our active can only use one move (Choice items, Encore). */
  lockedInto?: string;
  /** Chance the foe's active has each move (by id), from its possible sets and what it has shown. */
  foeMoves: Record<string, number>;
}

const NO_THREAT: Threat = { frac: 0, ko: 0, move: '', type: '', effectiveness: 1 };

/** Moves that knock out their user. */
const SELF_KO = new Set(['explosion', 'selfdestruct']);

/** Abilities that make a type of move do nothing (Gen 3 on). */
const ABSORB: Record<string, string> = {
  levitate: 'Ground',
  voltabsorb: 'Electric',
  waterabsorb: 'Water',
  flashfire: 'Fire',
};
const ABILITY_NAMES: Record<string, string> = {
  levitate: 'Levitate',
  voltabsorb: 'Volt Absorb',
  waterabsorb: 'Water Absorb',
  flashfire: 'Flash Fire',
};

/** Status moves and the major status they cause. */
const STATUS_MOVES: Record<string, string> = {
  toxic: 'tox',
  poisonpowder: 'psn',
  willowisp: 'brn',
  thunderwave: 'par',
  stunspore: 'par',
  glare: 'par',
  spore: 'slp',
  sleeppowder: 'slp',
  hypnosis: 'slp',
  sing: 'slp',
  lovelykiss: 'slp',
  grasswhistle: 'slp',
  darkvoid: 'slp',
  yawn: 'slp',
};
/** Types that can't get each status (Thunder Wave's Ground immunity is its type). */
const STATUS_IMMUNE: Record<string, string[]> = {
  tox: ['Poison', 'Steel'],
  psn: ['Poison', 'Steel'],
  brn: ['Fire'],
  par: [],
  slp: [],
};
const STATUS_ABILITY: Record<string, string[]> = {
  tox: ['immunity'],
  psn: ['immunity'],
  brn: ['waterveil'],
  par: ['limber'],
  slp: ['insomnia', 'vitalspirit'],
};
const HAZARD_MAX: Record<string, { key: 'spikes' | 'sr' | 'tspikes'; max: number; name: string }> =
  {
    spikes: { key: 'spikes', max: 3, name: 'Spikes' },
    stealthrock: { key: 'sr', max: 1, name: 'Stealth Rock' },
    toxicspikes: { key: 'tspikes', max: 2, name: 'Toxic Spikes' },
  };

/** The ability every possible set of the foe's active has, if they all agree (or it's revealed). */
function sureAbility(foe: FoeMon, abilities: string[]): string | undefined {
  if (foe.ability) return foe.ability;
  const ids = new Set(abilities.map(toId));
  return ids.size === 1 ? [...ids][0] : undefined;
}

/** One of ours for the calc, with its exact stats and HP from the request. */
function ownCalc(gen: Gen, view: SideView, mon: OwnMon): Pokemon {
  const req = view.request.requestType === 'wait' ? undefined : view.request.side.pokemon;
  const p = req?.[mon.slot - 1];
  const calc = makeMon(gen, {
    species: mon.forme,
    item: p?.item ?? mon.set.item,
    ability: p?.ability || p?.baseAbility || mon.set.ability,
    nature: 'Serious',
    evs: mon.set.evs,
    ivs: mon.set.ivs,
    boosts: mon.boosts,
    status: mon.status,
    hpFrac: 1,
  });
  if (p) {
    const max = Number(/\/(\d+)/.exec(p.condition)?.[1]) || calc.maxHP();
    calc.rawStats = { hp: max, ...p.stats };
    calc.originalCurHP = Math.max(1, Math.round(max * mon.hpFrac));
  }
  return calc;
}

/** Facts for the player's current request. Empty lists when there's no foe in front. */
export function turnFacts(view: SideView, data: SetsFile): Facts {
  const state = extractState(view, data);
  const format = data.meta.format;
  const gen = genFor(format);
  const toFoe = makeField(state.weather, state.ownSide, state.foeSide, state.terrain);
  const toOwn = makeField(state.weather, state.foeSide, state.ownSide, state.terrain);
  const foe = state.foeActive;
  const forced = view.request.requestType === 'switch';
  const facts: Facts = { state, foeFirst: 0.5, moves: [], switches: [], forced, foeMoves: {} };
  if (!foe || view.request.requestType === 'wait' || view.request.requestType === 'team') {
    return facts;
  }
  facts.foe = foe.forme;
  const foes = foeCands(foe, data, undefined, state.foeMegaUsed);
  for (const f of foes)
    for (const m of new Set(f.moves.map(moveId)))
      facts.foeMoves[m] = (facts.foeMoves[m] ?? 0) + f.weight;
  for (const m of foe.moves) facts.foeMoves[moveId(m)] = 1;
  const foeTypes = typesOf(gen, foe.forme);
  const foeAbility = sureAbility(
    foe,
    foes.map((f) => f.ability),
  );

  /**
   * The foe's best hit on one of ours. For a switch-in, moves that knock out
   * the foe too don't count: they'd knock out whatever stayed in just the same.
   */
  const threatOn = (calc: Pokemon, species: string, switchIn = false): Threat => {
    let frac = 0;
    let ko = 0;
    const byMove = new Map<string, number>();
    for (const f of foes) {
      let best: Hit & { move: string } = { frac: 0, ko: 0, move: '' };
      for (const move of f.moves) {
        if (switchIn && SELF_KO.has(moveId(move))) continue;
        const h = hit(f.mon, calc, move, toOwn);
        if (h.frac > best.frac) best = { ...h, move };
      }
      frac += f.weight * best.frac;
      ko += f.weight * best.ko;
      if (best.move) byMove.set(best.move, (byMove.get(best.move) ?? 0) + f.weight);
    }
    const move = [...byMove].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!move) return NO_THREAT;
    const info = new Move(gen, move);
    const type = info.type;
    return {
      frac,
      ko,
      move: info.name,
      type,
      effectiveness: effectiveness(gen, type, species),
    };
  };

  const bestOn = (calc: Pokemon, moves: string[]) =>
    Math.max(
      0,
      ...moves.map((m) => foes.reduce((a, f) => a + f.weight * hit(calc, f.mon, m, toFoe).frac, 0)),
    );

  for (const mon of state.own) {
    if (mon.active || mon.fainted) continue;
    const choice = `switch ${mon.slot}`;
    if (!legalChoices(view.request).includes(choice)) continue;
    const grounded =
      !typesOf(gen, mon.species).includes('Flying') && toId(mon.set.ability) !== 'levitate';
    const entry = grounded ? [0, 1 / 8, 1 / 6, 1 / 4][Math.min(3, state.ownSide.spikes)]! : 0;
    const calc = ownCalc(gen, view, { ...mon, hpFrac: Math.max(0.01, mon.hpFrac - entry) });
    const req = view.request.side.pokemon[mon.slot - 1]!;
    facts.switches.push({
      choice,
      slot: mon.slot,
      species: mon.species,
      hpFrac: mon.hpFrac,
      entry,
      taken: threatOn(calc, mon.forme, true),
      best: bestOn(calc, req.moves),
    });
  }

  const me = state.ownActive;
  if (forced || !me || view.request.requestType !== 'move') return facts;
  facts.me = me.forme;
  const meCalc = ownCalc(gen, view, me);
  facts.threat = threatOn(meCalc, me.forme);
  const mine = speed(meCalc, state.weather);
  facts.foeFirst = foes.reduce((p, f) => {
    const theirs = speed(f.spe, state.weather);
    return p + f.weight * (theirs > mine ? 1 : theirs === mine ? 0.5 : 0);
  }, 0);

  const active = view.request.active[0]!;
  const legal = new Set(legalChoices(view.request));
  const sleeping = sleptByPlayer(view);
  active.moves.forEach((m, i) => {
    const choice = `move ${i + 1}`;
    if (!legal.has(choice)) return;
    const name = moveName(m.name);
    const id = moveId(name);
    const info = moveInfo(gen, name);
    // Recharge and Struggle aren't real choices: no type, nothing to warn about.
    const forcedMove = id === 'recharge' || id === 'struggle';
    let damage = 0;
    let ko = 0;
    for (const f of foes) {
      const h = hit(meCalc, f.mon, name, toFoe);
      damage += f.weight * h.frac;
      ko += f.weight * h.ko;
    }
    const fact: MoveFact = {
      choice,
      name,
      id,
      type: info.type,
      category: info.category,
      damage,
      ko,
      first: info.priority > 0 ? 1 : info.priority < 0 ? 0 : 1 - facts.foeFirst,
      effectiveness:
        info.category === 'Status' || forcedMove ? null : effectiveness(gen, info.type, foe.forme),
    };
    const noEffect =
      !forcedMove && whyNoEffect(gen, fact, foe, foeTypes, foeAbility, state, sleeping);
    if (noEffect) fact.noEffect = noEffect;
    facts.moves.push(fact);
  });
  const usable = active.moves.filter((m) => !('disabled' in m && m.disabled));
  const only = usable.length === 1 ? usable[0]! : undefined;
  if (only && active.moves.length > 1 && !['recharge', 'struggle'].includes(moveId(only.name)))
    facts.lockedInto = only.name;
  return facts;
}

function whyNoEffect(
  gen: Gen,
  move: MoveFact,
  foe: FoeMon,
  foeTypes: string[],
  ability: string | undefined,
  state: AIState,
  sleeping: boolean,
): NoEffect | undefined {
  if (move.category !== 'Status') {
    // Fixed-damage and type-chart immunities both show as a zero multiplier.
    if (move.effectiveness === 0) return { kind: 'type', type: move.type };
    if (ability && ABSORB[ability] === move.type)
      return { kind: 'ability', ability: ABILITY_NAMES[ability]!, type: move.type };
    return undefined;
  }
  const hazard = HAZARD_MAX[move.id];
  if (hazard) {
    const now = state.foeSide[hazard.key];
    return (typeof now === 'boolean' ? (now ? 1 : 0) : now) >= hazard.max
      ? { kind: 'hazardMax', hazard: hazard.name }
      : undefined;
  }
  const status = STATUS_MOVES[move.id];
  if (!status) return undefined;
  if (foe.substitute) return { kind: 'substitute' };
  if (foe.status) return { kind: 'statused' };
  // Thunder Wave and Ground types: the type chart, like an attack.
  if (move.id === 'thunderwave' && foeTypes.includes('Ground'))
    return { kind: 'type', type: 'Electric' };
  const typeImmune = STATUS_IMMUNE[status]!.find((t) => foeTypes.includes(t));
  if (typeImmune) return { kind: 'statusImmune', type: typeImmune, status };
  if (ability && STATUS_ABILITY[status]!.includes(ability)) {
    return { kind: 'ability', ability: abilityName(gen, ability), type: '' };
  }
  if (status === 'slp' && sleeping) return { kind: 'sleepClause' };
  return undefined;
}

/**
 * Sleep Clause: one of the foe's Pokémon is asleep from the player's move.
 * Sleep it gave itself with Rest doesn't count.
 */
function sleptByPlayer(view: SideView): boolean {
  const side = view.side === 'p1' ? 'p2' : 'p1';
  return view.battle[side].team.some((p) => {
    if (p.fainted || p.status !== 'slp') return false;
    const prefix = `|-status|${side}a: ${p.name}|slp`;
    for (let i = view.log.length - 1; i >= 0; i--)
      if (view.log[i]!.startsWith(prefix)) return !view.log[i]!.includes('move: Rest');
    return true;
  });
}

const abilityName = (gen: Gen, id: string) =>
  gen.abilities.get(id as never)?.name ?? ABILITY_NAMES[id] ?? id;
