// Daily opponent v7: built as a team rather than drawn (owner, Nov 2026). Every
// team should be strong, since difficulty comes from the AI alone, and fresh,
// so the same staples don't come back day after day. Teams are put together
// from Smogon's teammate stats around the roles a team needs, scored on how
// well they hold together, and the best of many is kept. v6
// (`generateOpponent`) stays as it was: versus rounds and published days use it.
import { genOf, type SetEntry, type SetsFile, type TeammatesFile } from '@daily-battle/data';
import { Dex } from '@pkmn/sim';
import { addDays, mondayOf } from './dates';
import { opponentProblems, styleOf, type DailyOpponent, type Style } from './opponent';
import { CONFIG, seedPrefix } from './config';
import { candidateKey, rngFor, type Rng } from './rng';
import { type TeamSlot } from './sets';
import { majorOffensiveTypes, megaForme, setTraits, stabTypes, typeMultiplier } from './traits';

export const OPPONENT_VERSION = 7;

export const BUILDER = {
  size: 6,
  /** Teams put together per candidate; the best-scoring legal one is kept. */
  constructions: 300,
  /** Species weights: usage^exponent for the first pick, then for each teammate. */
  anchorUsageExponent: 0.5,
  fillUsageExponent: 0.6,
  /** Added to a teammate's co-usage share, so species never seen together still come up. */
  synergyFloor: 0.03,
  /** Role bonuses while filling: a multiplier on species that bring what the team lacks. */
  need: { sr: 2.5, remover: 1.6, fast: 1.5, bulk: 1.5, patch: 1.6 },
  /** Variety: the format's `staples` most used species, at most `maxStaples` per team. */
  staples: 8,
  maxStaples: 2,
  /** Variety: a species at most this often in a week (Monday on), never on two days running. */
  maxPerWeek: 2,
  /** Variety: over the last `recentDays`, at most `maxRecent` times, and less likely each time. */
  recentDays: 28,
  maxRecent: 4,
  recentDecay: 0.5,
  /** The format's most used species the team is scored against. */
  threats: 15,
  /** A fast member: base Speed at least this, or a Choice Scarf. */
  fastSpeed: 100,
  /**
   * The days' styles, in turn (owner: offense, balance, offense, balance,
   * defensive, repeat; 40/40/20 with defensive cores spaced out). Styles as
   * `styleOf`: offense has no defensive set, balance one or two, stall three or more.
   */
  styleCycle: ['offense', 'balance', 'offense', 'balance', 'stall'] as Style[],
} as const;

/** A day's style: the cycle from 2026-01-01, shifted by gen so the games differ. */
export function styleFor(day: string, gen: number): Style {
  const days = Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse('2026-01-01T00:00:00Z')) / 86_400_000,
  );
  const n = BUILDER.styleCycle.length;
  return BUILDER.styleCycle[(((days + gen) % n) + n) % n]!;
}

/** Earlier days' opponents, for variety. Any order; days outside the window are ignored. */
export type OpponentHistory = { day: string; species: string[] }[];

export interface BuiltOpponent extends DailyOpponent {
  opponentVersion: number;
  score: number;
  /** The score's parts, for reports and the gallery. */
  parts: Record<string, number>;
}

interface Pick {
  species: string;
  set: SetEntry;
}

/** How often each species appeared in the window, and which are ruled out for `day`. */
function freshness(day: string, history: OpponentHistory) {
  const week = mondayOf(day);
  const from = addDays(day, -BUILDER.recentDays);
  const yesterday = addDays(day, -1);
  const recent = new Map<string, number>();
  const inWeek = new Map<string, number>();
  const banned = new Set<string>();
  for (const h of history) {
    if (h.day >= day || h.day < from) continue;
    for (const s of h.species) {
      recent.set(s, (recent.get(s) ?? 0) + 1);
      if (mondayOf(h.day) === week) inWeek.set(s, (inWeek.get(s) ?? 0) + 1);
      if (h.day === yesterday) banned.add(s);
    }
  }
  for (const [s, n] of recent) if (n >= BUILDER.maxRecent) banned.add(s);
  for (const [s, n] of inWeek) if (n >= BUILDER.maxPerWeek) banned.add(s);
  return (s: string) => (banned.has(s) ? 0 : BUILDER.recentDecay ** (recent.get(s) ?? 0));
}

function draw<T>(items: readonly T[], weight: (x: T) => number, rng: Rng): T | undefined {
  const ws = items.map(weight);
  const total = ws.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return undefined;
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]!;
    if (r < 0) return items[i];
  }
  return items.at(-1);
}

export function opponentBuilder(data: SetsFile, mates: TeammatesFile) {
  const gen = genOf(data.meta.format);
  const dex = Dex.forGen(gen);
  const names = Object.keys(data.species);
  const usage = (s: string) => data.species[s]!.usage;
  const byUsage = [...names].sort((a, b) => usage(b) - usage(a));
  const staples = new Set(byUsage.slice(0, BUILDER.staples));
  const threats = byUsage.slice(0, BUILDER.threats);
  const types = majorOffensiveTypes(data);
  const maxUsage = usage(byUsage[0]!);
  const share = (a: string, b: string) => mates.data[a]?.teammates[b] ?? 0;
  const traits = new Map<SetEntry, ReturnType<typeof setTraits>>();
  const traitsOf = (set: SetEntry) => {
    let t = traits.get(set);
    if (!t) traits.set(set, (t = setTraits(set)));
    return t;
  };
  const fast = (p: Pick) =>
    p.set.item === 'Choice Scarf' ||
    (traitsOf(p.set).categories.has('offense') &&
      dex.species.get(megaForme(p.species, p.set, gen) ?? p.species).baseStats.spe >=
        BUILDER.fastSpeed);
  const bulky = (p: Pick) => traitsOf(p.set).categories.has('defense');
  /** Types two or more members are weak to with nothing resisting them. */
  const holes = (team: Pick[]) =>
    types.filter((type) => {
      const m = team.map((p) => typeMultiplier(p.species, p.set, type, gen));
      return m.filter((x) => x > 1).length >= 2 && !m.some((x) => x < 1);
    });

  /** How well a member checks a threat: Smogon's KO-or-force-out share, minus 4 deviations. */
  const checks = (threat: string, member: Pick): number => {
    if (member.species === threat) return 0;
    const c = mates.data[threat]?.counters[member.species];
    if (c && c[0]! >= 20) return Math.max(0, Math.min(1, c[1]! - 4 * c[2]!));
    // No stats: resisting every STAB of the threat's main set is a partial check.
    const main = data.species[threat]!.sets[0]!;
    const stabs = stabTypes(threat, main, gen);
    if (!stabs.length) return 0;
    return stabs.every((t) => typeMultiplier(member.species, member.set, t, gen) < 1) ? 0.4 : 0;
  };

  function score(team: Pick[], target: Style): { score: number; parts: Record<string, number> } {
    const t = team.map((p) => traitsOf(p.set));
    let weak = 0;
    for (const type of types) {
      const m = team.map((p) => typeMultiplier(p.species, p.set, type, gen));
      const w = m.filter((x) => x > 1).length;
      const r = m.filter((x) => x < 1).length;
      weak += Math.max(0, w - r - 1) + (w >= 3 && r === 0 ? 3 : 0);
    }
    let covered = 0;
    let total = 0;
    for (const threat of threats) {
      const best = Math.max(0, ...team.map((p) => checks(threat, p)));
      covered += usage(threat) * best;
      total += usage(threat);
    }
    let synergy = 0;
    for (const a of team) for (const b of team) if (a !== b) synergy += share(a.species, b.species);
    synergy /= team.length * (team.length - 1);
    const parts = {
      threats: 3 * (covered / total),
      hazards: (t.some((x) => x.sr) ? 1 : 0) + (t.some((x) => x.spikes) ? 0.4 : 0),
      removal: t.some((x) => x.remover) ? 0.5 : 0,
      speed: team.some(fast) ? 0.6 : 0,
      offense: t.filter((x) => x.categories.has('offense')).length >= 2 ? 0.5 : 0,
      bulk: target !== 'offense' && team.some(bulky) ? 0.3 : 0,
      synergy: 2 * synergy,
      strength:
        3 * (team.reduce((a, p) => a + Math.sqrt(usage(p.species) / maxUsage), 0) / team.length),
      weaknesses: -0.7 * weak,
    };
    return { score: Object.values(parts).reduce((a, b) => a + b, 0), parts };
  }

  /** How much a set suits the day's style, given the defensive sets the team already has. */
  const styleFit = (set: SetEntry, team: Pick[], target: Style): number => {
    const def = traitsOf(set).categories.has('defense');
    const d = team.filter(bulky).length;
    if (target === 'offense') return def ? 0.03 : 1;
    if (target === 'stall') return def && d < CONFIG.opponent.stallMinDefense ? 3 : 1;
    if (def) return d >= 2 ? 0.05 : 1;
    return d === 0 && team.length >= 4 ? 0.3 : 1;
  };
  /** A species' fit: its sets' fits, by set weight. */
  const fit = (species: string, team: Pick[], target: Style): number => {
    const sets = data.species[species]!.sets;
    const total = sets.reduce((a, x) => a + x.weight, 0);
    return sets.reduce((a, x) => a + x.weight * styleFit(x, team, target), 0) / total;
  };

  function pickSet(species: string, team: Pick[], target: Style, rng: Rng): SetEntry {
    const sets = data.species[species]!.sets;
    const has = (f: (p: Pick) => boolean) => team.some(f);
    const hazardSetters = team.filter((p) => traitsOf(p.set).sr || traitsOf(p.set).spikes).length;
    return draw(
      sets,
      (set) => {
        const tr = traitsOf(set);
        let w = set.weight * styleFit(set, team, target);
        if (tr.sr && !has((p) => traitsOf(p.set).sr)) w *= BUILDER.need.sr;
        if (tr.remover && !has((p) => traitsOf(p.set).remover)) w *= BUILDER.need.remover;
        if ((tr.sr || tr.spikes) && hazardSetters >= 2) w *= 0.05;
        return w;
      },
      rng,
    )!;
  }

  function construct(fresh: (s: string) => number, target: Style, rng: Rng): Pick[] | undefined {
    const team: Pick[] = [];
    const anchor = draw(
      names,
      (s) => fresh(s) * usage(s) ** BUILDER.anchorUsageExponent * fit(s, team, target),
      rng,
    );
    if (!anchor) return undefined;
    team.push({ species: anchor, set: pickSet(anchor, team, target, rng) });
    while (team.length < BUILDER.size) {
      const inTeam = new Set(team.map((p) => p.species));
      const stapleCount = team.filter((p) => staples.has(p.species)).length;
      const lacks = {
        sr: !team.some((p) => traitsOf(p.set).sr),
        remover: !team.some((p) => traitsOf(p.set).remover),
        fast: !team.some(fast),
        bulk: target !== 'offense' && !team.some(bulky),
      };
      const open = holes(team);
      const next = draw(
        names,
        (s) => {
          if (inTeam.has(s)) return 0;
          if (staples.has(s) && stapleCount >= BUILDER.maxStaples) return 0;
          const f = fresh(s);
          if (!f) return 0;
          const syn =
            team.reduce((a, p) => a + share(p.species, s), 0) / team.length + BUILDER.synergyFloor;
          const sets = data.species[s]!.sets;
          const as = (pred: (set: SetEntry) => boolean) => sets.some(pred);
          let need = 1;
          if (lacks.sr && as((x) => traitsOf(x).sr)) need *= BUILDER.need.sr;
          if (lacks.remover && as((x) => traitsOf(x).remover)) need *= BUILDER.need.remover;
          if (lacks.fast && as((x) => fast({ species: s, set: x }))) need *= BUILDER.need.fast;
          if (lacks.bulk && as((x) => traitsOf(x).categories.has('defense')))
            need *= BUILDER.need.bulk;
          if (open.length && open.some((type) => as((x) => typeMultiplier(s, x, type, gen) < 1))) {
            need *= BUILDER.need.patch;
          }
          return f * usage(s) ** BUILDER.fillUsageExponent * syn * need * fit(s, team, target);
        },
        rng,
      );
      if (!next) return undefined;
      team.push({ species: next, set: pickSet(next, team, target, rng) });
    }
    return team;
  }

  /** The day's opponent: the best of `BUILDER.constructions` built teams of the day's style that pass the hard rules. */
  return function buildOpponent(
    day: string,
    history: OpponentHistory = [],
    candidate = 0,
  ): BuiltOpponent {
    const key = `${seedPrefix(data.meta.format)}opp${OPPONENT_VERSION}:day:${day}`;
    const target = styleFor(day, gen);
    const rng = rngFor(candidateKey(key, candidate));
    const fresh = freshness(day, history);
    const built: {
      team: TeamSlot[];
      style: Style;
      score: number;
      parts: Record<string, number>;
    }[] = [];
    for (let i = 0; i < BUILDER.constructions; i++) {
      const picks = construct(fresh, target, rng);
      if (!picks) continue;
      const { score: s, parts } = score(picks, target);
      built.push({
        team: picks.map((p) => ({ species: p.species, setId: p.set.id })),
        style: styleOf(picks.map((p) => p.set)),
        score: s,
        parts,
      });
    }
    // Teams of the day's style first, best first; others only if none passes.
    built.sort((a, b) => +(b.style === target) - +(a.style === target) || b.score - a.score);
    // The validator is the slow part: check from the top only until one passes.
    for (const [attempts, b] of built.entries()) {
      if (opponentProblems(b.team, data).length) continue;
      return {
        generatorVersion: OPPONENT_VERSION,
        opponentVersion: OPPONENT_VERSION,
        day,
        style: b.style,
        team: b.team,
        attempts: attempts + 1,
        score: b.score,
        parts: b.parts,
      };
    }
    throw new Error(`No valid v${OPPONENT_VERSION} opponent for ${day}`);
  };
}
