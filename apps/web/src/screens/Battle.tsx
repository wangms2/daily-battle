// The battle screen (DESIGN.md §12.2b): field, this-turn log, and controls on
// one screen; turns play back line by line at the chosen speed, tap to skip.
import { DEFAULT_FORMAT, formatInfo } from '@daily-battle/data/formats';
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
import { useBattleBackend } from '../battle/backend';
import type {
  Controls,
  EngineStart,
  Frame,
  TeamMember,
  TurnPackage,
  View,
  Who,
} from '../battle/frames';
import { ControlPanel } from '../battle/ui/Controls';
import { Field, type Anim, type Float, type Stage } from '../battle/ui/Field';
import { EXPLAINERS, textLines } from '../battle/ui/labels';
import { MonPopover } from '../battle/ui/MonPopover';
import { GiveUpDialog, LogList, LogSheet, MenuSheet } from '../battle/ui/sheets';
import { BattleText } from '../battle/ui/text';
import type { Settings } from '../state/schema';
import { streakLine, type DaySummary } from '../lib/results';
import { Button } from '../ui/bits';
import type { ShareModel } from '../lib/share';
import { ShareButton, TryRows } from '../ui/results';
import { CloseIcon, ExpandIcon, InfoIcon } from '../ui/icons';
import { useWide } from '../ui/useWide';

/** Milliseconds per battle line ('instant' is for automated tests only). */
const DELAY: Record<Settings['battleSpeed'], number> = {
  slow: 1150,
  normal: 800,
  fast: 450,
  instant: 0,
};
const SPEEDS: Settings['battleSpeed'][] = ['slow', 'normal', 'fast'];
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
  share: ShareModel;
  /** This battle's attempt. */
  ts: number;
}

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
  onRunItBack,
  topBarRight,
  background,
  result,
}: {
  result: DayResult;
  start: EngineStart;
  /** The day's battle background image URL. */
  background: string;
  /** 1 for the day's first (scored) try. */
  tryNumber: number;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onExplainerSeen: (id: string) => void;
  /** A choice the engine accepted; saved so the battle can resume. */
  onChoice: (choice: string) => void;
  onEnd: (outcome: BattleOutcome) => void;
  onExit: () => void;
  onRunItBack: () => void;
  topBarRight?: ReactNode;
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
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [controls, setControls] = useState<Controls | null>(null);
  const [playing, setPlaying] = useState(true);
  const [anim, setAnim] = useState<Anim | null>(null);
  const [end, setEnd] = useState<TurnPackage['end']>(null);
  const [gaveUp, setGaveUp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [explainer, setExplainer] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const [monFor, setMonFor] = useState<Who | null>(null);
  const [floats, setFloats] = useState<Float[]>([]);
  // Showdown's move animations, loaded on demand when animations are on.
  const [anims, setAnims] = useState<typeof AnimPlay | null>(null);

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
  useLayoutEffect(() => {
    settingsRef.current = settings;
    animateRef.current = animate;
    onEndRef.current = onEnd;
    onChoiceRef.current = onChoice;
  });
  const ended = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
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
    if (withAnim && animateRef.current && (f.label || f.popup)) {
      const float = { id: ++animKey.current, label: f.label, popup: f.popup };
      // A few at a time is plenty; drop the oldest if animations stall.
      setFloats((fs) => [...fs.slice(-5), float]);
    }
    const init = withAnim && f.event && animateRef.current ? stageRef.current?.() : null;
    const play = animsRef.current;
    if (!init || !play || !f.event) return 0;
    const full = { ...init, accel: ACCEL[settingsRef.current.battleSpeed] };
    const run = play.playMove(full, f.event) ?? play.playStatus(full, f.event);
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
    if (timer.current) clearTimeout(timer.current);
    running.current?.cancel();
    setFloats([]); // labels from a skipped turn shouldn't linger
    for (let i = p.index; i < p.frames.length; i++) applyFrame(p.frames[i]!, false);
    finish(p.pkg);
  }, [applyFrame, finish]);

  const play = useCallback(
    (pkg: TurnPackage) => {
      setPlaying(true);
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
        animsRef.current = mod;
        setAnims(mod);
        play(pkg);
      },
      (e: unknown) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
      running.current?.cancel();
    };
  }, [backend, start, play]);

  const choose = useCallback(
    (choice: string) => {
      setControls(null);
      setPlaying(true);
      backend.choose(choice).then(
        (pkg) => {
          onChoiceRef.current(choice);
          play(pkg);
        },
        (e: unknown) => setError(String(e)),
      );
    },
    [backend, play],
  );

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
      onClick={() => playing && skip()}
      className="card relative flex min-h-0 flex-1 basis-0 flex-col p-4"
    >
      <p className="display mb-2 text-[12px] tracking-wider text-muted uppercase">Battle log</p>
      {log.length ? (
        <LogList lines={log} className="min-h-0 flex-1 text-[13px] leading-[1.45]" />
      ) : (
        <span className="text-[13px] text-muted">The battle is starting…</span>
      )}
    </div>
  );

  // The battle text on phones: the latest lines in a pixel-font box under the field,
  // taking the spare height. Older lines fade.
  const recent = log.filter((l) => l.trim() && !l.startsWith('== Turn')).slice(-8);
  const gen = formatInfo(start.format ?? DEFAULT_FORMAT).gen;
  const textbox = (
    <div
      // It is the log on phones: the full history is read out, and a tap opens it.
      role="log"
      aria-label="Battle log"
      onClick={() => (playing ? skip() : setLogOpen(true))}
      className="battle-textbox relative min-h-[3.25rem] flex-1 basis-0"
    >
      {/* Newest first, laid out from the bottom up: a line that doesn't fit wraps into a
          second column that is clipped, so only whole lines show (no half-cut text). */}
      <div
        className="flex min-h-0 flex-1 flex-col-reverse flex-wrap content-start gap-1 overflow-hidden"
        aria-hidden
      >
        {recent.length ? (
          [...recent].reverse().map((l, i) => (
            <p key={log.length - i} className="w-full shrink-0">
              <BattleText text={l} />
            </p>
          ))
        ) : (
          <p className="w-full">The battle is starting…</p>
        )}
      </div>
      <div className="sr-only">
        {log.map((l, i) => (
          <p key={i}>
            <BattleText text={l} />
          </p>
        ))}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setLogOpen(true);
        }}
        className="absolute top-1 right-1 grid size-8 place-items-center rounded-full text-white/80 hover:bg-white/15"
        aria-label="Open the battle log"
      >
        <ExpandIcon width={16} height={16} />
      </button>
    </div>
  );

  const popover =
    monFor === 'foe' && view?.foe ? (
      <MonPopover
        foe
        mon={view.foe}
        revealed={view.revealed[view.foe.species]}
        hints={settings.beginnerHints}
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
      <span className="flex-1">{EXPLAINERS[explainer!]}</span>
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

  const field = (
    <div className={clsx('relative w-full', wide ? 'shrink-0' : 'shrink')}>
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
        onInfo={setMonFor}
        busy={playing}
        popover={popover}
      />
      {explainerNote}
    </div>
  );

  const panel = (
    <ControlPanel
      controls={controls}
      team={team}
      hints={settings.beginnerHints}
      disabled={playing || !!end}
      onChoose={choose}
    />
  );

  // Which of today's tries this battle was (known once its result is saved).
  const tryIndex = result.summary.tries.findIndex((a) => a.ts === result.ts) + 1;
  const counts = tryIndex > 0 && tryIndex <= result.summary.counted.length;
  const firstTryWin = tryIndex === 1 && result.summary.status === 'firstTry';
  const streakText = streakLine(result.summary, result.streak);
  const endCard = end && (
    <div className="animate-fade-in absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
      <div
        ref={endRef}
        tabIndex={-1}
        className="card animate-sheet-in w-full max-w-sm p-5 text-center outline-none"
        role="dialog"
        aria-label="Battle over"
      >
        <p className="display text-[22px]">
          {gaveUp ? 'You gave up' : end.winner === 'you' ? 'You won' : 'You lost'}
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
          <TryRows summary={result.summary} current={result.ts} />
        </div>
        {streakText && <p className="mt-2 text-[14px] font-semibold">{streakText}</p>}
        <div className="mt-4 grid gap-2">
          <ShareButton share={result.share} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onRunItBack}>
              {result.summary.status === 'pending' ? 'Try again' : 'Play again'}
            </Button>
            <Button variant="secondary" onClick={onExit}>
              Back to today
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const topBar = (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-3 pt-[env(safe-area-inset-top)] wide:px-6">
      <div className="display text-[16px] tabular-nums">
        {view ? `Turn ${Math.max(1, view.turn)}` : 'Battle'}
      </div>
      <div className="flex items-center gap-1">
        {topBarRight}
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
              Back to today
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-gen={gen}>
      {topBar}
      {wide ? (
        // A size container: the stage (field + controls) and the log sit side by side,
        // the stage as wide as fits (up to a comfortable 960px) with room for the
        // controls below, and the log matching its height.
        <main className="battle-main relative flex min-h-0 flex-1 justify-center px-6 pb-6">
          <div className="flex min-h-0 items-stretch gap-5 self-start">
            <section className="battle-stage flex min-h-0 shrink-0 flex-col gap-2">
              {field}
              {panel}
            </section>
            <div className="flex w-[380px] shrink-0 flex-col">{turnLog}</div>
          </div>
          {endCard}
        </main>
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {field}
          {textbox}
          {panel}
          {endCard}
        </main>
      )}

      <LogSheet open={logOpen} onOpenChange={setLogOpen} lines={log} />
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
        onLeave={onExit}
        onGiveUp={() => setGiveUpOpen(true)}
        canGiveUp={!end}
      />
      <GiveUpDialog
        open={giveUpOpen}
        onOpenChange={setGiveUpOpen}
        onConfirm={giveUp}
        firstTry={tryNumber === 1}
        practice={!end && !['none', 'pending'].includes(result.summary.status)}
      />
    </div>
  );
}
