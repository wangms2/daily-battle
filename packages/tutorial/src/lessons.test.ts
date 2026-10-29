import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { legalChoices } from '@daily-battle/sim-bridge';
import { describe, expect, it } from 'vitest';
import { playBattle } from './battle';
import { winCheck } from './coach/guide';
import { battlePressure, practiceCheck } from './coach/lesson-check';
import { LESSONS } from './index';
import { lessonProblems } from './validate';

describe('lesson content', () => {
  for (const [format, lessons] of Object.entries(LESSONS)) {
    it(`${format}: ids are unique and numbers run in order`, () => {
      expect(new Set(lessons.map((l) => l.id)).size).toBe(lessons.length);
      // Reviews carry the number of the last lesson they cover.
      const numbered = lessons.filter((l) => !l.review);
      expect(numbered.map((l) => l.number)).toEqual(numbered.map((_, i) => i + 1));
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
  const immune = LESSONS.gen3ou!.find((l) => l.id === 'gen3-immune')!;

  it('catches illegal demo moves and practice answers, and moves a Pokémon can’t learn', () => {
    const bad = structuredClone(immune);
    const demo = bad.steps.find((s) => s.kind === 'demo')!;
    demo.turn = { p1: 'move Thunderbolt', p2: 'move Drill Peck' };
    const practice = bad.steps.find((s) => s.kind === 'practice')!;
    practice.answers.push({ choice: 'move Ice Beam', grade: 'wrong', why: '' });
    const battle = bad.steps.find((s) => s.kind === 'battle')!;
    battle.player[0] = { species: 'Swampert', moves: ['Spore'] };
    const problems = lessonProblems(bad).join('\n');
    expect(problems).toContain(`the demo's move "move Thunderbolt" isn't legal`);
    expect(problems).toContain(`answer "move Ice Beam" isn't legal`);
    expect(problems).toContain(`can't learn Spore`);
  });

  it('catches a practice without exactly one best answer, and a demo cut before your move', () => {
    const bad = structuredClone(immune);
    const practice = bad.steps.find((s) => s.kind === 'practice')!;
    for (const a of practice.answers) a.grade = 'best';
    const demo = bad.steps.find((s) => s.kind === 'demo' && s.turn)!;
    if (demo.kind !== 'demo') throw new Error('no demo');
    // A slower Pokémon: the foe moves first, so the demo would stop before yours.
    demo.position = {
      ...demo.position,
      p1: [{ species: 'Snorlax', moves: ['Earthquake'] }],
    };
    demo.turn = { p1: 'move Earthquake', p2: 'move Drill Peck' };
    const problems = lessonProblems(bad).join('\n');
    expect(problems).toContain('a practice needs exactly one best answer');
    expect(problems).toContain('the foe moves first, so the demo would stop before your move');
  });
});

// Lesson battles play to an end whatever you pick, losing included.
describe('lesson battles end cleanly', () => {
  for (const [format, lessons] of Object.entries(LESSONS))
    for (const lesson of lessons)
      for (const [n, step] of lesson.steps.entries())
        if (step.kind === 'battle')
          it(`${lesson.id} step ${n + 1}`, () => {
            for (let i = 1; i <= 4; i++) {
              const r = playBattle(format, step, ({ request }) => {
                const legal = legalChoices(request);
                return legal.includes(`move ${i}`) ? `move ${i}` : legal[0]!;
              });
              expect(r.winner).not.toBeNull();
            }
          });
});

// Practice positions: the best answer is the judge's
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

// Lesson battles: the full coach rarely wants to talk about an idea a later
// lesson teaches (out-of-scope pressure).
describe.skipIf(!engineBuilt(3))('lesson battles stay in scope', () => {
  for (const lesson of LESSONS.gen3ou ?? [])
    for (const [n, step] of lesson.steps.entries())
      if (step.kind === 'battle')
        it(`${lesson.id} step ${n + 1}`, () => {
          const p = battlePressure(loadEngine(3), lesson.format, step, lesson.number, 3);
          expect(p.outOfScope / p.decisions).toBeLessThanOrEqual(0.05);
        }, 300_000);
});

// Lesson battles: the guided replay's line wins the battle the app plays
// (the step's seed) and nearly always on other seeds (DESIGN.md §22).
describe.skipIf(!engineBuilt(3))('lesson battles can be won', () => {
  for (const lesson of LESSONS.gen3ou ?? [])
    for (const [n, step] of lesson.steps.entries())
      if (step.kind === 'battle')
        it(`${lesson.id} step ${n + 1}`, () => {
          const r = winCheck(loadEngine(3), lesson.format, step, 10);
          expect(r.guided).toBe(true);
          expect(r.wins).toBeGreaterThanOrEqual(0.9);
        }, 120_000);
});
