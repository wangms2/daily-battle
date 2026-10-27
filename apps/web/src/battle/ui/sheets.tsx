import { useEffect, useRef } from 'react';
import { ConfirmDialog } from '../../sheets/misc';
import { Sheet } from '../../ui/Sheet';
import { Button, Switch } from '../../ui/bits';
import { BattleLine } from './text';

export function LogSheet({
  open,
  onOpenChange,
  lines,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lines: string[];
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Battle log">
      <LogList lines={lines} className="h-[60dvh]" />
    </Sheet>
  );
}

/** The full log, newest at the bottom, scrolled to the end. */
export function LogList({ lines, className }: { lines: string[]; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  // Scroll only the log itself to its end (scrollIntoView could move the page too).
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length]);
  return (
    <div
      ref={box}
      className={`overflow-y-auto overscroll-contain text-[13.5px] leading-relaxed ${className ?? ''}`}
    >
      {lines
        .filter((l) => l.trim())
        .map((l, i) => (
          <BattleLine key={i} text={l} />
        ))}
    </div>
  );
}

export function MenuSheet({
  open,
  onOpenChange,
  hints,
  animations,
  onHints,
  onAnimations,
  onLog,
  onChart,
  onLeave,
  leaveLabel = 'Back to today (battle is saved)',
  onGiveUp,
  canGiveUp,
  coach,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** The daily coach, where it's offered: once on, it stays on for the battle. */
  coach?: { on: boolean; onTurnOn: () => void };
  hints: boolean;
  animations: boolean;
  onHints: (v: boolean) => void;
  onAnimations: (v: boolean) => void;
  onLog: () => void;
  /** The type chart, for this battle's game. */
  onChart: () => void;
  onLeave: () => void;
  /** The way out, e.g. "Back to lessons" (the daily's by default). */
  leaveLabel?: string;
  onGiveUp: () => void;
  canGiveUp: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Battle">
      <div className="divide-y divide-line">
        <Switch
          checked={hints}
          onCheckedChange={onHints}
          label="Beginner hints"
          hint="Effectiveness, speed, and tips"
        />
        <Switch checked={animations} onCheckedChange={onAnimations} label="Animations" />
        {coach && (
          <Switch
            checked={coach.on}
            disabled={coach.on}
            onCheckedChange={(v) => v && coach.onTurnOn()}
            label="Coach"
            hint={
              coach.on
                ? 'On for the rest of this battle'
                : 'Tips, blunder warnings, and a review. A Coached result.'
            }
          />
        )}
      </div>
      <div className="mt-3 grid gap-2">
        <Button variant="secondary" onClick={onLog}>
          Battle log
        </Button>
        <Button variant="secondary" onClick={onChart}>
          Type chart
        </Button>
        <Button variant="secondary" onClick={onLeave}>
          {leaveLabel}
        </Button>
        {canGiveUp && (
          <Button variant="ghost" className="text-bad" onClick={onGiveUp}>
            Forfeit
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export function GiveUpDialog({
  open,
  onOpenChange,
  onConfirm,
  firstTry,
  practice = false,
  body,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  firstTry: boolean;
  /** Today's counted tries are already done. */
  practice?: boolean;
  /** What giving up means, when it isn't about today's tries (a versus battle). */
  body?: string;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Forfeit this battle?"
      body={
        body ??
        (practice
          ? 'It’s a practice run, so it doesn’t change today’s result.'
          : firstTry
            ? 'It counts as a loss for today’s first try, with the Pokémon you have left.'
            : 'It counts as a lost try, with the Pokémon you have left.')
      }
      confirm="Forfeit"
      cancel="Keep battling"
      onConfirm={onConfirm}
    />
  );
}
