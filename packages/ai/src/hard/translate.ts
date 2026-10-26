// Turns one sampled world (a guess at the foe's hidden sets) plus everything
// the AI can see into a poke-engine state string. Side one is the AI, side two
// the foe. Our own code, written from poke-engine's documented state format
// (State::deserialize in poke-engine's src/state.rs).
import type { SetEntry, SetsFile } from '@daily-battle/data';
import type { SideView } from '@daily-battle/sim-bridge';
import type { Pokemon as ClientMon, Side as ClientSide } from '@pkmn/client';
import { genFor, makeMon, type Gen } from '../calc';
import { baseSpecies, isMegaForme, megaInfo, moveId, toId } from '../state';
import {
  engineId,
  engineMove,
  engineStatus,
  engineTerrain,
  engineWeather,
  VOLATILES,
} from './names';

type Request = Exclude<SideView['request'], { requestType: 'wait' }>;
type ReqMon = Request['side']['pokemon'][number];

/** One foe Pokémon in a world: its species, an assumed set, and what's been seen of it. */
export interface WorldFoe {
  species: string;
  set: SetEntry;
  /** The client's view of it, once it has been seen (sent out, or listed at Team Preview). */
  seen?: ClientMon;
}

/** Engine-ready Pokémon fields. */
interface Mon {
  id: string;
  level: number;
  types: [string, string];
  hp: number;
  maxhp: number;
  ability: string;
  item: string;
  nature: string;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
  stats: { atk: number; def: number; spa: number; spd: number; spe: number };
  status: string;
  sleepTurns: number;
  weight: number;
  moves: { id: string; disabled: boolean; pp: number }[];
  megaEvolved: boolean;
}

const EMPTY_MOVE = 'NONE;true;0';
const PP = 32;

function speciesInfo(gen: Gen, forme: string) {
  const s = gen.species.get(toId(forme) as never);
  const types = [...(s?.types ?? ['Normal'])].map((t) => t.toUpperCase());
  return {
    types: [types[0] ?? 'NORMAL', types[1] ?? 'TYPELESS'] as [string, string],
    weight: s?.weightkg ?? 50,
  };
}

const evsOf = (set: SetEntry) => ({
  hp: set.evs.hp ?? 0,
  atk: set.evs.atk ?? 0,
  def: set.evs.def ?? 0,
  spa: set.evs.spa ?? 0,
  spd: set.evs.spd ?? 0,
  spe: set.evs.spe ?? 0,
});

const ppLeft = (client: ClientMon | undefined, id: string) => {
  const used = client?.moveSlots.find((m) => moveId(m.id) === moveId(id))?.ppUsed;
  return Math.max(1, PP - (typeof used === 'number' ? used : 0));
};

function serializeMon(m: Mon): string {
  const moves = m.moves.map((x) => `${x.id};${x.disabled};${x.pp}`);
  while (moves.length < 4) moves.push(EMPTY_MOVE);
  const e = m.evs;
  return [
    m.id,
    m.level,
    m.types[0],
    m.types[1],
    m.types[0],
    m.types[1],
    m.hp,
    m.maxhp,
    m.ability,
    m.ability,
    m.item,
    m.nature,
    `${e.hp};${e.atk};${e.def};${e.spa};${e.spd};${e.spe}`,
    m.stats.atk,
    m.stats.def,
    m.stats.spa,
    m.stats.spd,
    m.stats.spe,
    m.status,
    0,
    m.sleepTurns,
    m.weight,
    ...moves.slice(0, 4),
    m.megaEvolved,
    false,
    'NORMAL',
  ].join(',');
}

/** An empty team slot (the foe brought fewer than six). Fainted, so never in play. */
const EMPTY_MON = serializeMon({
  id: 'NONE',
  level: 100,
  types: ['NORMAL', 'TYPELESS'],
  hp: 0,
  maxhp: 1,
  ability: 'NONE',
  item: 'NONE',
  nature: 'SERIOUS',
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  stats: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
  status: 'NONE',
  sleepTurns: 0,
  weight: 1,
  moves: [],
  megaEvolved: false,
});

function parseCondition(condition: string) {
  const [hpPart = '0', status = ''] = condition.split(' ');
  const [hp = '0', max = '0'] = hpPart.split('/');
  return { hp: Number(hp) || 0, maxhp: Number(max) || 0, status: status === 'fnt' ? '' : status };
}

/** Our own Pokémon: exact stats, HP, and moves from the request. */
function ownMon(
  p: ReqMon,
  set: SetEntry | undefined,
  client: ClientMon | undefined,
  request: Request,
  gen: Gen,
  genNum: number,
): Mon {
  const forme = p.speciesForme;
  const cond = parseCondition(p.condition);
  const info = speciesInfo(gen, forme);
  const active = p.active && request.requestType === 'move' ? request.active[0] : undefined;
  const moves = p.moves.slice(0, 4).map((id) => {
    if (!active) return { id: engineMove(id, genNum), disabled: false, pp: ppLeft(client, id) };
    // While locked in (Outrage, a Choice item…) the request lists only what can be used.
    const slot = active.moves.find((m) => moveId(m.id) === moveId(id));
    const pp = slot && 'pp' in slot ? slot.pp : 0;
    const disabled = !slot || ('disabled' in slot && !!slot.disabled) || pp <= 0;
    return { id: engineMove(id, genNum), disabled, pp: Math.max(disabled ? 0 : 1, pp) };
  });
  const stats = p.stats;
  return {
    id: engineId(forme),
    level: client?.level ?? 100,
    types: info.types,
    hp: cond.hp,
    maxhp: cond.maxhp || 1,
    ability: engineId(p.ability || p.baseAbility || set?.ability || ''),
    item: engineId(p.item),
    nature: engineId(set?.nature ?? 'Serious'),
    evs: set ? evsOf(set) : { hp: 85, atk: 85, def: 85, spa: 85, spd: 85, spe: 85 },
    stats: { atk: stats.atk, def: stats.def, spa: stats.spa, spd: stats.spd, spe: stats.spe },
    status: engineStatus(cond.status),
    sleepTurns: client?.statusState.sleepTurns ?? 0,
    weight: info.weight,
    moves,
    megaEvolved: isMegaForme(forme),
  };
}

/** A foe Pokémon: the world's assumed set, overlaid with everything revealed. */
function foeMon(foe: WorldFoe, gen: Gen, genNum: number, format: string): Mon {
  const { set, seen } = foe;
  const forme = seen?.speciesForme ?? foe.species;
  const mega = isMegaForme(forme) ? megaInfo(format, foe.species, set.item) : undefined;
  // Revealed item, or none once it's been used up or knocked off.
  const item = seen?.item ? seen.item : seen?.lastItem ? '' : toId(set.item);
  const ability = mega?.ability ?? (seen?.ability || set.ability);
  const calc = makeMon(gen, {
    species: forme,
    item,
    ability,
    nature: set.nature,
    evs: set.evs,
    ivs: set.ivs,
    boosts: {},
    status: '',
    hpFrac: 1,
  });
  const maxhp = calc.maxHP();
  const frac = !seen ? 1 : seen.fainted ? 0 : seen.maxhp ? seen.hp / seen.maxhp : 1;
  const hp = seen?.fainted ? 0 : Math.max(1, Math.round(maxhp * frac));
  const info = speciesInfo(gen, forme);
  // A Choice item locks the active foe into the move it last used.
  const locked =
    seen && seen.side.active.includes(seen) && toId(item).startsWith('choice') && seen.lastMove
      ? moveId(seen.lastMove)
      : '';
  const moves = set.moves.slice(0, 4).map((m) => ({
    id: engineMove(m, genNum),
    disabled: !!locked && moveId(m) !== locked,
    pp: ppLeft(seen, m),
  }));
  const r = calc.rawStats;
  return {
    id: engineId(forme),
    level: seen?.level ?? 100,
    types: info.types,
    hp,
    maxhp,
    ability: engineId(ability),
    item: engineId(item),
    nature: engineId(set.nature),
    evs: evsOf(set),
    stats: { atk: r.atk, def: r.def, spa: r.spa, spd: r.spd, spe: r.spe },
    status: engineStatus(seen?.status),
    sleepTurns: seen?.statusState.sleepTurns ?? 0,
    weight: info.weight,
    moves,
    megaEvolved: isMegaForme(forme),
  };
}

const turns = (c: { minDuration?: number; maxDuration?: number } | undefined, fallback = 5) =>
  c ? c.minDuration || c.maxDuration || fallback : 0;

function sideConditions(side: ClientSide, active: ClientMon | null | undefined): string {
  const sc = side.sideConditions as Record<
    string,
    { level?: number; minDuration?: number; maxDuration?: number } | undefined
  >;
  const level = (id: string) => (sc[id] ? (sc[id]!.level ?? 1) : 0);
  const toxic = active?.status === 'tox' ? Math.max(0, active.statusState.toxicTurns) : 0;
  // In poke-engine's order.
  return [
    turns(sc.auroraveil),
    0, // crafty shield
    0, // healing wish
    turns(sc.lightscreen),
    turns(sc.luckychant),
    0, // lunar dance
    0, // mat block
    turns(sc.mist),
    0, // consecutive protects
    0, // quick guard
    turns(sc.reflect),
    turns(sc.safeguard),
    level('spikes'),
    level('stealthrock') ? 1 : 0,
    level('stickyweb') ? 1 : 0,
    turns(sc.tailwind, 4),
    toxic,
    level('toxicspikes'),
    0, // wide guard
  ].join(';');
}

const BOOSTS = ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion'] as const;

interface SideInput {
  mons: string[];
  activeIndex: number;
  /** The active Pokémon's moves as serialized (engine ids), for its last-used move. */
  activeMoves: string[];
  client: ClientSide;
  active: ClientMon | null | undefined;
  /** The active Pokémon's max HP (for a Substitute's HP). */
  activeMaxHp: number;
  forceSwitch: boolean;
  gen: number;
}

function serializeSide(s: SideInput): string {
  const mons = [...s.mons];
  while (mons.length < 6) mons.push(EMPTY_MON);
  const a = s.active;
  const volatiles = Object.keys(a?.volatiles ?? {}).filter((v) => VOLATILES.has(v));
  const boosts = BOOSTS.map((b) => a?.boosts[b] ?? 0);
  const last = a?.lastMove ? s.activeMoves.indexOf(engineMove(a.lastMove, s.gen)) : -1;
  return [
    ...mons.slice(0, 6),
    s.activeIndex,
    sideConditions(s.client, a),
    volatiles.map((v) => v.toUpperCase()).join(':'),
    '0;0;0;0;0;0', // volatile durations: confusion, encore, locked move, slow start, taunt, yawn
    volatiles.includes('substitute') ? Math.floor(s.activeMaxHp / 4) : 0,
    ...boosts,
    0, // wish turns
    0, // wish HP
    0, // future sight turns
    0, // future sight user
    s.forceSwitch,
    'NONE',
    false, // baton passing
    false, // shed tailing
    false, // force trapped
    last >= 0 ? `move:${last}` : `switch:${s.activeIndex}`,
    false,
  ].join('=');
}

const moveIds = (mon: string) =>
  mon
    .split(',')
    .slice(22, 26)
    .map((m) => m.split(';')[0]!);

/**
 * The engine state for one world. `foes` are the foe's six (seen and assumed),
 * in any order; the active one is found by its client view.
 */
export function translate(
  view: SideView,
  foes: WorldFoe[],
  data: SetsFile,
  ownSets: (SetEntry | undefined)[],
): string {
  const request = view.request as Request;
  const format = data.meta.format;
  const gen = genFor(format);
  const genNum = gen.num;
  const ownClient = view.battle[view.side];
  const foeClient = view.battle[view.side === 'p1' ? 'p2' : 'p1'];

  const reqMons = request.side.pokemon;
  const ownClientMon = (p: ReqMon) =>
    ownClient.team.find(
      (c) =>
        c.originalIdent === p.ident || baseSpecies(c.speciesForme) === baseSpecies(p.speciesForme),
    );
  const own = reqMons.map((p, i) => ownMon(p, ownSets[i], ownClientMon(p), request, gen, genNum));
  const ownActive = Math.max(
    0,
    reqMons.findIndex((p) => p.active),
  );
  const foeMons = foes.map((f) => foeMon(f, gen, genNum, format));
  const foeActiveClient = foeClient.active[0];
  const foeActive = Math.max(
    0,
    foes.findIndex((f) => f.seen && f.seen === foeActiveClient),
  );

  const side1 = serializeSide({
    mons: own.map(serializeMon),
    activeIndex: ownActive,
    activeMoves: own[ownActive]?.moves.map((m) => m.id) ?? [],
    client: ownClient,
    active: ownClient.active[0],
    activeMaxHp: own[ownActive]?.maxhp ?? 1,
    forceSwitch: request.requestType === 'switch',
    gen: genNum,
  });
  const side2Mons = foeMons.map(serializeMon);
  const side2 = serializeSide({
    mons: side2Mons,
    activeIndex: foeActive,
    activeMoves: side2Mons[foeActive] ? moveIds(side2Mons[foeActive]!) : [],
    client: foeClient,
    active: foeActiveClient,
    activeMaxHp: foeMons[foeActive]?.maxhp ?? 1,
    forceSwitch: false,
    gen: genNum,
  });

  const field = view.battle.field;
  const weather = engineWeather(field.weatherState.id);
  // No duration means permanent (weather from an ability before Gen 6).
  const weatherTurns =
    weather === 'NONE' ? 0 : field.weatherState.minDuration || field.weatherState.maxDuration || -1;
  const terrain = engineTerrain(field.terrainState.id);
  const trickRoom = field.pseudoWeather.trickroom;
  return [
    side1,
    side2,
    `${weather};${weatherTurns}`,
    `${terrain};${terrain === 'NONE' ? 0 : turns(field.terrainState)}`,
    `${!!trickRoom};${trickRoom ? turns(trickRoom) : 0}`,
    'false',
  ].join('/');
}
