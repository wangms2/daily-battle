import type { Difficulty } from '@daily-battle/ai/version';
import { DEFAULT_FORMAT, FORMATS, formatInfo, type FormatId } from '@daily-battle/data/formats';
import { addDays, dayKey, weekKey } from '@daily-battle/gen/dates';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BattleRoute } from './screens/BattleRoute';
import { DailyBrief } from './screens/DailyBrief';
import { Home } from './screens/Home';
import { TeamBuilder } from './screens/TeamBuilder';
import { AboutSheet } from './sheets/About';
import { ConfirmDialog, SettingsSheet, StatsSheet, WelcomeSheet } from './sheets/misc';
import { configureAudio } from './lib/audio';
import { setActiveFormat } from './lib/data';
import { setSpriteStyle } from './lib/sprites';
import { useMediaQuery } from './ui/useWide';
import { reportText } from './lib/report';
import {
  attemptBucket,
  attemptDifficulty,
  computeStats,
  dayHeadline,
  summarizeDay,
} from './lib/results';
import { bucketOf, coachAvailable, coachOn, coachWarning } from './lib/coach';
import { useSchedule } from './lib/schedule';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { hardAvailable } from './battle/hardEngine';
import { currentDifficulty } from './lib/difficulty';
import { ENGINE_VERSION, randomSeed } from './lib/seed';
import { DIFFICULTY_NAME, shareModel } from './lib/share';
import { GamesProvider } from './ui/OtherGames';
import {
  attemptEngine,
  attemptInProgress,
  dayDecided,
  withChange,
  type GameAction,
} from './state/reducer';
import { emptyDay, type Settings } from './state/schema';
import { useNow, useStore } from './state/context';
import { Button } from './ui/bits';
import { TopBar } from './ui/TopBar';
import { VersusRoute } from './versus/VersusRoute';
import { gen3Course, LESSONS } from '@daily-battle/tutorial/lessons';
import { LessonPlayer } from './tutorial/LessonPlayer';
import { CourseMap } from './tutorial/CourseMap';
import { TypeTrainer } from './tutorial/TypeTrainer';
import { TypeChartSheet } from './sheets/TypeChart';
import { nextLesson } from './tutorial/lesson';

/** Shared links open the game picker, so a friend can choose any generation. */
const shareUrl = () => `${window.location.origin}/#daily`;

/** The games each generation covers, for the picker. */
const GAME_BLURB: Record<FormatId, string[]> = {
  gen3ou: ['Ruby', 'Sapphire', 'Emerald'],
  gen4ou: ['Diamond', 'Pearl'],
  gen5ou: ['Black', 'White'],
  gen6ou: ['X', 'Y'],
};

const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${key}T12:00:00`).toLocaleDateString(undefined, opts);

function countdownTo(now: Date, nextDay: string): string {
  const ms = Math.max(0, new Date(`${nextDay}T00:00:00`).getTime() - now.getTime());
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** The part of the app a route is in: the home screens, versus, Learn, today's game, or the battle. */
const area = (route: string) =>
  route === '' || route === 'daily'
    ? 'home'
    : route === 'versus' || route.startsWith('versus/')
      ? 'versus'
      : route === 'learn' || route.startsWith('learn/')
        ? 'learn'
        : route === 'battle'
          ? 'battle'
          : 'play';

type ViewTransitions = { startViewTransition?: (update: () => Promise<void>) => unknown };

function useHashRoute(): [string, (r: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.slice(1));
  // Resolves once the new route has rendered, so a view transition can take its picture.
  const settled = useRef<(() => void) | null>(null);
  useEffect(() => {
    const on = () => setRoute(window.location.hash.slice(1));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    settled.current?.();
    settled.current = null;
  }, [route]);
  const go = (next: string) => {
    const from = window.location.hash.slice(1);
    if (next === from) return;
    // The landing and the picker animate themselves, and the battle comes in without ceremony.
    const [a, b] = [area(from), area(next)];
    const glide =
      a !== b &&
      a !== 'battle' &&
      b !== 'battle' &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = (document as unknown as ViewTransitions).startViewTransition;
    if (!glide || !start) {
      window.location.hash = next;
      return;
    }
    start.call(
      document,
      () =>
        new Promise<void>((resolve) => {
          settled.current = resolve;
          window.location.hash = next;
          // Never leave the page frozen if the route doesn't change.
          window.setTimeout(resolve, 600);
        }),
    );
  };
  return [route, go];
}

/** An older share link's `#gen5` (or `#gen4`, `#gen6`): the game it was shared from. */
/** Attempts are identified by ts, so keep it unique even if the clock repeats. */
const nextTs = (last: number | undefined) => Math.max(Date.now(), (last ?? 0) + 1);

/** The game Learn mode teaches (the only one with lessons so far). */
const LEARN_FORMAT: FormatId = 'gen3ou';

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
  // Until a player picks a game (on the picker), Gen 4 OU is the default.
  const format = state.settings.format ?? DEFAULT_FORMAT;
  const game = formatInfo(format);
  setActiveFormat(format);
  // Animations off (or the system asking for less motion) means still sprites everywhere.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  setSpriteStyle(state.settings.animations && !reducedMotion ? 'animated' : 'still');
  const { sound, musicVolume, effectsVolume } = state.settings;
  configureAudio({ sound, musicVolume, effectsVolume });
  const dispatch = (action: GameAction) => dispatchAny({ ...action, format });
  const [retry, setRetry] = useState(0);
  const schedule = useSchedule(week, format, retry);

  // An older shared link (`…/#gen5`) opens the game it came from.
  const linked = formatFromHash(route);
  useEffect(() => {
    if (!linked) return;
    // Only when it differs: the hash change that ends this link arrives later.
    if (state.settings.format !== linked)
      dispatchAny({ type: 'setSetting', key: 'format', value: linked });
    go('play');
  }, [linked, state.settings.format, dispatchAny, go]);
  const [statsOpen, setStatsOpen] = useState(false);
  // After a loss, the end card's "Change team" opens the brief with the team editable.
  const [openEdit, setOpenEdit] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [typeChartOpen, setTypeChartOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [storageNoticeDismissed, setStorageNoticeDismissed] = useState(false);

  const { settings } = state;
  const { weeks, days } = state.games[format];
  const weekState = weeks[week];
  const dayState = days[day] ?? emptyDay();
  // Each difficulty has its own tries and streak; the team is shared.
  const difficulty = currentDifficulty(settings, format, days[day]);
  // Coached tries count apart, in one bucket across difficulties (DESIGN.md §22).
  const coached = coachOn(settings, format, days[day], difficulty);
  const bucket = bucketOf(difficulty, coached);
  const gameBucket = (id: FormatId) => {
    const d = currentDifficulty(settings, id, state.games[id].days[day]);
    return bucketOf(d, coachOn(settings, id, state.games[id].days[day], d));
  };
  // Streaks and stats come from the saved attempts (lib/results.ts).
  const stats = useMemo(() => computeStats(days, day, bucket), [days, day, bucket]);
  const summary = useMemo(() => summarizeDay(days[day], true, bucket), [days, day, bucket]);
  // What turning the coach on would cost: the regular streak at this difficulty.
  const regularStreak = useMemo(
    () => (coached ? stats.streak : computeStats(days, day, difficulty).streak),
    [coached, stats.streak, days, day, difficulty],
  );
  const coachCost = coached ? null : coachWarning(days[day], difficulty, regularStreak);
  const share = shareModel({
    day,
    summary,
    streak: stats.streak,
    change: dayState.change,
    url: shareUrl(),
    game: `${game.name} OU`,
    format,
    difficulty,
    coached,
  });
  const countdown = countdownTo(now, addDays(day, 1));
  // The other games, for the "Play another generation" row on the result and share screens.
  const otherGames = {
    games: (Object.keys(FORMATS) as FormatId[])
      .filter((id) => id !== format)
      .map((id) => ({
        id,
        name: `${formatInfo(id).name} OU`,
        status: summarizeDay(state.games[id].days[day], true, gameBucket(id)).status,
      })),
    onPlay: (id: FormatId) => {
      dispatchAny({ type: 'setSetting', key: 'format', value: id });
      go('play');
    },
  };
  const setSetting = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    dispatchAny({ type: 'setSetting', key, value });
  const setCoach = (on: boolean) => setSetting('coach', { ...settings.coach, [format]: on });
  const setDifficulty = (d: Difficulty) =>
    setSetting('difficulty', { ...settings.difficulty, [format]: d });
  // The welcome sheet and How to play point beginners to the Gen 3 lessons (DESIGN.md §22).
  const startTutorial = () => {
    if (!settings.shownExplainers.includes('welcome'))
      dispatchAny({ type: 'markExplainer', id: 'welcome' });
    setHowToPlayOpen(false);
    const next = nextLesson(LESSONS[LEARN_FORMAT]!, settings.tutorial?.[LEARN_FORMAT]);
    go(next ? `learn/${next.id}` : 'learn');
  };

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
      // Resuming keeps the battle's difficulty picked, so its result shows after.
      const resumed = attemptDifficulty(inProgress);
      if (resumed !== (settings.difficulty?.[format] ?? 'normal')) setDifficulty(resumed);
      setBattleTs(inProgress.ts);
    } else {
      const team = runTeam;
      const lead = team.find((s) => s.species === dayState.lead) ?? team[0]!;
      const ts = nextTs(dayState.attempts.at(-1)?.ts);
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
          engine: attemptEngine(ENGINE_VERSION, difficulty),
          ...(difficulty !== 'normal' && { difficulty }),
          ...(coached && { coached: true as const }),
          ...(practiceChange && { practiceChange }),
        },
      });
      setBattleTs(ts);
    }
    go('battle');
  };
  // The coach is offered once on the brief (a game's first daily, and after
  // graduation), never over another sheet or a battle that's under way.
  const coachOffer =
    route === 'play' &&
    schedule.status === 'ready' &&
    !!weekState &&
    !staleTeam &&
    !inProgress &&
    !coached &&
    !practice &&
    coachAvailable(format, difficulty) &&
    !settings.coachOffered?.[format] &&
    settings.shownExplainers.includes('welcome');
  const offeredCoach = () =>
    setSetting('coachOffered', { ...settings.coachOffered, [format]: true });
  const shownAttempt =
    dayState.attempts.find((a) => a.ts === battleTs) ??
    (route === 'battle' ? inProgress : undefined);

  const renderTopBar = (title: string) => (left?: ReactNode) => (
    <TopBar
      title={[
        game.name,
        difficulty !== 'normal' && DIFFICULTY_NAME[difficulty],
        coached && 'Coached',
        title,
      ]
        .filter(Boolean)
        .join(' · ')}
      onTitle={() => go('daily')}
      left={left}
      streak={stats.streak}
      onStats={() => setStatsOpen(true)}
      onSettings={() => setSettingsOpen(true)}
      format={format}
    />
  );

  // Versus rooms (#versus, #versus/CODE) stand apart from the daily games.
  const versus = route === 'versus' || route.startsWith('versus/');
  // Today's game is #play (and #battle); anything else is the landing screen,
  // or #daily, the picker a shared link opens.
  const playing = route === 'play' || route === 'battle';
  // Learn mode (#learn, #learn/LESSON): the Gen 3 course, apart from the daily.
  const learning = area(route) === 'learn';

  let screen: ReactNode;
  if (learning) {
    const progress = settings.tutorial?.[LEARN_FORMAT];
    const lessons = LESSONS[LEARN_FORMAT]!;
    const lesson = lessons.find((l) => route === `learn/${l.id}`);
    // Learn is all Gen 3: its screens and sheets read that game's data.
    setActiveFormat(LEARN_FORMAT);
    screen =
      route === 'learn/types' ? (
        // The type trainer, for the course's game.
        <TypeTrainer
          boxes={settings.typeTrainer?.[LEARN_FORMAT] ?? {}}
          onBoxes={(b) => setSetting('typeTrainer', { ...settings.typeTrainer, [LEARN_FORMAT]: b })}
          onBack={() => go('learn')}
          onChart={() => setTypeChartOpen(true)}
          onSettings={() => setSettingsOpen(true)}
        />
      ) : lesson ? (
        <LessonPlayer
          key={lesson.id}
          lesson={lesson}
          step={progress?.current?.lesson === lesson.id ? progress.current.step : 0}
          settings={settings}
          onSetting={setSetting}
          onExplainerSeen={(id) => dispatchAny({ type: 'markExplainer', id })}
          onStep={(step) =>
            dispatchAny({ type: 'lessonStep', format: LEARN_FORMAT, lesson: lesson.id, step })
          }
          onDone={() => {
            dispatchAny({ type: 'lessonDone', format: LEARN_FORMAT, lesson: lesson.id });
            // Graduates are offered the coach again, on their next daily.
            if (
              lesson.graduation &&
              !settings.tutorial?.[LEARN_FORMAT]?.completed.includes(lesson.id)
            )
              setSetting('coachOffered', { ...settings.coachOffered, [LEARN_FORMAT]: false });
            go('learn');
          }}
          onExit={() => go('learn')}
          onSettings={() => setSettingsOpen(true)}
        />
      ) : (
        // The course map (#learn; #learn/course, its link before it shipped).
        <CourseMap
          game={formatInfo(LEARN_FORMAT).name}
          course={gen3Course}
          lessons={lessons}
          progress={progress}
          onOpen={(l) => go(`learn/${l.id}`)}
          onTrainer={() => go('learn/types')}
          onBack={() => go('')}
          onSettings={() => setSettingsOpen(true)}
        />
      );
  } else if (!versus && !playing) {
    screen = (
      <Home
        view={route === 'daily' ? 'picker' : 'landing'}
        games={(Object.keys(FORMATS) as FormatId[]).map((id) => {
          const gameDays = state.games[id].days;
          const level = currentDifficulty(settings, id, gameDays[day]);
          const today = summarizeDay(gameDays[day], true, gameBucket(id));
          return {
            id,
            name: formatInfo(id).name,
            blurb: GAME_BLURB[id],
            streak: computeStats(gameDays, day, gameBucket(id)).streak,
            today: dayHeadline(today),
            cleared: today.status === 'firstTry' || today.status === 'won',
            ...(level !== 'normal' && { difficulty: level }),
            ...(gameBucket(id) === 'coached' && { coached: true }),
          };
        })}
        onPlay={() => go('daily')}
        onFriends={() => go('versus')}
        onLearn={() => go('learn')}
        onPick={(id) => {
          if (id !== format) dispatchAny({ type: 'setSetting', key: 'format', value: id });
          go('play');
        }}
        onBack={() => go('')}
        onSettings={() => setSettingsOpen(true)}
      />
    );
  } else if (versus) {
    screen = (
      <VersusRoute
        route={route}
        go={go}
        onExit={() => go('')}
        battle={{
          settings,
          onSetting: setSetting,
          onExplainerSeen: (id) => dispatchAny({ type: 'markExplainer', id }),
        }}
      />
    );
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
          go('play');
        }}
      />
    );
  } else if (route === 'battle' && shownAttempt) {
    screen = (
      <BattleRoute
        // Turning the coach on mid-battle starts it again, coached, from the same turn.
        key={`${shownAttempt.ts}${shownAttempt.coached ? 'c' : ''}`}
        day={day}
        schedule={schedule.schedule}
        attempt={shownAttempt}
        tryNumber={
          dayState.attempts
            .filter((a) => attemptBucket(a) === attemptBucket(shownAttempt))
            .indexOf(shownAttempt) + 1
        }
        settings={settings}
        dispatch={dispatchAny}
        format={format}
        onExit={() => {
          setBattleTs(null);
          go('play');
        }}
        onRunItBack={startBattle}
        onChangeTeam={() => {
          setOpenEdit(true);
          setBattleTs(null);
          go('play');
        }}
        result={{
          summary,
          streak: stats.streak,
          // The same share as the brief's: practice runs never show in it.
          share,
        }}
        {...(shownAttempt === inProgress &&
          coachAvailable(format, attemptDifficulty(shownAttempt)) && {
            coach: {
              warning: coachCost,
              onTurnOn: () => {
                setCoach(true);
                dispatch({ type: 'coachAttempt', day });
              },
            },
          })}
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
        difficulty={difficulty}
        onDifficulty={setDifficulty}
        {...(coachAvailable(format, difficulty) && {
          coach: { on: coached, warning: coachCost, onChange: setCoach },
        })}
        hardAvailable={hardAvailable(format)}
        result={{ summary, streak: stats.streak, share, countdown }}
      />
    );
  }

  return (
    <div
      className={`mx-auto h-dvh overflow-hidden ${route === 'battle' ? 'max-w-[1440px]' : !versus && !playing && !learning ? '' : 'max-w-[1280px]'}`}
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
      <GamesProvider value={otherGames}>
        <Fragment key={format}>{screen}</Fragment>
      </GamesProvider>
      <WelcomeSheet
        open={playing && !settings.shownExplainers.includes('welcome')}
        hints={settings.beginnerHints}
        onHints={(v) => setSetting('beginnerHints', v)}
        onDone={() => dispatchAny({ type: 'markExplainer', id: 'welcome' })}
        onAbout={() => setAboutOpen(true)}
        onTutorial={startTutorial}
      />
      <ConfirmDialog
        open={coachOffer}
        onOpenChange={(o) => !o && offeredCoach()}
        title="Want a coach?"
        body={`The coach gives a tip now and then, checks before a clear mistake, and reviews the key turns after. ${coachCost ?? 'Coached wins build a Coached streak of their own.'} You can turn it on or off before any battle.`}
        confirm="Turn on coach"
        cancel="Not now"
        onConfirm={() => {
          offeredCoach();
          setCoach(true);
        }}
      />
      <StatsSheet
        open={statsOpen}
        onOpenChange={setStatsOpen}
        stats={stats}
        game={[
          `${game.name} OU`,
          coached ? 'Coached' : difficulty !== 'normal' && DIFFICULTY_NAME[difficulty],
        ]
          .filter(Boolean)
          .join(' · ')}
        todayLabel={dayHeadline(summary)}
        countdown={countdown}
      />
      <TypeChartSheet open={typeChartOpen} onOpenChange={setTypeChartOpen} />
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
        onDone={() => setHowToPlayOpen(false)}
        onAbout={() => setAboutOpen(true)}
        onTutorial={startTutorial}
      />
      <AboutSheet open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
