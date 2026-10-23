// Validates and writes schedule files (DESIGN.md §6.4, §9).
//   pnpm --filter @daily-battle/pipeline schedule --from 2026-10-19 [--weeks 8] [--workers N] [--force] [--format gen4ou]
//   pnpm --filter @daily-battle/pipeline schedule --from 2026-10-19 --weeks 1 --from-day 2026-10-24
// Existing week files are skipped unless --force: published weeks must not change.
// --from-day rebuilds only an existing week's days from that day on, keeping
// its pool, suggestions, and earlier days (for a week already being played).
// Gen 4 OU writes to schedule/ and reports/; other formats to a subfolder named
// for the format (schedule/gen5ou/).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import { addDays, mondayOf } from '@daily-battle/gen';
import { buildWeek, rebuildDays, reportMarkdown, Simulator } from '../src/index';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const from = mondayOf(arg('from') ?? new Date().toISOString().slice(0, 10));
const weeks = Number(arg('weeks') ?? 8);
const force = process.argv.includes('--force');
const fromDay = arg('from-day');
const workers = arg('workers') === undefined ? undefined : Number(arg('workers'));
const format = arg('format') ?? DEFAULT_FORMAT;
const data = setsFor(format);
const sub = format === DEFAULT_FORMAT ? '' : `/${format}`;

const root = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
const scheduleDir = root(`apps/web/public/schedule${sub}`);
const reportDir = root(`packages/pipeline/reports${sub}`);
mkdirSync(scheduleDir, { recursive: true });
mkdirSync(reportDir, { recursive: true });

const sim = new Simulator(workers);
console.log(`Using ${sim.workers} worker(s) for ${format}.`);
try {
  for (let w = 0; w < weeks; w++) {
    const week = addDays(from, 7 * w);
    const file = `${scheduleDir}/${week}.json`;
    if (fromDay && existsSync(file)) {
      console.log(`${week}: rebuilding days from ${fromDay}`);
      const reportFile = `${reportDir}/${week}.json`;
      const { schedule, report } = await rebuildDays(
        JSON.parse(readFileSync(file, 'utf8')),
        JSON.parse(readFileSync(reportFile, 'utf8')),
        fromDay,
        sim,
        data,
        console.log,
      );
      writeFileSync(
        file,
        `${JSON.stringify(schedule, null, 2)}
`,
      );
      writeFileSync(
        reportFile,
        `${JSON.stringify(report, null, 2)}
`,
      );
      writeFileSync(`${reportDir}/${week}.md`, reportMarkdown(report));
      continue;
    }
    if (existsSync(file) && !force) {
      console.log(`${week}: exists, skipping (use --force to rebuild)`);
      continue;
    }
    console.log(`${week}:`);
    const { schedule, report } = await buildWeek(week, sim, data, console.log);
    writeFileSync(file, `${JSON.stringify(schedule, null, 2)}\n`);
    writeFileSync(`${reportDir}/${week}.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(`${reportDir}/${week}.md`, reportMarkdown(report));
    console.log(`  done in ${report.seconds}s`);
  }
} finally {
  await sim.close();
}
