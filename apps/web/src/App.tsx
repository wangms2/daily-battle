import { addDays, dayKey, weekKey } from '@daily-battle/gen/dates';
import { useEffect, useState, type ReactNode } from 'react';
import { BattleRoute } from './screens/BattleRoute';
import { DailyBrief } from './screens/DailyBrief';
import { TeamBuilder } from './screens/TeamBuilder';
import { SettingsSheet, StatsSheet, WelcomeSheet } from './sheets/misc';
import { useSchedule } from './lib/schedule';
import { ENGINE_VERSION, randomSeed } from './lib/seed';
import { attemptInProgress } from './state/reducer';
import { emptyDay, type Settings } from './state/schema';
import { useNow, useStore } from './state/context';
import { Button } from './ui/bits';
import { TopBar } from './ui/TopBar';

const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, opts);

function countdownTo(now: Date, nextDay: string): string {
  const ms = Math.max(0, new Date(`${nextDay}T00:00:00`).getTime() - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1));
  useEffect(() => {
    const on = () => setRoute(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r: string) => (window.location.hash = r)];
}

export function App() {
  const { state, dispatch, storageAvailable } = useStore();
  const now = useNow(1000);
  const day = dayKey(now);
  const week = weekKey(now);
  const [retry, setRetry] = useState(0);
  const schedule = useSchedule(week, retry);
  const [route, go] = useHashRoute();
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(false);

  const { settings, stats } = state;
  const weekState = state.weeks[week];
  const dayState = state.days[day] ?? emptyDay();
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    dispatch({ type: 'setSetting', key, value });

  // An unfinished battle from an earlier day, or from an older engine, counts as a loss.
  useEffect(() => {
    dispatch({ type: 'expireAttempts', today: day, engine: ENGINE_VERSION });
  }, [day, dispatch]);

  const inProgress = attemptInProgress(dayState);
  // The attempt the battle screen shows; it stays put after the battle ends.
  const [battleTs, setBattleTs] = useState<number | null>(null);

  const startBattle = () => {
    if (!weekState) return;
    if (inProgress) {
      setBattleTs(inProgress.ts);
    } else {
      const team = weekState.team;
      const lead = team.find((s) => s.species === dayState.lead) ?? team[0]!;
      const ts = Date.now();
      dispatch({
        type: 'startAttempt',
        day,
        attempt: {
          result: 'inProgress',
          remaining: 6,
          ts,
          lead: lead.species,
          team: [lead, ...team.filter((s) => s !== lead)],
          battleSeed: randomSeed(),
          aiSeed: randomSeed(),
          choices: [],
          engine: ENGINE_VERSION,
        },
      });
      setBattleTs(ts);
    }
    go('battle');
  };
  const shownAttempt =
    dayState.attempts.find((a) => a.ts === battleTs) ??
    (route === 'battle' ? inProgress : undefined);

  const todayLabel = !dayState.attempts.length
    ? 'Not played yet'
    : dayState.attempts[0]!.result === 'win'
      ? 'First-try win'
      : dayState.attempts.some((a) => a.result === 'win')
        ? 'Cleared on a retry'
        : 'Not cleared yet';

  const renderTopBar = (title: string) => (left?: ReactNode) => (
    <TopBar
      title={title}
      left={left}
      streak={stats.firstTryStreak}
      onStats={() => setStatsOpen(true)}
      onSettings={() => setSettingsOpen(true)}
    />
  );

  let screen: ReactNode;
  if (schedule.status === 'loading') {
    screen = <div className="grid h-full place-items-center text-muted">Loading this week…</div>;
  } else if (schedule.status === 'error') {
    screen = (
      <div className="grid h-full place-items-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-[16px] font-semibold">Couldn’t load this week’s battles.</p>
          <Button onClick={() => setRetry((n) => n + 1)}>Try again</Button>
        </div>
      </div>
    );
  } else if (!weekState) {
    screen = (
      <TeamBuilder
        schedule={schedule.schedule}
        hints={settings.beginnerHints}
        topBar={renderTopBar(`Week of ${fmtDay(week, { month: 'short', day: 'numeric' })}`)()}
        onLock={(team) => {
          dispatch({
            type: 'lockTeam',
            week,
            poolId: `${week}:c${schedule.schedule.pool.candidate}`,
            team,
          });
          go('');
        }}
      />
    );
  } else if (route === 'battle' && shownAttempt) {
    screen = (
      <BattleRoute
        key={shownAttempt.ts}
        day={day}
        schedule={schedule.schedule}
        attempt={shownAttempt}
        tryNumber={dayState.attempts.indexOf(shownAttempt) + 1}
        settings={settings}
        dispatch={dispatch}
        onExit={() => {
          setBattleTs(null);
          go('');
        }}
        onRunItBack={startBattle}
      />
    );
  } else {
    screen = (
      <DailyBrief
        schedule={schedule.schedule}
        day={day}
        team={weekState.team}
        dayState={dayState}
        hints={settings.beginnerHints}
        renderTopBar={renderTopBar(
          `Today · ${fmtDay(day, { weekday: 'short', month: 'short', day: 'numeric' })}`,
        )}
        onLead={(species) => dispatch({ type: 'setLead', day, species })}
        onChange={(change) => dispatch({ type: 'applyChange', day, week, change })}
        inProgress={!!inProgress}
        onStart={startBattle}
      />
    );
  }

  return (
    <div className="mx-auto h-dvh max-w-[1280px] overflow-hidden">
      {!storageAvailable && !storageNoticeDismissed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 bg-[#fef3c7] px-3 py-1.5 text-[13px] text-[#78350f]"
        >
          Progress won’t be saved in this browser.
          <button
            type="button"
            className="font-semibold"
            onClick={() => setStorageNoticeDismissed(true)}
          >
            OK
          </button>
        </div>
      )}
      {screen}
      <WelcomeSheet
        open={!settings.shownExplainers.includes('welcome')}
        hints={settings.beginnerHints}
        onHints={(v) => setSetting('beginnerHints', v)}
        onDone={() => dispatch({ type: 'markExplainer', id: 'welcome' })}
      />
      <StatsSheet
        open={statsOpen}
        onOpenChange={setStatsOpen}
        stats={stats}
        todayLabel={todayLabel}
        countdown={countdownTo(now, addDays(day, 1))}
      />
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSetting}
      />
    </div>
  );
}
