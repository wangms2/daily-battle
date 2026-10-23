import { readFileSync } from 'node:fs';
import { Dex, TeamValidator, toID } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import {
  BUILD_RULES,
  buildSets,
  SPECIES_COUNT,
  UU_MIN_USAGE,
  UU_TIERS,
  type SetCuration,
} from './build';
import { FORMATS, type FormatId } from './formats';
import { setsFor } from './index';
import type { ChaosStats, CuratedSets, RoleOverrides, SourcesMeta } from './types';

const readJson = <T>(rel: string) =>
  JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8')) as T;

const FORMAT_IDS = Object.keys(FORMATS) as FormatId[];

/**
 * Published sets that break a team-only rule, kept until it's decided how to
 * retire them without changing published days. Gen 4's Swords Dance + Baton
 * Pass Scyther breaks Baton Pass Stat Trap Clause; the pipeline already never
 * puts it on an opponent or a suggested team.
 */
const KNOWN_TEAM_ILLEGAL = ['scyther-baton-pass'];

describe.each(FORMAT_IDS)('%s/sets.json', (format) => {
  const sets = setsFor(format);
  const entries = Object.entries(sets.species);

  it('is built for its format', () => {
    expect(sets.meta.format).toBe(format);
  });

  it(`has the top ${SPECIES_COUNT} species plus UU-tier species with real OU usage`, () => {
    expect(entries.length).toBeGreaterThan(SPECIES_COUNT);
    for (const [species, entry] of entries.slice(SPECIES_COUNT)) {
      expect(UU_TIERS, species).toContain(entry.tier);
      expect(entry.usage, species).toBeGreaterThanOrEqual(UU_MIN_USAGE);
    }
  });

  it("passes the format's validator for every set", () => {
    const validator = TeamValidator.get(format);
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

  it('passes the team rules for every set on its own (e.g. Baton Pass Stat Trap Clause)', () => {
    // Some clauses only run on whole teams, so validateSet above can't see them.
    const validator = TeamValidator.get(format);
    const problems = entries.flatMap(([species, { sets: speciesSets }]) =>
      speciesSets
        .filter((s) => !KNOWN_TEAM_ILLEGAL.includes(s.id))
        .flatMap((s) => {
          const team = [{ name: species, species, gender: '', level: 100, ...structuredClone(s) }];
          const errors = validator.validateTeam(team);
          return errors ? [`${s.id}: ${errors.join(' ')}`] : [];
        }),
    );
    expect(problems).toEqual([]);
  });

  it('leaves out excluded species and avoided abilities', () => {
    const rules = BUILD_RULES[format];
    for (const name of rules.exclude) expect(sets.species[name], name).toBeUndefined();
    const avoided = entries.flatMap(([, e]) =>
      e.sets.filter((s) => rules.avoidAbilities.includes(s.ability)).map((s) => s.id),
    );
    expect(avoided).toEqual([]);
  });

  it('has no combination the format bans across a team (e.g. Drizzle ++ Swift Swim)', () => {
    // Every part of a complex ban showing up somewhere in the data would let a
    // pool hold an illegal team, even though each set passes on its own.
    const used = new Set(
      entries.flatMap(([, e]) => e.sets.flatMap((s) => [s.ability, s.item, ...s.moves].map(toID))),
    );
    const complex = Dex.formats.get(format).banlist.filter((b) => b.includes('++'));
    const reachable = complex.filter((b) => b.split('++').every((part) => used.has(toID(part))));
    expect(reachable).toEqual([]);
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
    const overrides = readJson<RoleOverrides>(`../${format}/role-overrides.json`);
    expect(Object.keys(overrides).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('is up to date with sources/ (run `pnpm build-sets --format <id>` if this fails)', () => {
    const { uu } = FORMATS[format];
    const { file } = buildSets(
      {
        format,
        curated: readJson<CuratedSets>(`../sources/${format}-sets.json`),
        curatedUU: readJson<CuratedSets>(`../sources/${uu}-sets.json`),
        stats: readJson<ChaosStats>(`../sources/${format}-stats.json`),
        sources: readJson<SourcesMeta>(`../sources/${format}-sources.json`),
        overrides: readJson<RoleOverrides>(`../${format}/role-overrides.json`),
        curation: readJson<SetCuration>(`../${format}/set-curation.json`),
      },
      { builtAt: sets.meta.builtAt },
    );
    expect(file).toEqual(sets);
  });
});

describe('curation', () => {
  const find = (format: FormatId, species: string, source: string) =>
    setsFor(format).species[species]!.sets.find((s) => s.sourceName === source)!;

  it('applies move swaps (Gen 4 Scarf Magnezone: Flash Cannon over Thunder Wave)', () => {
    const scarf = find('gen4ou', 'Magnezone', 'Choice Scarf');
    expect(scarf.moves).toContain('Flash Cannon');
    expect(scarf.moves).not.toContain('Thunder Wave');
  });

  it('keeps setup moves off Gen 5 Choice sets (Breloom, Crobat)', () => {
    expect(find('gen5ou', 'Breloom', 'Technician').moves).not.toContain('Swords Dance');
    expect(find('gen5ou', 'Crobat', 'Choice Band').moves).not.toContain('Roost');
  });

  it('gives Gen 5 sets hidden abilities where the analyses use them', () => {
    expect(setsFor('gen5ou').species['Politoed']!.sets[0]!.ability).toBe('Drizzle');
  });
});
