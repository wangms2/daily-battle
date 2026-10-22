// Read-only helpers over the set data and species facts. No simulator code here.
import { sets, type SetEntry } from '@daily-battle/data';
import { speciesData, type SpeciesInfo } from '@daily-battle/data/species';

export interface Slot {
  species: string;
  setId: string;
}

export const toId = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function setsOf(species: string): SetEntry[] {
  return sets.species[species]?.sets ?? [];
}

/**
 * The set a slot names. A set merged away in a data update (one that did the
 * same job as another) falls back to the species' most common set, so saved
 * teams keep working.
 */
export function findSet(slot: Slot): SetEntry | undefined {
  const sets = setsOf(slot.species);
  return sets.find((s) => s.id === slot.setId) ?? (sets.length ? topSet(slot.species) : undefined);
}

/** The most common set for a species (what a tap on a pool tile picks). */
export function topSet(species: string): SetEntry {
  return [...setsOf(species)].sort((a, b) => b.weight - a.weight)[0]!;
}

export function speciesInfo(species: string): SpeciesInfo {
  return speciesData.species[species]!;
}

/** Damage multiplier of an attacking type against a species' typing. */
export function multiplier(attacking: string, species: string): number {
  return speciesInfo(species).types.reduce(
    (m, t) => m * (speciesData.typeChart[attacking]?.[t] ?? 1),
    1,
  );
}

export const ALL_TYPES = Object.keys(speciesData.typeChart);

export interface Matchups {
  weak: { type: string; mult: number }[];
  resist: { type: string; mult: number }[];
  immune: string[];
}

/** Defensive type matchups, with the immunity abilities a species' sets use. */
export function matchups(species: string): Matchups {
  const abilities = new Set(setsOf(species).map((s) => s.ability));
  const abilityImmune: Record<string, string> = {
    Levitate: 'Ground',
    'Flash Fire': 'Fire',
    'Water Absorb': 'Water',
    'Dry Skin': 'Water',
    'Volt Absorb': 'Electric',
    'Motor Drive': 'Electric',
  };
  const immuneByAbility = new Set([...abilities].map((a) => abilityImmune[a]).filter(Boolean));
  const out: Matchups = { weak: [], resist: [], immune: [] };
  for (const type of ALL_TYPES) {
    const mult = immuneByAbility.has(type) ? 0 : multiplier(type, species);
    if (mult === 0) out.immune.push(type);
    else if (mult > 1) out.weak.push({ type, mult });
    else if (mult < 1) out.resist.push({ type, mult });
  }
  out.weak.sort((a, b) => b.mult - a.mult);
  out.resist.sort((a, b) => a.mult - b.mult);
  return out;
}

/** Types that two or more team members are weak to, most shared first. */
export function sharedWeaknesses(team: string[]): { type: string; species: string[] }[] {
  return ALL_TYPES.map((type) => ({
    type,
    species: team.filter((s) => matchups(s).weak.some((w) => w.type === type)),
  }))
    .filter((x) => x.species.length >= 2)
    .sort((a, b) => b.species.length - a.species.length);
}

const HAZARDS = ['Stealth Rock', 'Spikes', 'Toxic Spikes'];
const REMOVAL = ['Rapid Spin', 'Defog'];
const isBulky = (s: SetEntry) => s.evs.hp >= 200 && Math.max(s.evs.def, s.evs.spd) >= 160;

export interface Checklist {
  hazards: boolean;
  removal: boolean;
  physical: boolean;
  special: boolean;
  defensive: boolean;
}

export const CHECK_ITEMS: { key: keyof Checklist; label: string; why: string }[] = [
  { key: 'hazards', label: 'Hazards', why: 'Stealth Rock or Spikes chip every switch-in.' },
  { key: 'removal', label: 'Removal', why: 'Rapid Spin clears hazards from your side.' },
  { key: 'physical', label: 'Physical', why: 'A strong physical attacker.' },
  { key: 'special', label: 'Special', why: 'A strong special attacker.' },
  { key: 'defensive', label: 'Defense', why: 'A bulky Pokémon to take hits.' },
];

/** Beginner checklist (§12.2a) for the chosen sets. */
export function checklist(team: SetEntry[]): Checklist {
  const any = (pred: (s: SetEntry) => boolean) => team.some(pred);
  return {
    hazards: any((s) => s.moves.some((m) => HAZARDS.includes(m))),
    removal: any((s) => s.moves.some((m) => REMOVAL.includes(m))),
    physical: any((s) => !isBulky(s) && s.evs.atk >= 200),
    special: any((s) => !isBulky(s) && s.evs.spa >= 200),
    defensive: any(isBulky),
  };
}

const STAT_LABEL: Record<string, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};

/** "252 Atk / 4 SpD / 252 Spe". */
export function formatEvs(evs: Record<string, number>): string {
  return Object.entries(evs)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v} ${STAT_LABEL[k]}`)
    .join(' / ');
}

/** A tab-sized name: "Choice Scarf attacker" → "Scarf", "Swords Dance sweeper" → "Swords Dance". */
export function shortLabel(label: string): string {
  return label
    .replace(/^Choice /, '')
    .replace(/ (attacker|sweeper|setter)\b/, '')
    .replace(/\(physically defensive\)/, '(Phys. def.)')
    .replace(/\(specially defensive\)/, '(Spec. def.)');
}

export { STAT_LABEL };

/** A full set for the simulator from a team slot. */
export function toBattleSet(slot: Slot) {
  const set = findSet(slot);
  if (!set) throw new Error(`Unknown set ${slot.species} / ${slot.setId}`);
  return {
    name: slot.species,
    species: slot.species,
    item: set.item,
    ability: set.ability,
    nature: set.nature,
    evs: { ...set.evs },
    ivs: { ...set.ivs },
    moves: [...set.moves],
    level: 100,
    gender: '',
  };
}
