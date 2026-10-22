// Compares pasted playtest reports with the pipeline's predictions (M9b).
//   pnpm --filter @daily-battle/pipeline calibrate <report files…> [--out calibration.md]
// Report files are any text holding one or more copied reports (chat exports work).
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addDays } from '@daily-battle/gen';
import { parseReports } from '@daily-battle/gen/report';
import { calibrate, predictionsFrom } from '../src/calibrate';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : undefined;
if (!args.length) {
  console.error('Usage: calibrate <report files…> [--out file.md]');
  process.exit(1);
}

const reports = args.flatMap((f) => parseReports(readFileSync(f, 'utf8')));
const reportDir = fileURLToPath(new URL('../reports/', import.meta.url));
const weeks = readdirSync(reportDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(reportDir + f, 'utf8')));
const markdown = calibrate(reports, predictionsFrom(weeks, addDays));
if (out) writeFileSync(out, `${markdown}\n`);
console.log(markdown);
