// The coach's UI (DESIGN.md §22): a turn tip above the controls, a confirm
// sheet for blunders, and the post-battle review on the end card.
import type { CoachNote, Review } from '@daily-battle/tutorial';
import { useState } from 'react';
import { ConfirmDialog } from '../../sheets/misc';
import { CloseIcon } from '../../ui/icons';

export function CoachTip({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <p
      role="note"
      aria-label="Coach tip"
      className="animate-fade-in flex items-start gap-2 rounded-card bg-accent-soft px-3 py-2 text-[14px] leading-snug"
    >
      <span aria-hidden>💡</span>
      <span className="flex-1">{text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss tip"
        className="-m-1 p-1 text-soft-ink"
      >
        <CloseIcon width={16} height={16} />
      </button>
    </p>
  );
}

/** "Are you sure?" for a choice the coach flags; the player can silence the rule for the battle. */
export function CoachWarning({
  note,
  onPickAgain,
  onConfirm,
}: {
  note: CoachNote | null;
  onPickAgain: () => void;
  onConfirm: (silence: boolean) => void;
}) {
  const [silence, setSilence] = useState(false);
  return (
    <ConfirmDialog
      open={!!note}
      onOpenChange={(open) => {
        if (!open) {
          setSilence(false);
          onPickAgain();
        }
      }}
      title="Coach: are you sure?"
      body={note?.text ?? ''}
      cancel="Pick again"
      confirm="Do it anyway"
      onConfirm={() => {
        onConfirm(silence);
        setSilence(false);
      }}
    >
      <label className="mt-2 flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={silence}
          onChange={(e) => setSilence(e.target.checked)}
          className="size-4"
        />
        Don’t warn about this again this battle
      </label>
    </ConfirmDialog>
  );
}

/**
 * The coach's look back at the battle: up to 3 key turns and a thing or two
 * done well. With `onShow`, each turn can be replayed (its index among
 * the key turns, then the turns done well).
 */
export function CoachReview({ review, onShow }: { review: Review; onShow?: (i: number) => void }) {
  const show = (i: number) =>
    onShow && (
      <button
        type="button"
        onClick={() => onShow(i)}
        className="mt-1 text-[13px] font-semibold text-accent underline underline-offset-2"
      >
        Show turn
      </button>
    );
  if (!review.key.length && !review.good.length) return null;
  return (
    <section
      aria-label="Coach review"
      className="mt-4 grid gap-2 text-left text-[14px] leading-snug"
    >
      <h3 className="display text-[14px] tracking-wider text-muted uppercase">Coach review</h3>
      {review.key.map((t, i) => (
        <div key={`k${t.turn}`} className="rounded-card bg-surface-2 px-3 py-2">
          <p className="text-[12px] font-semibold text-muted">
            Turn {t.turn}: {t.me} vs {t.foe}
          </p>
          <p>
            You chose <b>{t.chose}</b>
            {t.better && (
              <>
                ; <b>{t.better}</b> was better
              </>
            )}
            .
          </p>
          <p className="text-soft-ink">{t.text}</p>
          {show(i)}
        </div>
      ))}
      {review.good.map((t, i) => (
        <div key={`g${t.turn}`} className="rounded-card bg-accent-soft px-3 py-2">
          <p className="text-[12px] font-semibold text-muted">
            ✓ Turn {t.turn}: {t.firstChose ? `${t.firstChose} → ${t.chose}` : t.chose}
          </p>
          <p>{t.text}</p>
          {show(review.key.length + i)}
        </div>
      ))}
    </section>
  );
}
