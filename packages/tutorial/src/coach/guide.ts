// The guided replay of a lesson battle (DESIGN.md §22) and the win check
// behind it: the coach's judge names a choice each turn, and the same judge,
// seeded the same way, plays the battle in the content tests, so the line it
// names is one that wins. The app's lesson battles judge each decision with
// `guideKey` (battle/engine.ts), which makes the two the same battle.
import { NaivePolicy } from '@daily-battle/ai';
import type { Engine } from '@daily-battle/engine-wasm';
import { deriveSeed, legalChoices, makeRng, type SideView } from '@daily-battle/sim-bridge';
import { playBattle } from '../battle';
import { knownSets, withLessonSets } from '../teams';
import type { BattleStep, Mon } from '../types';
import { Judge, LESSON_TIE } from './judge';
import type { CoachNote } from './simple';

/** The judge for a lesson battle: the lesson foe's sets are known, near-ties left out. */
export const lessonJudge = (engine: Engine, format: string, foe: Mon[]) =>
  new Judge(engine, withLessonSets(format, foe), {
    knownSets: knownSets(format, foe),
    tie: LESSON_TIE,
  });

/** The judge's key for a decision: the battle's seed label and your choices so far. */
export const guideKey = (seed: string, decisions: number) => `${seed}:${decisions}`;

/**
 * The guide's pick when a Pokémon of yours has fainted (the judge only weighs
 * moves): the teammate that hits the foe hardest.
 */
export function guideSwitch(format: string, foe: Mon[], view: SideView): string | undefined {
  if (legalChoices(view.request).length < 2) return undefined;
  return new NaivePolicy(withLessonSets(format, foe)).choose(view, makeRng(deriveSeed('guide', 0)));
}

/** The guided replay's tip naming `choice` (`move 2`, `switch 3`) for this decision. */
export function guideNote(view: SideView, choice: string): CoachNote {
  const [verb, n] = choice.split(' ');
  const i = Number(n) - 1;
  const { request } = view;
  const text =
    verb === 'switch'
      ? `Try ${request.side?.pokemon[i]?.details.split(',')[0] ?? 'switching'}.`
      : `Try ${('active' in request && request.active?.[0]?.moves[i]?.name) || 'this move'}.`;
  return { rule: 'guide', text };
}

export interface WinCheck {
  /** The battle as the app plays it (the step's seed), followed by the guide, is won. */
  guided: boolean;
  /** Share won by the guide over `runs` seeds (the step's and variants). */
  wins: number;
}

/**
 * Plays a lesson battle with the guide choosing every turn, on the step's
 * seed and `runs - 1` variants (the foe's Easy AI chooses differently).
 */
export function winCheck(engine: Engine, format: string, step: BattleStep, runs = 6): WinCheck {
  let wins = 0;
  let guided = false;
  for (let k = 0; k < runs; k++) {
    const seed = k === 0 ? step.seed : `${step.seed}:win${k}`;
    const judge = lessonJudge(engine, format, step.foe);
    const result = playBattle(
      format,
      step,
      (view, session) => {
        const legal = legalChoices(view.request);
        if (view.request.requestType !== 'move')
          return guideSwitch(format, step.foe, view) ?? legal[0]!;
        judge.begin(view, guideKey(seed, session.choices('p1').length));
        while (!judge.best && judge.step());
        return judge.best ?? legal[0]!;
      },
      seed,
    );
    if (result.winner === 'p1') {
      wins++;
      if (k === 0) guided = true;
    }
  }
  return { guided, wins: wins / runs };
}
