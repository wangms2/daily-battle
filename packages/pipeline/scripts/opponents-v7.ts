// Builds v7 daily opponents for a date range without validating them, and
// compares variety with the published (v6) days: for tuning the builder.
//   pnpm --filter @daily-battle/pipeline exec tsx scripts/opponents-v7.ts --format gen4ou --from 2026-11-09 --days 28 [--json out.json]
import { setsFor } from '@daily-battle/data';
import { teammatesFor } from '@daily-battle/data/teammates';
import { addDays } from '@daily-battle/gen';
import {
  opponentBuilder,
  type BuiltOpponent,
  type OpponentHistory,
} from '@daily-battle/gen/builder';
import { writeFileSync } from 'node:fs';
import { publishedDays } from './published';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const format = arg('format') ?? 'gen4ou';
const from = arg('from') ?? '2026-11-09';
const count = Number(arg('days') ?? 28);
const data = setsFor(format);

const published = publishedDays(format);
const build = opponentBuilder(data, teammatesFor(format));
const history: OpponentHistory = published.filter((d) => d.day < from);
const built: BuiltOpponent[] = [];
for (let i = 0; i < count; i++) {
  const day = addDays(from, i);
  const o = build(day, history);
  built.push(o);
  history.push({ day, species: o.team.map((t) => t.species) });
  if (i < 14) {
    const p = Object.entries(o.parts)
      .map(([k, v]) => `${k} ${v.toFixed(2)}`)
      .join(', ');
    console.log(
      `${day} ${o.style.padEnd(7)} ${o.score.toFixed(2)}  ${o.team.map((t) => t.setId).join('  ')}\n            ${p}`,
    );
  }
}

const usage = (s: string) => data.species[s]!.usage;
function variety(label: string, days: OpponentHistory) {
  const n = new Map<string, number>();
  for (const d of days) for (const s of d.species) n.set(s, (n.get(s) ?? 0) + 1);
  const top = [...n].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const slots = days.length * 6;
  const meanUsage = days.flatMap((d) => d.species).reduce((a, s) => a + usage(s), 0) / slots;
  let repeatsNextDay = 0;
  for (let i = 1; i < days.length; i++) {
    repeatsNextDay += days[i]!.species.filter((s) => days[i - 1]!.species.includes(s)).length;
  }
  console.log(
    `${label}: ${days.length} days, ${n.size} species, mean usage ${(100 * meanUsage).toFixed(1)}%, ` +
      `next-day repeats ${(repeatsNextDay / Math.max(1, days.length - 1)).toFixed(2)}/day\n` +
      `  most used: ${top.map(([s, k]) => `${s} ${k}`).join(', ')}`,
  );
}
const to = addDays(from, count - 1);
variety(
  'v6 published',
  published.filter((d) => d.day >= from && d.day <= to),
);
variety(
  'v7 built',
  built.map((o) => ({ day: o.day, species: o.team.map((t) => t.species) })),
);
const out = arg('json');
if (out) writeFileSync(out, JSON.stringify({ format, built }, null, 1));
