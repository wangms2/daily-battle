// Extracts what the AI reasons about from a SideView: its own team (full info,
// from its own request) and what it has seen of the foe (from its own log).
import { sets as defaultSets, type SetEntry, type SetsFile } from '@daily-battle/data';
import type { SideView } from '@daily-battle/sim-bridge';

export interface SideConds {
  sr: boolean;
  spikes: number;
  tspikes: number;
  reflect: boolean;
  lightScreen: boolean;
}

export interface OwnMon {
  /** 1-based index in the request, as used by `switch N`. */
  slot: number;
  species: string;
  active: boolean;
  fainted: boolean;
  hpFrac: number;
  status: string;
  boosts: Record<string, number>;
  /** The full set (own team, so known); matched against the set data. */
  set: SetEntry;
}

export interface FoeMon {
  species: string;
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
}

export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
/** Request ids can carry Hidden Power's base power (`hiddenpowerice60`). */
export const moveId = (s: string) => toId(s).replace(/^(hiddenpower[a-z]*)\d+$/, '$1');

function sideConds(conditions: Record<string, { level?: number } | undefined>): SideConds {
  const level = (id: string) => (conditions[id] ? (conditions[id]!.level ?? 1) : 0);
  return {
    sr: level('stealthrock') > 0,
    spikes: level('spikes'),
    tspikes: level('toxicspikes'),
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

  const own: OwnMon[] = reqMons.map((p, i) => {
    const species = p.speciesForme;
    const client = ownSide.team.find(
      (c) => c.originalIdent === p.ident || c.speciesForme === species,
    );
    return {
      slot: i + 1,
      species,
      active: !!p.active,
      fainted: !!p.fainted || p.condition.endsWith(' fnt'),
      hpFrac: p.maxhp ? p.hp / p.maxhp : 0,
      status: p.status ?? '',
      boosts: { ...(p.active ? client?.boosts : {}) },
      set: matchOwnSet(species, p.item, p.moves, data),
    };
  });

  // With Team Preview (Gen 5 on), the foe's whole team is listed from the start;
  // the ones not yet sent out have no HP reading, so they count as healthy.
  const foe: FoeMon[] = foeSide.team.map((p) => ({
    species: p.speciesForme,
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

  return {
    side: view.side,
    turn: battle.turn,
    weather: battle.field.weatherState.id,
    own,
    ownActive: own.find((m) => m.active),
    ownSide: sideConds(ownSide.sideConditions as never),
    foe,
    foeActive: foe.find((m) => m.active && !m.fainted),
    foeSide: sideConds(foeSide.sideConditions as never),
    foeTotal: foeSide.totalPokemon || 6,
  };
}
