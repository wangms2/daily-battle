// Builds the playtest report (format in @daily-battle/gen/report) from saved
// state: each played day's tries, with the tester's own team. Nothing else.
import { formatReport, type PlaytestReport, type ReportTry } from '@daily-battle/gen/report';
import type { State } from '../state/schema';

const CODE: Record<string, ReportTry['r']> = { win: 'w', loss: 'l', forfeit: 'f' };

export function buildReport(state: State, engine: string): PlaytestReport {
  const days = Object.keys(state.days)
    .sort()
    .flatMap((d) => {
      const tries = state.days[d]!.attempts.filter((a) => a.result !== 'inProgress');
      if (!tries.length) return [];
      return [
        {
          d,
          team: tries[0]!.team.map((s) => s.species),
          tries: tries.map((a) => ({
            r: CODE[a.result]!,
            left: a.remaining,
            n: a.choices.length,
            lead: a.lead,
          })),
        },
      ];
    });
  return {
    v: 1,
    engine,
    hints: state.settings.beginnerHints,
    speed: state.settings.battleSpeed,
    days,
  };
}

export const reportText = (state: State, engine: string) =>
  formatReport(buildReport(state, engine));
