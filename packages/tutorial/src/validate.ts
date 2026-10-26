import { aiFor } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import {
  deriveSeed,
  legalChoices,
  makeRng,
  resolveStep,
  runBattle,
  ScriptedPolicy,
  SIDES,
  teamProblems,
  type Policy,
  type SideID,
} from '@daily-battle/sim-bridge';
import { speciesDataFor } from '@daily-battle/data/species';
import type { PokemonSet } from '@pkmn/sim';
import { battleInput, foePolicy, startPosition } from './battle';
import { teamOf } from './teams';
import type { Grade, Lesson, Mon, QuizStep } from './types';

// Lessons use small teams (1v1 to 4v4); the sim allows them, the validator doesn't.
const SIZE = /must bring at least|at least \d+ Pok/i;

function teamIssues(format: string, mons: Mon[]): string[] {
  const team = teamOf(format, mons);
  return [
    ...(teamProblems(format, team) ?? []).filter((p) => !SIZE.test(p)),
    ...dataIssues(format, team),
  ];
}

/**
 * The web shows species and moves from the game's own data (its OU pool), so
 * lessons may only use what's in it.
 */
function dataIssues(format: string, team: PokemonSet[]): string[] {
  const data = speciesDataFor(format);
  return team.flatMap((set) => [
    ...(data.species[set.species] ? [] : [`${set.species} isn't in the game's species data`]),
    ...set.moves
      .filter((m) => !data.moves[m])
      .map((m) => `${set.species}'s ${m} isn't in the game's move data`),
  ]);
}

const RANK: Record<Grade, number> = { best: 2, ok: 1, wrong: 0 };

// Win rates within this of each other count as a tie (then the faint margin decides).
const TOLERANCE = 0.1;

const fmt = (o: Outcome) => `${Math.round(o.wins * 100)}% wins, ${o.margin.toFixed(1)} margin`;

/**
 * Mean damage (% of the foe's HP) each answer deals from the position, over a
 * few seeds, with the foe made harmless (Splash) so only the answer differs.
 */
export function answerDamage(format: string, step: QuizStep, seeds = 8): number[] {
  const p2 = step.position.p2.map((m) => ({ species: m.species, moves: ['Splash'] }));
  return step.answers.map(({ choice }) => {
    let total = 0;
    for (let k = 0; k < seeds; k++) {
      const s = startPosition(format, {
        ...step.position,
        p2,
        seed: `${step.position.seed}:damage:${k}`,
      });
      const hp = () => s.client('p1').p2.active[0]?.hp ?? 0;
      const before = hp();
      s.choose('p1', resolveStep(choice, s.request('p1')!)!);
      s.choose('p2', 'move 1');
      total += before - hp();
    }
    return total / seeds;
  });
}

export interface Outcome {
  /** Share of games won (0–1). */
  wins: number;
  /** Mean of (foe's fainted − player's fainted) at the end. */
  margin: number;
}

/**
 * How each answer plays out: the player makes it, then both sides play on
 * (the player as the Normal AI, the foe as `foeAi`) to the end, over
 * `runs` seeds. Every answer gets the same seeds, so only the answer differs.
 */
export function answerOutcomes(
  format: string,
  step: Pick<QuizStep, 'position' | 'answers'> & { foeAi?: QuizStep['foeAi'] },
  runs = 24,
): Outcome[] {
  const data = setsFor(format);
  return step.answers.map(({ choice }) => {
    let wins = 0;
    let margin = 0;
    for (let k = 0; k < runs; k++) {
      const seed = `${step.position.seed}:outcome:${k}`;
      const s = startPosition(format, { ...step.position, seed });
      const policies: Record<SideID, Policy> = {
        p1: aiFor({ difficulty: 'normal', style: 'balance', data }),
        p2: foePolicy(format, step.foeAi ?? 'easy'),
      };
      const rngs = { p1: makeRng(deriveSeed(seed, 1)), p2: makeRng(deriveSeed(seed, 2)) };
      let first: string | undefined = resolveStep(choice, s.request('p1')!)!;
      for (let guard = 0; !s.ended && guard < 1000; guard++) {
        for (const side of SIDES) {
          const view = s.view(side);
          if (!view) continue;
          const pick = side === 'p1' && first ? first : policies[side].choose(view, rngs[side]);
          if (side === 'p1') first = undefined;
          s.choose(side, pick);
          if (s.ended) break;
        }
      }
      const result = s.result();
      const faints = (side: SideID) =>
        result.spectatorLog.filter((l) => l.startsWith(`|faint|${side}`)).length;
      if (result.winner === 'p1') wins++;
      margin += faints('p2') - faints('p1');
    }
    return { wins: wins / runs, margin: margin / runs };
  });
}

/** Everything wrong with a lesson's content; empty when it's good to ship. */
export function lessonProblems(lesson: Lesson): string[] {
  const { format } = lesson;
  const problems: string[] = [];
  const note = (where: string, list: string[]) =>
    problems.push(...list.map((p) => `${where}: ${p}`));

  for (const [n, step] of lesson.steps.entries()) {
    const where = `${lesson.id} step ${n + 1} (${step.kind})`;
    try {
      if (step.kind === 'quiz') {
        note(where, teamIssues(format, step.position.p1));
        note(where, teamIssues(format, step.position.p2));
        const request = startPosition(format, step.position).request('p1')!;
        const seen = new Set<string>();
        for (const answer of step.answers) {
          const choice = resolveStep(answer.choice, request);
          if (!choice) note(where, [`answer "${answer.choice}" isn't legal`]);
          else if (seen.has(choice)) note(where, [`answer "${answer.choice}" is listed twice`]);
          else seen.add(choice);
        }
        if (!step.answers.some((a) => a.grade === 'best')) note(where, ['no best answer']);
        const allGraded = seen.size === legalChoices(request).length;
        if (allGraded && step.otherwise)
          note(where, ['every choice is graded, so `otherwise` is never shown']);
        if (!allGraded && !step.otherwise)
          note(where, ['some choices are ungraded and there is no `otherwise`']);
        if (step.check === 'damage' && seen.size === step.answers.length) {
          const damage = answerDamage(format, step);
          for (const [i, a] of step.answers.entries())
            for (const [j, b] of step.answers.entries())
              if (RANK[a.grade] > RANK[b.grade] && damage[i]! < damage[j]!)
                note(where, [
                  `"${a.choice}" (${a.grade}) deals less than "${b.choice}" (${b.grade})`,
                ]);
        }
        if (step.check === 'outcome' && seen.size === step.answers.length) {
          const outcomes = answerOutcomes(format, step);
          for (const [i, a] of step.answers.entries())
            for (const [j, b] of step.answers.entries()) {
              const x = outcomes[i]!;
              const y = outcomes[j]!;
              const worse =
                x.wins < y.wins - TOLERANCE || (x.wins <= y.wins && x.margin < y.margin);
              if (RANK[a.grade] > RANK[b.grade] && worse)
                note(where, [
                  `"${a.choice}" (${a.grade}) plays out worse than "${b.choice}" (${b.grade}): ` +
                    `${fmt(x)} vs ${fmt(y)}`,
                ]);
            }
        }
      } else if (step.kind === 'pick') {
        const lead = step.target === 'lead';
        if (lead && step.team.length) note(where, ['a lead pick has no team so far']);
        if (lead && step.picks !== 1) note(where, ['a lead pick picks exactly one']);
        const data = speciesDataFor(format);
        for (const s of step.foe ?? [])
          if (!data.species[s]) note(where, [`${s} isn't in the game's species data`]);
        if (step.team.length) note(where, teamIssues(format, step.team));
        const best = step.options.filter((o) => o.grade === 'best');
        if (best.length < step.picks)
          note(where, [`only ${best.length} best options for ${step.picks} picks`]);
        // A lead is picked from a whole team, so the options are that team.
        const built = lead
          ? step.options.map((o) => o.mon)
          : [...step.team, ...best.map((o) => o.mon)];
        note(where, teamIssues(format, built));
        note(
          where,
          dataIssues(
            format,
            teamOf(
              format,
              step.options.map((o) => o.mon),
            ),
          ),
        );
        const names = step.options.map((o) => o.mon.species);
        const dup = names.find((n, i) => names.indexOf(n) !== i);
        if (dup) note(where, [`${dup} is offered twice`]);
        const onTeam = step.team.map((m) => m.species);
        const taken = names.find((n) => onTeam.includes(n));
        if (taken) note(where, [`${taken} is offered but already on the team`]);
      } else if (step.kind === 'battle') {
        note(where, teamIssues(format, step.player));
        note(where, teamIssues(format, step.foe));
        if (step.intended) {
          const player = new ScriptedPolicy(step.intended);
          const input = battleInput(format, step, player);
          const foe = input.p2.policy;
          const result = runBattle(input);
          if (result.winner !== 'p1') note(where, ['the intended line loses']);
          if (player.skipped.length)
            note(where, [`player steps skipped: ${player.skipped.join(', ')}`]);
          if (foe instanceof ScriptedPolicy && foe.skipped.length)
            note(where, [`foe steps skipped: ${foe.skipped.join(', ')}`]);
        } else if (step.foeAi !== 'easy') {
          note(where, ['a scripted battle needs an intended line']);
        }
      } else if (step.kind === 'practice') {
        note(where, teamIssues(format, step.position.p1));
        note(where, teamIssues(format, step.position.p2));
        const request = startPosition(format, step.position).request('p1')!;
        for (const a of step.answers)
          if (!resolveStep(a.choice, request)) note(where, [`answer "${a.choice}" isn't legal`]);
        if (step.answers.filter((a) => a.grade === 'best').length !== 1)
          note(where, ['a practice needs exactly one best answer']);
      } else if (step.kind === 'demo') {
        note(where, teamIssues(format, step.position.p1));
        note(where, teamIssues(format, step.position.p2));
        const request = startPosition(format, step.position).request('p1')!;
        if (!step.turn.p1 || !resolveStep(step.turn.p1, request))
          note(where, [`the demo's move "${step.turn.p1}" isn't legal`]);
      } else {
        const data = speciesDataFor(format);
        for (const s of step.sprites ?? [])
          if (!data.species[s]) note(where, [`${s} isn't in the game's species data`]);
      }
    } catch (e) {
      note(where, [(e as Error).message]);
    }
  }
  return problems;
}
