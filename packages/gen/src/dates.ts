// Day and week keys from the player's local calendar date (DESIGN.md §4.1).
// Arithmetic is done on UTC dates built from Y/M/D, so DST never shifts a key.

const pad = (n: number) => String(n).padStart(2, '0');
const format = (d: Date) =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function parse(key: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) throw new Error(`Bad date key: ${key}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** `YYYY-MM-DD` for the local calendar date of `date`. */
export function dayKey(date: Date): string {
  return format(new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())));
}

export function addDays(key: string, days: number): string {
  const d = parse(key);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** The Monday on or before a day key. */
export function mondayOf(key: string): string {
  const offset = (parse(key).getUTCDay() + 6) % 7; // Monday = 0
  return addDays(key, -offset);
}

/** The week key (its Monday) for the local calendar date of `date`. */
export function weekKey(date: Date): string {
  return mondayOf(dayKey(date));
}

/** The 7 day keys of a week, Monday first. */
export function weekDays(week: string): string[] {
  if (mondayOf(week) !== week) throw new Error(`Not a Monday: ${week}`);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(week, i));
}
