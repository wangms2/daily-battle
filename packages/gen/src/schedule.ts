// The published schedule file format (DESIGN.md §6.4). Types only, so the web
// client can import it without pulling in the generators.
import type { Style } from './opponent';
import type { TeamSlot } from './sets';

export interface ScheduleFile {
  version: 1;
  generatorVersion: number;
  /** `meta.builtAt` of the set data the schedule was built from. */
  dataBuiltAt: string;
  /** Monday of the week, `YYYY-MM-DD`. */
  week: string;
  pool: { species: string[]; candidate: number };
  /** The builder's recommended team: none or one (older files had up to three). */
  suggestedTeams: { team: TeamSlot[] }[];
  /** Monday first. The client shows only species from these teams. */
  days: { day: string; style: Style; team: TeamSlot[]; candidate: number }[];
}

const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isTeam = (t: unknown) =>
  Array.isArray(t) &&
  t.length === 6 &&
  t.every((s) => s && typeof s.species === 'string' && typeof s.setId === 'string');

/** Checks the shape of a fetched schedule file; throws with a reason if it's wrong. */
export function parseSchedule(json: unknown): ScheduleFile {
  const f = json as ScheduleFile;
  const fail = (why: string) => {
    throw new Error(`Bad schedule file: ${why}`);
  };
  if (!f || f.version !== 1) fail('unsupported version');
  if (!isDay(f.week)) fail('bad week');
  if (!Array.isArray(f.pool?.species) || f.pool.species.length !== 12)
    fail('pool must have 12 species');
  if (!Array.isArray(f.suggestedTeams) || !f.suggestedTeams.every((s) => isTeam(s.team))) {
    fail('bad suggested teams');
  }
  if (!Array.isArray(f.days) || f.days.length !== 7) fail('must have 7 days');
  if (!f.days.every((d) => isDay(d.day) && isTeam(d.team))) fail('bad day');
  return f;
}
