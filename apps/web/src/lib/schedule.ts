// Loads the published schedule for a week (DESIGN.md §6.4). If a file is
// missing, falls back to generating the same content at runtime.
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import { parseSchedule, type ScheduleFile } from '@daily-battle/gen/schedule';
import { useEffect, useState } from 'react';

export type ScheduleState =
  | { status: 'loading' }
  | { status: 'ready'; schedule: ScheduleFile; generated: boolean }
  | { status: 'error'; message: string };

/** Where a format's weeks are published: Gen 4 OU at the top, others in a folder. */
export const schedulePath = (format: string, week: string) =>
  `schedule/${format === DEFAULT_FORMAT ? '' : `${format}/`}${week}.json`;

export async function loadSchedule(
  week: string,
  format: string = DEFAULT_FORMAT,
): Promise<{ schedule: ScheduleFile; generated: boolean }> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${schedulePath(format, week)}`);
    if (res.ok) return { schedule: parseSchedule(await res.json()), generated: false };
  } catch {
    // fall through to generation
  }
  console.warn(`No published ${format} schedule for ${week}; generating it in the browser.`);
  // Lazy: the generators pull in the simulator, so only load them when needed.
  const gen = await import('@daily-battle/gen');
  const { pool, opponents } = gen.generateWeek(week, setsFor(format));
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

type Loaded = { schedule: ScheduleFile; generated: boolean };
// Weeks loaded (or loading) this session, so going back to a game is instant.
const loading = new Map<string, Promise<Loaded>>();
const loaded = new Map<string, ScheduleState>();

/** Starts loading a game's week (once). */
function loadOnce(week: string, format: string): Promise<Loaded> {
  const key = `${format}:${week}`;
  let p = loading.get(key);
  if (!p) {
    p = loadSchedule(week, format);
    loading.set(key, p);
    p.then(
      (r) => loaded.set(key, { status: 'ready', ...r }),
      // A failure isn't kept: a retry loads it again.
      () => loading.delete(key),
    );
  }
  return p;
}

/**
 * Fetches a game's published week ahead (e.g. on the game picker), so picking it
 * opens at once. Never generates a missing week: that waits until it's opened.
 */
export async function preloadSchedule(week: string, format: string): Promise<void> {
  const key = `${format}:${week}`;
  if (loading.has(key)) return;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}${schedulePath(format, week)}`);
    if (!res.ok || loading.has(key)) return;
    const r: Loaded = { schedule: parseSchedule(await res.json()), generated: false };
    loading.set(key, Promise.resolve(r));
    loaded.set(key, { status: 'ready', ...r });
  } catch {
    // Opening the game loads it properly.
  }
}

/** For tests: forget loaded weeks (each test stubs its own fetch). */
export function clearScheduleCache() {
  loading.clear();
  loaded.clear();
}

export function useSchedule(week: string, format: string, attempt = 0): ScheduleState {
  // Results are tagged with what they were loaded for, so a change of week
  // reads as loading until the new result arrives.
  const key = `${format}:${week}#${attempt}`;
  const cached = loaded.get(`${format}:${week}`);
  const [result, setResult] = useState<{ key: string; state: ScheduleState } | null>(null);
  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    loadOnce(week, format).then(
      (r) => !cancelled && setResult({ key, state: { status: 'ready', ...r } }),
      (e: unknown) =>
        !cancelled && setResult({ key, state: { status: 'error', message: String(e) } }),
    );
    return () => {
      cancelled = true;
    };
  }, [key, week, format, cached]);
  if (cached) return cached;
  return result?.key === key ? result.state : { status: 'loading' };
}
