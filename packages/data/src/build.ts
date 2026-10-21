import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { Dex, TeamValidator, toID } from '@pkmn/sim';
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

export const FORMAT = 'gen4ou';
export const METHOD = 'curated-usage-weighted-v1';
/** How many species make the playable data set. */
export const SPECIES_COUNT = 70;
/** UU-tier species also included when their OU usage is at least UU_MIN_USAGE. */
export const UU_TIERS = ['UU', 'UUBL'];
export const UU_MIN_USAGE = 0.001;

const dex = Dex.forGen(4);

export interface BuildInput {
  /** Curated gen4ou sets. */
  curated: CuratedSets;
  /** Curated gen4uu sets, used for UU species with no gen4ou sets. */
  curatedUU: CuratedSets;
  stats: ChaosStats;
  sources: SourcesMeta;
  overrides?: RoleOverrides;
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
  const validator = TeamValidator.get(FORMAT);
  const dropped: BuildReport['dropped'] = [];
  const species: SetsFile['species'] = {};

  const ranked = Object.entries(input.stats.data)
    .sort((a, b) => b[1].usage - a[1].usage)
    .map(([name]) => name);

  // The top species by OU usage, then UU-tier species with real OU usage.
  const picks: { name: string; setSource: SpeciesEntry['setSource'] }[] = [];
  for (const name of ranked) {
    if (picks.length >= speciesCount) break;
    if (input.curated[name]) picks.push({ name, setSource: 'gen4ou' });
  }
  for (const name of ranked) {
    if (picks.some((p) => p.name === name)) continue;
    if (!UU_TIERS.includes(dex.species.get(name).tier)) continue;
    if (input.stats.data[name]!.usage < UU_MIN_USAGE) continue;
    if (input.curated[name]) picks.push({ name, setSource: 'gen4ou' });
    else if (input.curatedUU[name]) picks.push({ name, setSource: 'gen4uu' });
  }

  for (const { name, setSource } of picks) {
    const curated = (setSource === 'gen4ou' ? input.curated : input.curatedUU)[name]!;
    const usage = usageShares(input.stats.data[name]!);

    const candidates: { item: SetEntry; score: number; signature: string }[] = [];
    for (const [setName, curatedSet] of Object.entries(curated)) {
      const set = resolveSet(name, curatedSet, usage);
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
      candidates.push({
        signature,
        item: {
          id: `${toID(name)}-${slug(setName)}`,
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

    const selected = selectAndWeight(candidates);
    for (const c of candidates) {
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
        format: FORMAT,
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
