import { DEFAULT_FORMAT, FORMATS, formatInfo, type FormatId } from '@daily-battle/data/formats';
import { addDays, dayKey, weekKey } from '@daily-battle/gen/dates';
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BattleRoute } from './screens/BattleRoute';
import { DailyBrief } from './screens/DailyBrief';
import { TeamBuilder } from './screens/TeamBuilder';
import { AboutSheet } from './sheets/About';
import { GameNewsSheet, GEN5_NEWS } from './sheets/GameNews';
import { GamePicker } from './sheets/GamePicker';
import { SettingsSheet, StatsSheet, WelcomeSheet } from './sheets/misc';
import { setActiveFormat } from './lib/data';
import { setSpriteStyle } from './lib/sprites';
import { useMediaQuery } from './ui/useWide';
import { reportText } from './lib/report';
import { computeStats, dayHeadline, summarizeDay } from './lib/results';
import { useSchedule } from './lib/schedule';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { ENGINE_VERSION, randomSeed } from './lib/seed';
import { shareModel } from './lib/share';
import { attemptInProgress, dayDecided, withChange, type GameAction } from './state/reducer';
import { emptyDay, type Settings } from './state/schema';
import { useNow, useStore } from './state/context';
import { Button } from './ui/bits';
import { TopBar } from './ui/TopBar';
import { VersusRoute } from './versus/VersusRoute';

/** The site's address, with the game for anything but Gen 4 OU (`…/#gen5`). */
const shareUrl = (format: FormatId) =>
  format === DEFAULT_FORMAT
    ? window.location.origin
    : `${window.location.origin}/#${format.replace(/ou$/, '')}`;

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

/** A share link's `#gen5` (or `#gen4`): the game it was shared from. */
const formatFromHash = (hash: string): FormatId | undefined =>
  (Object.keys(FORMATS) as FormatId[]).find((f) => f === `${hash}ou`);

/** Identifies the version of a week's pool a team was locked against. */
function poolIdOf(s: ScheduleFile): string {
  return `${s.week}:g${s.generatorVersion}:c${s.pool.candidate}`;
}

export function App() {
  const { state, dispatch: dispatchAny, storageAvailable } = useStore();
  const now = useNow(1000);
  const day = dayKey(now);
  const week = weekKey(now);
  const [route, go] = useHashRoute();
  // Until a player picks a game (on the welcome sheet), Gen 4 OU is shown behind it.
  const format = state.settings.format ?? DEFAULT_FORMAT;
  const game = formatInfo(format);
  setActiveFormat(format);
  // Animations off (or the system asking for less motion) means still sprites everywhere.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  setSpriteStyle(state.settings.animations && !reducedMotion ? 'animated' : 'still');
  const dispatch = (action: GameAction) => dispatchAny({ ...action, format });
  const [retry, setRetry] = useState(0);
  const schedule = useSchedule(week, format, retry);
  const [pickerOpen, setPickerOpen] = useState(false);

  // A shared link (`…/#gen5`) opens the game it came from.
  const linked = formatFromHash(route);
  useEffect(() => {
    if (!linked) return;
    dispatchAny({ type: 'setSetting', key: 'format', value: linked });
    go('');
  }, [linked, dispatchAny, go]);
  const [statsOpen, setStatsOpen] = useState(false);
  // After a loss, the end card's "Change team" opens the brief with the team editable.
  const [openEdit, setOpenEdit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(false);

  const { settings } = state;
  const { weeks, days } = state.games[format];
  const weekState = weeks[week];
  const dayState = days[day] ?? emptyDay();
  // Streaks and stats come from the saved attempts (lib/results.ts).
  const stats = useMemo(() => computeStats(days, day), [days, day]);
  const summary = useMemo(() => summarizeDay(days[day], true), [days, day]);
  const share = shareModel({
    day,
    summary,
    streak: stats.streak,
    change: dayState.change,
    url: shareUrl(format),
    game: game.name,
  });
  const countdown = countdownTo(now, addDays(day, 1));
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    dispatchAny({ type: 'setSetting', key, value });

  // An unfinished battle from an earlier day, or from an older engine, counts as a loss.
  useEffect(() => {
    dispatchAny({ type: 'expireAll', today: day, engine: ENGINE_VERSION });
  }, [day, dispatchAny]);

  // A team locked against an earlier version of the week (the schedule was
  // regenerated): everyone builds this week's team again.
  const [poolRefreshed, setPoolRefreshed] = useState(false);
  const poolId = schedule.status === 'ready' ? poolIdOf(schedule.schedule) : null;
  const staleTeam = !!poolId && !!weekState && weekState.poolId !== poolId;
  if (staleTeam && !poolRefreshed) setPoolRefreshed(true);
  useEffect(() => {
    if (staleTeam) dispatchAny({ type: 'resetWeek', week, day, format });
  }, [staleTeam, week, day, format, dispatchAny]);

  const inProgress = attemptInProgress(dayState);
  // After today's counted tries, runs are practice and may carry a one-off change.
  const practice = dayDecided(dayState);
  const practiceChange = practice ? dayState.practiceChange : undefined;
  const runTeam = weekState ? withChange(weekState.team, practiceChange) : [];
  // The attempt the battle screen shows; it stays put after the battle ends.
  const [battleTs, setBattleTs] = useState<number | null>(null);

  const startBattle = () => {
    setOpenEdit(false);
    if (!weekState) return;
    if (inProgress) {
      setBattleTs(inProgress.ts);
    } else {
      const team = runTeam;
      const lead = team.find((s) => s.species === dayState.lead) ?? team[0]!;
      // Attempts are identified by ts, so keep it unique even if the clock repeats.
      const ts = Math.max(Date.now(), (dayState.attempts.at(-1)?.ts ?? 0) + 1);
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
          ...(practiceChange && { practiceChange }),
        },
      });
      setBattleTs(ts);
    }
    go('battle');
  };
  const shownAttempt =
    dayState.attempts.find((a) => a.ts === battleTs) ??
    (route === 'battle' ? inProgress : undefined);

  const renderTopBar = (title: string) => (left?: ReactNode) => (
    <TopBar
      title={`${game.name} · ${title}`}
      onTitle={() => setPickerOpen(true)}
      left={left}
      streak={stats.streak}
      onStats={() => setStatsOpen(true)}
      onSettings={() => setSettingsOpen(true)}
    />
  );

  // Versus rooms (#versus, #versus/CODE) stand apart from the daily games.
  const versus = route === 'versus' || route.startsWith('versus/');

  let screen: ReactNode;
  if (versus) {
    screen = <VersusRoute route={route} go={go} onExit={() => go('')} />;
  } else if (schedule.status === 'loading') {
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
  } else if (!weekState || staleTeam) {
    screen = (
      <TeamBuilder
        notice={
          poolRefreshed
            ? 'This week’s Pokémon and opponents were refreshed with new sets. Pick your team again.'
            : undefined
        }
        schedule={schedule.schedule}
        hints={settings.beginnerHints}
        topBar={renderTopBar(`Week of ${fmtDay(week, { month: 'short', day: 'numeric' })}`)()}
        onLock={(team) => {
          dispatch({
            type: 'lockTeam',
            week,
            poolId: poolIdOf(schedule.schedule),
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
        dispatch={dispatchAny}
        format={format}
        onExit={() => {
          setBattleTs(null);
          go('');
        }}
        onRunItBack={startBattle}
        onChangeTeam={() => {
          setOpenEdit(true);
          setBattleTs(null);
          go('');
        }}
        result={{
          summary,
          streak: stats.streak,
          // The same share as the brief's: practice runs never show in it.
          share,
        }}
      />
    );
  } else {
    screen = (
      <DailyBrief
        schedule={schedule.schedule}
        day={day}
        team={runTeam}
        dayState={dayState}
        practice={practice}
        hints={settings.beginnerHints}
        teamPreview={game.teamPreview}
        renderTopBar={renderTopBar(
          fmtDay(day, { weekday: 'short', month: 'short', day: 'numeric' }),
        )}
        initialEdit={openEdit}
        onDitch={() => {
          dispatch({ type: 'ditchTeam', week, day });
          setOpenEdit(false);
        }}
        onLead={(species) => dispatch({ type: 'setLead', day, species })}
        onChange={(change) => {
          if (practice) dispatch({ type: 'setPracticeChange', day, week, change });
          else if (change) dispatch({ type: 'applyChange', day, week, change });
        }}
        inProgress={!!inProgress}
        onStart={startBattle}
        result={{ summary, streak: stats.streak, share, countdown }}
      />
    );
  }

  return (
    <div
      className={`mx-auto h-dvh overflow-hidden ${route === 'battle' ? 'max-w-[1440px]' : 'max-w-[1280px]'}`}
    >
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
      <Fragment key={format}>{screen}</Fragment>
      <WelcomeSheet
        open={!versus && !settings.shownExplainers.includes('welcome')}
        hints={settings.beginnerHints}
        onHints={(v) => setSetting('beginnerHints', v)}
        format={state.settings.format}
        onFormat={(value) => dispatchAny({ type: 'setSetting', key: 'format', value })}
        onDone={() => {
          if (!state.settings.format)
            dispatchAny({ type: 'setSetting', key: 'format', value: format });
          dispatchAny({ type: 'markExplainer', id: 'welcome' });
          // They just picked a game, so the Gen 5 news is old news.
          dispatchAny({ type: 'markExplainer', id: GEN5_NEWS });
        }}
        onAbout={() => setAboutOpen(true)}
      />
      <StatsSheet
        open={statsOpen}
        onOpenChange={setStatsOpen}
        stats={stats}
        game={`${game.name} OU`}
        todayLabel={dayHeadline(summary)}
        countdown={countdown}
      />
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onChange={setSetting}
        report={reportText({ days, settings }, ENGINE_VERSION)}
        onAbout={() => setAboutOpen(true)}
        onHowToPlay={() => {
          setSettingsOpen(false);
          setHowToPlayOpen(true);
        }}
      />
      <WelcomeSheet
        review
        open={howToPlayOpen}
        hints={settings.beginnerHints}
        onHints={() => {}}
        format={format}
        onFormat={() => {}}
        onDone={() => setHowToPlayOpen(false)}
        onAbout={() => setAboutOpen(true)}
      />
      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} />
      <GameNewsSheet
        open={
          route !== 'battle' &&
          !versus &&
          settings.shownExplainers.includes('welcome') &&
          !settings.shownExplainers.includes(GEN5_NEWS)
        }
        onTry={() => {
          dispatchAny({ type: 'markExplainer', id: GEN5_NEWS });
          dispatchAny({ type: 'setSetting', key: 'format', value: 'gen5ou' });
        }}
        onStay={() => dispatchAny({ type: 'markExplainer', id: GEN5_NEWS })}
      />
      <GamePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        current={format}
        games={(Object.keys(FORMATS) as FormatId[]).map((id) => ({
          id,
          name: `${formatInfo(id).name} OU`,
          streak: computeStats(state.games[id].days, day).streak,
          today: dayHeadline(summarizeDay(state.games[id].days[day], true)),
        }))}
        onPick={(id) => {
          setPickerOpen(false);
          if (id !== format) dispatchAny({ type: 'setSetting', key: 'format', value: id });
        }}
      />
    </div>
  );
}
