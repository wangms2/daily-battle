// Published schedule files, read for the v7 opponent scripts.
import { parseSchedule, type ScheduleFile } from '@daily-battle/gen';
import type { OpponentHistory } from '@daily-battle/gen/builder';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Where a format's schedule files live (Gen 4 OU at the root). */
export function scheduleDir(format: string): string {
  const root = fileURLToPath(new URL('../../../apps/web/public/schedule/', import.meta.url));
  return format === 'gen4ou' ? root : `${root}${format}/`;
}

/** Every published day's opponent for a format, from its schedule files. */
export function publishedDays(format: string): OpponentHistory {
  const dir = scheduleDir(format);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .flatMap((f) => {
      const s: ScheduleFile = parseSchedule(JSON.parse(readFileSync(`${dir}${f}`, 'utf8')));
      return s.days.map((d) => ({ day: d.day, species: d.team.map((t) => t.species) }));
    });
}
