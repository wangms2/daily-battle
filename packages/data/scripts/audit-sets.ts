// Audits a format's built sets for quality and writes reports/set-audit-<format>.md:
// each set's problems (too few attacks for an attacker, no STAB, a slashed slot
// resolved away from the analysis's first choice, moves no Random Battle role
// uses, padding), and Random Battle roles no set covers (fun-set candidates).
// Read-only: it changes no data. Review the report, then edit the curation files.
//   pnpm --filter @daily-battle/data audit-sets [--format gen4ou]
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Dex, toID } from '@pkmn/sim';
import type { SetCuration } from '../src/build';
import type { CuratedSets, SetEntry, SetsFile } from '../src/types';
import { CURATION, FORMAT, OUTPUT, SOURCES } from './paths';

interface RandbatsSet {
  role: string;
  movepool: string[];
}
type Randbats = Record<string, { sets?: RandbatsSet[] }>;

const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
const data = read<SetsFile>(OUTPUT);
const curated = read<CuratedSets>(SOURCES.sets);
const curatedUU = read<CuratedSets>(SOURCES.uuSets);
const curation = read<SetCuration>(CURATION);
const randbats = read<{ species: Randbats }>(SOURCES.randbats).species;
const dex = Dex.forGen(FORMAT.gen);

/** Labels that promise damage: these need at least two attacks. */
const ATTACKER = /attacker|sweeper|breaker|cleaner|revenge|scarf|band|specs|life orb|mixed/i;

/** Attacks used for their effect more than their damage; Foul Play uses the foe's Attack. */
const UTILITY = [
  'rapidspin',
  'uturn',
  'voltswitch',
  'knockoff',
  'explosion',
  'selfdestruct',
  'foulplay',
  'endeavor',
  'dragontail',
  'circlethrow',
  'pursuit',
  'fakeout',
];

const isAttack = (m: string) => dex.moves.get(m).category !== 'Status';
const hpType = (m: string) => dex.moves.get(m).type;

/** The curated set a built set came from, and where. */
function sourceOf(species: string, set: SetEntry) {
  const from: [string, CuratedSets | undefined][] = [
    ['analysis', curated],
    ['lower-tier analysis', curatedUU],
    ['hand-added', curation.add],
  ];
  for (const [where, src] of from) {
    const s = src?.[species]?.[set.sourceName];
    if (s) return { where, set: s };
  }
  return null;
}

interface Finding {
  set: SetEntry;
  /** Worth a decision: likely a weak or mislabelled set. */
  flags: string[];
  /** Context only: often fine (Random Battles don't list every real option). */
  notes: string[];
}

const lines: string[] = [];
let flagged = 0;
let total = 0;
const counts: Record<string, number> = {};
const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

for (const [species, entry] of Object.entries(data.species).sort(
  (a, b) => b[1].usage - a[1].usage,
)) {
  const types = dex.species.get(species).types;
  const roles = randbats[toID(species)]?.sets ?? [];
  const roleMoves = new Set(roles.flatMap((r) => r.movepool));
  const findings: Finding[] = [];

  for (const set of entry.sets) {
    total++;
    const flags: string[] = [];
    const notes: string[] = [];
    const attacks = set.moves.filter(isAttack);
    const src = sourceOf(species, set);

    if (ATTACKER.test(set.label) && attacks.length < 2) {
      flags.push(`labelled "${set.label}" with ${attacks.length} attack(s)`);
      count('attacker with < 2 attacks');
    }
    // EVs and nature against what the set does. Fixed-damage moves (Seismic
    // Toss) don't care about Attack or Sp. Atk.
    const scaled = (m: string) => {
      const move = dex.moves.get(m);
      return move.category !== 'Status' && !move.damage && !move.ohko;
    };
    const physical = set.moves.some((m) => scaled(m) && dex.moves.get(m).category === 'Physical');
    const special = set.moves.some((m) => scaled(m) && dex.moves.get(m).category === 'Special');
    const evTotal = Object.values(set.evs).reduce((x, y) => x + y, 0);
    const nature = dex.natures.get(set.nature);
    const evFlag = (msg: string) => {
      flags.push(msg);
      count('EVs or nature');
    };
    if (evTotal > 510 || Object.values(set.evs).some((n) => n > 252))
      evFlag(`illegal EVs (${evTotal})`);
    else if (evTotal < 500) evFlag(`only ${evTotal} EVs used`);
    const uses = { atk: physical, spa: special } as Record<string, boolean>;
    if (nature.plus && nature.plus in uses && !uses[nature.plus]) {
      evFlag(
        `${set.nature} boosts ${nature.plus === 'atk' ? 'Attack' : 'Sp. Atk'}, which no attack uses`,
      );
    }
    if (nature.minus === 'atk' || nature.minus === 'spa') {
      // A lowered stat is fine under utility moves and a lone coverage move;
      // not under a STAB attack or two real attacks.
      const cat = nature.minus === 'atk' ? 'Physical' : 'Special';
      const hurt = set.moves.filter(
        (m) => scaled(m) && dex.moves.get(m).category === cat && !UTILITY.includes(toID(m)),
      );
      const stab = hurt.filter((m) => types.includes(hpType(m)));
      if (stab.length || hurt.length >= 2) {
        evFlag(
          `${set.nature} lowers ${cat === 'Physical' ? 'Attack' : 'Sp. Atk'}, which ${(stab.length ? stab : hurt).join(', ')} use`,
        );
      }
    }
    // The nature and the spread come from separate usage picks, so they can disagree.
    if (nature.minus && set.evs[nature.minus] >= 100 && !set.moves.includes('Trick Room')) {
      evFlag(
        `${set.nature} lowers ${nature.minus} though it invests ${set.evs[nature.minus]} in it`,
      );
    }
    if (nature.plus === 'spe' && set.evs.spe === 0)
      evFlag(`${set.nature} boosts Speed with no Speed EVs`);
    if (set.evs.atk >= 200 && !physical)
      evFlag(`${set.evs.atk} Attack EVs with no physical attack`);
    if (set.evs.spa >= 200 && !special) evFlag(`${set.evs.spa} Sp. Atk EVs with no special attack`);

    // A label naming a move the set doesn't have ("Physical wall (Roar)").
    for (const [, named] of set.label.matchAll(/\(([^)]+)\)/g)) {
      const move = dex.moves.get(named!);
      if (move.exists && !set.moves.some((m) => toID(m) === move.id)) {
        flags.push(`label names ${move.name}, which the set doesn't have`);
        count('label names a missing move');
      }
    }
    if (attacks.length >= 2 && !attacks.some((m) => types.includes(hpType(m)))) {
      flags.push('no STAB attack');
      count('no STAB');
    }
    if (src) {
      // Slashed slots where the build took a later option than the analysis's first.
      for (const slot of src.set.moves) {
        if (!Array.isArray(slot) || slot.length < 2) continue;
        const chosen = slot.find((m) => set.moves.some((x) => toID(x) === toID(m)));
        const first = slot[0]!;
        if (!chosen || toID(chosen) === toID(first)) continue;
        const swapsKind = isAttack(chosen) !== isAttack(first);
        const randbatsPrefers =
          roles.length > 0 && roleMoves.has(toID(first)) && !roleMoves.has(toID(chosen));
        if (swapsKind || randbatsPrefers) {
          const why = swapsKind
            ? isAttack(first)
              ? 'a status move for an attack'
              : 'an attack for a status move'
            : 'Random Battles use the first';
          flags.push(`took ${chosen} over the listed first choice ${first} (${why})`);
          count('slot resolved off first choice, worth a look');
        } else {
          notes.push(`took ${chosen} over ${first}`);
          count('slot resolved off first choice (note)');
        }
      }
      if (src.where === 'hand-added') {
        flags.push('hand-added padding set');
        count('hand-added');
      }
    } else {
      flags.push(`source set "${set.sourceName}" not found`);
      count('source not found');
    }
    if (roles.length) {
      const off = set.moves.filter((m) => !roleMoves.has(toID(m)));
      if (off.length) {
        notes.push(`not in any Random Battle role: ${off.join(', ')}`);
        count('moves outside randbats (note)');
      }
    }
    if (entry.sets.length > 1 && set.weight < 0.1) {
      notes.push(`low weight ${(set.weight * 100).toFixed(0)}%`);
      count('weight < 10% (note)');
    }
    if (flags.length) flagged++;
    if (flags.length || notes.length) findings.push({ set, flags, notes });
  }

  // Random Battle roles that share at most one move with every set: new ideas.
  const fresh = roles.filter((r) =>
    entry.sets.every((s) => s.moves.filter((m) => r.movepool.includes(toID(m))).length <= 1),
  );
  const uncovered = roles.filter((r) =>
    entry.sets.every((s) => s.moves.filter((m) => r.movepool.includes(toID(m))).length < 3),
  );

  if (!findings.some((f) => f.flags.length) && !fresh.length) continue;
  lines.push(`## ${species} — ${entry.tier}, ${(entry.usage * 100).toFixed(1)}% usage`, '');
  for (const s of entry.sets) {
    const f = findings.find((x) => x.set === s);
    lines.push(
      `- **${s.label}** \`${s.id}\` ${(s.weight * 100).toFixed(0)}% · ${s.item} · ${s.moves.join(' / ')}`,
    );
    for (const flag of f?.flags ?? []) lines.push(`  - ⚠ ${flag}`);
    for (const note of f?.notes ?? []) lines.push(`  - · ${note}`);
  }
  if (uncovered.length) {
    lines.push('', '  Random Battle roles no set covers:');
    for (const r of uncovered) {
      const names = r.movepool.map((m) => dex.moves.get(m).name).join(', ');
      lines.push(`  - ${fresh.includes(r) ? '✨ ' : ''}${r.role}: ${names}`);
    }
  }
  lines.push('');
}

const summary = [
  `# Set audit — ${FORMAT.name} OU`,
  '',
  `${flagged} of ${total} sets flagged (⚠) across ${Object.keys(data.species).length} species; notes (·) are context and often fine. Species are listed when a set is flagged or a Random Battle role shares at most one move with every set (✨, fun-set ideas).`,
  '',
  ...Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `- ${k}: ${n}`),
  '',
];
const dir = fileURLToPath(new URL('../reports/', import.meta.url));
mkdirSync(dir, { recursive: true });
const out = `${dir}set-audit-${FORMAT.id}.md`;
writeFileSync(out, [...summary, ...lines].join('\n'));
console.log(`${flagged}/${total} sets flagged; wrote ${out}`);
