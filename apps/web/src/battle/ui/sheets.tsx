import { useEffect, useRef } from 'react';
import { ConfirmDialog } from '../../sheets/misc';
import { Sheet } from '../../ui/Sheet';
import { Button, Switch } from '../../ui/bits';
import { BattleText } from './text';

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
      {lines.map((l, i) =>
        l.startsWith('== Turn') ? (
          <p
            key={i}
            className="display mt-3 mb-1 text-[12px] tracking-wider text-muted uppercase first:mt-0"
          >
            {l.replace(/=/g, '').trim()}
          </p>
        ) : (
          <p key={i} className={l.startsWith('(') ? 'text-muted' : undefined}>
            <BattleText text={l} />
          </p>
        ),
      )}
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
  onLeave,
  onGiveUp,
  canGiveUp,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  hints: boolean;
  animations: boolean;
  onHints: (v: boolean) => void;
  onAnimations: (v: boolean) => void;
  onLog: () => void;
  onLeave: () => void;
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
      </div>
      <div className="mt-3 grid gap-2">
        <Button variant="secondary" onClick={onLog}>
          Battle log
        </Button>
        <Button variant="secondary" onClick={onLeave}>
          Back to today (battle is saved)
        </Button>
        {canGiveUp && (
          <Button variant="ghost" className="text-bad" onClick={onGiveUp}>
            Give up
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
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: () => void;
  firstTry: boolean;
  /** Today's counted tries are already done. */
  practice?: boolean;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Give up this battle?"
      body={
        practice
          ? 'It’s a practice run, so it doesn’t change today’s result.'
          : firstTry
            ? 'It counts as a loss for today’s first try, with the Pokémon you have left.'
            : 'It counts as a lost try, with the Pokémon you have left.'
      }
      confirm="Give up"
      cancel="Keep battling"
      onConfirm={onConfirm}
    />
  );
}
