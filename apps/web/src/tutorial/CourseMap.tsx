// The course map (DESIGN.md §22): the Gen 3 course as a path, unit by unit.
// Each lesson is a node with its star Pokémon; done lessons are checked, the
// next one is highlighted, and lessons not built yet are marked Soon.
import type { CourseUnit, Lesson } from '@daily-battle/tutorial/lessons';
import clsx from 'clsx';
import { getSprite } from '../lib/sprites';
import type { TutorialProgress } from '../state/schema';
import { CheckIcon } from '../ui/icons';
import { TopBar } from '../ui/TopBar';
import { BackButton } from './Learn';

export function CourseMap({
  game,
  course,
  lessons,
  progress,
  onOpen,
  onBack,
  onSettings,
}: {
  game: string;
  course: CourseUnit[];
  /** The built lessons, to open by id. */
  lessons: Lesson[];
  progress: TutorialProgress | undefined;
  onOpen: (lesson: Lesson) => void;
  onBack: () => void;
  onSettings: () => void;
}) {
  const built = new Map(lessons.map((l) => [l.id, l]));
  const all = course.flatMap((u) => u.lessons);
  const done = (id?: string) => !!id && !!progress?.completed.includes(id);
  // The first lesson not done that can be played.
  const next = all.find((l) => !done(l.id) && l.id && built.has(l.id));
  const nextLesson = next?.id ? built.get(next.id) : undefined;
  const count = all.filter((l) => done(l.id)).length;
  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={`Learn · ${game} OU`}
        left={<BackButton label={`Learn · ${game} OU`} onClick={onBack} />}
        onSettings={onSettings}
      />
      <main className="mx-auto w-full max-w-[560px] flex-1 overflow-y-auto px-4 pt-4 pb-10">
        <h1 className="display text-[22px]">Learn to battle</h1>
        <p className="mt-1 text-[14px] text-muted">
          {all.length} short lessons, one idea each. {count > 0 && `${count} done.`}
        </p>
        {next && nextLesson && (
          // Up next: the way in, at the top.
          <button
            type="button"
            onClick={() => onOpen(nextLesson)}
            className="card mt-4 flex w-full items-center gap-3 p-3 text-left ring-2 ring-accent"
          >
            <img
              src={getSprite(next.star, 'front')}
              alt=""
              className="pixelated size-16 shrink-0 object-contain"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] font-semibold text-muted">
                {count > 0 ? 'Up next' : 'Start here'} · Lesson {next.number}
              </span>
              <span className="block text-[17px] leading-snug font-semibold">{next.title}</span>
              <span className="block text-[13px] text-muted">{nextLesson.summary}</span>
            </span>
            <span className="shrink-0 rounded-full bg-accent px-3 py-1.5 text-[14px] font-semibold text-on-accent">
              Start
            </span>
          </button>
        )}
        <ol className="mt-6 grid gap-6">
          {course.map((unit, u) => (
            <li key={unit.title}>
              <h2 className="mb-2 flex items-baseline justify-between text-[12px] font-semibold tracking-wider text-muted uppercase">
                <span>
                  Unit {u + 1} · {unit.title}
                </span>
                <span className="tracking-normal normal-case tabular-nums">
                  {unit.lessons.filter((l) => done(l.id)).length} of {unit.lessons.length}
                </span>
              </h2>
              <ol className="relative grid">
                {unit.lessons.map((l, i) => {
                  const lesson = l.id ? built.get(l.id) : undefined;
                  const isDone = done(l.id);
                  const isNext = l === next;
                  const last = i === unit.lessons.length - 1;
                  return (
                    <li key={l.number} className="relative flex gap-3 pb-3">
                      {/* The path between nodes. */}
                      {!last && (
                        <span
                          aria-hidden
                          className={clsx(
                            'absolute top-16 bottom-0 left-[31px] w-[3px] rounded-full',
                            isDone ? 'bg-accent' : 'bg-line',
                          )}
                        />
                      )}
                      <button
                        type="button"
                        disabled={!lesson}
                        onClick={() => lesson && onOpen(lesson)}
                        aria-current={isNext ? 'step' : undefined}
                        aria-label={`Lesson ${l.number}: ${l.title}${isDone ? ', done' : ''}${lesson ? '' : ', coming soon'}`}
                        className="group flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                      >
                        <span
                          className={clsx(
                            'relative grid size-16 shrink-0 place-items-center rounded-full border-[3px] bg-surface',
                            isDone
                              ? 'border-accent'
                              : isNext
                                ? 'border-accent shadow-card'
                                : 'border-line',
                          )}
                        >
                          <img
                            src={getSprite(l.star, 'front')}
                            alt=""
                            className={clsx(
                              'pixelated size-14 object-contain',
                              // Not built yet: faded.
                              !lesson && 'opacity-40 grayscale',
                            )}
                          />
                          {isDone && (
                            <span className="absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full bg-accent text-on-accent">
                              <CheckIcon width={14} height={14} />
                            </span>
                          )}
                        </span>
                        <span
                          className={clsx(
                            'min-w-0 flex-1 rounded-card px-3 py-2',
                            isNext && 'bg-accent-soft',
                            lesson && 'group-hover:bg-surface-2',
                          )}
                        >
                          <span className="block text-[12px] font-semibold text-muted tabular-nums">
                            Lesson {l.number}
                          </span>
                          <span
                            className={clsx(
                              'block text-[16px] leading-snug font-semibold',
                              !lesson && 'text-muted',
                            )}
                          >
                            {l.title}
                          </span>
                        </span>
                        {isNext && lesson && (
                          <span className="shrink-0 rounded-full bg-accent px-3 py-1 text-[13px] font-semibold text-on-accent">
                            Start
                          </span>
                        )}
                        {!lesson && (
                          <span className="shrink-0 text-[12px] font-semibold text-muted">
                            Soon
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
          <li className="flex items-center gap-3">
            <span className="grid size-16 shrink-0 place-items-center rounded-full border-[3px] border-line bg-surface text-[28px] opacity-45">
              <span aria-hidden>🎓</span>
            </span>
            <span className="text-[16px] font-semibold text-muted">Graduation</span>
          </li>
        </ol>
      </main>
    </div>
  );
}
