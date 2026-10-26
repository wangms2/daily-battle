// Learn mode's lesson list (DESIGN.md §22): every lesson can be opened, the
// recommended next one is highlighted, and finished ones are checked.
import type { Lesson } from '@daily-battle/tutorial/lessons';
import clsx from 'clsx';
import type { TutorialProgress } from '../state/schema';
import { CheckIcon, ChevronIcon } from '../ui/icons';
import { Button } from '../ui/bits';
import { TopBar } from '../ui/TopBar';
import { nextLesson } from './lesson';

export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-ml-2 flex h-10 min-w-0 items-center gap-0.5 rounded-full pr-3 pl-1 font-semibold hover:bg-white/10"
    >
      <ChevronIcon className="size-[18px] shrink-0 rotate-180" aria-hidden />
      <span className="truncate">{label}</span>
    </button>
  );
}

export function Learn({
  game,
  lessons,
  progress,
  onOpen,
  onPlay,
  onBack,
  onSettings,
}: {
  /** "Gen 3" */
  game: string;
  lessons: Lesson[];
  progress: TutorialProgress | undefined;
  onOpen: (lesson: Lesson) => void;
  /** Opens today's daily for this game (offered after graduation). */
  onPlay: () => void;
  onBack: () => void;
  onSettings: () => void;
}) {
  const next = nextLesson(lessons, progress);
  const done = lessons.filter((l) => progress?.completed.includes(l.id)).length;
  const graduated = lessons.some((l) => l.graduation && progress?.completed.includes(l.id));
  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={`Learn · ${game} OU`}
        left={<BackButton label={`Learn · ${game} OU`} onClick={onBack} />}
        onSettings={onSettings}
      />
      <main className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-4 pt-4 pb-8">
        <h1 className="display text-[22px]">Learn to battle</h1>
        <p className="mt-1 text-[14px] text-muted">
          Short lessons with quizzes and practice battles, from the basics up to playing {game} OU.{' '}
          {done > 0 && `${done} of ${lessons.length} done.`}
        </p>
        {graduated && (
          <div className="card mt-4 p-4">
            <p className="text-[16px] font-semibold">🎓 You graduated!</p>
            <p className="mt-1 text-[14px] text-muted">
              You’re ready for the real thing: build a team from this week’s pool and take on
              today’s battle.
            </p>
            <Button className="mt-3 w-full" onClick={onPlay}>
              Play today’s {game} daily
            </Button>
          </div>
        )}
        <ol className="mt-4 grid gap-2">
          {lessons.map((lesson) => {
            const complete = !!progress?.completed.includes(lesson.id);
            const recommended = lesson === next;
            const resume =
              progress?.current?.lesson === lesson.id && progress.current.step > 0 && !complete;
            return (
              <li key={lesson.id}>
                <button
                  type="button"
                  onClick={() => onOpen(lesson)}
                  aria-current={recommended ? 'step' : undefined}
                  className={clsx(
                    'card flex w-full items-center gap-3 p-3 text-left',
                    recommended && 'ring-2 ring-accent',
                  )}
                >
                  <span
                    className={clsx(
                      'grid size-9 shrink-0 place-items-center rounded-full text-[15px] font-bold',
                      complete ? 'bg-accent text-on-accent' : 'bg-surface-2 text-muted',
                    )}
                  >
                    {complete ? (
                      <CheckIcon aria-label="Done" />
                    ) : lesson.graduation ? (
                      <span aria-hidden>🎓</span>
                    ) : (
                      lesson.number
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-semibold">{lesson.title}</span>
                    <span className="block text-[13px] text-muted">{lesson.summary}</span>
                  </span>
                  {(recommended || resume) && (
                    <span className="shrink-0 rounded-badge bg-accent-soft text-soft-ink px-2 py-0.5 text-[12px] font-semibold">
                      {resume ? 'Resume' : 'Next'}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </main>
    </div>
  );
}
