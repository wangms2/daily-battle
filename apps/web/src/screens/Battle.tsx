// The battle screen (DESIGN.md §12.2b): field, ticker, and controls on one
// screen; turns play back line by line at the chosen speed, tap to skip.
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
import { Field, type Anim } from '../battle/ui/Field';
import { GiveUpDialog, LogList, LogSheet, MenuSheet, MonSheet } from '../battle/ui/sheets';
import { EXPLAINERS, textLines } from '../battle/ui/labels';
import { BattleText } from '../battle/ui/text';
import type { Settings } from '../state/schema';
import { Button } from '../ui/bits';
import { CloseIcon, InfoIcon } from '../ui/icons';
import { useWide } from '../ui/useWide';

const DELAY: Record<Settings['battleSpeed'], number> = { normal: 850, fast: 320, instant: 0 };
const SPEEDS: Settings['battleSpeed'][] = ['normal', 'fast', 'instant'];

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
}: {
  start: EngineStart;
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

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ frames: Frame[]; index: number; pkg: TurnPackage } | null>(null);
  const animKey = useRef(0);
  const explainerQueue = useRef<string[]>([]);
  // Latest props, read from callbacks so they never need to re-create (which
  // would restart the battle effect below).
  const settingsRef = useRef(settings);
  const onEndRef = useRef(onEnd);
  const onChoiceRef = useRef(onChoice);
  useLayoutEffect(() => {
    settingsRef.current = settings;
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
  }, []);

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

  // The top bar shows the turn, so the ticker skips turn banners.
  const tickerLines = log.filter((l) => !l.startsWith('== Turn')).slice(-2);
  const showExplainer = explainer && settings.beginnerHints && !end;
  const active = team.find((m) => m.active);

  const ticker = (
    <button
      type="button"
      onClick={() => (playing ? skip() : setLogOpen(true))}
      className="card flex h-12 shrink-0 flex-col justify-center px-3 text-left text-[13px] leading-snug"
      aria-label={playing ? 'Skip to the end of the turn' : 'Open the battle log'}
    >
      {tickerLines.length ? (
        tickerLines.map((l, i) => (
          <span
            key={`${log.length}-${i}`}
            className={clsx('truncate', i === 0 && tickerLines.length > 1 && 'text-muted')}
          >
            <BattleText text={l} />
          </span>
        ))
      ) : (
        <span className="text-muted">The battle is starting…</span>
      )}
    </button>
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
        <p className="mt-0.5 text-[14px] text-muted">
          {tryNumber === 1 ? 'First try' : `Try ${tryNumber}`}
        </p>
        <div
          className="mt-3 flex justify-center gap-1.5"
          aria-label={`${end.youLeft} of 6 Pokémon left`}
        >
          {Array.from({ length: 6 }, (_, i) => (
            <span
              key={i}
              className={clsx(
                'size-5 rounded-badge',
                i < end.youLeft ? 'bg-good' : 'bg-surface-2 ring-1 ring-line',
              )}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[13px] text-muted">
          {end.youLeft} of your Pokémon left
          {end.winner !== 'you' && !gaveUp && ` · ${end.foeLeft} of theirs`}
        </p>
        <div className="mt-4 grid gap-2">
          <Button onClick={onRunItBack}>Run it back</Button>
          <Button variant="secondary" onClick={onExit}>
            Back to today
          </Button>
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
            <Field view={view} anim={anim} animate={animate} onTap={skip} onInfo={setMonFor} />
            {explainerNote}
            {panel}
          </section>
          <aside className="card flex min-h-0 flex-col p-4" onClick={skip} role="presentation">
            <p className="display mb-2 text-[12px] tracking-wider text-muted uppercase">
              Battle log
            </p>
            <LogList lines={log} className="min-h-0 flex-1" />
          </aside>
          {endCard}
        </main>
      ) : (
        <main className="relative flex min-h-0 flex-1 flex-col gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Field view={view} anim={anim} animate={animate} onTap={skip} onInfo={setMonFor} />
          {explainerNote}
          {ticker}
          {panel}
          {endCard}
        </main>
      )}

      <LogSheet open={logOpen} onOpenChange={setLogOpen} lines={log} />
      <MonSheet
        open={!!monFor}
        onOpenChange={(o) => !o && setMonFor(null)}
        foe={monFor === 'foe'}
        mon={monFor === 'foe' ? (view?.foe ?? null) : (view?.you ?? null)}
        revealed={view?.foe ? view.revealed[view.foe.species] : undefined}
        member={monFor === 'you' ? active : undefined}
        hints={settings.beginnerHints}
      />
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
