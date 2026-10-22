// Suggested teams that really are the archetype they're named for (DESIGN.md
// §9.2). Each set gets a role, each archetype has composition rules over those
// roles, and candidate teams are built to the rules; the simulator then picks
// the strongest of each.
//
// - Offense: attackers (Choice items, Life Orb, Expert Belt, setup sweepers,
//   Focus Sash leads), and no walls.
// - Stall: walls (bulky sets with recovery, Leftovers, status or phazing), and
//   no attackers.
// - Balanced: a mix, two or three of each.
import type { SetEntry, SetsFile } from '@daily-battle/data';
import { isBulky, teamSets, type Archetype, type Rng, type TeamSlot } from '@daily-battle/gen';
import { TeamValidator } from '@pkmn/sim';

export type SetRole = 'attacker' | 'wall' | 'support';

const ATTACK_ITEMS = [
  'Choice Band',
  'Choice Specs',
  'Choice Scarf',
  'Life Orb',
  'Expert Belt',
  'Focus Sash',
];
/** Setup moves that make a sweeper, however bulky the spread. */
const SWEEP_SETUP = [
  'Swords Dance',
  'Dragon Dance',
  'Nasty Plot',
  'Agility',
  'Rock Polish',
  'Tail Glow',
  'Belly Drum',
  'Bulk Up',
];
const RECOVERY = [
  'Recover',
  'Roost',
  'Soft-Boiled',
  'Slack Off',
  'Synthesis',
  'Moonlight',
  'Morning Sun',
  'Milk Drink',
  'Wish',
  'Rest',
];
const WALL_TOOLS = [
  'Toxic',
  'Will-O-Wisp',
  'Thunder Wave',
  'Roar',
  'Whirlwind',
  'Haze',
  'Protect',
  'Seismic Toss',
  'Leech Seed',
];

const LEFTOVERS = ['Leftovers', 'Black Sludge'];

export function setRole(set: SetEntry): SetRole {
  const has = (m: string) => set.moves.includes(m);
  const bulky = isBulky(set);
  if (ATTACK_ITEMS.includes(set.item) || SWEEP_SETUP.some(has)) return 'attacker';
  if (!bulky && (set.evs.atk >= 200 || set.evs.spa >= 200)) return 'attacker';
  if (bulky && (RECOVERY.some(has) || LEFTOVERS.includes(set.item) || WALL_TOOLS.some(has))) {
    return 'wall';
  }
  return 'support';
}

interface Rule {
  /** Which roles a set may have on this archetype's team. */
  allowed: SetRole[];
  attackers: [min: number, max: number];
  walls: [min: number, max: number];
}

export const ARCHETYPE_RULES: Record<Archetype, Rule> = {
  Offense: { allowed: ['attacker', 'support'], attackers: [4, 6], walls: [0, 0] },
  Balanced: { allowed: ['attacker', 'wall', 'support'], attackers: [2, 3], walls: [2, 3] },
  Stall: { allowed: ['wall', 'support'], attackers: [0, 0], walls: [4, 6] },
};

const hazard = (s: SetEntry) =>
  ['Stealth Rock', 'Spikes', 'Toxic Spikes'].some((m) => s.moves.includes(m));

/** Whether a team (as sets) meets an archetype's rules. */
export function fitsArchetype(sets: SetEntry[], archetype: Archetype): boolean {
  const rule = ARCHETYPE_RULES[archetype];
  const roles = sets.map(setRole);
  const count = (r: SetRole) => roles.filter((x) => x === r).length;
  const within = (n: number, [lo, hi]: [number, number]) => n >= lo && n <= hi;
  return (
    roles.every((r) => rule.allowed.includes(r)) &&
    within(count('attacker'), rule.attackers) &&
    within(count('wall'), rule.walls) &&
    // Every archetype wants entry hazards up; stall and balance live on them.
    sets.some(hazard)
  );
}

function pickWeighted(sets: SetEntry[], rng: Rng): SetEntry {
  const total = sets.reduce((a, s) => a + s.weight, 0);
  let r = rng() * total;
  for (const s of sets) if ((r -= s.weight) < 0) return s;
  return sets[sets.length - 1]!;
}

/**
 * Up to `n` distinct legal teams from the pool that fit the archetype, drawn at
 * random (sets by weight among the allowed roles). Fewer, or none, when the
 * pool can't support the archetype.
 */
export function archetypeTeams(
  species: string[],
  archetype: Archetype,
  n: number,
  rng: Rng,
  data: SetsFile,
  tries = 4000,
): TeamSlot[][] {
  const rule = ARCHETYPE_RULES[archetype];
  const options = species
    .map((name) => ({
      name,
      sets: data.species[name]!.sets.filter((s) => rule.allowed.includes(setRole(s))),
    }))
    .filter((o) => o.sets.length > 0);
  if (options.length < 6) return [];
  const validator = TeamValidator.get('gen4ou');
  const seen = new Set<string>();
  const teams: TeamSlot[][] = [];
  for (let t = 0; t < tries && teams.length < n; t++) {
    const left = [...options];
    const picked = Array.from({ length: 6 }, () => {
      const o = left.splice(Math.floor(rng() * left.length), 1)[0]!;
      return { species: o.name, set: pickWeighted(o.sets, rng) };
    });
    if (
      !fitsArchetype(
        picked.map((p) => p.set),
        archetype,
      )
    )
      continue;
    const team = picked.map((p) => ({ species: p.species, setId: p.set.id }));
    const key = team
      .map((s) => s.setId)
      .sort()
      .join();
    if (seen.has(key)) continue;
    seen.add(key);
    if (!validator.validateTeam(teamSets(data, team))) teams.push(team);
  }
  return teams;
}
