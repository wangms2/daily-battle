// Plays one lesson (DESIGN.md §22) on the battle screen: demos and looks,
// practice positions, and a short battle against the Easy AI with the coach.
// Lesson battles are never scored and never touch the daily.
import type {
  BattleStep,
  DemoStep,
  PracticeStep,
  Lesson,
  Mon,
} from '@daily-battle/tutorial/lessons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BattleBackendContext, useBattleBackend } from '../battle/backend';
import { replayBackend } from '../battle/replay-backend';
import type { BattleBackend } from '../battle/backend';
import type { EngineStart, LessonTurn } from '../battle/frames';
import type { Mark } from '../battle/ui/Controls';
import { setActiveFormat } from '../lib/data';
import { backgroundFor } from '../lib/fx';
import { Battle } from '../screens/Battle';
import type { Settings } from '../state/schema';
import { Button } from '../ui/bits';
import { TopBar } from '../ui/TopBar';
import { BackButton } from './BackButton';
import { choiceLabel, lessonStart } from './lesson';

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

  if (step.kind === 'practice')
    return (
      <Practice
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
        // The coach talks only about what the lessons so far have taught.
        taught={lesson.number}
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

  return null;
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
  taught,
}: {
  /** The lesson reached, for the coach. */
  taught: number;
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
  const start = useMemo(() => lessonStart(step, format, taught), [step, format, taught]);
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
        const t = await b.turn(
          format,
          step.position,
          step.turn ?? {},
          // The card to open goes last, to resolve like the spots.
          [...before, ...after, ...(step.card ? [step.card] : [])],
          !!step.whole,
        );
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
      // The foe's lesson sets: its card shows its exact Speed (unless it stands
      // for a real foe, whose set is unknown).
      opponentTeam: step.realSets ? [] : step.position.p2,
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
          ...(step.turn ? { choice: turn?.choice ?? '' } : { look: true }),
          // The foe's card opens on the first frame; a choice's once it resolves.
          ...(step.card === 'foe'
            ? { card: 'foe' }
            : step.card && turn && { card: spots[before.length + after.length]! }),
          header,
          before: <p>{step.before}</p>,
          ...(step.after && { after: <p>{step.after}</p> }),
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

/** The battle screen's start for a lesson position shown as a staged turn. */
const stagedStart = (format: string, seed: string, foe: Mon[] = []): EngineStart => ({
  format,
  playerTeam: [],
  opponentTeam: foe,
  style: 'balance',
  battleSeed: seed,
  aiSeed: seed,
  choices: [],
  tutorial: { noLuck: true },
});

/**
 * A practice step: the player picks on the battle screen, the turn plays with
 * their pick, and the coach card says why it was (or wasn't) best. If it
 * wasn't, Show the better choice replays the same turn with the best one.
 */
function Practice({
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
  step: PracticeStep;
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
  // Each try (and each look at the better choice) starts the screen fresh.
  const [round, setRound] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [better, setBetter] = useState(false);
  // The answers' steps as choices (`move Surf` → `move 1`).
  const [choices, setChoices] = useState<(string | null)[] | null>(null);
  const [spots, setSpots] = useState<string[]>([]);
  const best = step.answers.findIndex((a) => a.grade === 'best');
  const bestChoice = choices?.[best] ?? undefined;
  const answer = picked === null ? undefined : step.answers[choices?.indexOf(picked) ?? -1];

  useEffect(() => {
    const b = createBackend();
    let live = true;
    // The turn's spots resolve steps to choices, so the answers go in as spots.
    b.turn?.(
      format,
      step.position,
      { p1: step.answers[best]!.choice, p2: step.foe },
      step.answers.map((a) => a.choice),
      true,
    ).then(
      (t) => live && setChoices(t.spots),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [createBackend, format, step, best]);

  const factory = useCallback((): BattleBackend => {
    const b = createBackend();
    const play = (p1: string) =>
      b.turn!(format, step.position, { p1, p2: step.foe }, step.spotlight ?? [], true);
    let opening: Promise<LessonTurn> | null = null;
    return {
      start: () => {
        opening = play(step.answers[best]!.choice);
        return opening.then((t) => {
          setSpots(t.spots);
          return t.before;
        });
      },
      choose: (choice) => play(choice).then((t) => t.turn),
      forfeit: () => Promise.reject(new Error('A practice turn can’t be given up')),
    };
  }, [createBackend, format, step, best]);

  const tryAgain = () => {
    setPicked(null);
    setBetter(false);
    setRound((r) => r + 1);
  };
  const header = (
    <>
      <BackButton label={title} onClick={onExit} />
      <span className="text-[13px] text-muted tabular-nums">
        {index + 1} of {count}
      </span>
    </>
  );
  const nextButton = (
    <Button className="h-9 px-3 text-[13.5px]" onClick={onNext}>
      {last ? 'Finish' : 'Next'}
    </Button>
  );
  const right = picked !== null && picked === bestChoice;
  // The Better tag waits for Show better, so Try again is still a real try.
  const marks: Record<string, Mark> | undefined =
    picked === null || !bestChoice
      ? undefined
      : right
        ? { [picked]: 'best' }
        : better
          ? { [picked]: 'you', [bestChoice]: 'better' }
          : { [picked]: 'you' };
  const feedback = right ? (
    <p>
      <b>That’s it.</b> {answer?.why}
    </p>
  ) : (
    <p>
      {answer?.grade === 'ok' && <b>Good, but there’s better. </b>}
      {answer?.why ?? step.otherwise}
    </p>
  );
  const after = right ? (
    nextButton
  ) : (
    <>
      <Button
        className="h-9 px-3 text-[13.5px]"
        onClick={() => {
          setBetter(true);
          setRound((r) => r + 1);
        }}
      >
        Show better
      </Button>
      <Button variant="secondary" className="h-9 px-3 text-[13.5px]" onClick={tryAgain}>
        Try again
      </Button>
    </>
  );

  // One start per step: a new one would restart the battle screen.
  const start = useMemo(
    () => stagedStart(format, step.position.seed, step.position.p2),
    [format, step],
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
        staged={
          better && bestChoice
            ? {
                // The better choice, played on the same turn.
                choice: bestChoice,
                ...(marks && { marks }),
                header,
                before: (
                  <p>
                    <b>{choiceLabel(step.answers[best]!.choice)}</b> was better.{' '}
                    {step.answers[best]!.why}
                  </p>
                ),
                label: 'Practice',
                playLabel: '▶ Watch',
                stack: true,
                next: (
                  <>
                    <Button
                      variant="secondary"
                      className="h-9 px-3 text-[13.5px]"
                      onClick={tryAgain}
                    >
                      Try again
                    </Button>
                    {nextButton}
                  </>
                ),
                onReplay: () => setRound((r) => r + 1),
              }
            : {
                ...(marks && { marks }),
                header,
                before: <p>{step.prompt}</p>,
                after: feedback,
                label: 'Practice',
                spotlight: { before: spots },
                onPick: setPicked,
                again: false,
                stack: !right,
                next: after,
                onReplay: tryAgain,
              }
        }
      />
    </BattleBackendContext.Provider>
  );
}
