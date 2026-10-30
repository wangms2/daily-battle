// The battle screen (DESIGN.md §12.2b): field, this-turn log, and controls on
// one screen; turns play back line by line at the chosen speed, tap to skip.
import { DEFAULT_FORMAT, formatInfo } from '@daily-battle/data/formats';
import type { CoachNote, Review } from '@daily-battle/tutorial';
import type { Mon } from '@daily-battle/tutorial/lessons';
import clsx from 'clsx';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type * as AnimPlay from '../battle/anim/play';
import { BattleBackendContext, useBattleBackend } from '../battle/backend';
import { replayBackend } from '../battle/replay-backend';
import { playCry, startMusic, stopMusic } from '../lib/audio';
import {
  mergeAiChoices,
  type AiChoices,
  type CoachMemo,
  type Controls,
  type EngineStart,
  type Frame,
  type MonView,
  type TeamMember,
  type TurnPackage,
  type TurnReplay,
  type View,
  type Who,
} from '../battle/frames';
import { CoachReview, CoachTip, CoachWarning } from '../battle/ui/Coach';
import { ControlPanel, type Mark } from '../battle/ui/Controls';
import { Field, type Anim, type Float, type Stage } from '../battle/ui/Field';
import { EXPLAINERS, explainer as explainerText, textLines } from '../battle/ui/labels';
import { MonPopover } from '../battle/ui/MonPopover';
import { Spotlight } from '../battle/ui/Spotlight';
import { GiveUpDialog, LogList, LogSheet, MenuSheet } from '../battle/ui/sheets';
import { BattleLog } from '../battle/ui/BattleLog';
import type { Settings } from '../state/schema';
import { likelyMoves, possibleSets, speciesInfo } from '../lib/data';
import { TypeChartSheet } from '../sheets/TypeChart';
import { streakLine, type DaySummary } from '../lib/results';
import { Button } from '../ui/bits';
import type { ShareGame, ShareModel } from '../lib/share';
import {
  battleSpeed,
  foeSpeed,
  lessonMoves,
  lessonSet,
  showdownNow,
  type SpeedCheck,
} from '../lib/speed';
import { ShareButton, TryRows } from '../ui/results';
import { ChevronIcon, CloseIcon, InfoIcon } from '../ui/icons';
import { CoachBadge, DifficultyBadge } from '../ui/Difficulty';
import { OtherGames, useNextGame } from '../ui/OtherGames';
import { ConfirmDialog } from '../sheets/misc';
import { useWide } from '../ui/useWide';

/** Milliseconds per battle line ('instant' is for automated tests only). */
const DELAY: Record<Settings['battleSpeed'], number> = {
  slow: 1150,
  normal: 800,
  fast: 450,
  instant: 0,
};
const SPEEDS: Settings['battleSpeed'][] = ['slow', 'normal', 'fast'];
/** A daily foe still choosing after this long gets a "thinking" note. */
const THINKING_MS = 300;
/** How long the coach may check a pick before it goes through unwarned (DESIGN.md §22). */
const COACH_CHECK_MS = 1000;
/** A coach check still going after this long gets a "checking" note. */
const CHECKING_MS = 150;
/** How much faster than Showdown's own pace its move animations run at each speed. */
const ACCEL: Record<Settings['battleSpeed'], number> = {
  slow: 1,
  normal: 1.4,
  fast: 3,
  instant: 3,
};

/** Today's result, recomputed from saved attempts as each battle ends. */
export interface DayResult {
  summary: DaySummary;
  streak: number;
  /** What sharing today says (as text or the image card). */
  /** This game's share: every difficulty played today. */
  share: ShareModel | ShareGame;
  /** This battle's attempt. */
  ts: number;
  /** After a win: the offer to protect the player's name with a password (ProtectCard). */
  protect?: ReactNode;
}

/** A battle against a friend (versus rooms, DESIGN.md §18) instead of the day's opponent. */
export interface LiveOptions {
  /** The end card's contents, in place of the daily result. */
  renderEnd: (end: NonNullable<TurnPackage['end']>, gaveUp: boolean) => ReactNode;
  /** Shown over the field while the foe chooses. */
  waiting: string;
  /** What giving up means here. */
  giveUpBody: string;
  /** The way out, e.g. "Back to the room". */
  exitLabel: string;
}

/**
 * A staged turn (DESIGN.md §22): the battle frozen at a decision, with choices
 * tagged on the controls and a coach card, then one turn played as scripted.
 * The coach's review shows past turns this way, and lessons show their demos
 * and practice answers this way.
 */
export interface StagedTurn {
  /**
   * The choice the turn plays. Left out, the player picks it on the controls
   * (a lesson's practice), and `onPick` hears which.
   */
  choice?: string;
  onPick?: (choice: string) => void;
  /** After the turn, offer "Again" (on unless false). */
  again?: boolean;
  /** After the turn, the buttons go in a row under the text (for two or more), not beside it. */
  stack?: boolean;
  /** Tags on the controls; the other choices fade. */
  marks?: Record<string, Mark>;
  /** The top bar's contents. */
  header: ReactNode;
  /** The coach card: its words before the turn plays, and after (the same if left out). */
  before: ReactNode;
  after?: ReactNode;
  /** The card's accessible name. */
  label: string;
  /** Parts of the screen to point at before the turn and after it (`data-spot` keys, Spotlight.tsx). */
  spotlight?: {
    before?: readonly string[];
    after?: readonly string[];
    /** Before the turn: lit without a ring (a practice's answers, the info spots ringed in `before`). */
    lit?: readonly string[];
  };
  /** The play button's label before the turn. */
  playLabel?: string;
  /** After the turn, beside "Again": the way on (a lesson's Next). */
  next?: ReactNode;
  /** Show the turn again from the decision. */
  onReplay: () => void;
  /**
   * Details open from the start (a lesson pointing at them): the foe's card
   * (`foe`), or a choice's (`move 2`: the move's details; `switch 2`: the
   * teammate's card).
   */
  card?: string;
  /** No turn to play: `next` shows at once (a lesson's look at the position). */
  look?: boolean;
  /**
   * The player plays the turn by tapping `choice` itself (a lesson demo): the
   * other choices are off, and there's no play button.
   */
  tap?: boolean;
}

/** The first-battle tour (DESIGN.md §22): one step per control a new player might miss. */
const TOUR: { spots: string[]; text: string }[] = [
  { spots: ['your-moves'], text: 'Tap a move to use it. Press and hold one to see what it does.' },
  {
    spots: ['your-team'],
    text: 'Your team. Tap a Pokémon to see its moves and stats, or to switch to it.',
  },
  { spots: ['foe-plate'], text: 'Tap the foe to see its ability, base stats, and Speed.' },
];

export interface BattleOutcome {
  result: 'win' | 'loss' | 'forfeit';
  remaining: number;
}

export function Battle({
  start,
  tryNumber,
  settings,
  onSetting,
  onExplainerSeen,
  onChoice,
  onEnd,
  onExit,
  onDayDone,
  onRunItBack,
  onChangeTeam,
  topBarRight,
  background,
  result,
  live,
  prompt,
  coach: dailyCoach,
  staged,
}: {
  /** Show one staged turn instead of playing (see `StagedTurn`). */
  staged?: StagedTurn;
  /**
   * The daily coach (DESIGN.md §22), where it's offered: on, or a switch in the
   * menu to turn it on (after `warning`, what it costs, if anything).
   */
  coach?: { on: boolean; warning: string | null; onTurnOn: () => void };
  /** The day's result, for the end card (daily battles). */
  result?: DayResult;
  live?: LiveOptions;
  start: EngineStart;
  /** The day's battle background image URL. */
  background: string;
  /** 1 for the day's first (scored) try. */
  tryNumber?: number;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onExplainerSeen: (id: string) => void;
  /** A choice the engine accepted (and Hard's new AI choices); saved so the battle can resume. */
  /** A choice was made: save it, with the AI's new choices (Hard) and the coach's memo. */
  onChoice: (choice: string, ai?: AiChoices, memo?: CoachMemo) => void;
  onEnd: (outcome: BattleOutcome) => void;
  onExit: () => void;
  /** Once the day is decided with every game done ("Done for today"): the game picker. */
  onDayDone?: () => void;
  onRunItBack?: () => void;
  /** After a loss: back to the brief with the team open for changes. */
  onChangeTeam?: () => void;
  topBarRight?: ReactNode;
  /** Learn mode: a lesson's callout for the turn about to be chosen. */
  prompt?: (turn: number) => string | undefined;
}) {
  const wide = useWide();
  const createBackend = useBattleBackend();
  const backend = useMemo(() => createBackend(), [createBackend]);
  const reducedMotion = useMemo(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const animate = settings.animations && !reducedMotion;

  const [view, setView] = useState<View | null>(null);
  const [log, setLog] = useState<string[]>([]);
  // Bumped on a new turn or a skip: the battle text follows the newest line again.
  const [follow, setFollow] = useState(0);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [controls, setControls] = useState<Controls | null>(null);
  const [playing, setPlaying] = useState(true);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [end, setEnd] = useState<TurnPackage['end']>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainer, setExplainer] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const [coachAsk, setCoachAsk] = useState<string | null>(null);
  const [monFor, setMonFor] = useState<Who | null>(staged?.card === 'foe' ? 'foe' : null);
  const [tourAt, setTourAt] = useState(0);
  // A foe team icon tapped: its card shows instead of the active foe's.
  const [foePick, setFoePick] = useState<string | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  // Showdown's move animations, loaded on demand when animations are on.
  const [anims, setAnims] = useState<typeof AnimPlay | null>(null);
  // A daily foe taking a while to choose (Hard's search): say so.
  const [thinking, setThinking] = useState(false);
  const nextGame = useNextGame();
  const thinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Hard: AI choices not saved yet (they go with your next choice). */
  const unsavedAi = useRef<AiChoices | undefined>(undefined);
  // The coach (when on): this turn's tip and warnings, a choice awaiting
  // confirmation, rules silenced for this battle, and the end-of-battle review.
  const [coach, setCoach] = useState<TurnPackage['coach'] | null>(null);
  // A pick the coach is checking (controls held), and whether to say so yet.
  const [checking, setChecking] = useState(false);
  const [checkingNote, setCheckingNote] = useState(false);
  const [tipHidden, setTipHidden] = useState(false);
  const [warning, setWarning] = useState<{ choice: string; note: CoachNote } | null>(null);
  // A review turn being replayed (its index in the review's turns).
  const [replayAt, setReplayAt] = useState<number | null>(null);
  const replayTurn = useCallback(
    (decision: number) => backend.replay?.(decision) ?? Promise.resolve(null),
    [backend],
  );
  const silenced = useRef(new Set<string>());
  // A battle played without the coach (Gen 3 dailies) can still be reviewed
  // once it's over, on request: the coach judges its choices then.
  const canReview =
    !start.coach &&
    !live &&
    !start.tutorial &&
    !staged &&
    (start.format ?? DEFAULT_FORMAT) === 'gen3ou' &&
    // Not against Hard: its warnings aren't checked there yet (step 5).
    start.difficulty !== 'hard' &&
    !!backend.review;
  const [reviewProgress, setReviewProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const startReview = () => {
    setReviewProgress({ done: 0, total: 0 });
    backend.review!((done, total) => setReviewProgress({ done, total })).then(
      (r) => {
        setReview(r);
        setReviewProgress(null);
      },
      () => setReviewProgress(null),
    );
  };
  const [review, setReview] = useState<Review | null>(null);
  // Review mode: the decision's controls (kept, marked, while and after the turn
  // plays), and whether the turn has been played.
  const [decision, setDecision] = useState<{ controls: Controls; team: TeamMember[] } | null>(null);
  const [played, setPlayed] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ frames: Frame[]; index: number; pkg: TurnPackage } | null>(null);
  const animKey = useRef(0);
  const stageRef = useRef<Stage | null>(null);
  const animsRef = useRef<typeof AnimPlay | null>(null);
  const running = useRef<AnimPlay.Running | null>(null);
  const explainerQueue = useRef<string[]>([]);
  // Latest props, read from callbacks so they never need to re-create (which
  // would restart the battle effect below).
  const settingsRef = useRef(settings);
  const animateRef = useRef(animate);
  const onEndRef = useRef(onEnd);
  const onChoiceRef = useRef(onChoice);
  const format = start.format ?? DEFAULT_FORMAT;
  const formatRef = useRef(format);
  useLayoutEffect(() => {
    formatRef.current = format;
    settingsRef.current = settings;
    animateRef.current = animate;
    onEndRef.current = onEnd;
    onChoiceRef.current = onChoice;
  });
  const ended = useRef(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // The generation's battle music, from the start of the battle to its end.
  const reviewing = !!staged;
  useEffect(() => {
    if (reviewing) return;
    startMusic(format);
    return () => stopMusic();
  }, [format, reviewing]);
  useEffect(() => {
    if (end) stopMusic();
  }, [end]);
  // Move focus to the result so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (end) endRef.current?.focus();
  }, [end]);

  /** Applies a frame; returns how long its move animation needs (0 if none). */
  const applyFrame = useCallback((f: Frame, withAnim: boolean) => {
    setView(f.view);
    const lines = textLines(f.text);
    if (lines.length) setLog((l) => [...l, ...lines]);
    if (withAnim && f.event)
      setAnim({ kind: f.event.kind, who: f.event.who, key: ++animKey.current });
    // Cries, as on Showdown: on the way in, Mega Evolving, and lower as it faints.
    // Only for turns that play out (not skipped, resumed, or instant).
    const mon = withAnim && f.event?.who ? f.view[f.event.who] : null;
    if (mon && (f.event!.kind === 'switch' || f.event!.kind === 'mega')) {
      playCry(mon.species, formatRef.current);
    } else if (mon && f.event!.kind === 'faint') {
      playCry(mon.species, formatRef.current, { faint: true });
    }
    if (withAnim && animateRef.current && (f.label || f.popup)) {
      const float = { id: ++animKey.current, label: f.label, popup: f.popup };
      // A few at a time is plenty; drop the oldest if animations stall.
      setFloats((fs) => [...fs.slice(-5), float]);
    }
    const init = withAnim && f.event && animateRef.current ? stageRef.current?.() : null;
    const play = animsRef.current;
    if (!init || !play || !f.event) return 0;
    const full = { ...init, accel: ACCEL[settingsRef.current.battleSpeed] };
    const run =
      play.playMove(full, f.event) ??
      play.playStatus(full, f.event) ??
      play.playMega(full, f.event);
    if (!run) return 0;
    running.current = run;
    return run.duration;
  }, []);
  const floatDone = useCallback(
    (id: number) => setFloats((fs) => fs.filter((f) => f.id !== id)),
    [],
  );

  const finish = useCallback((pkg: TurnPackage) => {
    pending.current = null;
    running.current?.cancel();
    setTeam(pkg.team);
    setControls(pkg.controls);
    setDecision((d) => d ?? (pkg.controls && { controls: pkg.controls, team: pkg.team }));
    setCoach(pkg.coach ?? null);
    setTipHidden(false);
    if (pkg.review) setReview(pkg.review);
    setPlaying(false);
    setAnim(null);
    if (settingsRef.current.beginnerHints) {
      for (const id of pkg.explainers) {
        if (EXPLAINERS[id] && !settingsRef.current.shownExplainers.includes(id)) {
          if (!explainerQueue.current.includes(id)) explainerQueue.current.push(id);
        }
      }
      setExplainer((cur) => cur ?? explainerQueue.current[0] ?? null);
    }
    if (pkg.end && !ended.current) {
      ended.current = true;
      setEnd(pkg.end);
      onEndRef.current({
        result: pkg.end.winner === 'you' ? 'win' : 'loss',
        remaining: pkg.end.youLeft,
      });
    }
  }, []);

  const skip = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    setFollow((n) => n + 1);
    if (timer.current) clearTimeout(timer.current);
    running.current?.cancel();
    setFloats([]); // labels from a skipped turn shouldn't linger
    for (let i = p.index; i < p.frames.length; i++) applyFrame(p.frames[i]!, false);
    finish(p.pkg);
  }, [applyFrame, finish]);

  const play = useCallback(
    (pkg: TurnPackage) => {
      setPlaying(true);
      setFollow((n) => n + 1);
      setControls(null);
      const delay = pkg.resumed ? 0 : DELAY[settingsRef.current.battleSpeed];
      if (!delay || !pkg.frames.length) {
        for (const f of pkg.frames) applyFrame(f, false);
        finish(pkg);
        return;
      }
      pending.current = { frames: pkg.frames, index: 0, pkg };
      const step = () => {
        const p = pending.current;
        if (!p) return;
        if (p.index >= p.frames.length) return finish(p.pkg);
        const f = p.frames[p.index++]!;
        running.current?.cancel();
        const extra = applyFrame(f, true);
        // Silent lines (no text) pass quickly; the new-turn banner gets a short beat.
        const d = !f.text ? delay / 4 : f.event?.kind === 'turn' ? delay / 2 : delay;
        timer.current = setTimeout(step, Math.max(d, extra ? extra + 80 : 0));
      };
      step();
    },
    [applyFrame, finish],
  );

  // Start (or resume) the battle once.
  useEffect(() => {
    let cancelled = false;
    const loaded = animateRef.current
      ? import('../battle/anim/play').catch(() => null)
      : Promise.resolve(null);
    Promise.all([backend.start(start), loaded]).then(
      ([pkg, mod]) => {
        if (cancelled) return;
        unsavedAi.current = pkg.aiChoices;
        animsRef.current = mod;
        setAnims(mod);
        play(pkg);
      },
      (e: unknown) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
      running.current?.cancel();
    };
  }, [backend, start, play]);

  // A coach tip that waited for the judge arrives late, while you choose.
  useEffect(
    () => backend.onCoachTip?.((note) => setCoach((c) => (c && !c.tip ? { ...c, tip: note } : c))),
    [backend],
  );

  // A live foe's turn (or the end) can arrive while it's your move or between turns.
  useEffect(
    () =>
      backend.subscribe?.((pkg) => {
        if (pending.current) skip();
        play(pkg);
      }),
    [backend, play, skip],
  );

  const choose = useCallback(
    (choice: string) => {
      setControls(null);
      setCoach(null);
      setPlaying(true);
      if (thinkTimer.current) clearTimeout(thinkTimer.current);
      thinkTimer.current = setTimeout(() => setThinking(true), THINKING_MS);
      const settle = () => {
        if (thinkTimer.current) clearTimeout(thinkTimer.current);
        thinkTimer.current = null;
        setThinking(false);
      };
      backend.choose(choice).then(
        (pkg) => {
          settle();
          const ai = mergeAiChoices(unsavedAi.current, pkg.aiChoices);
          unsavedAi.current = undefined;
          if (pkg.coachMemo) onChoiceRef.current(choice, ai, pkg.coachMemo);
          else if (ai) onChoiceRef.current(choice, ai);
          else onChoiceRef.current(choice);
          play(pkg);
        },
        (e: unknown) => {
          settle();
          setError(String(e));
        },
      );
    },
    [backend, play],
  );

  // The coach checks a choice first; a flagged one asks before it's sent. If
  // the check takes too long, the choice goes through unwarned.
  const pick = (choice: string) => {
    if (staged) {
      // A demo: tapping its choice plays the turn.
      if (staged.tap) {
        if (choice !== staged.choice || played) return;
        setPlayed(true);
        return choose(choice);
      }
      // Practice: the player's pick plays the turn.
      if (staged.choice !== undefined || played) return;
      setPlayed(true);
      staged.onPick?.(choice);
      return choose(choice);
    }
    if (!coach || !backend.coachCheck) return choose(choice);
    setChecking(true);
    const slow = setTimeout(() => setCheckingNote(true), CHECKING_MS);
    const done = (note: CoachNote | null) => {
      clearTimeout(slow);
      setChecking(false);
      setCheckingNote(false);
      if (note && !silenced.current.has(note.rule)) setWarning({ choice, note });
      else choose(choice);
    };
    backend.coachCheck(choice, COACH_CHECK_MS).then(done, () => done(null));
  };

  const giveUp = () => {
    setGiveUpOpen(false);
    setMenuOpen(false);
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    backend.forfeit().then(
      (pkg) => {
        for (const f of pkg.frames) applyFrame(f, false);
        if (!ended.current) {
          ended.current = true;
          setGaveUp(true);
          setEnd(pkg.end);
          onEndRef.current({ result: 'forfeit', remaining: pkg.end?.youLeft ?? 0 });
        }
        setControls(null);
        setPlaying(false);
      },
      (e: unknown) => setError(String(e)),
    );
  };

  const dismissExplainer = () => {
    if (explainer) onExplainerSeen(explainer);
    explainerQueue.current = explainerQueue.current.filter((id) => id !== explainer);
    setExplainer(explainerQueue.current[0] ?? null);
  };

  const cycleSpeed = () =>
    onSetting('battleSpeed', SPEEDS[(SPEEDS.indexOf(settings.battleSpeed) + 1) % SPEEDS.length]!);
  // Keyboard users skip playback with Space, Enter, or Escape (the tap-to-skip).
  useEffect(() => {
    if (!playing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'Escape') return;
      if ((e.target as Element | null)?.closest?.('[role="dialog"]')) return;
      skip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, skip]);

  // Keyboard play on a computer: 1–4 pick a move, Q W E R T Y your Pokémon in team order
  // (the battle menu lists them). Only while you can choose, and never while typing.
  useEffect(() => {
    if (playing || end) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as Element | null;
      if (target?.closest?.('input, textarea, select, [role="dialog"]')) return;
      const root = rootRef.current;
      if (!root) return;
      const move = '1234'.indexOf(e.key);
      const mon = 'qwerty'.indexOf(e.key.toLowerCase());
      const button =
        move >= 0
          ? root.querySelectorAll<HTMLButtonElement>('main button[aria-label*=" PP"]')[move]
          : mon >= 0
            ? root.querySelectorAll<HTMLButtonElement>('main [data-bench]')[mon]
            : undefined;
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      if (button.hasAttribute('aria-current')) return;
      e.preventDefault();
      button.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playing, end]);

  // During playback a tap anywhere in the battle area skips, not just on the field or log:
  // empty space included. Controls, and the field and log (which skip on their own), don't.
  const tapToSkip = (e: React.MouseEvent) => {
    if (!playing) return;
    const target = e.target as Element;
    if (target.closest('button, a, input, select, textarea, [role="dialog"], [data-taps]')) return;
    skip();
  };

  const showExplainer = explainer && settings.beginnerHints && !end;

  // The hint leaves on its own after a few seconds (and slides back up next time).
  const dismissRef = useRef(dismissExplainer);
  useEffect(() => {
    dismissRef.current = dismissExplainer;
  });
  useEffect(() => {
    if (!showExplainer) return;
    const id = setTimeout(() => dismissRef.current(), 7000);
    return () => clearTimeout(id);
  }, [explainer, showExplainer]);
  const active = team.find((m) => m.active);

  // The log, newest at the bottom: a few lines on phones (the current turn), a
  // full-height panel on wide screens. During playback a tap skips.
  // Wide screens keep a full log column beside the field.
  const turnLog = (
    <div
      role="log"
      aria-label="Battle log"
      data-taps
      onClick={() => playing && skip()}
      className="card relative flex min-h-0 flex-1 basis-0 flex-col p-4"
    >
      <p className="display mb-2 text-[12px] tracking-wider text-muted uppercase">Battle log</p>
      {log.length ? (
        // A computer's log: a touch larger than the rest, it's read a lot.
        <LogList lines={log} className="min-h-0 flex-1 !text-[15px] leading-[1.5]" />
      ) : (
        <span className="text-[15px] text-muted">The battle is starting…</span>
      )}
    </div>
  );

  // The battle text on phones: the turn just played, in a pixel-font box under the
  // field that takes the spare height (see battle/ui/BattleLog.tsx).
  const gen = formatInfo(format).gen;
  const textbox = (
    <div data-spot="log" data-taps className="flex min-h-[3.25rem] flex-1 basis-0 flex-col">
      <BattleLog
        log={log}
        follow={follow}
        onClick={() => playing && skip()}
        className="min-h-[3.25rem] flex-1 basis-0"
      />
    </div>
  );

  // The foe whose card is open: the one in battle, or one tapped in its team row.
  const picked =
    foePick && foePick !== (view?.foe?.base ?? view?.foe?.species)
      ? view?.foeTeam.find((m) => m.species === foePick)
      : undefined;
  const shownFoe: MonView | null = picked
    ? {
        species: picked.species!,
        hp: picked.fainted ? 0 : (picked.hp ?? 100),
        status: picked.status,
        boosts: {},
        substitute: false,
        fainted: picked.fainted,
      }
    : (view?.foe ?? null);
  // A lesson's foe is fixed content: its set is known, so its Speed is exact.
  const foeSpecies = shownFoe ? (shownFoe.base ?? shownFoe.species) : '';
  const lessonFoe = start.tutorial
    ? (start.opponentTeam as Mon[]).find((m) => m.species === foeSpecies)
    : undefined;
  const hinted = settings.beginnerHints || !!lessonFoe || !!staged?.card;
  // What it likely has but hasn't shown: with beginner hints, and in lessons.
  const likely =
    shownFoe && hinted
      ? likelyMoves(
          lessonFoe
            ? [{ moves: lessonMoves(lessonFoe), weight: 1 }]
            : possibleSets(foeSpecies, view?.revealed[foeSpecies]),
          view?.revealed[foeSpecies]?.moves ?? [],
        )
      : undefined;
  // Who moves first: always shown (its Speed, and yours against it), hints or not.
  // As on Showdown, the card shows the whole range a species' Speed can take;
  // Beginner hints narrow the comparison to the sets this game has for it.
  const revealedFoe = view?.revealed[foeSpecies];
  const foeSets = !shownFoe || lessonFoe || !hinted ? [] : possibleSets(foeSpecies, revealedFoe);
  const speedCheck: SpeedCheck | undefined =
    view && shownFoe
      ? {
          ...foeSpeed(shownFoe.species, lessonFoe ? [lessonSet(lessonFoe)] : foeSets, {
            boost: shownFoe.boosts.spe,
            status: shownFoe.status,
            weather: view.weather,
            ...(revealedFoe?.item && { item: revealedFoe.item }),
            ...(revealedFoe?.ability && { ability: revealedFoe.ability }),
          }),
          ...(!lessonFoe && {
            ...showdownNow(
              speciesInfo(shownFoe.species).baseStats.spe,
              shownFoe.boosts.spe,
              shownFoe.status,
            ),
            fromSets: foeSets.length > 0,
          }),
          ...(active?.stats.spe && view.you
            ? {
                mine: {
                  species: view.you.species,
                  speed: battleSpeed(active.stats.spe, {
                    boost: view.you.boosts.spe,
                    status: view.you.status,
                    item: active.item,
                    ability: active.ability,
                    weather: view.weather,
                  }),
                },
              }
            : {}),
        }
      : undefined;

  const popover =
    monFor === 'foe' && view && shownFoe ? (
      <MonPopover
        foe
        mon={shownFoe}
        // Not in battle: its HP isn't on a plate, so the card has it.
        benched={!!picked}
        revealed={view.revealed[foeSpecies]}
        hints={settings.beginnerHints}
        {...(speedCheck && { speed: speedCheck })}
        {...(likely?.length && { likely })}
        // The card sits above the spotlight, so it rings its own parts.
        {...(staged && !played && { pointAt: staged.spotlight?.before ?? [] })}
      />
    ) : monFor === 'you' && active ? (
      <MonPopover foe={false} member={active} mon={view?.you} />
    ) : null;

  const explainerNote = showExplainer && (
    <div
      role="note"
      // Slides up over the bottom of the field when a mechanic first appears, then
      // leaves; it takes no room of its own.
      className="animate-sheet-in absolute inset-x-2 bottom-2 z-20 flex items-start gap-2 rounded-card bg-accent-soft px-3 py-2 text-[13px] shadow-card"
    >
      <InfoIcon width={16} height={16} className="mt-0.5 shrink-0 text-soft-ink" />
      <span className="flex-1">{explainerText(explainer!, gen)}</span>
      <button
        type="button"
        onClick={dismissExplainer}
        aria-label="Got it"
        className="-m-1 p-1 text-soft-ink"
      >
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );

  // A live battle: your choice is in, and the foe hasn't made theirs.
  // It sits over the (dimmed) controls, where your next choice will appear.
  // A daily foe that takes a moment (Hard) gets the same note.
  const waitingText = live ? live.waiting : thinking ? 'The opponent is thinking…' : null;
  const waitingNote = waitingText && !end && !controls && view && (live ? !playing : true) && (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <p
        role="status"
        className="rounded-full bg-ink px-4 py-1.5 text-[14px] font-semibold text-surface shadow-card"
      >
        {waitingText}
      </p>
    </div>
  );

  const field = (
    <div data-taps className={clsx('relative w-full', wide ? 'shrink-0' : 'shrink')}>
      <Field
        // Wide screens keep the scene's own shape. Phones get a taller field, which zooms
        // the scene a little (--s covers it) so it reads bigger.
        className={clsx('w-full', wide ? 'aspect-[440/295]' : 'aspect-[440/335]')}
        view={view}
        anim={anim}
        animate={animate}
        stageRef={stageRef}
        ported={anims !== null && animate}
        background={background}
        floats={floats}
        onFloatDone={floatDone}
        onTap={skip}
        info={monFor}
        onInfo={(who) => {
          setFoePick(null);
          setMonFor(who);
        }}
        onPick={(species) => {
          // A second tap on the same one closes it.
          const open = monFor === 'foe' && foePick === species;
          setFoePick(open ? null : species);
          setMonFor(open ? null : 'foe');
        }}
        busy={playing}
        popover={popover}
      />
      {explainerNote}
    </div>
  );

  // Shown once the turn's playback is over, while you choose.
  const promptText =
    prompt && view && controls && !end ? prompt(Math.max(1, view.turn)) : undefined;
  const promptNote = promptText && (
    <p
      role="note"
      aria-label="Lesson tip"
      className="animate-fade-in flex items-start gap-2 rounded-card bg-accent-soft px-3 py-2 text-[14px] leading-snug"
    >
      <span aria-hidden>🎓</span>
      <span className="flex-1">{promptText}</span>
    </p>
  );

  // A demo the player taps through: only its choice is on. Kept as one object
  // while the decision stands: a tapped bench card belongs to the controls it
  // opened on, so a new object each render would close it.
  const decisionControls = decision?.controls;
  const tapChoice = staged?.tap && !played ? staged.choice : undefined;
  const tapControls = useMemo(
    () =>
      tapChoice !== undefined && decisionControls
        ? {
            ...decisionControls,
            moves: decisionControls.moves.map((m) => ({
              ...m,
              disabled: m.disabled || m.choice !== tapChoice,
            })),
            switches: decisionControls.switches.filter((s) => s.choice === tapChoice),
          }
        : null,
    [tapChoice, decisionControls],
  );
  // Once a staged turn has played and brought in another Pokémon (a switch),
  // the panel shows it: its moves, and the tags on it rather than on a slot.
  const switchedIn =
    staged &&
    played &&
    !playing &&
    controls?.kind === 'move' &&
    decision &&
    active &&
    decision.team.find((m) => m.active)?.species !== active.species;
  const stagedControls = switchedIn ? controls : (tapControls ?? decision?.controls ?? null);
  const stagedTeam = switchedIn ? team : (decision?.team ?? team);
  const stagedMarks =
    staged?.marks && switchedIn ? marksBySpecies(staged.marks, decision!) : staged?.marks;
  const controlPanel = staged ? (
    <ControlPanel
      controls={stagedControls}
      team={stagedTeam}
      hints={settings.beginnerHints}
      disabled={playing}
      onChoose={pick}
      // Its details cards open above the coach's note (the panel below), not over it.
      cardsAbove
      {...(staged.card && staged.card !== 'foe' && !played && { show: staged.card })}
      // Practice: the controls work until the player picks; then the tags show. A turn the
      // player taps through shows them once it's played.
      {...(stagedMarks &&
        (staged.tap ? played : staged.choice !== undefined || played) && { marks: stagedMarks })}
    />
  ) : (
    <ControlPanel
      controls={controls}
      team={team}
      hints={settings.beginnerHints}
      disabled={playing || !!end || checking}
      onChoose={pick}
    />
  );
  // A staged turn: what the coach says, and the way to play the turn.
  const stagedNote = staged && (
    <div
      role="note"
      aria-label={staged.label}
      data-spot="coach"
      className={clsx(
        'animate-fade-in flex gap-2 rounded-card bg-accent-soft px-3 py-2 text-[14px] leading-snug',
        // Several buttons go under the text; one sits beside it, so the card stays short.
        staged.stack && played && !playing ? 'flex-col' : 'items-center',
      )}
    >
      <div className="min-w-0 flex-1">
        {played && !playing ? (staged.after ?? staged.before) : staged.before}
      </div>
      {!playing && (
        // Side by side, so the card is only as tall as its text.
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {played
            ? staged.again !== false && (
                <button
                  type="button"
                  aria-label="Again"
                  title="Again"
                  onClick={staged.onReplay}
                  className="btn btn-secondary grid size-9 place-items-center p-0 text-[17px]"
                >
                  <span aria-hidden>↺</span>
                </button>
              )
            : !staged.tap &&
              staged.choice !== undefined && (
                <Button
                  className="h-9 px-3 text-[13.5px]"
                  onClick={() => {
                    setPlayed(true);
                    choose(staged.choice!);
                  }}
                >
                  {staged.playLabel ?? '▶ Play'}
                </Button>
              )}
          {(played || staged.look) && staged.next}
        </div>
      )}
    </div>
  );
  // The first-battle tour, once: where the moves, your team, and the foe's card are.
  const touring =
    !start.tutorial &&
    !staged &&
    !live &&
    !settings.shownExplainers.includes('tour') &&
    tourAt < TOUR.length &&
    !!controls &&
    controls.kind === 'move' &&
    !playing &&
    !end;
  const endTour = () => {
    setTourAt(TOUR.length);
    onExplainerSeen('tour');
  };
  const tourNote = touring && (
    <div
      role="note"
      aria-label="Tour"
      data-spot="tour"
      className="animate-fade-in flex items-center gap-2 rounded-card bg-accent-soft px-3 py-2 text-[14px] leading-snug"
    >
      <p className="min-w-0 flex-1">
        <span className="text-[12px] font-semibold text-muted tabular-nums">
          {tourAt + 1}/{TOUR.length}{' '}
        </span>
        {TOUR[tourAt]!.text}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        {tourAt < TOUR.length - 1 && (
          <Button variant="ghost" className="h-9 px-2 text-[13.5px]" onClick={endTour}>
            Skip
          </Button>
        )}
        <Button
          className="h-9 px-3 text-[13.5px]"
          onClick={() => (tourAt < TOUR.length - 1 ? setTourAt(tourAt + 1) : endTour())}
        >
          {tourAt < TOUR.length - 1 ? 'Next' : 'Got it'}
        </Button>
      </div>
    </div>
  );
  const lit = touring
    ? TOUR[tourAt]!.spots
    : !staged || playing
      ? []
      : ((played ? staged.spotlight?.after : staged.spotlight?.before) ?? []);
  // The coach's card and the top bar stay lit (unringed): they say what to look at, and how to go on.
  const spotlight = lit;
  const litPlain = touring || !staged || playing || played ? [] : (staged.spotlight?.lit ?? []);
  // One message at a time: the lesson's own prompt and a beginner hint both
  // come before a coach tip.
  const tip =
    !touring && !promptText && !showExplainer && controls && !end && !tipHidden
      ? coach?.tip
      : undefined;
  const coachChecking = checkingNote && (
    <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
      <p
        role="status"
        className="rounded-full bg-ink px-4 py-1.5 text-[14px] font-semibold text-surface shadow-card"
      >
        Coach is checking…
      </p>
    </div>
  );
  // The lesson's and coach's words: above the moves on phones, and on a computer at the
  // top of the right-hand column, next to the field, where there's room to read them.
  const notes = (
    <>
      {tourNote}
      {stagedNote}
      {promptNote}
      {tip && <CoachTip text={tip.text} onDismiss={() => setTipHidden(true)} />}
    </>
  );
  const panel = (
    <div className="relative flex shrink-0 flex-col gap-2">
      {!wide && notes}
      <div data-spot="controls">{controlPanel}</div>
      {waitingNote}
      {coachChecking}
    </div>
  );

  // Which of today's tries this battle was (known once its result is saved).
  const tryIndex = result ? result.summary.tries.findIndex((a) => a.ts === result.ts) + 1 : 0;
  const counts = !!result && tryIndex > 0 && tryIndex <= result.summary.counted.length;
  const firstTryWin = tryIndex === 1 && result?.summary.status === 'firstTry';
  const streakText = result && streakLine(result.summary, result.streak);
  const dailyEnd = (e: NonNullable<TurnPackage['end']>, r: DayResult) => (
    <>
      <p className="home-serif text-[26px] leading-tight">
        {gaveUp ? 'You gave up' : e.winner === 'you' ? 'You won' : 'You lost'}
      </p>
      <div className="mt-1 flex justify-center">
        {firstTryWin ? (
          <span className="flex items-center gap-1 rounded-badge bg-gold px-2 py-0.5 text-[13px] font-bold text-on-gold">
            ⭐ First try
          </span>
        ) : (
          <span className="h-5 text-[14px] text-muted">
            {tryIndex === 0 ? null : counts ? `Try ${tryIndex}` : 'Practice'}
          </span>
        )}
      </div>
      <div className="mt-3">
        <TryRows summary={r.summary} current={r.ts} />
      </div>
      {streakText && <p className="mt-2 text-[14px] font-semibold">{streakText}</p>}
      {e.winner === 'you' && !gaveUp && r.protect}
      <div className="mt-4 grid gap-2">
        <ShareButton share={r.share} />
        <div className="grid grid-cols-2 gap-2">
          {/* A real try goes back to the brief first: pick a lead, maybe use the change. */}
          <Button
            variant="secondary"
            onClick={r.summary.status === 'pending' ? onExit : onRunItBack}
          >
            {r.summary.status === 'pending' ? 'Try again' : 'Play again'}
          </Button>
          {r.summary.status === 'pending' ? (
            <Button variant="secondary" onClick={onChangeTeam}>
              Change team
            </Button>
          ) : nextGame ? (
            <Button variant="secondary" onClick={nextGame.play}>
              Play {nextGame.game.name}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onDayDone ?? onExit}>
              Done for today
            </Button>
          )}
        </div>
      </div>
      {/* Once the day's decided, the other games are one tap away. */}
      {r.summary.status !== 'pending' && <OtherGames className="mt-4 text-left" />}
    </>
  );
  const endCard = end && !staged && (
    <div className="end-card-wrap animate-fade-in absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
      <div
        ref={endRef}
        tabIndex={-1}
        className="end-card card animate-sheet-in max-h-full w-full max-w-sm overflow-y-auto p-5 pt-6 text-center outline-none"
        role="dialog"
        aria-label="Battle over"
      >
        {live ? live.renderEnd(end, gaveUp) : result && dailyEnd(end, result)}
        {review && !gaveUp && (
          <CoachReview review={review} {...(backend.replay && { onShow: setReplayAt })} />
        )}
        {review && !gaveUp && !review.key.length && !review.good.length && (
          <p className="mt-4 text-[14px] text-muted">The coach found nothing to point out.</p>
        )}
        {!review && !gaveUp && canReview && (
          <div className="mt-4">
            {reviewProgress ? (
              <p role="status" className="text-[14px] text-muted">
                The coach is reviewing your choices…
                {reviewProgress.total > 0 && ` ${reviewProgress.done} of ${reviewProgress.total}`}
              </p>
            ) : (
              <Button variant="secondary" className="w-full" onClick={startReview}>
                Review this battle
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
  const topBar = staged ? (
    <header
      data-spot="header"
      className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6"
    >
      {staged.header}
    </header>
  ) : (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
      <div className="flex items-center gap-2">
        <span className="display text-[16px] tabular-nums">
          {view ? `Turn ${Math.max(1, view.turn)}` : 'Battle'}
        </span>
        {/* A lesson's foe follows its script, whatever AI fills in. */}
        <DifficultyBadge difficulty={start.tutorial ? undefined : start.difficulty} />
        {dailyCoach?.on && <CoachBadge />}
      </div>
      <div className="flex items-center gap-1">
        {topBarRight}
        {/* Always in reach while the battle is on; it asks first, so a stray tap is safe. */}
        {!end && (
          <button
            type="button"
            onClick={() => setGiveUpOpen(true)}
            className="h-9 rounded-chip border border-line bg-surface px-3 text-[13px] font-semibold text-bad"
          >
            Forfeit
          </button>
        )}
        <button
          type="button"
          onClick={cycleSpeed}
          className="h-9 rounded-chip border border-line bg-surface px-3 text-[13px] font-semibold capitalize"
          aria-label={`Battle speed: ${settings.battleSpeed}. Change`}
        >
          {settings.battleSpeed} ⏩
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2"
          aria-label="Battle menu"
        >
          <span aria-hidden className="text-[20px] leading-none">
            ☰
          </span>
        </button>
      </div>
    </header>
  );

  if (error) {
    return (
      <div className="flex h-full flex-col">
        {topBar}
        <div className="grid flex-1 place-items-center p-6 text-center">
          <div className="space-y-3">
            <p className="text-[16px] font-semibold">Something went wrong in this battle.</p>
            <p className="text-[13px] text-muted">{error}</p>
            <Button variant="secondary" onClick={onExit}>
              {live?.exitLabel ?? 'Back to today'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="battle-ui relative flex h-full flex-col" data-gen={gen}>
      {topBar}
      <Spotlight
        root={rootRef}
        targets={spotlight}
        lit={litPlain}
        // While the player picks (practice), the controls stay lit too.
        keep={
          touring
            ? ['tour']
            : staged && staged.choice === undefined && !staged.look && !played
              ? ['coach', 'header', 'controls']
              : ['coach', 'header']
        }
      />
      {wide ? (
        // A size container: the stage (field + controls) and the log sit side by side,
        // the stage as wide as fits (up to a comfortable 960px) with room for the
        // controls below, and the log matching its height.
        <main
          className="battle-main relative flex min-h-0 flex-1 justify-center px-6 pb-6"
          onClick={tapToSkip}
        >
          <div className="flex min-h-0 items-stretch gap-5 self-start">
            <section className="battle-stage flex min-h-0 shrink-0 flex-col gap-2">
              {field}
              {panel}
            </section>
            <div className="flex w-[380px] shrink-0 flex-col gap-3">
              {notes}
              {turnLog}
            </div>
          </div>
          {endCard}
        </main>
      ) : (
        <main
          className="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          onClick={tapToSkip}
        >
          {field}
          {textbox}
          {panel}
          {endCard}
        </main>
      )}

      <LogSheet open={logOpen} onOpenChange={setLogOpen} lines={log} />
      <TypeChartSheet open={chartOpen} onOpenChange={setChartOpen} />
      <MenuSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        hints={settings.beginnerHints}
        animations={settings.animations}
        onHints={(v) => onSetting('beginnerHints', v)}
        onAnimations={(v) => onSetting('animations', v)}
        onLog={() => {
          setMenuOpen(false);
          setLogOpen(true);
        }}
        onChart={() => {
          setMenuOpen(false);
          setChartOpen(true);
        }}
        onLeave={onExit}
        {...(live && { leaveLabel: live.exitLabel })}
        onGiveUp={() => setGiveUpOpen(true)}
        canGiveUp={!end}
        {...(dailyCoach &&
          !end && {
            coach: {
              on: dailyCoach.on,
              onTurnOn: () => {
                if (dailyCoach.warning) return setCoachAsk(dailyCoach.warning);
                setMenuOpen(false);
                dailyCoach.onTurnOn();
              },
            },
          })}
      />
      <ConfirmDialog
        open={!!coachAsk}
        onOpenChange={(o) => !o && setCoachAsk(null)}
        title="Turn on the coach?"
        body={coachAsk ?? ''}
        confirm="Turn on"
        onConfirm={() => {
          setCoachAsk(null);
          setMenuOpen(false);
          dailyCoach?.onTurnOn();
        }}
      />
      {review && backend.replay && replayAt !== null && (
        <ReviewTurnScreen
          review={review}
          index={replayAt}
          load={replayTurn}
          battle={{ start, background, settings }}
          onIndex={setReplayAt}
          onClose={() => setReplayAt(null)}
        />
      )}
      <CoachWarning
        note={warning?.note ?? null}
        onPickAgain={() => setWarning(null)}
        onConfirm={(silence) => {
          if (!warning) return;
          if (silence) silenced.current.add(warning.note.rule);
          setWarning(null);
          choose(warning.choice);
        }}
      />
      <GiveUpDialog
        open={giveUpOpen}
        onOpenChange={setGiveUpOpen}
        onConfirm={giveUp}
        firstTry={tryNumber === 1}
        practice={!!result && !end && !['none', 'pending'].includes(result.summary.status)}
        body={live?.giveUpBody}
      />
    </div>
  );
}

const noop = () => {};

/**
 * A turn from the coach's review, on the battle screen in review mode, over
 * the finished battle. Each turn (and each "Watch again") starts fresh.
 */
function ReviewTurnScreen({
  review,
  index,
  load,
  battle,
  onIndex,
  onClose,
}: {
  review: Review;
  index: number;
  load: (decision: number) => Promise<TurnReplay | null>;
  battle: { start: EngineStart; background: string; settings: Settings };
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const turns = [...review.key, ...review.good];
  const turn = turns[index]!;
  const [round, setRound] = useState(0);
  const decision = turn.decision;
  const factory = useCallback(() => replayBackend(() => load(decision)), [load, decision]);
  const marks: Record<string, Mark> = {
    ...(turn.first ? { [turn.first]: 'first' as const } : {}),
    [turn.choice]: turn.top || turn.first ? 'you' : 'best',
    ...(turn.top ? { [turn.top]: 'better' as const } : {}),
  };
  const nav = (label: string, to: number, icon: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      disabled={to < 0 || to >= turns.length}
      onClick={() => onIndex(to)}
      className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2 disabled:opacity-30"
    >
      {icon}
    </button>
  );
  const header = (
    <>
      <span className="display text-[16px] tabular-nums">Review · Turn {turn.turn}</span>
      <div className="flex items-center gap-1">
        {nav(
          'Previous turn',
          index - 1,
          <ChevronIcon className="rotate-180" width={18} height={18} />,
        )}
        <span className="text-[13px] text-muted tabular-nums">
          {index + 1} of {turns.length}
        </span>
        {nav('Next turn', index + 1, <ChevronIcon width={18} height={18} />)}
        <button
          type="button"
          aria-label="Close review"
          onClick={onClose}
          className="grid size-10 place-items-center rounded-full text-muted hover:bg-surface-2"
        >
          <CloseIcon width={18} height={18} />
        </button>
      </div>
    </>
  );
  const note = (
    <p>
      {turn.better ? (
        <>
          <b>{turn.better}</b> was better.{' '}
        </>
      ) : null}
      <span className="text-soft-ink">{turn.text}</span>
    </p>
  );
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={`Review: turn ${turn.turn}`}
      className="fixed inset-0 z-50 bg-[var(--bg)]"
    >
      <BattleBackendContext.Provider value={factory}>
        <Battle
          key={`${index}:${round}`}
          start={battle.start}
          background={battle.background}
          // No beginner explainers over the review.
          settings={{ ...battle.settings, beginnerHints: false }}
          onSetting={noop}
          onExplainerSeen={noop}
          onChoice={noop}
          onEnd={noop}
          onExit={onClose}
          staged={{
            choice: turn.choice,
            marks,
            header,
            before: note,
            label: 'Coach review',
            onReplay: () => setRound((r) => r + 1),
          }}
        />
      </BattleBackendContext.Provider>
    </div>
  );
}

/**
 * A staged turn's tags once another Pokémon has come in: a switch's tag goes on
 * the Pokémon it brought in (`mon:Species`); the old one's move tags are dropped.
 */
function marksBySpecies(
  marks: Record<string, Mark>,
  decision: { controls: Controls; team: TeamMember[] },
): Record<string, Mark> {
  const out: Record<string, Mark> = {};
  for (const [choice, mark] of Object.entries(marks)) {
    const slot = decision.controls.switches.find((s) => s.choice === choice)?.slot;
    const species = decision.team.find((m) => m.slot === slot)?.species;
    if (species) out[`mon:${species}`] = mark;
  }
  return out;
}
