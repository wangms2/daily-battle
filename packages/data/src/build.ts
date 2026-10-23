import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Dex, TeamValidator, toID } from '@pkmn/sim';
import { samePurpose } from './distinct';
import { DEFAULT_FORMAT, formatInfo, type FormatId } from './formats';
import { resolveSet, usageShares } from './resolve';
import { assignRoles } from './roles';
import type {
  ChaosStats,
  CuratedSets,
  RoleOverrides,
  SetEntry,
  SetsFile,
  SpeciesEntry,
  SourcesMeta,
} from './types';
import { scoreSet, selectAndWeight } from './weights';

export const METHOD = 'curated-usage-weighted-v1';
/** How many species make the playable data set. */
export const SPECIES_COUNT = 70;
/** UU-tier species also included when their OU usage is at least UU_MIN_USAGE. */
export const UU_TIERS = ['UU', 'UUBL'];
export const UU_MIN_USAGE = 0.001;

/**
 * Per-format build rules. `exclude` leaves out species whose mechanics break the
 * game's assumptions: Ditto (Imposter copies your set) and Zoroark (Illusion
 * disguises it on the brief). `avoidAbilities` are legal on a set but can make a
 * team illegal (gen5ou bans Drizzle with Swift Swim and Drought with Chlorophyll),
 * so sets use the species' other abilities and any 6 of a pool stay legal.
 */
export const BUILD_RULES: Record<FormatId, { exclude: string[]; avoidAbilities: string[] }> = {
  gen4ou: { exclude: [], avoidAbilities: [] },
  gen5ou: { exclude: ['Ditto', 'Zoroark'], avoidAbilities: ['Swift Swim', 'Chlorophyll'] },
};

export interface BuildInput {
  /** Which format to build for; defaults to Gen 4 OU. */
  format?: FormatId;
  /** Curated sets for the format (e.g. gen4ou). */
  curated: CuratedSets;
  /** Curated sets for its lower tier (e.g. gen4uu), used for UU species with no OU sets. */
  curatedUU: CuratedSets;
  stats: ChaosStats;
  sources: SourcesMeta;
  overrides?: RoleOverrides;
  /** Hand curation: sets added for variety, and curated sets left out. */
  curation?: SetCuration;
}

/**
 * `<format>/set-curation.json`. `add` sets are written like curated ones and
 * compete on equal terms; `drop` names curated sets (by species and set name)
 * that don't earn a place, such as a near-copy of a better set; `swap`
 * replaces moves one for one in a named set (species → set → old → new).
 */
export interface SetCuration {
  add?: CuratedSets;
  drop?: Record<string, string[]>;
  swap?: Record<string, Record<string, Record<string, string>>>;
}

export interface BuildReport {
  file: SetsFile;
  /** Curated sets left out, with the reason. */
  dropped: { species: string; set: string; reason: string }[];
}

/** Version of the installed @pkmn/sim, recorded so data can be rebuilt when it changes. */
export function simVersion(): string {
  const require = createRequire(import.meta.url);
  let dir = dirname(require.resolve('@pkmn/sim'));
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
        name?: string;
        version: string;
      };
      if (pkg.name === '@pkmn/sim') return pkg.version;
    } catch {
      // keep walking up
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error('Could not find @pkmn/sim package.json');
    dir = parent;
  }
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Pure pipeline: curated sets + usage stats → `sets.json` contents. */
export function buildSets(
  input: BuildInput,
  opts: { speciesCount?: number; builtAt?: string } = {},
): BuildReport {
  const { speciesCount = SPECIES_COUNT, builtAt = new Date().toISOString() } = opts;
  const format = formatInfo(input.format ?? DEFAULT_FORMAT);
  const rules = BUILD_RULES[format.id as FormatId];
  const dex = Dex.forGen(format.gen);
  const validator = TeamValidator.get(format.id);
  const dropped: BuildReport['dropped'] = [];
  const species: SetsFile['species'] = {};

  const ranked = Object.entries(input.stats.data)
    .sort((a, b) => b[1].usage - a[1].usage)
    .map(([name]) => name)
    .filter((name) => !rules.exclude.includes(name));

  // The top species by OU usage, then UU-tier species with real OU usage.
  const picks: { name: string; setSource: SpeciesEntry['setSource'] }[] = [];
  for (const name of ranked) {
    if (picks.length >= speciesCount) break;
    if (input.curated[name]) picks.push({ name, setSource: format.id });
  }
  for (const name of ranked) {
    if (picks.some((p) => p.name === name)) continue;
    if (!UU_TIERS.includes(dex.species.get(name).tier)) continue;
    if (input.stats.data[name]!.usage < UU_MIN_USAGE) continue;
    if (input.curated[name]) picks.push({ name, setSource: format.id });
    else if (input.curatedUU[name]) picks.push({ name, setSource: format.uu });
  }

  for (const { name, setSource } of picks) {
    const usage = usageShares(input.stats.data[name]!);
    const skip = new Set(input.curation?.drop?.[name] ?? []);
    // Every set we know for the species: its own tier's analysis first, then
    // the other tier's, then hand-added ones. Usage decides which make the cut.
    const sources = (
      setSource === format.id
        ? [input.curated[name], input.curatedUU[name]]
        : [input.curatedUU[name], input.curated[name]]
    ).concat(input.curation?.add?.[name]);
    const ids = new Set<string>();

    const candidates: { item: SetEntry; score: number; signature: string; rank: number }[] = [];
    const entries = sources.flatMap((src, rank) =>
      Object.entries(src ?? {}).map(([setName, set]) => ({ setName, set, rank })),
    );
    for (const { setName, set: original, rank } of entries) {
      if (skip.has(setName)) {
        dropped.push({ species: name, set: setName, reason: 'dropped by curation' });
        continue;
      }
      const swap = input.curation?.swap?.[name]?.[setName];
      const curatedSet = swap
        ? {
            ...original,
            moves: original.moves.map((slot) =>
              Array.isArray(slot) ? slot.map((m) => swap[m] ?? m) : (swap[slot] ?? slot),
            ),
          }
        : original;
      const set = resolveSet(name, curatedSet, usage, format.gen, rules.avoidAbilities);
      if (!set) {
        dropped.push({ species: name, set: setName, reason: 'not enough distinct moves' });
        continue;
      }
      const problems = validator.validateSet(
        { name, gender: '', level: 100, ...structuredClone(set) },
        {},
      );
      if (problems) {
        dropped.push({ species: name, set: setName, reason: problems.join(' ') });
        continue;
      }
      const { moves, item, ability, nature, evs, ivs } = set;
      // Two curated sets can resolve to the same concrete set; keep the first.
      const signature = JSON.stringify([[...moves].sort(), item, ability, nature, evs, ivs]);
      const duplicate = candidates.find((c) => c.signature === signature);
      if (duplicate) {
        dropped.push({
          species: name,
          set: setName,
          reason: `same as ${duplicate.item.sourceName} once resolved`,
        });
        continue;
      }
      let id = `${toID(name)}-${slug(setName)}`;
      for (let n = 2; ids.has(id); n++) id = `${toID(name)}-${slug(setName)}-${n}`;
      ids.add(id);
      candidates.push({
        signature,
        rank,
        item: {
          id,
          sourceName: setName,
          label: '',
          description: '',
          weight: 0,
          moves,
          item,
          ability,
          nature,
          evs,
          ivs,
        },
        score: scoreSet(set, usage),
      });
    }
    if (!candidates.length) continue;

    // Sets that do the same job fold into one, which keeps their usage: the
    // species' own analysis wins, then the more used. Extra sources only add
    // variety, so they never replace a set (and published set ids stay put).
    const distinct: typeof candidates = [];
    for (const c of [...candidates].sort((x, y) => x.rank - y.rank || y.score - x.score)) {
      // The same set name in two analyses is the same set, whatever the spread.
      const same = distinct.find(
        (d) =>
          samePurpose(d.item, c.item) ||
          (d.rank !== c.rank && d.item.sourceName === c.item.sourceName),
      );
      if (same) {
        same.score += c.score;
        dropped.push({
          species: name,
          set: c.item.sourceName,
          reason: `same job as ${same.item.sourceName}`,
        });
      } else distinct.push(c);
    }

    const selected = selectAndWeight(distinct);
    for (const c of distinct) {
      if (!selected.some((s) => s.item === c.item)) {
        dropped.push({ species: name, set: c.item.sourceName, reason: 'low usage weight' });
      }
    }

    const sets = selected.map(({ item, weight }) => ({ ...item, weight }));
    const roles = assignRoles(
      sets.map((s) => ({ ...s, species: name })),
      input.overrides,
    );
    sets.forEach((s, i) => Object.assign(s, roles[i]));
    species[name] = {
      usage: Math.round(input.stats.data[name]!.usage * 1e6) / 1e6,
      tier: dex.species.get(name).tier,
      setSource,
      sets,
    };
  }

  return {
    file: {
      meta: {
        format: format.id,
        method: METHOD,
        simVersion: simVersion(),
        builtAt,
        sources: input.sources,
      },
      species,
    },
    dropped,
  };
}
