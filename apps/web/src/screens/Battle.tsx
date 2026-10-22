// The battle screen (DESIGN.md §12.2b): field, this-turn log, and controls on
// one screen; turns play back line by line at the chosen speed, tap to skip.
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
import { Field, type Anim, type Float } from '../battle/ui/Field';
import { EXPLAINERS, textLines } from '../battle/ui/labels';
import { MonPopover } from '../battle/ui/MonPopover';
import { GiveUpDialog, LogList, LogSheet, MenuSheet } from '../battle/ui/sheets';
import type { Settings } from '../state/schema';
import { streakLine, type DaySummary } from '../lib/results';
import { Button } from '../ui/bits';
import { ShareButton, TryRows } from '../ui/results';
import { CloseIcon, ExpandIcon, InfoIcon } from '../ui/icons';
import { useWide } from '../ui/useWide';

const DELAY: Record<Settings['battleSpeed'], number> = { normal: 850, fast: 320, instant: 0 };
const SPEEDS: Settings['battleSpeed'][] = ['normal', 'fast', 'instant'];

/** Today's result, recomputed from saved attempts as each battle ends. */
export interface DayResult {
  summary: DaySummary;
  streak: number;
  /** The share text for today. */
  share: string;
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

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ frames: Frame[]; index: number; pkg: TurnPackage } | null>(null);
  const animKey = useRef(0);
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
  }, []);
  const floatDone = useCallback(
    (id: number) => setFloats((fs) => fs.filter((f) => f.id !== id)),
    [],
  );

  const finish = useCallback((pkg: TurnPackage) => {
    pending.current = null;
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
        applyFrame(f, true);
        // Silent lines (no text) pass quickly; the new-turn banner gets a short beat.
        const d = !f.text ? delay / 4 : f.event?.kind === 'turn' ? delay / 2 : delay;
        timer.current = setTimeout(step, d);
      };
      step();
    },
    [applyFrame, finish],
  );

  // Start (or resume) the battle once.
  useEffect(() => {
    let cancelled = false;
    backend.start(start).then(
      (pkg) => !cancelled && play(pkg),
      (e: unknown) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
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

  // A request with a single legal choice is sent for you after a short beat.
  useEffect(() => {
    if (playing || !controls?.only) return;
    const id = setTimeout(
      () => choose(controls.only!),
      settings.battleSpeed === 'instant' ? 0 : 500,
    );
    return () => clearTimeout(id);
  }, [playing, controls, choose, settings.battleSpeed]);

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

  const showExplainer = explainer && settings.beginnerHints && !end;
  const active = team.find((m) => m.active);

  // The log, newest at the bottom: a few lines on phones (the current turn), a
  // full-height panel on wide screens. During playback a tap skips.
  const turnLog = (
    <div
      role="log"
      aria-label="Battle log"
      onClick={() => (playing ? skip() : !wide && setLogOpen(true))}
      className={clsx(
        'card relative flex min-h-0 flex-col',
        wide ? 'p-4' : 'min-h-[5.75rem] flex-1 basis-0 py-1.5 pr-9 pl-3',
      )}
    >
      {wide && (
        <p className="display mb-2 text-[12px] tracking-wider text-muted uppercase">Battle log</p>
      )}
      {log.length ? (
        <LogList lines={log} className="min-h-0 flex-1 text-[13px] leading-[1.45]" />
      ) : (
        <span className="text-[13px] text-muted">The battle is starting…</span>
      )}
      {!wide && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setLogOpen(true);
          }}
          className="absolute top-1 right-1 grid size-8 place-items-center rounded-full text-muted hover:bg-surface-2"
          aria-label="Open the battle log"
        >
          <ExpandIcon width={16} height={16} />
        </button>
      )}
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

  const field = (
    <Field
      // Phones keep the scene's own shape so it never zooms in; the log gets the spare height.
      className={wide ? 'flex-1' : 'aspect-[440/295] w-full shrink'}
      view={view}
      anim={anim}
      animate={animate}
      background={background}
      floats={floats}
      onFloatDone={floatDone}
      onTap={skip}
      info={monFor}
      onInfo={setMonFor}
      popover={popover}
    />
  );

  const explainerNote = showExplainer && (
    <div
      role="note"
      className="flex shrink-0 items-start gap-2 rounded-card bg-accent-soft px-3 py-2 text-[13px]"
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
  const counts = tryIndex > 0 && tryIndex <= 3;
  const firstTryWin = tryIndex === 1 && result.summary.status === 'firstTry';
  const streakText = streakLine(result.summary, result.streak);
  const endCard = end && (
    <div className="animate-fade-in absolute inset-0 z-20 grid place-items-center bg-black/35 p-4">
      <div
        className="card animate-sheet-in w-full max-w-sm p-5 text-center"
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
              {tryIndex === 0 ? null : counts ? `Try ${tryIndex} of 3` : 'Practice'}
            </span>
          )}
        </div>
        <div className="mt-3">
          <TryRows summary={result.summary} current={result.ts} />
        </div>
        {streakText && <p className="mt-2 text-[14px] font-semibold">{streakText}</p>}
        <div className="mt-4 grid gap-2">
          <ShareButton text={result.share} />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onRunItBack}>
              {result.summary.status === 'pending'
                ? `Try again · ${result.summary.triesLeft} left`
                : 'Play again'}
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
    <div className="flex h-full flex-col">
      {topBar}
      {wide ? (
        <main className="relative grid min-h-0 flex-1 grid-cols-[1fr_360px] gap-4 px-6 pb-6">
          <section className="flex min-h-0 flex-col gap-2">
            {field}
            {explainerNote}
            {panel}
          </section>
          {turnLog}
          {endCard}
        </main>
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {field}
          {explainerNote}
          {turnLog}
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
      />
    </div>
  );
}
