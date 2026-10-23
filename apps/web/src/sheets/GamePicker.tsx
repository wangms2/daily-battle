// Switches between the daily games (Gen 4 OU, Gen 5 OU). Each keeps its own
// weekly team, tries, and streak; the choice is remembered.
import type { FormatId } from '@daily-battle/data/formats';
import clsx from 'clsx';
import { Sheet } from '../ui/Sheet';
import { CheckIcon, FlameIcon } from '../ui/icons';

export interface GameRow {
  id: FormatId;
  /** "Gen 5 OU" */
  name: string;
  streak: number;
  /** Today's status, e.g. "First try!" or "Not played yet". */
  today: string;
}

export function GamePicker({
  open,
  onOpenChange,
  current,
  games,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: FormatId;
  games: GameRow[];
  onPick: (id: FormatId) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Choose a game">
      <p className="-mt-1 mb-3 text-[14px] text-muted">
        Each game has its own team, opponents, and streak.
      </p>
      <ul className="space-y-2">
        {games.map((g) => {
          const selected = g.id === current;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => onPick(g.id)}
                aria-current={selected || undefined}
                className={clsx(
                  'card flex w-full items-center gap-3 px-4 py-3 text-left',
                  selected ? 'is-selected' : 'hover:bg-surface-2',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-semibold">{g.name}</span>
                  <span className="block truncate text-[13px] text-muted">{g.today}</span>
                </span>
                <span
                  className="flex items-center gap-1 text-[15px] font-semibold tabular-nums"
                  aria-label={`Streak ${g.streak}`}
                >
                  <FlameIcon className={g.streak > 0 ? 'text-gold' : 'text-muted'} />
                  {g.streak}
                </span>
                <span className="grid size-6 place-items-center text-accent">
                  {selected && <CheckIcon aria-label="Playing" />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
