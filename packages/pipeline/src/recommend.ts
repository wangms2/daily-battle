// The team builder's recommended team (DESIGN.md §9.2): one strong, well-built
// team a player can pick up and use without teambuilding.
//
// 1. Rules: the builder's checklist (hazards, removal, physical, special,
//    defense; each only if the pool can provide it), no type that 3+ members are
//    weak to with no one resisting it, common sets only, and legal.
// 2. Search: random rule-meeting teams, then rounds of one-change tweaks (a
//    member or a set) to the leaders, all scored on the same battles.
// 3. Test: the leaders get more battles, and the finalists play held-out probe
//    opponents, so the pick isn't luck or tuned to a few opponents.
import type { SetEntry, SetsFile } from '@daily-battle/data';
import { genOf } from '@daily-battle/data';
import {
  checklist,
  generateOpponent,
  rngFor,
  setChecks,
  teamSets,
  typeMultiplier,
  typesOf,
  type Checklist,
  type DailyOpponent,
  type Rng,
  type TeamSlot,
} from '@daily-battle/gen';
import { PIPELINE } from './config';
import type { Job } from './job';
import { legalTeam } from './sample';
import type { Simulator } from './simulate';

type Config = typeof PIPELINE.recommend;

export interface Recommendation {
  team: TeamSlot[];
  /** Win rate against the held-out probes (mid bot), plus the search's battles. */
  winRate: number;
  battles: number;
  /** Which rules it meets: 'all', or relaxed when the pool can't meet them all. */
  rules: 'all' | 'checklist' | 'legal';
}

interface Option {
  species: string;
  sets: SetEntry[];
}

/** Each species' common sets (at least its most used one). */
function optionsFor(species: string[], data: SetsFile, minWeight: number): Option[] {
  return species.map((name) => {
    const all = data.species[name]!.sets;
    const common = all.filter((s) => s.weight >= minWeight);
    return {
      species: name,
      sets: common.length ? common : [all.reduce((a, b) => (b.weight > a.weight ? b : a))],
    };
  });
}

const KEYS: (keyof Checklist)[] = ['hazards', 'removal', 'physical', 'special', 'defensive'];

/** A team's sets. */
const setsOf = (data: SetsFile, team: TeamSlot[]) =>
  team.map((slot) => data.species[slot.species]!.sets.find((s) => s.id === slot.setId)!);

/** Types 3+ members are weak to with no one resisting or immune. */
export function defenseHoles(data: SetsFile, team: TeamSlot[]): string[] {
  const gen = genOf(data.meta.format);
  const sets = setsOf(data, team);
  return typesOf(gen).filter((type) => {
    const mults = team.map((slot, i) => typeMultiplier(slot.species, sets[i]!, type, gen));
    return mults.filter((m) => m > 1).length >= 3 && !mults.some((m) => m < 1);
  });
}

type Level = Recommendation['rules'];

/** A rule check for the pool: the checklist items its common sets can cover. */
function rulesFor(options: Option[], data: SetsFile) {
  const can = new Set(KEYS.filter((k) => options.some((o) => o.sets.some((s) => setChecks(s)[k]))));
  return (team: TeamSlot[], level: Level): boolean => {
    if (!legalTeam(data, team)) return false;
    if (level === 'legal') return true;
    const checks = checklist(setsOf(data, team));
    if (![...can].every((k) => checks[k])) return false;
    return level === 'checklist' || defenseHoles(data, team).length === 0;
  };
}

const keyOf = (team: TeamSlot[]) =>
  team
    .map((s) => s.setId)
    .sort()
    .join();

function pickWeighted(sets: SetEntry[], rng: Rng): SetEntry {
  const total = sets.reduce((a, s) => a + s.weight, 0);
  let r = rng() * total;
  for (const s of sets) if ((r -= s.weight) < 0) return s;
  return sets[sets.length - 1]!;
}

function randomTeam(options: Option[], rng: Rng): TeamSlot[] {
  const left = [...options];
  return Array.from({ length: 6 }, () => {
    const o = left.splice(Math.floor(rng() * left.length), 1)[0]!;
    return { species: o.species, setId: pickWeighted(o.sets, rng).id };
  });
}

/** One change: a member swapped for another of the pool, or a member's set changed. */
function tweak(team: TeamSlot[], options: Option[], rng: Rng): TeamSlot[] {
  const out = team.map((s) => ({ ...s }));
  const i = Math.floor(rng() * 6);
  const own = options.find((o) => o.species === out[i]!.species)!;
  const otherSets = own.sets.filter((s) => s.id !== out[i]!.setId);
  if (otherSets.length && rng() < 0.35) {
    out[i] = { species: own.species, setId: otherSets[Math.floor(rng() * otherSets.length)]!.id };
    return out;
  }
  const outside = options.filter((o) => !out.some((s) => s.species === o.species));
  const o = outside[Math.floor(rng() * outside.length)]!;
  out[i] = { species: o.species, setId: pickWeighted(o.sets, rng).id };
  return out;
}

/** Scores teams by battles against probes; every team plays the same battles. */
function scorer(week: string, sim: Simulator, data: SetsFile, probes: DailyOpponent[]) {
  return async (teams: TeamSlot[][], seeds: number, seedOffset: number, tag: string) => {
    const jobs: Job[] = [];
    for (const team of teams) {
      const player = teamSets(data, team);
      probes.forEach((probe, p) => {
        for (let s = 0; s < seeds; s++) {
          jobs.push({
            format: data.meta.format,
            bot: 'mid',
            player,
            opponent: teamSets(data, probe.team),
            style: probe.style,
            seed: `pipeline:recommend:${week}:${tag}`,
            // The same index for every team: the same battle seeds, so teams compare fairly.
            index: p * 1000 + seedOffset + s,
          });
        }
      });
    }
    const results = await sim.run(jobs);
    const per = probes.length * seeds;
    return teams.map((_, t) => {
      const won = results
        .slice(t * per, (t + 1) * per)
        .reduce((a, r) => a + (r.outcome === 'win' ? 1 : r.outcome === 'tie' ? 0.5 : 0), 0);
      return { won, played: per };
    });
  };
}

interface Scored {
  team: TeamSlot[];
  won: number;
  played: number;
}
const rate = (x: { won: number; played: number }) => x.won / x.played;

/** The week's recommended team from the pool, or undefined if no legal team exists. */
export async function recommendTeam(
  week: string,
  species: string[],
  sim: Simulator,
  data: SetsFile,
  cfg: Config = PIPELINE.recommend,
  log: (msg: string) => void = () => {},
): Promise<Recommendation | undefined> {
  const options = optionsFor(species, data, cfg.minSetWeight);
  const meets = rulesFor(options, data);
  const rng = rngFor(`pipeline:recommend:${week}`);

  // Start teams at the strictest rule level the pool can meet.
  let level: Level = 'all';
  let start: TeamSlot[][] = [];
  for (const l of ['all', 'checklist', 'legal'] as const) {
    const seen = new Set<string>();
    start = [];
    for (let t = 0; t < 20_000 && start.length < cfg.startTeams; t++) {
      const team = randomTeam(options, rng);
      const key = keyOf(team);
      if (seen.has(key)) continue;
      seen.add(key);
      if (meets(team, l)) start.push(team);
    }
    level = l;
    if (start.length >= Math.min(8, cfg.startTeams)) break;
  }
  if (!start.length) return undefined;

  const probes = (base: number, n: number) =>
    Array.from({ length: n }, (_, k) => generateOpponent(week, data, base + k));
  const search = scorer(week, sim, data, probes(cfg.searchProbeBase, cfg.searchProbes));
  const final = scorer(week, sim, data, probes(cfg.finalProbeBase, cfg.finalProbes));

  // Screen the start teams, then tweak the leaders.
  const seen = new Map<string, Scored>();
  const add = (teams: TeamSlot[][], scores: { won: number; played: number }[]) =>
    teams.forEach((team, i) => seen.set(keyOf(team), { team, ...scores[i]! }));
  add(start, await search(start, cfg.screenSeeds, 0, 'screen'));
  const ranked = () => [...seen.values()].sort((a, b) => rate(b) - rate(a));
  for (let round = 0; round < cfg.rounds; round++) {
    const leaders = ranked().slice(0, 4);
    const tweaks: TeamSlot[][] = [];
    for (let t = 0; t < cfg.tweaks * 20 && tweaks.length < cfg.tweaks; t++) {
      const team = tweak(leaders[t % leaders.length]!.team, options, rng);
      const key = keyOf(team);
      if (seen.has(key) || tweaks.some((x) => keyOf(x) === key) || !meets(team, level)) continue;
      tweaks.push(team);
    }
    if (!tweaks.length) break;
    add(tweaks, await search(tweaks, cfg.screenSeeds, 0, 'screen'));
    log(`    recommend round ${round + 1}: best ${(100 * rate(ranked()[0]!)).toFixed(0)}%`);
  }

  // More battles for the leaders (new seeds, same probes).
  const top = ranked().slice(0, cfg.retestTop);
  const more = await search(
    top.map((x) => x.team),
    cfg.retestSeeds,
    cfg.screenSeeds,
    'screen',
  );
  top.forEach((x, i) => {
    x.won += more[i]!.won;
    x.played += more[i]!.played;
  });
  top.sort((a, b) => rate(b) - rate(a));

  // Finalists on held-out probes; the pick counts all their battles.
  const finalists = top.slice(0, cfg.finalists);
  const held = await final(
    finalists.map((x) => x.team),
    cfg.finalSeeds,
    0,
    'final',
  );
  const scored = finalists
    .map((x, i) => ({
      team: x.team,
      won: x.won + held[i]!.won,
      played: x.played + held[i]!.played,
    }))
    .sort((a, b) => rate(b) - rate(a));
  const best = scored[0]!;
  return { team: best.team, winRate: rate(best), battles: best.played, rules: level };
}
