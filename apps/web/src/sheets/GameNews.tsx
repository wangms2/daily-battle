// A one-time note for players from before Gen 5 OU: a second daily game is
// here, with its own team and streak. New players pick a game on the welcome
// sheet instead, so they never see it.
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/bits';

export const GEN5_NEWS = 'gen5-news';

export function GameNewsSheet({
  open,
  onTry,
  onStay,
}: {
  open: boolean;
  onTry: () => void;
  onStay: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onStay()} title="New: Gen 5 OU">
      <p className="text-[15px] leading-relaxed">
        A second daily game, from the Black and White era. It has its own weekly team, opponents,
        and streak, so your Gen 4 streak is safe.
      </p>
      <p className="mt-2 text-[14px] leading-relaxed text-muted">
        One difference: both teams are shown before the battle, so the opponent sees your six too.
        Switch games any time from the title.
      </p>
      <div className="mt-4 grid gap-2">
        <Button onClick={onTry}>Try Gen 5 OU</Button>
        <Button variant="secondary" onClick={onStay}>
          Stay on Gen 4
        </Button>
      </div>
    </Sheet>
  );
}
