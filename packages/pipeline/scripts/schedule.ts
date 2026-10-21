// Validates and writes schedule files (DESIGN.md §6.4, §9).
//   pnpm --filter @daily-battle/pipeline schedule --from 2026-10-19 [--weeks 8] [--workers N] [--force]
// Existing week files are skipped unless --force: published weeks must not change.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addDays, mondayOf } from '@daily-battle/gen';
import { buildWeek, reportMarkdown, Simulator } from '../src/index';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const from = mondayOf(arg('from') ?? new Date().toISOString().slice(0, 10));
const weeks = Number(arg('weeks') ?? 8);
const force = process.argv.includes('--force');
const workers = arg('workers') === undefined ? undefined : Number(arg('workers'));

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const scheduleDir = root('apps/web/public/schedule');
const reportDir = root('packages/pipeline/reports');
mkdirSync(scheduleDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const sim = new Simulator(workers);
console.log(`Using ${sim.workers} worker(s).`);
try {
  for (let w = 0; w < weeks; w++) {
    const week = addDays(from, 7 * w);
    const file = `${scheduleDir}/${week}.json`;
    if (existsSync(file) && !force) {
      console.log(`${week}: exists, skipping (use --force to rebuild)`);
      continue;
    }
    console.log(`${week}:`);
    const { schedule, report } = await buildWeek(week, sim, undefined, console.log);
    writeFileSync(file, `${JSON.stringify(schedule, null, 2)}\n`);
    writeFileSync(`${reportDir}/${week}.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(`${reportDir}/${week}.md`, reportMarkdown(report));
    console.log(`  done in ${report.seconds}s`);
  }
} finally {
  await sim.close();
}
