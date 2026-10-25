import { describe, expect, it } from 'vitest';
import { LESSONS } from './index';
import { lessonProblems } from './validate';

describe('lesson content', () => {
  for (const [format, lessons] of Object.entries(LESSONS)) {
    it(`${format}: ids are unique and numbers run in order`, () => {
      expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
      expect(lessons.map((l) => l.number)).toEqual(lessons.map((_, i) => i + 1));
      for (const l of lessons) expect(l.format).toBe(format);
    });
    for (const lesson of lessons) {
      it(`${lesson.id} is valid`, () => {
        expect(lessonProblems(lesson)).toEqual([]);
      });
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
});
