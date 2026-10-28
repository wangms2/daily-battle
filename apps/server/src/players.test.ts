import { describe, expect, it } from 'vitest';
import { memoryDb } from './memoryDb';
import { parsePing, playerSeen, playerSummary, utcDay, type Ping } from './players';
import { summary } from './admin';
import { accountSeen, forgetPlayer } from './stats';

const NOW = Date.UTC(2026, 9, 28, 12);
const TODAY = utcDay(NOW);
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const day = (back: number) => utcDay(NOW - back * 24 * 60 * 60 * 1000);

describe('parsePing', () => {
  const good = { id: ID(1), day: TODAY, activity: 'daily-gen3ou' };

  it('takes a well-formed ping for about today', () => {
    expect(parsePing(good, NOW)).toEqual(good);
    expect(parsePing({ ...good, activity: 'versus' }, NOW)).not.toBeNull();
    expect(parsePing({ ...good, day: day(1) }, NOW)).not.toBeNull();
    expect(parsePing({ ...good, since: '2026-01-05', account: 'Misty' }, NOW)).toEqual({
      ...good,
      since: '2026-01-05',
      account: 'Misty',
    });
  });

  it('refuses anything else', () => {
    expect(parsePing(null, NOW)).toBeNull();
    expect(parsePing({ ...good, id: 'abc' }, NOW)).toBeNull();
    expect(parsePing({ ...good, activity: 'hacking' }, NOW)).toBeNull();
    expect(parsePing({ ...good, day: day(3) }, NOW)).toBeNull();
    expect(parsePing({ ...good, day: '2026-13-99x' }, NOW)).toBeNull();
  });

  it('drops a since that makes no sense, keeping the ping', () => {
    expect(parsePing({ ...good, since: '1999-01-01' }, NOW)).toEqual(good);
    expect(parsePing({ ...good, since: day(-5) }, NOW)).toEqual(good);
  });
});

describe('players', () => {
  const ping = (db: ReturnType<typeof memoryDb>, p: Partial<Ping> & { id: string }, back = 0) =>
    playerSeen(db, { day: day(back), activity: 'daily-gen3ou', ...p }, NOW);

  it('counts people, new and returning, and who came back the next day', async () => {
    const db = memoryDb();
    // 1: an old player (their save goes back a month), here today and yesterday.
    await ping(db, { id: ID(1), since: day(40) }, 1);
    await ping(db, { id: ID(1) });
    await ping(db, { id: ID(1), activity: 'lessons-gen3ou' });
    // 2: new five days ago, and back the next day.
    await ping(db, { id: ID(2) }, 5);
    await ping(db, { id: ID(2), activity: 'versus' }, 4);
    // 3: new four days ago, never back.
    await ping(db, { id: ID(3) }, 4);
    // 4 and 5: one account on two devices, today.
    await accountSeen(db, 'Brock', 'created', NOW, null);
    await ping(db, { id: ID(4), account: 'Brock' });
    await ping(db, { id: ID(5), account: 'brock', activity: 'trainer-gen3ou' });

    const s = await playerSummary(db, NOW);
    expect(s).toMatchObject({
      total: 4,
      today: 2,
      week: 4,
      month: 4,
      newWeek: 3,
      returningWeek: 1,
      nextDay: { cohort: 2, back: 1 },
    });
    expect(s.perDay).toHaveLength(30);
    expect(s.perDay.at(-1)).toEqual({ day: TODAY, players: 2 });
    expect(s.perDay.at(-5)).toEqual({ day: day(4), players: 2 });
    expect(s.activities).toEqual([
      { activity: 'daily-gen3ou', players: 4 },
      { activity: 'lessons-gen3ou', players: 1 },
      { activity: 'trainer-gen3ou', players: 1 },
      { activity: 'versus', players: 1 },
    ]);
  });

  it('counts from the admin’s local date when it’s within a day of UTC’s', async () => {
    const db = memoryDb();
    await ping(db, { id: ID(1) }, 1);
    expect((await playerSummary(db, NOW)).today).toBe(0);
    expect((await playerSummary(db, NOW, day(1))).today).toBe(1);
    expect((await playerSummary(db, NOW, day(3))).today).toBe(0);
  });

  it('leaves the rest of the summary up when its tables are missing', async () => {
    const db = memoryDb();
    await db.prepare(`DROP TABLE player_days`).run();
    const s = await summary(db, NOW);
    expect(s.players).toBeUndefined();
    expect(s.games).toBeDefined();
  });

  it('counts a ping once a day per activity, and links only real accounts', async () => {
    const db = memoryDb();
    await ping(db, { id: ID(1), account: 'Nobody' });
    await ping(db, { id: ID(1), account: 'Nobody' });
    const rows = (sql: string) =>
      db
        .prepare(sql)
        .all()
        .then((r) => r.results);
    expect(await rows(`SELECT id, day FROM player_days`)).toHaveLength(1);
    expect(await rows(`SELECT account_key FROM players`)).toEqual([{ account_key: null }]);
  });

  it('goes with its account when an admin deletes the player', async () => {
    const db = memoryDb();
    await accountSeen(db, 'Brock', 'created', NOW, null);
    await ping(db, { id: ID(4), account: 'Brock' });
    await ping(db, { id: ID(6) });
    expect((await forgetPlayer(db, 'Brock')).devices).toBe(1);
    const rows = (sql: string) =>
      db
        .prepare(sql)
        .all()
        .then((r) => r.results);
    expect(await rows(`SELECT id FROM players`)).toEqual([{ id: ID(6) }]);
    expect(await rows(`SELECT id FROM player_days`)).toEqual([{ id: ID(6) }]);
  });
});
