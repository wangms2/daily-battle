// Read-only helpers over the set data and species facts of the game being
// shown (Gen 4 OU or Gen 5 OU). No simulator code here.
import {
  DEFAULT_FORMAT,
  FORMATS,
  formatInfo,
  setsFor,
  type SetEntry,
  type SetsFile,
} from '@daily-battle/data';
import {
  speciesDataFor,
  type MoveInfo,
  type SpeciesFile,
  type SpeciesInfo,
} from '@daily-battle/data/species';

let format: string = DEFAULT_FORMAT;
let sets: SetsFile = setsFor(format);
let speciesData: SpeciesFile = speciesDataFor(format);

/**
 * Points every helper here at a format's data. The app calls it before
 * rendering a game, and remounts the game when the format changes.
 */
export function setActiveFormat(id: string): void {
  if (id === format) return;
  format = id;
  sets = setsFor(id);
  speciesData = speciesDataFor(id);
}

export const activeFormat = () => format;

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

/**
 * The species' sets that fit what a foe has shown: every revealed move, and
 * its item and ability if revealed. For Beginner hints only, and never with
 * usage. If nothing fits (an item was swapped by Trick, say), the item stops
 * counting; past that, every set stays possible.
 */
export function possibleSets(
  species: string,
  revealed?: { moves: string[]; item: string; ability: string },
): SetEntry[] {
  const all = setsOf(species);
  if (!revealed) return all;
  // Hidden Power shows by type in some places and not others; any typed one matches.
  const id = (m: string) => toId(m).replace(/^hiddenpower[a-z]*$/, 'hiddenpower');
  const fits = (set: SetEntry, checkItem: boolean) =>
    revealed.moves.every((m) => set.moves.some((x) => id(x) === id(m))) &&
    (!checkItem || !revealed.item || toId(set.item) === toId(revealed.item)) &&
    (!revealed.ability || toId(set.ability) === toId(revealed.ability));
  const strict = all.filter((s) => fits(s, true));
  if (strict.length) return strict;
  const loose = all.filter((s) => fits(s, false));
  return loose.length ? loose : all;
}

/** The most common set for a species (what a tap on a pool tile picks). */
export function topSet(species: string): SetEntry {
  return [...setsOf(species)].sort((a, b) => b.weight - a.weight)[0]!;
}

/**
 * National Dex number. It's the same in every format, and forms share it
 * (Rotom-Wash and Rotom-Frost are both #479).
 */
export function dexNum(species: string): number | undefined {
  for (const f of Object.keys(FORMATS)) {
    const info = speciesDataFor(f).species[species];
    if (info) return info.num;
  }
  return undefined;
}

/** Species Clause: two forms of one Pokémon count as the same species on a team. */
export const sameSpecies = (a: string, b: string) =>
  a === b || (dexNum(a) !== undefined && dexNum(a) === dexNum(b));

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

/** Every type in the chart (the same 17 in Gens 4 and 5). */
export const allTypes = () => Object.keys(speciesData.typeChart);

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
    // From Gen 5 these also make their user immune.
    ...(formatInfo(format).gen >= 5 && {
      'Sap Sipper': 'Grass',
      'Storm Drain': 'Water',
      'Lightning Rod': 'Electric',
    }),
  };
  const immuneByAbility = new Set([...abilities].map((a) => abilityImmune[a]).filter(Boolean));
  const out: Matchups = { weak: [], resist: [], immune: [] };
  for (const type of allTypes()) {
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
  return allTypes()
    .map((type) => ({
      type,
      species: team.filter((s) => matchups(s).weak.some((w) => w.type === type)),
    }))
    .filter((x) => x.species.length >= 2)
    .sort((a, b) => b.species.length - a.species.length);
}

/** Damaging moves whose type doesn't change the damage (fixed or reflected). */
const TYPELESS_DAMAGE = [
  'Seismic Toss',
  'Night Shade',
  'Super Fang',
  'Endeavor',
  'Counter',
  'Mirror Coat',
  'Metal Burst',
  'Psywave',
  'Final Gambit',
];

/** Types none of the team's attacks hits super effectively. */
export function offenseGaps(team: SetEntry[]): string[] {
  const attacking = new Set<string>();
  for (const set of team) {
    for (const m of set.moves) {
      const info = moveInfo(m);
      if (info && info.category !== 'Status' && !TYPELESS_DAMAGE.includes(m))
        attacking.add(info.type);
    }
  }
  return allTypes().filter(
    (def) => ![...attacking].some((atk) => (speciesData.typeChart[atk]?.[def] ?? 1) > 1),
  );
}

/**
 * Types three or more of the team are weak to with no one resisting or immune
 * (immunity abilities like Levitate count, as in `matchups`).
 */
export function defenseGaps(team: string[]): { type: string; species: string[] }[] {
  const all = team.map((s) => ({ s, m: matchups(s) }));
  return allTypes()
    .map((type) => ({
      type,
      species: all.filter(({ m }) => m.weak.some((w) => w.type === type)).map(({ s }) => s),
      covered: all.some(
        ({ m }) => m.immune.includes(type) || m.resist.some((r) => r.type === type),
      ),
    }))
    .filter((g) => g.species.length >= 3 && !g.covered)
    .map(({ type, species }) => ({ type, species }));
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

/** What an item does (any item a set holds). */
export const itemInfo = (name: string): string | undefined => speciesData.items[name];

/** What an ability does (any ability a set has). */
export const abilityInfo = (name: string): string | undefined => speciesData.abilities[name];

/** What a set's move does (any move a set uses). */
export function moveInfo(name: string): MoveInfo | undefined {
  return speciesData.moves[name];
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
