// The first screen: Daily Battle or a versus room with friends. Daily Battle
// opens the game picker (Gen 4, 5, 6), where each game keeps its own weekly
// team, tries, and streak. A shared link lands on the picker.
import type { FormatId } from '@daily-battle/data/formats';
import type { ReactNode } from 'react';
import { ChevronIcon, FlameIcon } from '../ui/icons';

export interface GameRow {
  id: FormatId;
  /** "Gen 5 OU" */
  name: string;
  /** What sets the game apart: "Black and White, with Team Preview". */
  blurb: string;
  streak: number;
  /** Today's status, e.g. "First try!" or "Not played yet". */
  today: string;
}

function Choice({
  title,
  body,
  onClick,
  children,
}: {
  title: string;
  body: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="card flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-surface-2"
    >
      <span className="min-w-0 flex-1">
        <span className="display block text-[18px]">{title}</span>
        <span className="mt-0.5 block text-[14px] text-muted">{body}</span>
      </span>
      {children}
      <ChevronIcon className="size-5 shrink-0 text-muted" aria-hidden />
    </button>
  );
}

export function Landing({
  topBar,
  onDaily,
  onVersus,
}: {
  topBar: ReactNode;
  onDaily: () => void;
  onVersus: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {topBar}
      <main className="mx-auto flex w-full max-w-[480px] min-h-0 flex-1 flex-col justify-center gap-3 px-4 pb-8">
        <Choice
          title="Daily Battle"
          body="A new team each week and a new opponent every day. Keep your streak going."
          onClick={onDaily}
        />
        <Choice
          title="Versus with friends"
          body="Make a room, share the code, and battle live."
          onClick={onVersus}
        />
      </main>
    </div>
  );
}

export function DailyPicker({
  topBar,
  games,
  onPick,
}: {
  topBar: ReactNode;
  games: GameRow[];
  onPick: (id: FormatId) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {topBar}
      <main className="mx-auto flex w-full max-w-[480px] min-h-0 flex-1 flex-col justify-center gap-3 px-4 pb-8">
        <h1 className="display text-[20px]">Choose a game</h1>
        <p className="-mt-2 text-[14px] text-muted">
          Each game has its own team, opponents, and streak.
        </p>
        {games.map((g) => (
          <button
            key={g.id}
            type="button"
            onClick={() => onPick(g.id)}
            className="card flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[17px] font-semibold">{g.name}</span>
              <span className="block truncate text-[13px] text-muted">{g.blurb}</span>
              <span className="block truncate text-[13px] text-muted">{g.today}</span>
            </span>
            <span
              className="flex items-center gap-1 text-[15px] font-semibold tabular-nums"
              aria-label={`Streak ${g.streak}`}
            >
              <FlameIcon className={g.streak > 0 ? 'text-gold' : 'text-muted'} />
              {g.streak}
            </span>
            <ChevronIcon className="size-5 shrink-0 text-muted" aria-hidden />
          </button>
        ))}
      </main>
    </div>
  );
}
