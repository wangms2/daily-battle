// A row of the other generations, so a player who's finished one can start another
// without going back to the picker. App provides which games and how to start one;
// where nothing is provided (versus), it renders nothing.
import type { FormatId } from '@daily-battle/data/formats';
import clsx from 'clsx';
import { createContext, useContext } from 'react';
import type { DayStatus } from '../lib/results';
import type { ShareAll, ShareModel } from '../lib/share';

export interface GameLink {
  id: FormatId;
  /** "Gen 3 OU" */
  name: string;
  status: DayStatus;
}

interface GamesValue {
  games: GameLink[];
  onPlay: (id: FormatId) => void;
  /** Every game played today, for Share's "All games" (see `shareAll`). */
  shareAll?: ShareModel | ShareAll | null;
}

const GamesContext = createContext<GamesValue | null>(null);
export const GamesProvider = GamesContext.Provider;

/** Today's games as one share, or null outside the daily. */
// A hook beside its provider; editing this file reloads the page, which is fine.
// eslint-disable-next-line react-refresh/only-export-components
export function useShareAll() {
  return useContext(GamesContext)?.shareAll ?? null;
}

const STATUS_LABEL: Record<DayStatus, string> = {
  none: 'Not played',
  pending: 'In progress',
  firstTry: 'Cleared',
  won: 'Cleared',
  failed: 'Not cleared',
};

export function OtherGames({
  className,
  onPicked,
  compact = false,
}: {
  className?: string;
  /** One short line per game and no heading, for screens with no room to spare. */
  compact?: boolean;
  /** Runs as a game is chosen (a sheet closes itself). */
  onPicked?: () => void;
}) {
  const value = useContext(GamesContext);
  if (!value || !value.games.length) return null;
  return (
    <section className={className} aria-label="Play another generation">
      {!compact && (
        <p className="mb-1.5 text-[12.5px] font-semibold text-muted">Play another generation</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {value.games.map((g) => {
          const label = STATUS_LABEL[g.status];
          const cleared = g.status === 'firstTry' || g.status === 'won';
          return (
            <button
              key={g.id}
              type="button"
              aria-label={`Play ${g.name}. ${label} today`}
              onClick={() => {
                onPicked?.();
                value.onPlay(g.id);
              }}
              className={clsx(
                'chunky-chip flex flex-col items-center justify-center border-line bg-surface px-1 text-center hover:bg-surface-2',
                compact ? 'min-h-10' : 'min-h-12 py-1.5',
              )}
            >
              <span className="text-[14px] leading-tight font-semibold">
                {g.name}
                {compact && cleared && <span className="text-good"> ✓</span>}
              </span>
              {!compact && (
                <span
                  className={clsx(
                    'text-[11.5px] leading-tight',
                    cleared ? 'text-good' : 'text-muted',
                  )}
                >
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
