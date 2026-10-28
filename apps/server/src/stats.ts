// Stats for the admin page (DESIGN.md §18a), kept in D1: versus games, their
// players and battles, and accounts with their progress. Every write is
// best-effort: callers run it under waitUntil and a failure never touches the
// game (`record` swallows and logs it).
import { AI_ID, AI_NAME, type Match, type RoomState } from '@daily-battle/versus';
import { nameKey } from './accounts';
import { progressRows, type ProgressRow } from './progress';

/** The part of D1 used here, so tests can stand in an in-memory SQLite. */
export interface Db {
  prepare(sql: string): Stmt;
  batch(statements: Stmt[]): Promise<unknown>;
}
export interface Stmt {
  bind(...values: unknown[]): Stmt;
  run(): Promise<unknown>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
}

/** Runs a write without letting it fail anything else. */
export async function record(db: Db | undefined, write: (db: Db) => Promise<unknown>) {
  if (!db) return;
  try {
    await write(db);
  } catch (e) {
    console.error('stats write failed', e);
  }
}

/** A new game id: the room and when the game started (rooms play many games). */
export const gameId = (code: string, startedAt: number) => `${code}-${startedAt}`;

export function gameStarted(db: Db, room: RoomState) {
  const game = room.game!;
  const s = room.settings;
  return db
    .prepare(
      `INSERT OR IGNORE INTO games
        (id, room, format, pool_mode, lives, timer, rival, players, started_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      game.id,
      room.code,
      s.format,
      s.pool,
      s.lives,
      s.timer,
      s.rivalDifficulty ?? 'normal',
      room.players.length,
      game.startedAt,
    )
    .run();
}

/** The AI's name in the stats, so it can't be mistaken for a player called "Rival". */
const nameOf = (match: Match, side: 'p1' | 'p2') =>
  match.players[side] === AI_ID ? `${AI_NAME} (AI)` : match.names[side];

export function battleEnded(db: Db, room: RoomState, match: Match, turns: number, now: number) {
  const winner = match.result?.winner;
  return db
    .prepare(
      `INSERT OR REPLACE INTO battles
        (game_id, round, match, p1, p2, winner, reason, turns, duration_ms, ended_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      room.game!.id,
      room.round,
      match.id,
      nameOf(match, 'p1'),
      nameOf(match, 'p2'),
      winner ? nameOf(match, winner) : null,
      match.result?.reason ?? 'tie',
      turns,
      match.battleAt === undefined ? null : now - match.battleAt,
      now,
    )
    .run();
}

/** Closes the game and writes how each player did. */
export function gameEnded(db: Db, room: RoomState, now: number) {
  const game = room.game!;
  const winners = room.players
    .filter((p) => p.place === 1)
    .map((p) => p.name)
    .join(', ');
  return db.batch([
    db
      .prepare(`UPDATE games SET rounds = ?, ended_at = ?, winners = ? WHERE id = ?`)
      .bind(room.round, now, winners || null, game.id),
    ...room.players.map((p) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO game_players
            (game_id, name, team_size, place, wins, losses, build_ms, auto_team, left_early)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          game.id,
          p.name,
          p.teamSize,
          p.place,
          p.wins,
          p.losses,
          p.builtAt === undefined ? null : p.builtAt - game.startedAt,
          p.builtAt === undefined ? 1 : 0,
          p.left ? 1 : 0,
        ),
    ),
  ]);
}

export type SeenKind = 'created' | 'signin' | 'sync';

/**
 * An account was registered, signed into, or synced. With its save, its
 * progress per game is updated too.
 */
export function accountSeen(
  db: Db,
  name: string,
  kind: SeenKind,
  now: number,
  save: string | null,
) {
  const key = nameKey(name);
  const rows: ProgressRow[] = save ? progressRows(save, now) : [];
  return db.batch([
    db
      .prepare(
        `INSERT INTO accounts (key, name, created_at, last_seen_at, sign_ins)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (key) DO UPDATE SET
           name = ?2,
           created_at = COALESCE(created_at, ?3),
           last_seen_at = ?4,
           sign_ins = sign_ins + ?5`,
      )
      .bind(
        key,
        name,
        kind === 'created' ? now : null,
        now,
        kind === 'signin' || kind === 'created' ? 1 : 0,
      ),
    ...rows.map((r) =>
      db
        .prepare(
          `INSERT OR REPLACE INTO account_games
            (key, format, days_played, last_day, wins, losses, clears, first_try_wins,
             streak, best_streak, difficulty, coach, lessons, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          key,
          r.format,
          r.daysPlayed,
          r.lastDay,
          r.wins,
          r.losses,
          r.clears,
          r.firstTryWins,
          r.streak,
          r.bestStreak,
          r.difficulty,
          r.coach ? 1 : 0,
          r.lessons,
          now,
        ),
    ),
  ]);
}

/** Forgets a deleted account. */
export function accountDeleted(db: Db, name: string) {
  const key = nameKey(name);
  return db.batch([
    db.prepare(`DELETE FROM account_games WHERE key = ?`).bind(key),
    db.prepare(`DELETE FROM accounts WHERE key = ?`).bind(key),
  ]);
}
