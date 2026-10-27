// How Link Battle works (DESIGN.md §18): shown the first time someone opens Link
// Battle or joins a room by link, and again from "How it works".
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/bits';

const RULES = [
  ['Build from the same 12', 'Everyone picks a team from the room’s 12 Pokémon.'],
  ['Battle each round', 'Face someone new: make one change to your team, pick a lead, and battle.'],
  ['Last one standing wins', 'Lose a battle, lose a life. Run out and you can watch.'],
  ['An odd one out faces the Rival', 'With an odd number left, one player battles the AI.'],
];

export function VersusHowTo({ open, onDone }: { open: boolean; onDone: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onDone()} title="How Link Battle works">
      <ol className="space-y-2">
        {RULES.map(([title, body], i) => (
          <li key={title} className="flex gap-3">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[13px] font-bold text-soft-ink">
              {i + 1}
            </span>
            <span>
              <span className="block text-[15px] leading-snug font-semibold">{title}</span>
              <span className="block text-[13px] leading-snug text-muted">{body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-card bg-surface-2 px-4 py-3 text-[13px] leading-snug">
        <span className="font-semibold">Handicaps.</span> A stronger player can take fewer Pokémon
        (5, 4, or 3) to even things out. Set your own in the room; the host can set anyone’s.
      </p>
      <Button className="mt-4 w-full" onClick={onDone}>
        Got it
      </Button>
    </Sheet>
  );
}

/** The link that brings the sheet back. */
export function HowToLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[14px] font-semibold text-accent underline-offset-2 hover:underline"
    >
      How it works
    </button>
  );
}
