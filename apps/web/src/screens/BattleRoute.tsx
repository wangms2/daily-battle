// Connects the battle screen to today's attempt: builds the engine input from
// the saved attempt (seeds, team, recorded choices) and records progress.
import { backgroundFor } from '../lib/fx';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { useState } from 'react';
import type { EngineStart } from '../battle/frames';
import { toBattleSet } from '../lib/data';
import type { FormatId } from '@daily-battle/data/formats';
import type { Action } from '../state/reducer';
import type { Attempt, Settings } from '../state/schema';
import { Battle, type DayResult } from './Battle';

export function BattleRoute({
  day,
  schedule,
  attempt,
  tryNumber,
  settings,
  dispatch,
  format,
  onExit,
  onRunItBack,
  onChangeTeam,
  result,
}: {
  /** Today's result so far, for the end card. */
  result: Omit<DayResult, 'ts'>;
  day: string;
  schedule: ScheduleFile;
  attempt: Attempt;
  tryNumber: number;
  settings: Settings;
  dispatch: (a: Action) => void;
  format: FormatId;
  onExit: () => void;
  onRunItBack: () => void;
  onChangeTeam: () => void;
}) {
  // Built once per attempt, with the choices saved so far (for resume).
  const [start] = useState<EngineStart>(() => {
    const opponent = schedule.days.find((d) => d.day === day)!;
    return {
      format,
      playerTeam: attempt.team.map(toBattleSet),
      opponentTeam: opponent.team.map(toBattleSet),
      style: opponent.style,
      battleSeed: attempt.battleSeed,
      aiSeed: attempt.aiSeed,
      choices: [...attempt.choices],
      ...(attempt.difficulty && { difficulty: attempt.difficulty }),
      ...(attempt.difficulty === 'hard' && {
        pool: [...schedule.pool.species],
        aiChoices: [...(attempt.aiChoices ?? [])],
      }),
    };
  });
  return (
    <Battle
      start={start}
      background={backgroundFor(day, format)}
      tryNumber={tryNumber}
      settings={settings}
      onSetting={(key, value) => dispatch({ type: 'setSetting', key, value })}
      onExplainerSeen={(id) => dispatch({ type: 'markExplainer', id })}
      onChoice={(choice, ai) =>
        dispatch({ type: 'recordChoice', day, choice, format, ...(ai && { ai }) })
      }
      onEnd={({ result, remaining }) =>
        dispatch({ type: 'endAttempt', day, result, remaining, format })
      }
      onExit={onExit}
      onRunItBack={onRunItBack}
      onChangeTeam={onChangeTeam}
      result={{ ...result, ts: attempt.ts }}
    />
  );
}
