// A one-time note for returning players when a new daily game arrives, with
// its own team and streak. New players pick a game on the welcome sheet
// instead, so they never see it. Only the newest note is shown: a player who
// missed the Gen 5 note goes straight to the Gen 6 one, and either marks all
// notes as seen.
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
    <Sheet open={open} onOpenChange={(o) => !o && onStay()} title="New: Gen 6 OU">
      <p className="text-[15px] leading-relaxed">
        A new daily game, from the X and Y era, with Mega Evolution and Fairy types. It has its own
        weekly team, opponents, and streak, so your other streaks are safe.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        One Mega per team, and both teams are shown before the battle. Switch games any time from
        the title.
      </p>
      <div className="mt-4 grid gap-2">
        <Button onClick={onTry}>Try Gen 6 OU</Button>
        <Button variant="secondary" onClick={onStay}>
          Stay on {current}
        </Button>
      </div>
    </Sheet>
  );
}
