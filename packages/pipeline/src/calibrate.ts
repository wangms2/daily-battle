// Compares real playtest results with the pipeline's predictions (M9b,
// DESIGN.md §9.4), to calibrate the validation bands against real players.
import type { PlaytestReport } from '@daily-battle/gen/report';
import { pct } from './stats';

/** The mid bot's predicted win rates for a day, from the pipeline report. */
export interface Prediction {
  first: number;
  retry: number;
}

interface Tally {
  wins: number;
  n: number;
}

/** Wilson 95% interval: honest even for the small counts a playtest gives. */
function wilson({ wins, n }: Tally): [number, number] {
  if (!n) return [0, 1];
  const z = 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

const cell = (t: Tally) => {
  if (!t.n) return '–';
  const [lo, hi] = wilson(t);
  return `${pct(t.wins / t.n)} (${t.wins}/${t.n}, ${pct(lo)}–${pct(hi)})`;
};

interface DayTally {
  players: number;
  first: Tally;
  /** Tries 2 and 3, for players who hadn't won yet. */
  retry: Tally;
  kept: Tally;
}

const empty = (): DayTally => ({
  players: 0,
  first: { wins: 0, n: 0 },
  retry: { wins: 0, n: 0 },
  kept: { wins: 0, n: 0 },
});

function add(t: DayTally, tries: { r: string }[]) {
  const counted = tries.slice(0, 3);
  if (!counted.length) return;
  t.players++;
  t.first.n++;
  if (counted[0]!.r === 'w') t.first.wins++;
  for (let i = 1; i < counted.length; i++) {
    if (counted.slice(0, i).some((x) => x.r === 'w')) break;
    t.retry.n++;
    if (counted[i]!.r === 'w') t.retry.wins++;
  }
  // A day is only decided after a win or 3 tries; skip undecided days for "kept".
  const won = counted.some((x) => x.r === 'w');
  if (won || counted.length === 3) {
    t.kept.n++;
    if (won) t.kept.wins++;
  }
}

/** Predicted chance of a win within 3 tries. */
const keptOf = (p: Prediction) => 1 - (1 - p.first) * (1 - p.retry) ** 2;

export function calibrate(reports: PlaytestReport[], predictions: Map<string, Prediction>): string {
  const byDay = new Map<string, DayTally>();
  const all = empty();
  for (const report of reports) {
    for (const day of report.days) {
      const t = byDay.get(day.d) ?? empty();
      add(t, day.tries);
      add(all, day.tries);
      byDay.set(day.d, t);
    }
  }

  const predicted = [...byDay.keys()].map((d) => predictions.get(d)).filter((p) => p !== undefined);
  const avg = (f: (p: Prediction) => number) =>
    predicted.length ? predicted.reduce((s, p) => s + f(p), 0) / predicted.length : NaN;
  const botFirst = avg((p) => p.first);
  const botRetry = avg((p) => p.retry);
  const botKept = avg(keptOf);

  const rows = [...byDay.keys()].sort().map((d) => {
    const t = byDay.get(d)!;
    const p = predictions.get(d);
    return `| ${d} | ${t.players} | ${cell(t.first)} | ${p ? pct(p.first) : '–'} | ${cell(t.retry)} | ${p ? pct(p.retry) : '–'} | ${cell(t.kept)} | ${p ? pct(keptOf(p)) : '–'} |`;
  });

  const lines = [
    '# Playtest calibration',
    '',
    `${reports.length} report(s), ${all.players} played day(s).`,
    '',
    '| Day | Players | First try (real) | Bot first try | Tries 2–3 (real) | Bot retry | Kept in 3 (real) | Bot kept |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    `| **All** | ${all.players} | ${cell(all.first)} | ${pct(botFirst)} | ${cell(all.retry)} | ${pct(botRetry)} | ${cell(all.kept)} | ${pct(botKept)} |`,
    '',
  ];
  if (all.first.n) {
    const real = all.first.wins / all.first.n;
    const gap = real - botFirst;
    // Opponents the bot beats more often are easier for people too, so move the
    // band by however far real players sit from the 50% target.
    const move = 0.5 - real;
    lines.push(
      `Real first tries run ${gap >= 0 ? 'above' : 'below'} the bot by ${pct(Math.abs(gap))}.`,
      `To land real first tries near 50%, move the uninformed band by about ${move >= 0 ? '+' : '−'}${pct(Math.abs(move))} (packages/pipeline/src/config.ts), if the interval is tight enough to trust.`,
    );
  }
  return lines.join('\n');
}

/** Reads predictions from pipeline week reports (`reports/<week>.json`). */
export function predictionsFrom(
  weekReports: {
    week: string;
    days: { check: { metrics: { uninformed?: { rate: number }; informed?: { rate: number } } } }[];
  }[],
  addDays: (key: string, n: number) => string,
): Map<string, Prediction> {
  const out = new Map<string, Prediction>();
  for (const w of weekReports) {
    w.days.forEach((day, i) => {
      const m = day.check.metrics;
      if (m.uninformed && m.informed) {
        out.set(addDays(w.week, i), { first: m.uninformed.rate, retry: m.informed.rate });
      }
    });
  }
  return out;
}
