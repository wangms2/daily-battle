// Players counted anonymously (DESIGN.md §18a): each device sends a random id
// with the day and what it played, at most once per activity a day. A signed-in
// device names its account, so one person on two devices counts once. Nothing
// else is kept: no names, no addresses.
import { addDays } from '@daily-battle/gen/dates';
import { nameKey } from './accounts';
import type { Db } from './stats';

export interface Ping {
  id: string;
  /** The player's local date. */
  day: string;
  activity: string;
  /** The earliest day in the device's save, so an old player isn't counted as new. */
  since?: string;
  /** The account the device is signed into. */
  account?: string;
}

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVITY = /^(daily|lessons|trainer)-gen\d{1,2}ou$|^versus$/;
/** No save predates the game. */
const FIRST_DAY = '2025-01-01';

/** The UTC date of `now`; players' local dates are within a day of it. */
export const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);

/** A well-formed ping for about today, or null. */
export function parsePing(body: unknown, now: number): Ping | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const { id, day, activity, since, account } = b;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (typeof activity !== 'string' || !ACTIVITY.test(activity)) return null;
  const today = utcDay(now);
  if (typeof day !== 'string' || !DAY.test(day)) return null;
  if (day < addDays(today, -1) || day > addDays(today, 1)) return null;
  const ping: Ping = { id, day, activity };
  if (typeof since === 'string' && DAY.test(since) && since >= FIRST_DAY && since < day) {
    ping.since = since;
  }
  if (typeof account === 'string' && account.length <= 40 && nameKey(account)) {
    ping.account = account;
  }
  return ping;
}

/** Records a ping: the player (first and last day, account) and the day's activity. */
export function playerSeen(db: Db, p: Ping, now: number) {
  const first = p.since ?? p.day;
  return db.batch([
    db
      .prepare(
        `INSERT INTO players (id, first_day, last_day, account_key, created_at)
         VALUES (?1, ?2, ?3, (SELECT key FROM accounts WHERE key = ?4), ?5)
         ON CONFLICT (id) DO UPDATE SET
           first_day = min(first_day, ?2),
           last_day = max(last_day, ?3),
           account_key = COALESCE((SELECT key FROM accounts WHERE key = ?4), account_key)`,
      )
      .bind(p.id, first, p.day, p.account ? nameKey(p.account) : null, now),
    db
      .prepare(`INSERT OR IGNORE INTO player_days (id, day, activity) VALUES (?, ?, ?)`)
      .bind(p.id, p.day, p.activity),
  ]);
}

/**
 * The admin page's player counts. A person is an account, or a device without
 * one. Players send their local dates, so the days count back from the admin's
 * own local date when given (within a day of UTC's), else UTC's.
 */
export async function playerSummary(db: Db, now: number, local?: string | null) {
  const utc = utcDay(now);
  const near = !!local && DAY.test(local) && local >= addDays(utc, -1) && local <= addDays(utc, 1);
  const today = near ? local : utc;
  const since = (days: number) => addDays(today, -(days - 1));
  const firsts = new Map(
    (
      await db
        .prepare(
          `SELECT COALESCE(account_key, id) AS person, MIN(first_day) AS first
             FROM players GROUP BY person`,
        )
        .all<{ person: string; first: string }>()
    ).results.map((r) => [r.person, r.first]),
  );
  const plays = (
    await db
      .prepare(
        `SELECT COALESCE(p.account_key, p.id) AS person, d.day AS day, d.activity AS activity
           FROM player_days d JOIN players p ON p.id = d.id
          WHERE d.day >= ?`,
      )
      .bind(addDays(today, -31))
      .all<{ person: string; day: string; activity: string }>()
  ).results;

  const active = (from: string) => new Set(plays.filter((r) => r.day >= from).map((r) => r.person));
  const week = active(since(7));
  const days = new Map<string, Set<string>>();
  for (const r of plays) {
    if (!days.has(r.person)) days.set(r.person, new Set());
    days.get(r.person)!.add(r.day);
  }
  // New players with a whole next day behind them: did they come back for it?
  const cohort = [...firsts].filter(([, f]) => f >= addDays(today, -8) && f <= addDays(today, -2));
  const perActivity = new Map<string, Set<string>>();
  for (const r of plays.filter((p) => p.day >= since(30))) {
    if (!perActivity.has(r.activity)) perActivity.set(r.activity, new Set());
    perActivity.get(r.activity)!.add(r.person);
  }
  return {
    total: firsts.size,
    today: active(today).size,
    week: week.size,
    month: active(since(30)).size,
    newWeek: [...firsts.values()].filter((f) => f >= since(7)).length,
    returningWeek: [...week].filter((p) => (firsts.get(p) ?? today) < since(7)).length,
    nextDay: {
      cohort: cohort.length,
      back: cohort.filter(([p, f]) => days.get(p)?.has(addDays(f, 1))).length,
    },
    perDay: Array.from({ length: 30 }, (_, i) => {
      const day = addDays(today, i - 29);
      return {
        day,
        players: new Set(plays.filter((r) => r.day === day).map((r) => r.person)).size,
      };
    }),
    activities: [...perActivity]
      .map(([activity, people]) => ({ activity, players: people.size }))
      .sort((a, b) => b.players - a.players || a.activity.localeCompare(b.activity)),
  };
}
