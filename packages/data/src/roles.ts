import type { ResolvedSet } from './resolve';
import type { RoleOverrides } from './types';

export interface Role {
  label: string;
  description: string;
}

interface RoleInput extends ResolvedSet {
  sourceName: string;
}

const SETUP_MOVES = [
  'Swords Dance',
  'Dragon Dance',
  'Nasty Plot',
  'Calm Mind',
  'Bulk Up',
  'Agility',
  'Rock Polish',
  'Curse',
  'Belly Drum',
  'Tail Glow',
];
const HAZARDS = ['Stealth Rock', 'Spikes', 'Toxic Spikes'];
const RECOVERY = [
  'Recover',
  'Roost',
  'Soft-Boiled',
  'Slack Off',
  'Synthesis',
  'Moonlight',
  'Wish',
  'Rest',
];

const has = (set: RoleInput, move: string) => set.moves.includes(move);
const isBulky = (s: RoleInput) => s.evs.hp >= 200 && (s.evs.def >= 160 || s.evs.spd >= 160);

function listJoin(items: string[]): string {
  return items.length <= 1
    ? (items[0] ?? '')
    : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

type Rule = (set: RoleInput) => Role | null;

/** Ordered rules; the first one that matches decides the role. */
const RULES: Rule[] = [
  (s) =>
    s.item === 'Choice Scarf'
      ? {
          label: 'Choice Scarf attacker',
          description:
            'Outspeeds most threats and hits hard, but is locked into one move until it switches out.',
        }
      : null,
  (s) =>
    s.item === 'Choice Band'
      ? {
          label: 'Choice Band attacker',
          description:
            'Hits extremely hard with physical moves, but is locked into one move until it switches out.',
        }
      : null,
  (s) =>
    s.item === 'Choice Specs'
      ? {
          label: 'Choice Specs attacker',
          description:
            'Hits extremely hard with special moves, but is locked into one move until it switches out.',
        }
      : null,
  (s) =>
    has(s, 'Stealth Rock') && s.item === 'Focus Sash'
      ? {
          label: 'Stealth Rock lead',
          description:
            "Leads off, survives a hit with Focus Sash, and sets Stealth Rock before the opponent's lead can stop it.",
        }
      : null,
  (s) => {
    const setup = SETUP_MOVES.find((m) => has(s, m));
    if (!setup) return null;
    return {
      label: `${setup} sweeper`,
      description: `Boosts itself with ${setup}, then tries to sweep through the opposing team.`,
    };
  },
  (s) => {
    const hazards = HAZARDS.filter((m) => has(s, m));
    if (!hazards.length) return null;
    const spin = has(s, 'Rapid Spin') ? ', and clears your side with Rapid Spin' : '';
    return {
      label: hazards.length === 1 ? `${hazards[0]} setter` : 'Hazard setter',
      description: `Sets ${listJoin(hazards)} to wear down every Pokémon the opponent switches in${spin}.`,
    };
  },
  (s) =>
    has(s, 'Rapid Spin')
      ? { label: 'Spinner', description: 'Clears entry hazards from your side with Rapid Spin.' }
      : null,
  (s) =>
    has(s, 'Trick Room')
      ? {
          label: 'Trick Room setter',
          description: 'Sets up Trick Room so that slower Pokémon move first for five turns.',
        }
      : null,
  (s) =>
    has(s, 'Reflect') && has(s, 'Light Screen')
      ? {
          label: 'Dual screens',
          description: 'Sets Reflect and Light Screen to soften hits for the whole team.',
        }
      : null,
  (s) =>
    has(s, 'Substitute') && has(s, 'Focus Punch')
      ? {
          label: 'SubPunch attacker',
          description: 'Hides behind a Substitute, then fires off a full-power Focus Punch.',
        }
      : null,
  (s) =>
    has(s, 'Substitute')
      ? {
          label: 'Substitute attacker',
          description: 'Uses Substitute to block status and scout its counters while it attacks.',
        }
      : null,
  (s) =>
    has(s, 'Rest') && has(s, 'Sleep Talk')
      ? {
          label: 'RestTalk',
          description: 'Heals fully with Rest and keeps attacking while asleep with Sleep Talk.',
        }
      : null,
  (s) =>
    has(s, 'Trick') && !s.item.startsWith('Choice')
      ? {
          label: 'Trick user',
          description: `Cripples a foe by swapping its item for this Pokémon's ${s.item}.`,
        }
      : null,
  (s) =>
    has(s, 'Leech Seed')
      ? {
          label: 'Leech Seed staller',
          description: 'Drains foes with Leech Seed and outlasts them over a long battle.',
        }
      : null,
  (s) => {
    if (!isBulky(s)) return null;
    const recovery = RECOVERY.some((m) => has(s, m)) ? ' and heals itself back up' : '';
    return s.evs.def >= s.evs.spd
      ? {
          label: 'Physical wall',
          description: `Soaks up physical attacks${recovery} while wearing the opponent down.`,
        }
      : {
          label: 'Special wall',
          description: `Soaks up special attacks${recovery} while wearing the opponent down.`,
        };
  },
  (s) =>
    s.evs.atk >= 60 && s.evs.spa >= 60
      ? {
          label: 'Mixed attacker',
          description: 'Mixes physical and special attacks to break through walls of either kind.',
        }
      : null,
  (s) =>
    s.item === 'Life Orb'
      ? {
          label: 'Life Orb attacker',
          description: 'Gives up a little HP with each attack for a big boost in power.',
        }
      : null,
  (s) =>
    s.evs.spe >= 200 && (s.evs.atk >= 200 || s.evs.spa >= 200)
      ? { label: 'Fast attacker', description: 'Hits fast and hard with wide move coverage.' }
      : null,
];

/** "TyraniBoah (SubPunch)" → "TyraniBoah". */
const cleanName = (name: string) => name.replace(/\s*\(.*\)\s*/g, ' ').trim();

export function deriveRole(set: RoleInput): Role {
  for (const rule of RULES) {
    const role = rule(set);
    if (role) return role;
  }
  return {
    label: cleanName(set.sourceName),
    description: isBulky(set)
      ? 'A bulky set that supports the team and wears the opponent down.'
      : 'An offensive set that pressures the opponent with strong attacks.',
  };
}

function spreadName(s: RoleInput): string {
  if (isBulky(s)) return s.evs.def >= s.evs.spd ? 'physically defensive' : 'specially defensive';
  return s.evs.atk >= 60 && s.evs.spa >= 60 ? 'mixed' : 'offensive';
}

/** Ways to tell apart sets that share a label, tried in order. */
const SUFFIXES: ((s: RoleInput) => string)[] = [
  (s) => s.item,
  spreadName,
  (s) => cleanName(s.sourceName),
];

/**
 * Derives roles for one species' sets and applies overrides by id. When sets
 * share a label, adds the first suffix (item, spread, then source name) that
 * tells them all apart.
 */
export function assignRoles(
  sets: (RoleInput & { id: string })[],
  overrides: RoleOverrides = {},
): Role[] {
  const roles = sets.map(deriveRole);
  const groups = new Map<string, number[]>();
  roles.forEach((r, i) => groups.set(r.label, [...(groups.get(r.label) ?? []), i]));
  for (const [label, members] of groups) {
    if (members.length < 2) continue;
    const suffix =
      SUFFIXES.find((f) => new Set(members.map((i) => f(sets[i]!))).size === members.length) ??
      ((s: RoleInput) => s.sourceName);
    for (const i of members) roles[i]!.label = `${label} (${suffix(sets[i]!)})`;
  }
  return roles.map((r, i) => ({ ...r, ...overrides[sets[i]!.id] }));
}
