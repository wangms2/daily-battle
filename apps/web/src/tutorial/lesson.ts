// Lesson helpers shared by Learn mode's screens (no React).
import type { BattleStep, Lesson } from '@daily-battle/tutorial/lessons';
import type { TutorialProgress } from '../state/schema';
import type { EngineStart } from '../battle/frames';

/** A lesson battle's start: the engine derives its seeds from the lesson's seed label. */
export function lessonStart(step: BattleStep, format: string): EngineStart {
  return {
    format,
    playerTeam: step.player,
    opponentTeam: step.foe,
    style: 'balance',
    battleSeed: step.seed,
    aiSeed: step.seed,
    choices: [],
    difficulty: 'easy',
    tutorial: {
      noLuck: step.noLuck,
      ...(step.foeAi !== 'easy' && { foeScript: step.foeAi }),
    },
  };
}

/** The lesson to do next: the first one not finished (none once all are). */
export function nextLesson(lessons: Lesson[], progress: TutorialProgress | undefined) {
  return lessons.find((l) => !progress?.completed.includes(l.id));
}

/** "move Ice Beam" → "Ice Beam"; "switch Jolteon" → "Switch to Jolteon". */
export function choiceLabel(step: string) {
  const [verb, ...rest] = step.split(' ');
  const name = rest.join(' ');
  return verb === 'switch' ? `Switch to ${name}` : name;
}
