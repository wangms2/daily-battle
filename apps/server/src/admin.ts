// The admin page's API (DESIGN.md §18a): read-only views of the stats, behind
// the ADMIN_TOKEN secret. Off (404) when the secret or the database is missing.
//   GET /api/admin/stats?view=summary[&today=<the admin's local date>]
//   GET /api/admin/stats?view=games[&before=<started_at>]
//   GET /api/admin/stats?view=game&id=<game id>
//   GET /api/admin/stats?view=accounts[&q=<name search>][&before=<last_seen_at>]
import { same, sha256 } from './accounts';
import { playerSummary } from './players';
import type { Db } from './stats';

const DAY = 24 * 60 * 60 * 1000;
const PAGE = 50;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Whether the request carries the admin token. Hashed first so lengths don't leak. */
export async function isAdmin(request: Request, token: string): Promise<boolean> {
  const given = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!given) return false;
  return same(await sha256(given), await sha256(token));
}

export async function adminRequest(
  db: Db | undefined,
  token: string | undefined,
  request: Request,
  now = Date.now(),
): Promise<Response> {
  if (!db || !token) return new Response('Not found', { status: 404 });
  if (!(await isAdmin(request, token))) return json({ error: 'unauthorized' }, 401);
  const params = new URL(request.url).searchParams;
  const before = Number(params.get('before')) || Number.MAX_SAFE_INTEGER;
  switch (params.get('view')) {
    case 'summary':
      return json(await summary(db, now, params.get('today')));
    case 'games':
      return json(await games(db, before));
    case 'game': {
      const found = await game(db, params.get('id') ?? '');
      return found ? json(found) : json({ error: 'notFound' }, 404);
    }
    case 'accounts':
      return json(await accounts(db, params.get('q') ?? '', before));
    default:
      return json({ error: 'bad' }, 400);
  }
}

const rows = async <T>(db: Db, sql: string, ...values: unknown[]) =>
  (
    await db
      .prepare(sql)
      .bind(...values)
      .all<T>()
  ).results;

/** `?, ?, ?` for an IN list. */
const marks = (n: number) => Array(n).fill('?').join(', ');

export async function summary(db: Db, now: number, today?: string | null) {
  const week = now - 7 * DAY;
  const month = now - 30 * DAY;
  const weekDay = new Date(week).toISOString().slice(0, 10);
  const [gameTotals] = await rows<Record<string, number>>(
    db,
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(started_at >= ?), 0) AS week,
            COALESCE(SUM(started_at >= ?), 0) AS month,
            COALESCE(SUM(ended_at IS NOT NULL), 0) AS finished,
            AVG(players) AS avgPlayers
       FROM games`,
    week,
    month,
  );
  const counts = await rows<{ day: string; games: number }>(
    db,
    `SELECT date(started_at / 1000, 'unixepoch') AS day, COUNT(*) AS games
       FROM games WHERE started_at >= ? GROUP BY day`,
    month,
  );
  // Every day of the last 30 (UTC), oldest first, including those with none.
  const perDay = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(now - (29 - i) * DAY).toISOString().slice(0, 10);
    return { day, games: counts.find((c) => c.day === day)?.games ?? 0 };
  });
  const formats = await rows<{ format: string; games: number }>(
    db,
    `SELECT format, COUNT(*) AS games FROM games GROUP BY format ORDER BY games DESC`,
  );
  const [accountTotals] = await rows<Record<string, number>>(
    db,
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(last_seen_at >= ?), 0) AS activeWeek,
            COALESCE(SUM(created_at >= ?), 0) AS newWeek
       FROM accounts`,
    week,
    week,
  );
  const progress = await rows<Record<string, number | string>>(
    db,
    `SELECT format,
            COUNT(*) AS players,
            COALESCE(SUM(last_day >= ?), 0) AS activeWeek,
            COALESCE(SUM(days_played), 0) AS daysPlayed,
            AVG(streak) AS avgStreak,
            MAX(best_streak) AS bestStreak,
            COALESCE(SUM(difficulty = 'easy'), 0) AS easy,
            COALESCE(SUM(difficulty = 'normal'), 0) AS normal,
            COALESCE(SUM(difficulty = 'hard'), 0) AS hard,
            COALESCE(SUM(coach), 0) AS coach,
            COALESCE(SUM(lessons > 0), 0) AS learners
       FROM account_games GROUP BY format ORDER BY format`,
    weekDay,
  );
  // Without its tables (migration 0002 not applied yet) the rest still shows.
  const players = await playerSummary(db, now, today).catch((e: unknown) => {
    console.error('player summary failed', e);
    return undefined;
  });
  return { games: gameTotals, perDay, formats, accounts: accountTotals, progress, players };
}

interface PlayerRow {
  game_id: string;
  name: string;
  place: number | null;
}

export async function games(db: Db, before: number) {
  const list = await rows<Record<string, unknown> & { id: string }>(
    db,
    `SELECT * FROM games WHERE started_at < ? ORDER BY started_at DESC LIMIT ?`,
    before,
    PAGE,
  );
  const players = list.length
    ? await rows<PlayerRow>(
        db,
        `SELECT game_id, name, place FROM game_players
          WHERE game_id IN (${marks(list.length)}) ORDER BY place`,
        ...list.map((g) => g.id),
      )
    : [];
  return {
    games: list.map((g) => ({
      ...g,
      names: players.filter((p) => p.game_id === g.id).map((p) => p.name),
    })),
    more: list.length === PAGE,
  };
}

export async function game(db: Db, id: string) {
  const found = await db.prepare(`SELECT * FROM games WHERE id = ?`).bind(id).first();
  if (!found) return null;
  const players = await rows<Record<string, unknown> & { name: string }>(
    db,
    `SELECT * FROM game_players WHERE game_id = ? ORDER BY place IS NULL, place, wins DESC`,
    id,
  );
  const battles = await rows(
    db,
    `SELECT * FROM battles WHERE game_id = ? ORDER BY round, match`,
    id,
  );
  return { game: found, players, battles };
}

export async function accounts(db: Db, q: string, before: number) {
  const search = q.trim().toLowerCase();
  const list = await rows<Record<string, unknown> & { key: string }>(
    db,
    `SELECT * FROM accounts
      WHERE last_seen_at < ? AND (? = '' OR instr(key, ?) > 0)
      ORDER BY last_seen_at DESC LIMIT ?`,
    before,
    search,
    search,
    PAGE,
  );
  const progress = list.length
    ? await rows<Record<string, unknown> & { key: string }>(
        db,
        `SELECT * FROM account_games WHERE key IN (${marks(list.length)}) ORDER BY format`,
        ...list.map((a) => a.key),
      )
    : [];
  return {
    accounts: list.map((a) => ({
      ...a,
      games: progress.filter((p) => p.key === a.key),
    })),
    more: list.length === PAGE,
  };
}
