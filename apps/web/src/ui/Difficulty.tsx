// The CPU difficulty: a picker on the daily brief, and a badge wherever a game
// isn't at Normal (Normal shows nothing, so it looks as it always has).
import { DIFFICULTIES, type Difficulty } from '@daily-battle/ai/version';
import clsx from 'clsx';
import { DIFFICULTY_HINT } from '../lib/difficulty';
import { DIFFICULTY_NAME } from '../lib/share';

export function DifficultyPicker({
  value,
  onChange,
  hardAvailable = true,
  disabled,
}: {
  value: Difficulty;
  onChange: (d: Difficulty) => void;
  /** False in a build without the Hard engine for this game. */
  hardAvailable?: boolean;
  /** While a battle is unfinished, its difficulty stays. */
  disabled?: boolean;
}) {
  return (
    <div className="seg flex p-0.5" role="radiogroup" aria-label="Difficulty">
      {DIFFICULTIES.map((d) => {
        const off = disabled || (d === 'hard' && !hardAvailable);
        return (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value === d}
            disabled={off && value !== d}
            title={DIFFICULTY_HINT[d]}
            onClick={() => !off && onChange(d)}
            className={clsx(
              'min-h-7 rounded-lg px-2.5 text-[12px] font-semibold',
              value === d ? 'bg-surface text-ink shadow-card' : 'text-muted',
              off && value !== d && 'opacity-40',
            )}
          >
            {DIFFICULTY_NAME[d]}
          </button>
        );
      })}
    </div>
  );
}

/** "Easy" or "Hard" as a small pill; nothing for Normal. */
export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: Difficulty | undefined;
  className?: string;
}) {
  if (!difficulty || difficulty === 'normal') return null;
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-badge px-1.5 py-0.5 text-[11px] font-bold',
        difficulty === 'hard' ? 'bg-ink text-surface' : 'bg-surface-2 text-ink',
        className,
      )}
    >
      {DIFFICULTY_NAME[difficulty]}
    </span>
  );
}

/** The daily coach's switch on the brief: a pill beside the difficulty. */
export function CoachToggle({
  on,
  onChange,
  disabled,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  /** While a battle is unfinished (turn it on from the battle's menu). */
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      title="Tips, blunder warnings, and a review after. Coached results count apart."
      onClick={() => onChange(!on)}
      className={clsx(
        'chip chunky-chip min-h-8 shrink-0 px-2.5 text-[13px] font-semibold',
        disabled && 'opacity-60',
      )}
    >
      Coach {on ? 'on' : 'off'}
    </button>
  );
}
/** "Coached": the daily coach is on for this battle or game. */
export function CoachBadge({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-badge bg-accent px-1.5 py-0.5 text-[11px] font-bold text-white',
        className,
      )}
    >
      Coached
    </span>
  );
}
