import { readFileSync } from 'node:fs';
import { TeamValidator } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import {
  buildSets,
  FORMAT,
  SPECIES_COUNT,
  UU_MIN_USAGE,
  UU_TIERS,
  type SetCuration,
} from './build';
import { sets } from './index';
import type { ChaosStats, CuratedSets, RoleOverrides, SourcesMeta } from './types';

const readJson = <T>(rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as T;

const entries = Object.entries(sets.species);

describe('gen4ou/sets.json', () => {
  it(`has the top ${SPECIES_COUNT} species plus UU-tier species with real OU usage`, () => {
    expect(entries.length).toBeGreaterThan(SPECIES_COUNT);
    for (const [species, entry] of entries.slice(SPECIES_COUNT)) {
      expect(UU_TIERS, species).toContain(entry.tier);
      expect(entry.usage, species).toBeGreaterThanOrEqual(UU_MIN_USAGE);
    }
  });

  it('passes the gen4ou validator for every set', () => {
    const validator = TeamValidator.get(FORMAT);
    const problems = entries.flatMap(([species, { sets: speciesSets }]) =>
      speciesSets.flatMap((s) => {
        const errors = validator.validateSet(
          { name: species, species, gender: '', level: 100, ...structuredClone(s) },
          {},
        );
        return errors ? [`${s.id}: ${errors.join(' ')}`] : [];
      }),
    );
    expect(problems).toEqual([]);
  });

  it.each(entries)('%s has 1–4 sets with weights summing to 1', (_species, entry) => {
    expect(entry.sets.length).toBeGreaterThanOrEqual(1);
    expect(entry.sets.length).toBeLessThanOrEqual(4);
    expect(entry.sets.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1, 6);
    for (const s of entry.sets) expect(s.moves).toHaveLength(4);
  });

  it.each(entries)('%s has unique, non-empty labels and descriptions', (_species, entry) => {
    const labels = entry.sets.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const s of entry.sets) {
      expect(s.label.trim()).not.toBe('');
      expect(s.description.trim()).not.toBe('');
    }
  });

  it('has unique set ids', () => {
    const ids = entries.flatMap(([, e]) => e.sets.map((s) => s.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only has role overrides for sets that exist', () => {
    const ids = new Set(entries.flatMap(([, e]) => e.sets.map((s) => s.id)));
    const overrides = readJson<RoleOverrides>('../gen4ou/role-overrides.json');
    expect(Object.keys(overrides).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('is up to date with sources/ (run `pnpm build-sets` if this fails)', () => {
    const { file } = buildSets(
      {
        curated: readJson<CuratedSets>('../sources/gen4ou-sets.json'),
        curatedUU: readJson<CuratedSets>('../sources/gen4uu-sets.json'),
        stats: readJson<ChaosStats>('../sources/gen4ou-stats.json'),
        sources: readJson<SourcesMeta>('../sources/sources.json'),
        overrides: readJson<RoleOverrides>('../gen4ou/role-overrides.json'),
        curation: readJson<SetCuration>('../gen4ou/set-curation.json'),
      },
      { builtAt: sets.meta.builtAt },
    );
    expect(file).toEqual(sets);
  });
});
