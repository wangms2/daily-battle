export type StatID = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
export type Stats = Record<StatID, number>;

/** One concrete, validator-clean set as shipped in `<format>/sets.json`. */
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
  /**
   * Current tier in the format's generation, from the sim's data, e.g. `OU`,
   * `UU`, `UUBL`, `NU`. From Gen 6, the higher of the species' own tier and
   * those of the Megas its sets' stones make (Venusaur plays as OU).
   */
  tier: string;
  /**
   * Which curated set list the sets came from: the format itself (`gen4ou`) or
   * its lower tier (`gen4uu`). All sets are legal in the format either way.
   */
  setSource: string;
  sets: SetEntry[];
}

export interface SourcesMeta {
  sets: { url: string; fetchedAt: string };
  uuSets: { url: string; fetchedAt: string };
  stats: {
    url: string;
    month: string;
    /** The ladder rating cutoff, or null when the source doesn't say (the `--mirror` stats). */
    cutoff: number | null;
    battles: number;
    fetchedAt: string;
  };
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
  info: { metagame: string; cutoff: number | null; 'number of battles': number };
  data: Record<string, ChaosSpecies>;
}

/** Hand-reviewed label/description edits, keyed by set id. */
export type RoleOverrides = Record<string, { label?: string; description?: string }>;
