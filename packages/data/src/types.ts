export type StatID = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type Stats = Record<StatID, number>;

/** One concrete, validator-clean set as shipped in `gen4ou/sets.json`. */
export interface SetEntry {
  /** Stable id, e.g. `tyranitar-choice-band`. */
  id: string;
  /** Set name in the curated source. */
  sourceName: string;
  /** Player-facing role, e.g. "Choice Scarf attacker". */
  label: string;
  /** One-line player-facing description. */
  description: string;
  /** Share among this species' kept sets; sums to 1 per species. */
  weight: number;
  moves: string[];
  item: string;
  ability: string;
  nature: string;
  evs: Stats;
  ivs: Stats;
}

export interface SpeciesEntry {
  /** Species-level weighted usage in OU, from the stats source (not normalized). */
  usage: number;
  /** Current Gen 4 tier from the sim's data, e.g. `OU`, `UU`, `UUBL`, `NU`. */
  tier: string;
  /** Which curated set list the sets came from. All sets are legal in gen4ou. */
  setSource: 'gen4ou' | 'gen4uu';
  sets: SetEntry[];
}

export interface SourcesMeta {
  sets: { url: string; fetchedAt: string };
  uuSets: { url: string; fetchedAt: string };
  stats: { url: string; month: string; cutoff: number; battles: number; fetchedAt: string };
}

export interface SetsFile {
  meta: {
    format: string;
    method: string;
    simVersion: string;
    builtAt: string;
    sources: SourcesMeta;
  };
  species: Record<string, SpeciesEntry>;
}

// Source shapes.

type OneOrMany<T> = T | T[];

/** A set from data.pkmn.cc; most fields may list several options. */
export interface CuratedSet {
  moves: OneOrMany<string>[];
  item?: OneOrMany<string>;
  ability?: OneOrMany<string>;
  nature?: OneOrMany<string>;
  evs?: OneOrMany<Partial<Stats>>;
  ivs?: OneOrMany<Partial<Stats>>;
}

/** Species name → set name → set. */
export type CuratedSets = Record<string, Record<string, CuratedSet>>;

/**
 * Per-species entry in a Smogon chaos stats file, trimmed to the fields we use.
 * `Natures` isn't in the chaos file; `refresh` sums `Spreads` by nature to make it.
 */
export interface ChaosSpecies {
  'Raw count': number;
  usage: number;
  Abilities: Record<string, number>;
  Items: Record<string, number>;
  Moves: Record<string, number>;
  Natures: Record<string, number>;
}

export interface ChaosStats {
  info: { metagame: string; cutoff: number; 'number of battles': number };
  data: Record<string, ChaosSpecies>;
}

/** Hand-reviewed label/description edits, keyed by set id. */
export type RoleOverrides = Record<string, { label?: string; description?: string }>;
