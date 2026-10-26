// Extracts what the AI reasons about from a SideView: its own team (full info,
// from its own request) and what it has seen of the foe (from its own log).
import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import { speciesDataFor } from '@daily-battle/data/species';
import type { SideView } from '@daily-battle/sim-bridge';

export interface SideConds {
  sr: boolean;
  spikes: number;
  tspikes: number;
  /** Sticky Web (Gen 6 on). */
  web: boolean;
  reflect: boolean;
  lightScreen: boolean;
}

export interface OwnMon {
  /** 1-based index in the request, as used by `switch N`. */
  slot: number;
  /** Base species, as in the set data (Mega Evolving doesn't change it). */
  species: string;
  /** The forme it battles as right now, e.g. `Charizard-Mega-X` once it has Mega Evolved. */
  forme: string;
  active: boolean;
  fainted: boolean;
  hpFrac: number;
  status: string;
  boosts: Record<string, number>;
  /** The full set (own team, so known); matched against the set data. */
  set: SetEntry;
  /** The Mega its set's stone makes, if any (Gen 6 on). */
  megaForme?: string;
}

export interface FoeMon {
  /** Base species, as in the set data (Mega Evolving doesn't change it). */
  species: string;
  /** The forme it battles as right now, e.g. `Charizard-Mega-X` once it has Mega Evolved. */
  forme: string;
  active: boolean;
  fainted: boolean;
  hpFrac: number;
  status: string;
  boosts: Record<string, number>;
  substitute: boolean;
  /** Revealed move ids. */
  moves: string[];
  /** Revealed item id, or ''. */
  item: string;
  /** Revealed ability id, or ''. */
  ability: string;
}

export interface AIState {
  side: 'p1' | 'p2';
  turn: number;
  weather: string;
  own: OwnMon[];
  ownActive?: OwnMon;
  ownSide: SideConds;
  /** Foe Pokémon seen so far: those sent out in Gen 4, all six from Team Preview in Gen 5. */
  foe: FoeMon[];
  foeActive?: FoeMon;
  foeSide: SideConds;
  /** Size of the foe's team, from `|teamsize|`. */
  foeTotal: number;
  /** Electric, Grassy, Misty or Psychic Terrain's id (Gen 6 on), or ''. */
  terrain: string;
  /** The active Pokémon can Mega Evolve this turn (Gen 6 on). */
  canMega: boolean;
  /** One of ours has Mega Evolved; one Mega per battle. */
  ownMegaUsed: boolean;
  /** One of the foe's has Mega Evolved, so no other foe will. */
  foeMegaUsed: boolean;
}

/** "Charizard-Mega-X" → "Charizard": the species the set data knows it as. */
export const baseSpecies = (forme: string) => forme.replace(/-Mega(-[XY])?$/, '');
export const isMegaForme = (forme: string) => /-Mega(-[XY])?$/.test(forme);

/** The Mega a set's stone makes for its species, from the species data (Gen 6 on). */
export function megaFormeOf(format: string, species: string, item: string): string | undefined {
  return megaInfo(format, species, item)?.forme;
}

/** The Mega (forme and ability) a set's stone makes for its species, if any. */
export function megaInfo(format: string, species: string, item: string) {
  return speciesDataFor(format).species[species]?.megas?.[item];
}

export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/**
 * Older gens' requests add the power of Hidden Power and Return/Frustration
 * ("Hidden Power Ice 70", id `hiddenpowerice70`, `return102`). No move's own
 * id or name ends in a number, so these strip it.
 */
export const moveId = (s: string) => toId(s).replace(/\d+$/, '');
export const moveName = (s: string) => s.replace(/\s+\d+$/, '');

function sideConds(conditions: Record<string, { level?: number } | undefined>): SideConds {
  const level = (id: string) => (conditions[id] ? (conditions[id]!.level ?? 1) : 0);
  return {
    sr: level('stealthrock') > 0,
    spikes: level('spikes'),
    tspikes: level('toxicspikes'),
    web: level('stickyweb') > 0,
    reflect: level('reflect') > 0,
    lightScreen: level('lightscreen') > 0,
  };
}

/** Finds our own set in the data by species, item, and moves; falls back to a close match. */
export function matchOwnSet(
  species: string,
  item: string,
  moves: string[],
  data: SetsFile,
): SetEntry {
  const sets = data.species[species]?.sets ?? [];
  const want = new Set(moves.map(moveId));
  const overlap = (s: SetEntry) => s.moves.filter((m) => want.has(moveId(m))).length;
  const exact = sets.find((s) => toId(s.item) === toId(item) && overlap(s) === want.size);
  if (exact) return exact;
  const best = [...sets].sort((a, b) => overlap(b) - overlap(a))[0];
  if (best) return best;
  // Not from the data (shouldn't happen in this game): a neutral stand-in.
  return {
    id: `${toId(species)}-unknown`,
    sourceName: 'Unknown',
    label: 'Unknown',
    description: '',
    weight: 1,
    moves,
    item,
    ability: '',
    nature: 'Serious',
    evs: { hp: 84, atk: 84, def: 84, spa: 84, spd: 84, spe: 84 },
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
  };
}

export function extractState(view: SideView, data: SetsFile = defaultSets): AIState {
  const { battle, request } = view;
  const ownSide = battle[view.side];
  const foeSide = battle[view.side === 'p1' ? 'p2' : 'p1'];
  const reqMons = request.requestType === 'wait' ? [] : request.side.pokemon;

  const format = data.meta.format;
  const own: OwnMon[] = reqMons.map((p, i) => {
    const forme = p.speciesForme;
    // Track by base species: a Mega's forme changes mid-battle, its species doesn't.
    const species = baseSpecies(forme);
    const client = ownSide.team.find(
      (c) => c.originalIdent === p.ident || baseSpecies(c.speciesForme) === species,
    );
    const set = matchOwnSet(species, p.item, p.moves, data);
    const mon: OwnMon = {
      slot: i + 1,
      species,
      forme,
      active: !!p.active,
      fainted: !!p.fainted || p.condition.endsWith(' fnt'),
      hpFrac: p.maxhp ? p.hp / p.maxhp : 0,
      status: p.status ?? '',
      boosts: { ...(p.active ? client?.boosts : {}) },
      set,
    };
    const megaForme = megaFormeOf(format, species, set.item);
    if (megaForme) mon.megaForme = megaForme;
    return mon;
  });

  // With Team Preview (Gen 5 on), the foe's whole team is listed from the start;
  // the ones not yet sent out have no HP reading, so they count as healthy.
  const foe: FoeMon[] = foeSide.team.map((p) => ({
    species: baseSpecies(p.speciesForme),
    forme: p.speciesForme,
    active: foeSide.active.includes(p),
    fainted: p.fainted,
    hpFrac: p.maxhp ? p.hp / p.maxhp : p.fainted ? 0 : 1,
    status: p.status ?? '',
    boosts: { ...p.boosts },
    substitute: 'substitute' in p.volatiles,
    moves: p.moveSlots.map((m) => moveId(m.id)),
    item: p.item ? toId(p.item) : '',
    ability: toId(p.ability || p.baseAbility || ''),
  }));

  const active = request.requestType === 'move' ? request.active[0] : undefined;
  return {
    side: view.side,
    turn: battle.turn,
    weather: battle.field.weatherState.id,
    terrain: battle.field.terrainState.id,
    canMega: !!active?.canMegaEvo,
    ownMegaUsed: own.some((m) => isMegaForme(m.forme)),
    foeMegaUsed: foe.some((m) => isMegaForme(m.forme)),
    own,
    ownActive: own.find((m) => m.active),
    ownSide: sideConds(ownSide.sideConditions as never),
    foe,
    foeActive: foe.find((m) => m.active && !m.fainted),
    foeSide: sideConds(foeSide.sideConditions as never),
    foeTotal: foeSide.totalPokemon || 6,
  };
}
