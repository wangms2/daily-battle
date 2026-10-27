// Shared pieces for showing a day's result: the try rows, and a Share button
// that falls back to copying (or showing the text to copy).
import clsx from 'clsx';
import { useEffect, useState, type ReactNode } from 'react';
import { condenseTries, tryCount, type DaySummary } from '../lib/results';
import {
  anyShareText,
  imageMode,
  isShareAll,
  shareImage,
  copyText,
  shareResult,
  type ImageMode,
  type ImageOutcome,
  type ShareAll,
  type ShareModel,
  type ShareOutcome,
} from '../lib/share';
import { anyShareCardBlob } from '../lib/shareCard';
import { OtherGames, useShareAll } from './OtherGames';
import { Sheet } from './Sheet';
import { Button } from './bits';

type Try = DaySummary['tries'][number];

function TryRow({ a, label, current }: { a: Try; label: string; current: boolean }) {
  return (
    <div
      className={clsx(
        'flex items-center gap-1.5 rounded-badge px-1.5 py-0.5',
        current && 'bg-surface-2',
      )}
      role="img"
      aria-label={`${label}: ${a.result === 'win' ? 'won' : a.result === 'forfeit' ? 'gave up' : 'lost'}, ${a.remaining} of 6 left`}
    >
      <span
        className={clsx(
          'w-4 text-center text-[13px] font-bold',
          a.result === 'win' ? 'text-good' : 'text-bad',
        )}
        aria-hidden
      >
        {a.result === 'win' ? '✓' : '✗'}
      </span>
      {Array.from({ length: 6 }, (_, j) => (
        <span
          key={j}
          aria-hidden
          className={clsx(
            'size-4 rounded-[4px]',
            j >= a.remaining
              ? 'bg-surface-2 ring-1 ring-line'
              : a.result === 'forfeit'
                ? 'bg-muted/50' // given up: still standing, but not a result
                : 'bg-good',
          )}
        />
      ))}
    </div>
  );
}

/**
 * The tries that count, one row of six squares each (green = Pokémon left),
 * shortened to their ends past four so the card keeps its size. A practice run
 * being shown gets its own row under a "Practice" label.
 */
export function TryRows({ summary, current }: { summary: DaySummary; current?: number }) {
  const practice = summary.tries.slice(summary.counted.length);
  const shown = practice.find((a) => a.ts === current);
  const others = practice.length - (shown ? 1 : 0);
  return (
    <div className="flex flex-col items-center gap-1">
      {condenseTries(
        summary.counted.map((a, i) => ({ a, n: i + 1 })),
        4,
      ).map((x) =>
        'more' in x ? (
          <span key="more" className="text-[12px] text-muted">
            ⋯ {tryCount(x.more)} more
          </span>
        ) : (
          <TryRow key={x.a.ts} a={x.a} label={`Try ${x.n}`} current={x.a.ts === current} />
        ),
      )}
      {shown && (
        <>
          <span className="mt-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
            Practice
          </span>
          <TryRow a={shown} label="Practice" current />
        </>
      )}
      {others > 0 && (
        <span className="text-[12px] text-muted">
          + {others} {shown ? 'more ' : ''}practice
        </span>
      )}
    </div>
  );
}

const IMAGE_LABEL: Record<ImageMode, string> = {
  share: 'Share image',
  copy: 'Copy image',
  save: 'Save image',
};
const TOAST: Partial<Record<ImageOutcome | ShareOutcome, string>> = {
  copied: 'Copied to clipboard',
  saved: 'Image saved',
};

function useToast() {
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);
  const node = toast && (
    <div
      role="status"
      className="animate-fade-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[14px] font-semibold text-bg shadow-card"
    >
      {toast}
    </div>
  );
  return [node, setToast] as const;
}

/** The text to copy by hand, when neither sharing nor the clipboard works. */
function ManualCopy({
  text,
  open,
  onOpenChange,
}: {
  text: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Copy your result">
      <textarea
        readOnly
        value={text}
        rows={text.split('\n').length}
        onFocus={(e) => e.currentTarget.select()}
        autoFocus
        className="w-full resize-none rounded-card border border-line bg-surface-2 p-3 text-[14px] leading-relaxed"
      />
    </Sheet>
  );
}

/** Shares plain text straight away (share sheet, else clipboard, else by hand). */
export function TextShareButton({
  text,
  variant = 'primary',
  className,
  children,
}: {
  text: string;
  variant?: 'primary' | 'secondary';
  className?: string;
  children: ReactNode;
}) {
  const [toast, setToast] = useToast();
  const [manual, setManual] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={async () => {
          const outcome = await shareResult(text);
          if (outcome === 'copied') setToast(TOAST.copied!);
          if (outcome === 'manual') setManual(true);
        }}
      >
        {children}
      </Button>
      {toast}
      <ManualCopy text={text} open={manual} onOpenChange={setManual} />
    </>
  );
}

/** The card for `share`, drawn when `open` turns on and redrawn when its text changes. */
function useCard(share: ShareModel | ShareAll, text: string, open: boolean) {
  const [image, setImage] = useState<{ blob: Blob; url: string } | 'failed' | null>(null);
  useEffect(() => {
    if (!open) return;
    let url: string | null = null;
    let live = true;
    anyShareCardBlob(share)
      .then((blob) => {
        if (!live) return;
        if (!blob) return setImage('failed');
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch(() => live && setImage('failed'));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
      setImage(null);
    };
    // Redraw only when what the card says changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text]);
  return image;
}

/**
 * Share opens a choice: the result card as an image (previewed), which goes
 * to the share sheet where there is one, else the clipboard; or the text,
 * copied straight to the clipboard (shown to copy by hand if that fails).
 * With two or more games played today, a switch picks this game or all of them.
 */
export function ShareButton({
  share,
  variant = 'primary',
  className,
  children = 'Share',
}: {
  share: ShareModel;
  variant?: 'primary' | 'secondary';
  className?: string;
  children?: ReactNode;
}) {
  const all = useShareAll();
  return (
    <ShareSheetButton
      share={share}
      all={all && isShareAll(all) ? all : null}
      variant={variant}
      className={className}
      others
    >
      {children}
    </ShareSheetButton>
  );
}

/**
 * Shares every game played today (the picker's button). One game is that
 * game's full share; two or more are the compact card.
 */
export function ShareAllButton({
  share,
  variant = 'secondary',
  className,
  children,
}: {
  share: ShareModel | ShareAll;
  variant?: 'primary' | 'secondary';
  className?: string;
  children: ReactNode;
}) {
  return (
    <ShareSheetButton share={share} variant={variant} className={className}>
      {children}
    </ShareSheetButton>
  );
}

const SCOPES = [
  { id: 'game', label: 'This game' },
  { id: 'all', label: 'All games' },
] as const;

function ShareSheetButton({
  share,
  all = null,
  others = false,
  variant = 'primary',
  className,
  children,
}: {
  share: ShareModel | ShareAll;
  /** Offers "All games" next to `share`. */
  all?: ShareAll | null;
  /** Shows the other games to play under the buttons. */
  others?: boolean;
  variant?: 'primary' | 'secondary';
  className?: string;
  children: ReactNode;
}) {
  const [scope, setScope] = useState<'game' | 'all'>('game');
  const shown = scope === 'all' && all ? all : share;
  const text = anyShareText(shown);
  const [toast, setToast] = useToast();
  const [choosing, setChoosing] = useState(false);
  const [manual, setManual] = useState(false);
  // The card is drawn when the choice opens, so sharing it needs no wait (iOS
  // only opens the share sheet straight from a tap).
  const image = useCard(shown, text, choosing);
  const mode = imageMode();

  // The toast says what was copied: "Text copied", "Image copied".
  const finish = (outcome: ImageOutcome | ShareOutcome, what: 'Text' | 'Image') => {
    setChoosing(false);
    if (outcome === 'manual') setManual(true);
    setToast(outcome === 'copied' ? `${what} copied` : (TOAST[outcome] ?? null));
  };
  const ready = image && image !== 'failed' ? image : null;

  return (
    <>
      <Button
        variant={variant}
        className={className}
        onClick={() => {
          setScope('game');
          setChoosing(true);
        }}
      >
        {children}
      </Button>
      {toast}
      {/* Roomier on a computer: the card shows near its real size. */}
      <Sheet open={choosing} onOpenChange={setChoosing} title="Share your result" size="md">
        <div className="grid gap-3">
          {all && (
            <div
              className="seg flex justify-self-center p-0.5"
              role="radiogroup"
              aria-label="What to share"
            >
              {SCOPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={scope === s.id}
                  onClick={() => setScope(s.id)}
                  className={clsx(
                    'min-h-8 rounded-lg px-3.5 text-[13px] font-semibold',
                    scope === s.id ? 'bg-surface text-ink shadow-card' : 'text-muted',
                  )}
                >
                  {s.id === 'all' ? `All games (${all.games.length})` : s.label}
                </button>
              ))}
            </div>
          )}
          {image !== 'failed' && (
            <div className="aspect-[1200/630] overflow-hidden rounded-card border border-line bg-surface-2">
              {ready && (
                <img
                  src={ready.url}
                  alt={text}
                  className="animate-fade-in size-full object-cover"
                />
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={!ready}
              onClick={async () =>
                ready &&
                finish(
                  await shareImage(ready.blob, {
                    name: `pokemon-daily-${shown.date.replace(/\s+/g, '-').toLowerCase()}.png`,
                  }),
                  'Image',
                )
              }
            >
              {IMAGE_LABEL[mode]}
            </Button>
            <Button variant="secondary" onClick={async () => finish(await copyText(text), 'Text')}>
              Copy text
            </Button>
          </div>
          {others && <OtherGames className="mt-1" onPicked={() => setChoosing(false)} />}
        </div>
      </Sheet>
      <ManualCopy text={text} open={manual} onOpenChange={setManual} />
    </>
  );
}
