/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { AI_ID, type Match, type Player, type RoomState } from '@daily-battle/versus';
import { describe, expect, it } from 'vitest';
import { accounts, adminRequest, game, games, summary } from './admin';
import { progressRows } from './progress';
import {
  accountDeleted,
  accountSeen,
  battleEnded,
  forgetPlayer,
  gameEnded,
  gameStarted,
  record,
  type Db,
  type Stmt,
} from './stats';

/** D1's interface over an in-memory SQLite with the real migrations. */
function memoryDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  const here = dirname(fileURLToPath(import.meta.url));
  sqlite.exec(readFileSync(join(here, '../migrations/0001_stats.sql'), 'utf8'));
  const stmt = (sql: string, values: unknown[] = []): Stmt => {
    const s = () => sqlite.prepare(sql);
    const v = values as never[];
    return {
      bind: (...more) => stmt(sql, more),
      run: async () => s().run(...v),
      all: async <T>() => ({ results: s().all(...v) as T[] }),
      first: async <T>() => (s().get(...v) as T | undefined) ?? null,
    };
  };
  return {
    prepare: (sql) => stmt(sql),
    batch: async (statements) => {
      for (const st of statements) await st.run();
    },
  };
}

const T0 = Date.UTC(2025, 5, 2, 12);
const DAY = 24 * 60 * 60 * 1000;

const player = (id: string, name: string, update: Partial<Player> = {}): Player => ({
  id,
  name,
  token: 't',
  teamSize: 6,
  lives: 2,
  team: null,
  place: null,
  outRound: null,
  left: false,
  wins: 0,
  losses: 0,
  lastOpponent: null,
  aiRounds: 0,
  ...update,
});

const room = (update: Partial<RoomState> = {}): RoomState =>
  ({
    code: 'ABCDE',
    phase: 'build',
    round: 1,
    settings: { format: 'gen4ou', lives: 2, timer: 'standard', pool: 'random' },
    players: [player('a', 'Ash'), player('b', 'Misty'), player('c', 'Brock')],
    game: { id: `ABCDE-${T0}`, startedAt: T0 },
    ...update,
  }) as RoomState;

const match = (update: Partial<Match>): Match =>
  ({
    id: '1-0',
    players: { p1: 'a', p2: 'b' },
    names: { p1: 'Ash', p2: 'Misty' },
    result: { winner: 'p1', reason: 'win' },
    ...update,
  }) as Match;

const all = (db: Db, sql: string) =>
  db
    .prepare(sql)
    .all()
    .then((r) => r.results);

const admin = (db: Db | undefined, auth: string | null, query: string, token = 'secret') =>
  adminRequest(
    db,
    token,
    new Request(`https://x/api/admin/stats?${query}`, {
      headers: auth ? { Authorization: `Bearer ${auth}` } : {},
    }),
    T0 + DAY,
  );

/** A save with Gen 4 days: first-try wins on the 1st and 2nd, after a loss on the 3rd… */
const save = (days: Record<string, string[]>, settings: object = {}) =>
  JSON.stringify({
    version: 4,
    games: {
      gen4ou: {
        weeks: {},
        days: Object.fromEntries(
          Object.entries(days).map(([key, results]) => [
            key,
            {
              swapUsed: false,
              attempts: results.map((result, i) => ({ result, ts: i })),
            },
          ]),
        ),
      },
      gen5ou: { weeks: {}, days: {} },
    },
    settings: { shownExplainers: [], ...settings },
  });

describe('versus stats', () => {
  it('records a game, its battles, and how each player did', async () => {
    const db = memoryDb();
    await gameStarted(db, room());
    await battleEnded(
      db,
      room({ phase: 'playing' }),
      { ...match({}), battleAt: T0 + 60_000 },
      12,
      T0 + 300_000,
    );
    await battleEnded(
      db,
      room({ phase: 'playing' }),
      match({
        id: '1-1',
        players: { p1: 'c', p2: AI_ID },
        names: { p1: 'Brock', p2: 'Rival' },
        result: { winner: 'p2', reason: 'forfeit' },
      }),
      0,
      T0 + 100_000,
    );
    await gameEnded(
      db,
      room({
        phase: 'over',
        round: 3,
        players: [
          player('a', 'Ash', { place: 1, wins: 3, builtAt: T0 + 45_000 }),
          player('b', 'Misty', { place: 2, wins: 1, losses: 2, builtAt: T0 + 90_000 }),
          player('c', 'Brock', { place: 3, losses: 2, left: true }),
        ],
      }),
      T0 + 900_000,
    );

    expect(await all(db, 'SELECT rounds, ended_at, winners, players FROM games')).toEqual([
      { rounds: 3, ended_at: T0 + 900_000, winners: 'Ash', players: 3 },
    ]);
    expect(
      await all(db, 'SELECT name, place, build_ms, auto_team, left_early FROM game_players'),
    ).toEqual([
      { name: 'Ash', place: 1, build_ms: 45_000, auto_team: 0, left_early: 0 },
      { name: 'Misty', place: 2, build_ms: 90_000, auto_team: 0, left_early: 0 },
      { name: 'Brock', place: 3, build_ms: null, auto_team: 1, left_early: 1 },
    ]);
    expect(
      await all(
        db,
        'SELECT p1, p2, winner, reason, turns, duration_ms FROM battles ORDER BY match',
      ),
    ).toEqual([
      { p1: 'Ash', p2: 'Misty', winner: 'Ash', reason: 'win', turns: 12, duration_ms: 240_000 },
      {
        p1: 'Brock',
        p2: 'Rival (AI)',
        winner: 'Rival (AI)',
        reason: 'forfeit',
        turns: 0,
        duration_ms: null,
      },
    ]);
  });

  it('never lets a failed write through', async () => {
    const db = memoryDb();
    await expect(record(db, (d) => d.prepare('INSERT INTO nope VALUES (1)').run())).resolves.toBe(
      undefined,
    );
    await expect(record(undefined, () => Promise.reject(new Error()))).resolves.toBe(undefined);
  });
});

describe('account stats', () => {
  it('counts sign-ins and keeps when the account was made', async () => {
    const db = memoryDb();
    await accountSeen(db, 'Red', 'created', T0, null);
    await accountSeen(db, 'red', 'signin', T0 + DAY, null);
    await accountSeen(db, 'Red', 'sync', T0 + 2 * DAY, null);
    // Made before stats were kept: no creation date.
    await accountSeen(db, 'Blue', 'sync', T0, null);
    expect(await all(db, 'SELECT * FROM accounts ORDER BY key')).toEqual([
      { key: 'blue', name: 'Blue', created_at: null, last_seen_at: T0, sign_ins: 0 },
      { key: 'red', name: 'Red', created_at: T0, last_seen_at: T0 + 2 * DAY, sign_ins: 2 },
    ]);
  });

  it('keeps each game’s progress from the save, and forgets a deleted account', async () => {
    const db = memoryDb();
    const s = save(
      {
        '2025-05-30': ['win'],
        '2025-05-31': ['loss', 'win'],
        '2025-06-01': ['win'],
        '2025-06-02': ['win', 'win'],
      },
      {
        difficulty: { gen4ou: 'hard' },
        coach: { gen4ou: true },
        tutorial: { gen5ou: { completed: ['a', 'b'] } },
      },
    );
    await accountSeen(db, 'Red', 'created', T0, s);
    // Normal is unplayed: the streak and best are in Hard, which these tries
    // (saved without a difficulty) aren't. So it's the days and wins that show.
    const rows = await all(
      db,
      'SELECT format, days_played, last_day, wins, losses, clears, difficulty, coach, lessons FROM account_games ORDER BY format',
    );
    expect(rows).toEqual([
      {
        format: 'gen4ou',
        days_played: 4,
        last_day: '2025-06-02',
        wins: 5,
        losses: 1,
        clears: 0,
        difficulty: 'hard',
        coach: 1,
        lessons: 0,
      },
      {
        format: 'gen5ou',
        days_played: 0,
        last_day: null,
        wins: 0,
        losses: 0,
        clears: 0,
        difficulty: 'normal',
        coach: 0,
        lessons: 2,
      },
    ]);
    await accountDeleted(db, 'RED');
    expect(await all(db, 'SELECT * FROM accounts')).toEqual([]);
    expect(await all(db, 'SELECT * FROM account_games')).toEqual([]);
  });

  it('reads streaks the way the app does', () => {
    const s = save({
      '2025-05-30': ['win'],
      '2025-05-31': ['loss', 'win'],
      '2025-06-01': ['win'],
      '2025-06-02': ['win'],
    });
    expect(progressRows(s, T0)).toMatchObject([
      { format: 'gen4ou', streak: 2, bestStreak: 2, clears: 4, firstTryWins: 3 },
    ]);
    // Played "tomorrow" by UTC (ahead of it): still today's streak.
    expect(progressRows(s, T0 - DAY)[0]).toMatchObject({ streak: 2 });
    expect(progressRows('not json', T0)).toEqual([]);
  });
});

describe('admin API', () => {
  it('needs the token, and is off without one', async () => {
    const db = memoryDb();
    expect((await admin(db, null, 'view=summary')).status).toBe(401);
    expect((await admin(db, 'wrong', 'view=summary')).status).toBe(401);
    expect((await admin(db, 'secret', 'view=summary')).status).toBe(200);
    expect((await admin(db, 'secret', 'view=summary', '')).status).toBe(404);
    expect((await admin(undefined, 'secret', 'view=summary')).status).toBe(404);
    expect((await admin(db, 'secret', 'view=nope')).status).toBe(400);
  });

  it('summarises games and accounts, and shows one game', async () => {
    const db = memoryDb();
    await gameStarted(db, room());
    await gameEnded(
      db,
      room({
        phase: 'over',
        players: [player('a', 'Ash', { place: 1 }), player('b', 'Misty', { place: 2 })],
      }),
      T0 + 1000,
    );
    await gameStarted(
      db,
      room({ code: 'FGHIJ', game: { id: 'FGHIJ-1', startedAt: T0 - 40 * DAY } }),
    );
    await accountSeen(db, 'Red', 'created', T0, save({ '2025-06-02': ['win'] }));

    const sum = await read<typeof summary>(db, 'view=summary');
    expect(sum.games).toMatchObject({ total: 2, week: 1, month: 1, finished: 1 });
    expect(sum.perDay).toHaveLength(30);
    expect(sum.perDay.filter((d) => d.games)).toEqual([{ day: '2025-06-02', games: 1 }]);
    expect(sum.perDay.at(-1)!.day).toBe('2025-06-03');
    expect(sum.accounts).toMatchObject({ total: 1, activeWeek: 1, newWeek: 1 });
    expect(sum.progress).toMatchObject([
      { format: 'gen4ou', players: 1, activeWeek: 1, normal: 1 },
    ]);

    const list = await read<typeof games>(db, 'view=games');
    expect(list.games.map((g) => [g.id, g.names])).toEqual([
      [`ABCDE-${T0}`, ['Ash', 'Misty']],
      ['FGHIJ-1', []],
    ]);
    const one = (await read<typeof game>(db, `view=game&id=ABCDE-${T0}`))!;
    expect(one.players.map((p) => p.name)).toEqual(['Ash', 'Misty']);
    expect((await admin(db, 'secret', 'view=game&id=nope')).status).toBe(404);

    const accts = await read<typeof accounts>(db, 'view=accounts&q=re');
    expect(accts.accounts).toMatchObject([
      { name: 'Red', games: [{ format: 'gen4ou', streak: 1 }] },
    ]);
    expect((await read<typeof accounts>(db, 'view=accounts&q=zz')).accounts).toEqual([]);
  });
});

/** An admin view's answer, typed as the function that makes it. */
const read = async <F extends (...args: never[]) => Promise<unknown>>(db: Db, query: string) =>
  (await (await admin(db, 'secret', query)).json()) as Awaited<ReturnType<F>>;

describe('forgetPlayer', () => {
  it('removes a player’s account, progress and versus history, and nobody else’s', async () => {
    const db = memoryDb();
    const run = (sql: string, ...v: unknown[]) =>
      db
        .prepare(sql)
        .bind(...v)
        .run();
    for (const [key, name] of [
      ['misty', 'Misty'],
      ['brock', 'Brock'],
    ]) {
      await run(`INSERT INTO accounts (key, name, last_seen_at) VALUES (?, ?, 1)`, key, name);
    }
    await run(
      `INSERT INTO account_games (key, format, days_played, wins, losses, clears, first_try_wins,
         streak, best_streak, difficulty, coach, lessons, updated_at)
       VALUES ('misty', 'gen3ou', 1, 1, 0, 1, 1, 1, 1, 'normal', 0, 0, 1)`,
    );
    for (const [id, winners] of [
      ['g1', 'Misty, Brock'],
      ['g2', 'Misty'],
      ['g3', 'Brock'],
    ]) {
      await run(
        `INSERT INTO games (id, room, format, pool_mode, lives, timer, rival, players, started_at, winners)
         VALUES (?, 'R', 'gen3ou', 'weekly', 3, 'normal', 'normal', 2, 1, ?)`,
        id,
        winners,
      );
      for (const name of ['Misty', 'Brock']) {
        await run(
          `INSERT INTO game_players (game_id, name, team_size, wins, losses, auto_team, left_early)
           VALUES (?, ?, 6, 0, 0, 0, 0)`,
          id,
          name,
        );
      }
    }
    await run(
      `INSERT INTO battles (game_id, round, match, p1, p2, winner, reason, turns, ended_at)
       VALUES ('g1', 1, 'a', 'Misty', 'Brock', 'Misty', 'win', 10, 1),
              ('g1', 1, 'b', 'Brock', 'Rival', 'Brock', 'win', 10, 1)`,
    );

    expect(await forgetPlayer(db, 'MISTY')).toEqual({
      accounts: 1,
      progress: 1,
      games: 3,
      battles: 1,
      wins: 2,
    });
    const all = async (sql: string) => (await db.prepare(sql).all()).results;
    expect(await all(`SELECT key FROM accounts`)).toEqual([{ key: 'brock' }]);
    expect(await all(`SELECT key FROM account_games`)).toEqual([]);
    expect(await all(`SELECT DISTINCT name FROM game_players`)).toEqual([{ name: 'Brock' }]);
    expect(await all(`SELECT match FROM battles`)).toEqual([{ match: 'b' }]);
    expect(await all(`SELECT id, winners FROM games ORDER BY id`)).toEqual([
      { id: 'g1', winners: 'Brock' },
      { id: 'g2', winners: null },
      { id: 'g3', winners: 'Brock' },
    ]);
  });
});
