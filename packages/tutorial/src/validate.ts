import {
  legalChoices,
  resolveStep,
  runBattle,
  ScriptedPolicy,
  teamProblems,
} from '@daily-battle/sim-bridge';
import { battleInput, startPosition } from './battle';
import { teamOf } from './teams';
import type { Grade, Lesson, Mon, QuizStep } from './types';

// Lessons use small teams (1v1 to 4v4); the sim allows them, the validator doesn't.
const SIZE = /must bring at least|at least \d+ Pok/i;

function teamIssues(format: string, mons: Mon[]): string[] {
  const team = teamOf(format, mons);
  return (teamProblems(format, team) ?? []).filter((p) => !SIZE.test(p));
}

const RANK: Record<Grade, number> = { best: 2, ok: 1, wrong: 0 };

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
      }
    } catch (e) {
      note(where, [(e as Error).message]);
    }
  }
  return problems;
}
