// The admin page (#admin, DESIGN.md §18a): versus games and accounts from the
// stats API, behind the admin password. Not linked from the app; loaded only
// when opened.
import { dayKey } from '@daily-battle/gen/dates';
import { FORMATS } from '@daily-battle/data/formats';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/bits';

const KEY = 'daily-battle:admin';

type Row = Record<string, unknown>;

interface Summary {
  games: { total: number; week: number; month: number; finished: number; avgPlayers: number };
  perDay: { day: string; games: number }[];
  formats: { format: string; games: number }[];
  accounts: { total: number; activeWeek: number; newWeek: number };
  progress: {
    format: string;
    players: number;
    activeWeek: number;
    daysPlayed: number;
    avgStreak: number;
    bestStreak: number;
    easy: number;
    normal: number;
    hard: number;
    coach: number;
    learners: number;
  }[];
  /** Everyone who plays, counted anonymously per device or account (server players.ts). */
  players?: {
    total: number;
    today: number;
    week: number;
    month: number;
    newWeek: number;
    returningWeek: number;
    nextDay: { cohort: number; back: number };
    perDay: { day: string; players: number }[];
    activities: { activity: string; players: number }[];
  };
}

class Unauthorized extends Error {}
class Off extends Error {}

async function get<T>(token: string, query: string): Promise<T> {
  const res = await fetch(`/api/admin/stats?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Unauthorized();
  if (res.status === 404 && query.startsWith('view=summary')) throw new Off();
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const gen = (format: unknown) =>
  (FORMATS as Record<string, { name: string }>)[String(format)]?.name ?? String(format);

const when = (ms: unknown) =>
  typeof ms === 'number'
    ? new Date(ms).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—';

const length = (ms: unknown) => {
  if (typeof ms !== 'number') return '—';
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
};

const round1 = (n: number | null | undefined) =>
  n == null ? '—' : String(Math.round(n * 10) / 10);

export default function AdminPage() {
  const [token, setToken] = useState(() => localStorage.getItem(KEY) ?? '');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'games' | 'accounts'>('overview');

  const signOut = useCallback((message: string | null = null) => {
    localStorage.removeItem(KEY);
    setToken('');
    setError(message);
  }, []);

  const api = useMemo<Api>(
    () => ({
      get: <T,>(query: string) => get<T>(token, query),
      // A wrong password signs out.
      fail: (e) => {
        if (e instanceof Unauthorized) signOut('That password didn’t work.');
        else if (e instanceof Off)
          signOut('Stats are off: the server has no database or password.');
        else setError('Couldn’t load the stats. Try again.');
      },
    }),
    [token, signOut],
  );
  // Players send their local dates, so "today" is the admin's own.
  const summary = useQuery<Summary>(api, token ? `view=summary&today=${dayKey(new Date())}` : null);

  if (!token) {
    return (
      <Page>
        <SignIn
          error={error}
          onSignIn={(t) => {
            localStorage.setItem(KEY, t);
            setError(null);
            setToken(t);
          }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <header className="flex items-center justify-between gap-3">
        <h1 className="display text-[22px]">Daily Battle stats</h1>
        <Button variant="ghost" onClick={() => signOut()}>
          Sign out
        </Button>
      </header>
      <nav className="flex gap-2" aria-label="Sections">
        {(['overview', 'games', 'accounts'] as const).map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tab === t}
            onClick={() => setTab(t)}
            className={clsx(
              'h-9 rounded-chip px-3 text-[14px] font-semibold capitalize',
              tab === t ? 'bg-accent text-on-accent' : 'bg-surface-2 text-ink',
            )}
          >
            {t}
          </button>
        ))}
      </nav>
      {error && <p className="text-bad">{error}</p>}
      {tab === 'overview' &&
        (summary ? <Overview s={summary} /> : <p className="text-muted">Loading…</p>)}
      {tab === 'games' && <Games api={api} />}
      {tab === 'accounts' && <Accounts api={api} />}
    </Page>
  );
}

/** The stats API: a request, and what to do when one fails. */
interface Api {
  get: <T>(query: string) => Promise<T>;
  fail: (e: unknown) => void;
}

/** One request's answer, once it's in (null before, or with no query). */
function useQuery<T>(api: Api, query: string | null): T | null {
  const [got, setGot] = useState<{ query: string; data: T } | null>(null);
  useEffect(() => {
    if (query === null) return;
    let live = true;
    api.get<T>(query).then((data) => {
      if (live) setGot({ query, data });
    }, api.fail);
    return () => {
      live = false;
    };
  }, [api, query]);
  return got && got.query === query ? got.data : null;
}

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="fixed inset-0 overflow-y-auto bg-bg text-ink">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4 pb-16">{children}</div>
    </main>
  );
}

function SignIn({ error, onSignIn }: { error: string | null; onSignIn: (t: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="card mx-auto mt-16 flex w-full max-w-sm flex-col gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSignIn(value.trim());
      }}
    >
      <h1 className="display text-[20px]">Admin</h1>
      <label className="flex flex-col gap-1 text-[14px]">
        Password
        <input
          type="password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-11 rounded-btn border border-line bg-surface px-3 text-[16px]"
        />
      </label>
      {error && <p className="text-[14px] text-bad">{error}</p>}
      <Button type="submit">Open</Button>
    </form>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card flex flex-col gap-0.5 p-4">
      <span className="text-[13px] text-muted">{label}</span>
      <span className="display text-[26px] leading-tight">{value}</span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </div>
  );
}

/** "daily-gen3ou" as "Gen 3 daily", and so on. */
function activityName(activity: string) {
  if (activity === 'versus') return 'Link Battle';
  const [kind, format] = activity.split('-');
  const what = { daily: 'daily', lessons: 'lessons', trainer: 'type trainer' }[kind ?? ''];
  return `${gen(format)} ${what ?? kind}`;
}

/** Everyone who plays: a person is an account, or a device without one. */
function Players({ p }: { p: NonNullable<Summary['players']> }) {
  const most = Math.max(1, ...p.perDay.map((d) => d.players));
  const back = p.nextDay.cohort ? `${Math.round((100 * p.nextDay.back) / p.nextDay.cohort)}%` : '—';
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Players today"
          value={p.today}
          sub={`${p.week} this week · ${p.month} in 30 days`}
        />
        <Stat
          label="New this week"
          value={p.newWeek}
          sub={`${p.returningWeek} returning players`}
        />
        <Stat
          label="Back the next day"
          value={back}
          sub={`${p.nextDay.back} of ${p.nextDay.cohort} new players last week`}
        />
        <Stat label="All players" value={p.total} sub="since counting began" />
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-[15px] font-semibold">Players per day (30 days)</h2>
        <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Players per day">
          {p.perDay.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.players}`}
              className="flex-1 rounded-t-sm bg-accent"
              style={{ height: `${(100 * d.players) / most}%`, minHeight: d.players ? 3 : 1 }}
            />
          ))}
        </div>
        {p.activities.length > 0 && (
          <p className="text-[13px] text-muted">
            In 30 days:{' '}
            {p.activities.map((a) => `${activityName(a.activity)} ${a.players}`).join(' · ')}
          </p>
        )}
        <p className="text-[12px] text-muted">
          Counted per device, or once per account when signed in. Opening the site without playing
          doesn’t count.
        </p>
      </section>
    </>
  );
}

function Overview({ s }: { s: Summary }) {
  const days = s.perDay;
  const most = Math.max(1, ...days.map((d) => d.games));
  return (
    <>
      {s.players && <Players p={s.players} />}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Versus games"
          value={s.games.total}
          sub={`${s.games.week} this week · ${s.games.month} in 30 days`}
        />
        <Stat
          label="Finished"
          value={s.games.total ? `${Math.round((100 * s.games.finished) / s.games.total)}%` : '—'}
          sub={`${round1(s.games.avgPlayers)} players on average`}
        />
        <Stat
          label="Accounts"
          value={s.accounts.total}
          sub={`${s.accounts.newWeek} new this week`}
        />
        <Stat label="Accounts active" value={s.accounts.activeWeek} sub="in the last 7 days" />
      </section>

      <section className="card flex flex-col gap-2 p-4">
        <h2 className="text-[15px] font-semibold">Versus games per day (UTC, 30 days)</h2>
        <div className="flex h-32 items-end gap-[3px]" role="img" aria-label="Games per day">
          {days.map((d) => (
            <div
              key={d.day}
              title={`${d.day}: ${d.games}`}
              className="flex-1 rounded-t-sm bg-accent"
              style={{ height: `${(100 * d.games) / most}%`, minHeight: d.games ? 3 : 1 }}
            />
          ))}
        </div>
        {s.formats.length > 0 && (
          <p className="text-[13px] text-muted">
            {s.formats.map((f) => `${gen(f.format)}: ${f.games}`).join(' · ')}
          </p>
        )}
      </section>

      <section className="card overflow-x-auto p-4">
        <h2 className="mb-2 text-[15px] font-semibold">Accounts’ daily games</h2>
        <Table
          head={[
            'Gen',
            'Players',
            'Active 7d',
            'Days played',
            'Avg streak',
            'Best streak',
            'Easy / Normal / Hard',
            'Coach on',
            'Took lessons',
          ]}
          rows={s.progress.map((p) => [
            gen(p.format),
            p.players,
            p.activeWeek,
            p.daysPlayed,
            round1(p.avgStreak),
            p.bestStreak,
            `${p.easy} / ${p.normal} / ${p.hard}`,
            p.coach,
            p.learners,
          ])}
          empty="No account has played yet."
        />
      </section>
    </>
  );
}

function Table({
  head,
  rows,
  empty,
  onRow,
  selected,
}: {
  head: string[];
  rows: ReactNode[][];
  empty: string;
  onRow?: (i: number) => void;
  selected?: number | null;
}) {
  if (!rows.length) return <p className="text-[14px] text-muted">{empty}</p>;
  return (
    <table className="w-full text-left text-[14px]">
      <thead>
        <tr className="text-[12px] text-muted">
          {head.map((h) => (
            <th key={h} className="px-2 py-1 font-medium whitespace-nowrap">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r, i) => (
          <tr
            key={i}
            onClick={onRow && (() => onRow(i))}
            className={clsx(
              onRow && 'cursor-pointer hover:bg-surface-2',
              selected === i && 'bg-surface-2',
            )}
          >
            {r.map((c, j) => (
              <td key={j} className="px-2 py-1.5 align-top whitespace-nowrap">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A paged list from the API: the first page, then more on request. */
function usePages(api: Api, query: string, key: 'games' | 'accounts', cursor: string) {
  type Page = Record<string, Row[]> & { more: boolean };
  const first = useQuery<Page>(api, query);
  // Later pages, for this query.
  const [later, setLater] = useState<{ query: string; items: Row[]; more: boolean } | null>(null);
  const extra = later?.query === query ? later : null;
  const items = first ? [...first[key]!, ...(extra?.items ?? [])] : null;
  const more = extra ? extra.more : (first?.more ?? false);
  const next = () => {
    const last = items?.[items.length - 1];
    if (!last) return;
    api
      .get<Page>(`${query}&before=${String(last[cursor])}`)
      .then(
        (page) =>
          setLater({ query, items: [...(extra?.items ?? []), ...page[key]!], more: page.more }),
        api.fail,
      );
  };
  return { items, more, next };
}

function Games({ api }: { api: Api }) {
  const { items, more, next } = usePages(api, 'view=games', 'games', 'started_at');
  const [open, setOpen] = useState<number | null>(null);
  const top = useRef<HTMLElement>(null);
  if (!items) return <p className="text-muted">Loading…</p>;
  const pick = (i: number) => {
    setOpen(open === i ? null : i);
    top.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };
  return (
    <section ref={top} className="card overflow-x-auto p-4">
      {open !== null && items[open] && (
        <GameDetail api={api} id={String(items[open].id)} onClose={() => setOpen(null)} />
      )}
      <Table
        head={['Started', 'Room', 'Gen', 'Pool', 'Players', 'Rounds', 'Length', 'Winner']}
        rows={items.map((g) => [
          when(g.started_at),
          String(g.room),
          gen(g.format),
          g.pool_mode === 'weekly' ? 'This week’s' : 'Random each',
          <span key="p">
            {String(g.players)}
            <span className="ml-1 text-muted">{(g.names as string[]).join(', ')}</span>
          </span>,
          String(g.rounds),
          g.ended_at ? length((g.ended_at as number) - (g.started_at as number)) : '—',
          g.ended_at ? (
            String(g.winners ?? 'Nobody')
          ) : (
            <span className="text-muted">Unfinished</span>
          ),
        ])}
        empty="No versus games yet."
        onRow={pick}
        selected={open}
      />
      {more && (
        <Button variant="secondary" className="mt-3" onClick={next}>
          More games
        </Button>
      )}
    </section>
  );
}

function GameDetail({ api, id, onClose }: { api: Api; id: string; onClose: () => void }) {
  const game = useQuery<{ players: Row[]; battles: Row[] }>(
    api,
    `view=game&id=${encodeURIComponent(id)}`,
  );
  if (!game) return <p className="mb-3 text-muted">Loading the game…</p>;
  return (
    <div
      className="mb-4 flex flex-col gap-3 overflow-x-auto rounded-card bg-surface-2 p-3"
      aria-label="Game detail"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[14px] font-semibold">Game {id.split('-')[0]}: players</h3>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
      <Table
        head={['Place', 'Name', 'Team', 'Built in', 'W–L', '']}
        rows={game.players.map((p) => [
          p.place == null ? '—' : String(p.place),
          String(p.name),
          String(p.team_size),
          p.auto_team ? 'Timer built it' : length(p.build_ms),
          `${String(p.wins)}–${String(p.losses)}`,
          p.left_early ? 'Left' : '',
        ])}
        empty="No players recorded."
      />
      <h3 className="text-[14px] font-semibold">Battles</h3>
      <Table
        head={['Round', 'Battle', 'Winner', 'How', 'Turns', 'Length']}
        rows={game.battles.map((b) => [
          String(b.round),
          `${String(b.p1)} vs ${String(b.p2)}`,
          b.winner == null ? 'Tie' : String(b.winner),
          String(b.reason),
          String(b.turns),
          length(b.duration_ms),
        ])}
        empty="No battles finished."
      />
    </div>
  );
}

function Accounts({ api }: { api: Api }) {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(q.trim()), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  const { items, more, next } = usePages(
    api,
    `view=accounts&q=${encodeURIComponent(search)}`,
    'accounts',
    'last_seen_at',
  );
  return (
    <section className="card flex flex-col gap-3 overflow-x-auto p-4">
      <input
        type="search"
        placeholder="Search names"
        aria-label="Search names"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-10 rounded-btn border border-line bg-surface px-3 text-[16px]"
      />
      {!items ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <Table
          head={['Name', 'Created', 'Last seen', 'Sign-ins', 'Daily games']}
          rows={items.map((a) => [
            <span key="n" className="font-semibold">
              {String(a.name)}
            </span>,
            a.created_at == null ? 'Before stats' : when(a.created_at),
            when(a.last_seen_at),
            String(a.sign_ins),
            <ul key="g" className="flex flex-col gap-0.5">
              {(a.games as Row[]).map((g) => (
                <li key={String(g.format)} className="whitespace-nowrap">
                  <b>{gen(g.format)}</b> {String(g.days_played)} days · {String(g.wins)}W–
                  {String(g.losses)}L · streak {String(g.streak)} (best {String(g.best_streak)}) ·{' '}
                  <span className="capitalize">{String(g.difficulty)}</span>
                  {g.coach ? ' · coach' : ''}
                  {Number(g.lessons) > 0 ? ` · ${String(g.lessons)} lessons` : ''}
                  {g.last_day ? (
                    <span className="text-muted"> · last {String(g.last_day)}</span>
                  ) : null}
                </li>
              ))}
              {!(a.games as Row[]).length && <li className="text-muted">No daily games yet</li>}
            </ul>,
          ])}
          empty={search ? 'No names match.' : 'No accounts yet.'}
        />
      )}
      {more && (
        <Button variant="secondary" onClick={next}>
          More accounts
        </Button>
      )}
    </section>
  );
}
