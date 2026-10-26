import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { describe, expect, it } from 'vitest';
import { battlePressure, practiceCheck } from './coach/lesson-check';
import { LESSONS } from './index';
import { lessonProblems } from './validate';

describe('lesson content', () => {
  for (const [format, lessons] of Object.entries(LESSONS)) {
    it(`${format}: ids are unique and numbers run in order`, () => {
      expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
      // Drafts (the course being redesigned) are numbered for the new course.
      const listed = lessons.filter((l) => !l.draft);
      expect(listed.map((l) => l.number)).toEqual(listed.map((_, i) => i + 1));
      for (const l of lessons) expect(l.format).toBe(format);
    });
    for (const lesson of lessons) {
      it(`${lesson.id} is valid`, () => {
        expect(lessonProblems(lesson)).toEqual([]);
        // Outcome checks play out many battles.
      }, 60_000);
    }
  }
});

describe('lessonProblems', () => {
  const types = LESSONS.gen3ou!.find((l) => l.id === 'gen3-types')!;

  it('catches illegal answers, misgraded damage, illegal moves, and losing lines', () => {
    const bad = structuredClone(types);
    const quiz = bad.steps.find((s) => s.kind === 'quiz')!;
    quiz.answers.push({ choice: 'move Thunderbolt', grade: 'ok', why: '' });
    const quiz2 = bad.steps.filter((s) => s.kind === 'quiz')[1]!;
    quiz2.answers.find((a) => a.choice === 'move Explosion')!.grade = 'best';
    const battle = bad.steps.find((s) => s.kind === 'battle')!;
    battle.player[0] = { species: 'Swampert', moves: ['Spore'] };
    const problems = lessonProblems(bad).join('\n');
    expect(problems).toContain(`"move Thunderbolt" isn't legal`);
    expect(problems).toContain(`"move Explosion" (best) deals less than "move Meteor Mash" (ok)`);
    expect(problems).toContain(`can't learn Spore`);
    expect(problems).toContain('the intended line loses');
  });

  it('catches a quiz answer graded above one that plays out better', () => {
    const bad = structuredClone(LESSONS.gen3ou!.find((l) => l.id === 'gen3-winning')!);
    const quiz = bad.steps.filter((s) => s.kind === 'quiz').at(-1)!;
    for (const a of quiz.answers) a.grade = a.choice === 'move Surf' ? 'best' : 'wrong';
    bad.steps = [quiz];
    expect(lessonProblems(bad).join('\n')).toMatch(/"move Surf" \(best\) plays out worse/);
  }, 60_000);

  it('catches team picks without enough good options, repeats, and bad lead picks', () => {
    const roles = structuredClone(LESSONS.gen3ou!.find((l) => l.id === 'gen3-roles')!);
    const pick = roles.steps.find((s) => s.kind === 'pick')!;
    pick.options.find((o) => o.mon.species === 'Forretress')!.grade = 'ok';
    pick.options.push(
      { ...pick.options[0]!, grade: 'ok' },
      { ...pick.options[0]!, grade: 'ok', mon: pick.team[0]! },
    );
    const problems = lessonProblems(roles).join('\n');
    expect(problems).toContain('only 1 best options for 2 picks');
    expect(problems).toContain(`${pick.options[0]!.mon.species} is offered twice`);
    expect(problems).toContain(`${pick.team[0]!.species} is offered but already on the team`);

    const leads = structuredClone(LESSONS.gen3ou!.find((l) => l.id === 'gen3-leads')!);
    const lead = leads.steps.find((s) => s.kind === 'pick')!;
    lead.picks = 2;
    lead.foe = ['Mewtwo'];
    const leadProblems = lessonProblems(leads).join('\n');
    expect(leadProblems).toContain('a lead pick picks exactly one');
    expect(leadProblems).toContain(`Mewtwo isn't in the game's species data`);
  });
});

// The redesigned course's practice positions: the best answer is the judge's
// top choice, wins clearly more often, and every wrong answer is explained by
// an idea already taught (docs/plan-tutorial-coach.md, step 4b).
describe.skipIf(!engineBuilt(3))('practice positions', () => {
  for (const lesson of LESSONS.gen3ou ?? [])
    for (const [n, step] of lesson.steps.entries())
      if (step.kind === 'practice')
        it(`${lesson.id} step ${n + 1} decides on what's been taught`, () => {
          const { problems } = practiceCheck(loadEngine(3), lesson.format, step, lesson.number, 30);
          expect(problems).toEqual([]);
        }, 120_000);
});

// The redesigned course's battles: the full coach rarely wants to talk about
// an idea a later lesson teaches (out-of-scope pressure).
describe.skipIf(!engineBuilt(3))('lesson battles stay in scope', () => {
  for (const lesson of (LESSONS.gen3ou ?? []).filter((l) => l.draft))
    for (const [n, step] of lesson.steps.entries())
      if (step.kind === 'battle')
        it(`${lesson.id} step ${n + 1}`, () => {
          const p = battlePressure(loadEngine(3), lesson.format, step, lesson.number, 3);
          expect(p.outOfScope / p.decisions).toBeLessThanOrEqual(0.05);
        }, 300_000);
});
