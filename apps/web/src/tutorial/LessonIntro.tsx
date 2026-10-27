// A lesson's opening card (DESIGN.md §22): its star Pokémon, what it's about,
// and how long it takes, before the battle screen. The first lesson also
// welcomes the player to the course.
import type { Lesson } from '@daily-battle/tutorial/lessons';
import { getSprite } from '../lib/sprites';
import { Button } from '../ui/bits';
import { TopBar } from '../ui/TopBar';
import { BackButton } from './BackButton';

/** Rough seconds per step, for the time shown: looks are quick, a battle takes a few minutes. */
const SECONDS: Record<string, number> = { look: 10, demo: 25, practice: 45, battle: 150 };

function minutes(lesson: Lesson): number {
  const seconds = lesson.steps.reduce(
    (sum, s) => sum + SECONDS[s.kind === 'demo' && !s.turn ? 'look' : s.kind]!,
    0,
  );
  return Math.max(1, Math.round(seconds / 60));
}

export function LessonIntro({
  lesson,
  title,
  star,
  onStart,
  onExit,
  onSettings,
}: {
  lesson: Lesson;
  title: string;
  /** The Pokémon that stars in it (from the course outline). */
  star: string | undefined;
  onStart: () => void;
  onExit: () => void;
  onSettings: () => void;
}) {
  const first = lesson.number === 1 && !lesson.review;
  return (
    <div className="flex h-full flex-col">
      <TopBar
        title={title}
        left={<BackButton label={title} onClick={onExit} />}
        onSettings={onSettings}
      />
      <main className="mx-auto flex w-full max-w-[480px] wide:max-w-[800px] flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 pb-10 text-center">
        {first && (
          <div className="grid gap-1">
            <p className="home-serif text-[26px]">Welcome to Learn to battle!</p>
            <p className="text-[15px] leading-relaxed text-muted">
              Short lessons on the real battle screen. You make every move yourself, and the coach
              helps in the battles.
            </p>
          </div>
        )}
        {/* Wide screens: the star beside the lesson, not above it. */}
        <div className="flex flex-col items-center gap-4 wide:flex-row wide:gap-12 wide:text-left">
          {star && (
            <img
              src={getSprite(star, 'front')}
              alt=""
              className="lesson-star pixelated size-36 shrink-0 object-contain wide:size-52"
            />
          )}
          <div className="flex flex-col items-center wide:items-start">
            <div className="grid gap-1 wide:max-w-[420px]">
              <p className="text-[13px] font-semibold tracking-wider text-muted uppercase">
                {lesson.review ? 'Unit review' : `Lesson ${lesson.number}`}
              </p>
              <h1 className="home-serif text-[24px] leading-tight wide:text-[32px]">
                {lesson.title}
              </h1>
              <p className="text-[16px] leading-snug">{lesson.summary}</p>
              <p className="mt-1 text-[13px] text-muted tabular-nums">
                {lesson.steps.length} steps · about {minutes(lesson)} min
              </p>
            </div>
            <Button className="mt-2 w-full max-w-[280px] wide:mt-4" onClick={onStart}>
              {first ? 'Let’s go' : 'Start'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
