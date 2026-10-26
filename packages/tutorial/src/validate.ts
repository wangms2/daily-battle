import { aiFor } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import {
  deriveSeed,
  makeRng,
  resolveStep,
  SIDES,
  teamProblems,
  type Policy,
  type SideID,
} from '@daily-battle/sim-bridge';
import { speciesDataFor } from '@daily-battle/data/species';
import type { PokemonSet } from '@pkmn/sim';
import { foePolicy, startPosition } from './battle';
import { teamOf } from './teams';
import type { Lesson, Mon, PracticeStep } from './types';

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

export interface Outcome {
  /** Share of games won (0–1). */
  wins: number;
  /** Mean of (foe's fainted − player's fainted) at the end. */
  margin: number;
}

/**
 * How each answer plays out: the player makes it, then both sides play on
 * (the player as the Normal AI, the foe as the Easy AI) to the end, over
 * `runs` seeds. Every answer gets the same seeds, so only the answer differs.
 */
export function answerOutcomes(
  format: string,
  step: Pick<PracticeStep, 'position' | 'answers'>,
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
        p2: foePolicy(format),
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
      if (step.kind === 'battle') {
        note(where, teamIssues(format, step.player));
        note(where, teamIssues(format, step.foe));
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
        const session = startPosition(format, step.position);
        const request = session.request('p1')!;
        const turn = step.turn;
        if (step.card && step.card !== 'foe' && !resolveStep(step.card, request))
          note(where, [`the card "${step.card}" isn't a legal choice`]);
        const mine = turn?.p1 && resolveStep(turn.p1, request);
        if (!turn) {
          if (step.after) note(where, ['a look (no turn) has no "after" caption']);
        } else if (!mine) note(where, [`the demo's move "${turn.p1}" isn't legal`]);
        else if (!step.whole) {
          // A demo stops before the foe's move, so yours has to land first.
          session.choose('p1', mine);
          const foe = session.request('p2');
          if (foe && turn.p2) session.choose('p2', resolveStep(turn.p2, foe)!);
          const log = session.spectatorLog;
          const you = log.findIndex((l) => l.startsWith('|move|p1a:'));
          const them = log.findIndex((l) => l.startsWith('|move|p2a:'));
          if (you < 0 || (them >= 0 && them < you))
            note(where, ['the foe moves first, so the demo would stop before your move']);
        }
      }
    } catch (e) {
      note(where, [(e as Error).message]);
    }
  }
  return problems;
}
