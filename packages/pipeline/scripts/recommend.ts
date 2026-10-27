// Re-picks the recommended team (DESIGN.md §9.2) for existing schedule files,
// changing nothing else: pools and days of published weeks must not change.
//   pnpm --filter @daily-battle/pipeline recommend [--format gen4ou] [--from 2026-10-19] [--weeks 8] [--workers N]
// Without --from, every existing week of the format.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import { addDays, mondayOf, type ScheduleFile } from '@daily-battle/gen';
import { recommendedTeams, reportMarkdown, Simulator, type WeekReport } from '../src/index';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const workers = arg('workers') === undefined ? undefined : Number(arg('workers'));
const format = arg('format') ?? DEFAULT_FORMAT;
const data = setsFor(format);
const sub = format === DEFAULT_FORMAT ? '' : `/${format}`;

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const scheduleDir = root(`apps/web/public/schedule${sub}`);
const reportDir = root(`packages/pipeline/reports${sub}`);

const existing = readdirSync(scheduleDir)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .map((f) => f.slice(0, 10))
  .sort();
const from = arg('from');
const weeks = from
  ? Array.from({ length: Number(arg('weeks') ?? 8) }, (_, w) => addDays(mondayOf(from), 7 * w))
  : existing;

const sim = new Simulator(workers);
console.log(`Using ${sim.workers} worker(s) for ${format}.`);
try {
  for (const week of weeks) {
    const file = `${scheduleDir}/${week}.json`;
    if (!existsSync(file)) {
      console.log(`${week}: no schedule, skipping`);
      continue;
    }
    const t0 = performance.now();
    const schedule: ScheduleFile = JSON.parse(readFileSync(file, 'utf8'));
    const suggested = await recommendedTeams(week, schedule.pool.species, sim, data);
    schedule.suggestedTeams = suggested.map(({ team }) => ({ team }));
    writeFileSync(file, `${JSON.stringify(schedule, null, 2)}\n`);

    const reportFile = `${reportDir}/${week}.json`;
    if (existsSync(reportFile)) {
      const report: WeekReport = JSON.parse(readFileSync(reportFile, 'utf8'));
      report.pool.suggested = suggested;
      writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(`${reportDir}/${week}.md`, reportMarkdown(report));
    }
    const rec = suggested[0];
    const secs = ((performance.now() - t0) / 1000).toFixed(0);
    console.log(
      rec
        ? `${week}: ${(100 * rec.winRate).toFixed(0)}% (${rec.rules}) ${rec.team.map((s) => s.setId).join(', ')} [${secs}s]`
        : `${week}: none [${secs}s]`,
    );
  }
} finally {
  await sim.close();
}
