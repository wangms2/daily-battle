// Plays one lesson (DESIGN.md §22): cards, quiz positions frozen in the real
// battle UI, and practice battles in the battle worker. Lesson battles are
// never scored and never touch the daily.
import type {
  Answer,
  BattleStep,
  CardStep,
  DemoStep,
  Grade,
  Lesson,
  PickStep,
  QuizStep,
} from '@daily-battle/tutorial/lessons';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BattleBackendContext, useBattleBackend } from '../battle/backend';
import { replayBackend } from '../battle/replay-backend';
import type { EngineStart, LessonTurn, PositionPackage, Who } from '../battle/frames';
import { ControlPanel } from '../battle/ui/Controls';
import { Field } from '../battle/ui/Field';
import { MonPopover } from '../battle/ui/MonPopover';
import { setActiveFormat } from '../lib/data';
import { backgroundFor } from '../lib/fx';
import { getSprite } from '../lib/sprites';
import { Battle } from '../screens/Battle';
import type { Settings } from '../state/schema';
import { Button } from '../ui/bits';
import { TopBar } from '../ui/TopBar';
import { BackButton } from './Learn';
import { choiceLabel, lessonStart } from './lesson';

const GRADE: Record<Grade, { label: string; className: string }> = {
  best: { label: 'Best', className: 'bg-good text-on-accent' },
  ok: { label: 'OK', className: 'bg-gold-soft text-on-gold' },
  wrong: { label: 'Not good', className: 'bg-bad text-on-accent' },
};

export function LessonPlayer({
  lesson,
  step: index,
  settings,
  onSetting,
  onExplainerSeen,
  onStep,
  onDone,
  onExit,
  onSettings,
}: {
  lesson: Lesson;
  /** The step to show (resumes where the player left off). */
  step: number;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onExplainerSeen: (id: string) => void;
  onStep: (step: number) => void;
  onDone: () => void;
  onExit: () => void;
  onSettings: () => void;
}) {
  // Species, moves, and sprites as in the lesson's game, whatever game is picked.
  setActiveFormat(lesson.format);
  const step = lesson.steps[Math.min(index, lesson.steps.length - 1)]!;
  const last = index >= lesson.steps.length - 1;
  const next = () => (last ? onDone() : onStep(index + 1));
  const background = backgroundFor(lesson.id, lesson.format);
  const title = lesson.graduation ? lesson.title : `${lesson.number}. ${lesson.title}`;

  if (step.kind === 'demo')
    return (
      <Demo
        key={index}
        step={step}
        format={lesson.format}
        background={background}
        settings={settings}
        title={title}
        index={index}
        count={lesson.steps.length}
        last={last}
        onNext={next}
        onExit={onExit}
      />
    );

  if (step.kind === 'battle')
    return (
      <LessonBattle
        key={index}
        step={step}
        format={lesson.format}
        background={background}
        settings={settings}
        onSetting={onSetting}
        onExplainerSeen={onExplainerSeen}
        last={last}
        onNext={next}
        onExit={onExit}
        onSettings={onSettings}
      />
    );

  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={title}
        left={<BackButton label={title} onClick={onExit} />}
        onSettings={onSettings}
      />
      <div
        className="mx-auto h-1 w-full max-w-[560px] px-4"
        role="progressbar"
        aria-label="Lesson progress"
        aria-valuemin={0}
        aria-valuemax={lesson.steps.length}
        aria-valuenow={index + 1}
      >
        <div className="h-full overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full bg-accent transition-[width]"
            style={{ width: `${((index + 1) / lesson.steps.length) * 100}%` }}
          />
        </div>
      </div>
      <main className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-4 pt-4 pb-8">
        {step.kind === 'card' ? (
          <Card key={index} step={step} last={last} onNext={next} />
        ) : step.kind === 'pick' ? (
          <Pick key={index} step={step} last={last} onNext={next} />
        ) : (
          <Quiz
            key={index}
            step={step}
            format={lesson.format}
            background={background}
            hints={settings.beginnerHints}
            last={last}
            onNext={next}
          />
        )}
      </main>
    </div>
  );
}

function Card({ step, last, onNext }: { step: CardStep; last: boolean; onNext: () => void }) {
  return (
    <section className="grid gap-3">
      <h2 className="display text-[22px]">{step.title}</h2>
      {step.sprites && (
        <div className="flex flex-wrap justify-center gap-2">
          {step.sprites.map((s) => (
            <img
              key={s}
              src={getSprite(s)}
              alt={s}
              className="size-20 object-contain [image-rendering:pixelated]"
            />
          ))}
        </div>
      )}
      {step.text.map((p, i) => (
        <p key={i} className="text-[15px] leading-relaxed">
          {p}
        </p>
      ))}
      <Button className="mt-2 w-full" onClick={onNext}>
        {last ? 'Finish lesson' : 'Next'}
      </Button>
    </section>
  );
}

function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span
      className={clsx(
        'shrink-0 rounded-badge px-2 py-0.5 text-[12px] font-semibold',
        GRADE[grade].className,
      )}
    >
      {GRADE[grade].label}
    </span>
  );
}

function Sprite({ species, className }: { species: string; className?: string }) {
  return (
    <img
      src={getSprite(species)}
      alt={species}
      className={clsx('object-contain [image-rendering:pixelated]', className)}
    />
  );
}

/** Guided team building: tap Pokémon to add them, with feedback on each. */
export function Pick({
  step,
  last,
  onNext,
}: {
  step: PickStep;
  last: boolean;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  // The option whose feedback is showing.
  const [focus, setFocus] = useState<number | null>(null);
  const full = chosen.length >= step.picks;
  const tap = (i: number) => {
    setFocus(i);
    if (chosen.includes(i)) setChosen(chosen.filter((c) => c !== i));
    else if (step.options[i]!.grade !== 'wrong' && !full) setChosen([...chosen, i]);
  };
  const shown = focus === null ? null : step.options[focus]!;
  const lead = step.target === 'lead';
  const team = [
    ...step.team.map((m) => m.species),
    ...chosen.map((i) => step.options[i]!.mon.species),
  ];

  return (
    <section className="grid gap-3">
      <h2 className="text-[17px] font-semibold">{step.prompt}</h2>
      {step.foe && (
        <div aria-label="Their team" className="card grid gap-1 p-2">
          <span className="text-[12px] text-muted">Their team</span>
          <div className="grid grid-cols-6 gap-1">
            {step.foe.map((s) => (
              <Sprite key={s} species={s} className="size-12 justify-self-center" />
            ))}
          </div>
        </div>
      )}
      <div
        aria-label={lead ? 'Your lead' : 'Your team'}
        className="card grid grid-cols-6 gap-1 p-2"
      >
        {Array.from({ length: step.team.length + step.picks }, (_, i) =>
          team[i] ? (
            <Sprite key={team[i]} species={team[i]} className="size-12 justify-self-center" />
          ) : (
            <div
              key={`empty-${i}`}
              aria-label="Empty slot"
              className="size-12 justify-self-center rounded-full border-2 border-dashed border-white/15"
            />
          ),
        )}
      </div>
      <p className="text-[13px] text-muted">
        {lead
          ? full
            ? 'Lead chosen.'
            : 'Pick your lead.'
          : full
            ? 'Team complete.'
            : `Pick ${step.picks - chosen.length} more.`}
      </p>
      <ul className="grid grid-cols-2 gap-2">
        {step.options.map((o, i) => (
          <li key={o.mon.species}>
            <button
              type="button"
              aria-pressed={chosen.includes(i)}
              onClick={() => tap(i)}
              className={clsx(
                'card flex w-full items-center gap-2 p-2 text-left',
                chosen.includes(i) && 'ring-2 ring-accent',
                focus === i && !chosen.includes(i) && 'ring-1 ring-white/30',
              )}
            >
              <Sprite species={o.mon.species} className="size-10 shrink-0" />
              <span className="grid">
                <span className="font-medium">{o.mon.species}</span>
                <span className="text-[12px] text-muted">{o.role}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {shown && (
        <div role="status" className="card grid gap-2 p-3">
          <div className="flex items-center gap-2 font-semibold">
            <GradeBadge grade={shown.grade} />
            {shown.mon.species}
            {shown.grade === 'wrong'
              ? lead
                ? ': not a good lead'
                : ': not a good fit'
              : chosen.includes(focus!)
                ? lead
                  ? ': leads'
                  : ': added'
                : full
                  ? lead
                    ? ': you already picked a lead (tap it to change)'
                    : ': team is full (tap a pick to remove it)'
                  : ': removed'}
          </div>
          <p className="text-[15px]">{shown.why}</p>
        </div>
      )}
      {full && (
        <div className="card grid gap-3 p-3">
          <p className="text-[15px]">{step.done}</p>
          <Button onClick={onNext}>{last ? 'Finish lesson' : 'Continue'}</Button>
        </div>
      )}
    </section>
  );
}

export function Quiz({
  step,
  format,
  background,
  hints,
  last,
  onNext,
}: {
  step: QuizStep;
  format: string;
  background: string;
  hints: boolean;
  last: boolean;
  onNext: () => void;
}) {
  const backend = useBattleBackend();
  const [pos, setPos] = useState<PositionPackage | null>(null);
  const [error, setError] = useState(false);
  const [info, setInfo] = useState<Who | null>(null);
  // The latest pick: a graded answer, or `otherwise` for any other legal choice.
  const [picked, setPicked] = useState<{ answer?: Answer } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const b = backend();
    let live = true;
    const steps = step.answers.map((a) => a.choice);
    (
      b.position?.(format, step.position, steps) ?? Promise.reject(new Error('No quiz support'))
    ).then(
      (p) => live && setPos(p),
      () => live && setError(true),
    );
    return () => {
      live = false;
    };
  }, [backend, format, step]);

  const view = pos?.pkg.frames.at(-1)?.view ?? null;
  const solved = picked?.answer?.grade === 'best';
  const choose = (choice: string) => {
    const i = pos!.choices.indexOf(choice);
    setPicked({ answer: i >= 0 ? step.answers[i] : undefined });
  };
  const active = pos?.pkg.team.find((m) => m.active);
  const popover =
    info === 'foe' && view?.foe ? (
      <MonPopover
        foe
        mon={view.foe}
        revealed={view.revealed[view.foe.base ?? view.foe.species]}
        hints={hints}
      />
    ) : info === 'you' && active ? (
      <MonPopover foe={false} member={active} mon={view?.you} />
    ) : null;

  return (
    <section className="grid gap-3">
      <h2 className="text-[17px] font-semibold">{step.prompt}</h2>
      {error ? (
        <p className="text-bad">This position couldn&apos;t load. Try reopening the lesson.</p>
      ) : (
        <>
          <Field
            className="aspect-[440/335] w-full overflow-hidden rounded-card"
            view={view}
            anim={null}
            animate={false}
            background={background}
            floats={[]}
            onFloatDone={() => {}}
            onTap={() => {}}
            info={info}
            onInfo={setInfo}
            popover={popover}
          />
          {!picked && (
            <ControlPanel
              controls={pos?.pkg.controls ?? null}
              team={pos?.pkg.team ?? []}
              hints={hints}
              disabled={!pos}
              onChoose={choose}
            />
          )}
        </>
      )}
      {picked && !solved && (
        <div role="status" className="card grid gap-2 p-3">
          <div className="flex items-center gap-2 font-semibold">
            {picked.answer && <GradeBadge grade={picked.answer.grade} />}
            {picked.answer?.grade === 'ok' ? 'Good, but there’s better' : 'Not quite'}
          </div>
          <p className="text-[15px]">{picked.answer?.why ?? step.otherwise}</p>
          <Button variant="secondary" onClick={() => setPicked(null)}>
            Try again
          </Button>
        </div>
      )}
      {solved && (
        <div role="status" className="card grid gap-3 p-3">
          <div className="flex items-center gap-2 font-semibold">
            <GradeBadge grade="best" />
            {choiceLabel(picked.answer!.choice)}: that&apos;s it!
          </div>
          <p className="text-[15px]">{picked.answer!.why}</p>
          <div>
            <h3 className="text-[13px] font-semibold text-muted">All the options (tap for why)</h3>
            <ul className="mt-1 grid gap-1">
              {step.answers.map((a, i) => (
                <li key={a.choice}>
                  <button
                    type="button"
                    aria-expanded={open === i}
                    onClick={() => setOpen(open === i ? null : i)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <GradeBadge grade={a.grade} />
                    <span className="font-medium">{choiceLabel(a.choice)}</span>
                  </button>
                  {open === i && <p className="px-2 pb-1 text-[14px] text-muted">{a.why}</p>}
                </li>
              ))}
            </ul>
          </div>
          <Button onClick={onNext}>{last ? 'Finish lesson' : 'Continue'}</Button>
        </div>
      )}
    </section>
  );
}

function LessonBattle({
  step,
  format,
  background,
  settings,
  onSetting,
  onExplainerSeen,
  last,
  onNext,
  onExit,
  onSettings,
}: {
  step: BattleStep;
  format: string;
  background: string;
  settings: Settings;
  onSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  onExplainerSeen: (id: string) => void;
  last: boolean;
  onNext: () => void;
  onExit: () => void;
  onSettings: () => void;
}) {
  // Bumped to replay the battle from the start.
  const [round, setRound] = useState(0);
  const [intro, setIntro] = useState(true);
  // Battle restarts when its start changes, so keep one per lesson step.
  const start = useMemo(() => lessonStart(step, format), [step, format]);
  if (intro)
    return (
      <div className="flex h-full flex-col">
        <TopBar
          title="Practice battle"
          left={<BackButton label="Practice battle" onClick={onExit} />}
          onSettings={onSettings}
        />
        <main className="mx-auto grid w-full max-w-[560px] content-start gap-4 px-4 pt-6">
          <h2 className="display text-[22px]">Practice battle</h2>
          <p className="text-[15px] leading-relaxed">{step.intro}</p>
          <Button onClick={() => setIntro(false)}>Start battle</Button>
        </main>
      </div>
    );
  return (
    <Battle
      key={round}
      start={start}
      background={background}
      settings={settings}
      onSetting={onSetting}
      onExplainerSeen={onExplainerSeen}
      onChoice={() => {}}
      onEnd={() => {}}
      onExit={onExit}
      prompt={(turn) => step.prompts.find((p) => p.turn === turn)?.text}
      live={{
        waiting: 'The foe is choosing…',
        giveUpBody: 'Leave this practice battle? You can replay it any time.',
        exitLabel: 'Back to lessons',
        renderEnd: (end) => (
          <div className="grid gap-3">
            <h2 className="display text-[22px]">
              {end.winner === 'you' ? 'You won!' : 'Not this time'}
            </h2>
            <p className="text-[15px] leading-relaxed">{step.takeaway}</p>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => setRound((r) => r + 1)}>
                Replay
              </Button>
              <Button className="flex-1" onClick={onNext}>
                {last ? 'Finish lesson' : 'Continue'}
              </Button>
            </div>
          </div>
        ),
      }}
    />
  );
}

/**
 * A demo step: one turn on the battle screen (DESIGN.md §22). The screen
 * points at what matters, the coach card names the idea, and the turn plays on
 * Watch. Then Next, or Again to see it once more.
 */
function Demo({
  step,
  format,
  background,
  settings,
  title,
  index,
  count,
  last,
  onNext,
  onExit,
}: {
  step: DemoStep;
  format: string;
  background: string;
  settings: Settings;
  title: string;
  index: number;
  count: number;
  last: boolean;
  onNext: () => void;
  onExit: () => void;
}) {
  const createBackend = useBattleBackend();
  // Bumped by Again: the turn plays from the decision once more.
  const [round, setRound] = useState(0);
  const [turn, setTurn] = useState<LessonTurn | null>(null);
  const before = step.spotlight?.before ?? [];
  const after = step.spotlight?.after ?? [];
  const factory = useCallback(
    () =>
      replayBackend(async () => {
        const b = createBackend();
        if (!b.turn) return null;
        const t = await b.turn(format, step.position, step.turn, [...before, ...after]);
        setTurn(t);
        return t;
      }),
    // The step's content is fixed for the lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [createBackend, format, step],
  );
  const start: EngineStart = useMemo(
    () => ({
      format,
      playerTeam: [],
      opponentTeam: [],
      style: 'balance',
      battleSeed: step.position.seed,
      aiSeed: step.position.seed,
      choices: [],
      tutorial: { noLuck: true },
    }),
    [format, step],
  );
  const spots = turn?.spots ?? [];
  const header = (
    <>
      <BackButton label={title} onClick={onExit} />
      <span className="text-[13px] text-muted tabular-nums">
        {index + 1} of {count}
      </span>
    </>
  );
  return (
    <BattleBackendContext.Provider value={factory}>
      <Battle
        key={round}
        start={start}
        background={background}
        settings={{ ...settings, beginnerHints: false }}
        onSetting={() => {}}
        onExplainerSeen={() => {}}
        onChoice={() => {}}
        onEnd={() => {}}
        onExit={onExit}
        staged={{
          choice: turn?.choice ?? '',
          header,
          before: <p>{step.before}</p>,
          after: <p>{step.after}</p>,
          label: 'Lesson',
          spotlight: { before: spots.slice(0, before.length), after: spots.slice(before.length) },
          playLabel: '▶ Watch',
          next: (
            <Button className="h-9 px-3 text-[13.5px]" onClick={onNext}>
              {last ? 'Finish' : 'Next'}
            </Button>
          ),
          onReplay: () => setRound((r) => r + 1),
        }}
      />
    </BattleBackendContext.Provider>
  );
}
