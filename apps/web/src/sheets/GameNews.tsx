// A one-time note for returning players when a new daily game arrives, with
// its own team and streak. New players pick a game on the welcome sheet
// instead, so they never see it. Only the newest note is shown: a player who
// missed an earlier note goes straight to the newest one, and either button
// marks all notes as seen.
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/bits';

export function GameNewsSheet({
  open,
  current,
  onTry,
  onStay,
}: {
  open: boolean;
  /** The game being played, e.g. "Gen 4". */
  current: string;
  onTry: () => void;
  onStay: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onStay()} title="New: Gen 3 OU">
      <p className="text-[15px] leading-relaxed">
        A new daily game, from the Ruby and Sapphire era, with the games' own sprites. It has its
        own weekly team, opponents, and streak, so your other streaks are safe.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        Attacks are physical or special by their type, and Spikes is the only hazard. Switch games
        any time from the title.
      </p>
      <div className="mt-4 grid gap-2">
        <Button onClick={onTry}>Try Gen 3 OU</Button>
        <Button variant="secondary" onClick={onStay}>
          Stay on {current}
        </Button>
      </div>
    </Sheet>
  );
}
