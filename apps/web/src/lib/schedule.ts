// Loads the published schedule for a week (DESIGN.md §6.4). If a file is
// missing, falls back to generating the same content at runtime.
import { parseSchedule, type ScheduleFile } from '@daily-battle/gen/schedule';
import { useEffect, useState } from 'react';

export type ScheduleState =
  | { status: 'loading' }
  | { status: 'ready'; schedule: ScheduleFile; generated: boolean }
  | { status: 'error'; message: string };

export async function loadSchedule(
  week: string,
): Promise<{ schedule: ScheduleFile; generated: boolean }> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}schedule/${week}.json`);
    if (res.ok) return { schedule: parseSchedule(await res.json()), generated: false };
  } catch {
    // fall through to generation
  }
  console.warn(`No published schedule for ${week}; generating it in the browser.`);
  // Lazy: the generators pull in the simulator, so only load them when needed.
  const gen = await import('@daily-battle/gen');
  const { pool, opponents } = gen.generateWeek(week);
  const schedule: ScheduleFile = {
    version: 1,
    generatorVersion: gen.GENERATOR_VERSION,
    dataBuiltAt: '',
    week,
    pool: { species: pool.species, candidate: 0 },
    suggestedTeams: [],
    days: opponents.map((o) => ({ day: o.day, style: o.style, team: o.team, candidate: 0 })),
  };
  return { schedule, generated: true };
}

export function useSchedule(week: string, attempt = 0): ScheduleState {
  // Results are tagged with what they were loaded for, so a change of week
  // reads as loading until the new result arrives.
  const key = `${week}#${attempt}`;
  const [result, setResult] = useState<{ key: string; state: ScheduleState } | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSchedule(week).then(
      (r) => !cancelled && setResult({ key, state: { status: 'ready', ...r } }),
      (e: unknown) =>
        !cancelled && setResult({ key, state: { status: 'error', message: String(e) } }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, week]);
  return result?.key === key ? result.state : { status: 'loading' };
}
