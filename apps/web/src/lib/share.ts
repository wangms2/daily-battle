// The share text (DESIGN.md §11) and the share action. Plain text that pastes
// anywhere; never opponent species, sets, or turn counts.
import type { Attempt, DayChange } from '../state/schema';
import type { DaySummary } from './results';

export interface ShareArgs {
  /** `YYYY-MM-DD` */
  day: string;
  summary: DaySummary;
  streak: number;
  change?: DayChange;
  /** The run being shared from its end card; a practice run gets a line of its own. */
  run?: Attempt;
  /** Where to play, added as the last line so friends can tap through. */
  url?: string;
}

export interface ShareRow {
  result: 'win' | 'loss' | 'forfeit';
  /** Pokémon left, 0–6. */
  remaining: number;
}

/** What a share says, whether as text or as the image card (lib/shareCard.ts). */
export interface ShareModel {
  date: string;
  status: DaySummary['status'];
  /** "First try! 4/6 left", "Won on try 2 · 3/6 left", … (no emoji). */
  headline: string;
  /** Won at all today, even on a practice try after the 3 that counted. */
  cleared: boolean;
  /** The tries that counted (just the win on a first try). */
  rows: ShareRow[];
  /** A practice run shared from its end card, with the Pokémon it swapped in. */
  practice?: ShareRow & { with?: string };
  /** The deciding try's team; `swapped` marks today's change. */
  team: { species: string; swapped: boolean }[];
  /** "5-day streak", "Streak reset", or nothing. */
  streak: string | null;
  url?: string;
}

const row = (a: Attempt): ShareRow => ({
  result: a.result === 'inProgress' ? 'loss' : a.result,
  remaining: a.remaining,
});

export function shareModel({ day, summary, streak, change, run, url }: ShareArgs): ShareModel {
  const { status, counted, tries, winTry } = summary;
  const date = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const winning = winTry !== null ? tries[winTry - 1] : undefined;
  const headline =
    status === 'firstTry'
      ? `First try! ${winning!.remaining}/6 left`
      : winning
        ? `Won on try ${winTry} · ${winning.remaining}/6 left`
        : status === 'failed'
          ? 'Not cleared in 3 tries'
          : `Not cleared yet · ${counted.length} of 3 tries`;

  // A practice run after the day was decided: shown as an extra, never as a try.
  const practice =
    run &&
    run.result !== 'inProgress' &&
    run.ts !== winning?.ts &&
    !counted.some((a) => a.ts === run.ts)
      ? run
      : undefined;
  const swap = practice?.practiceChange;

  // The team from the deciding try: the win, or the latest try that counted.
  const swappedIn = change?.kind === 'replace' ? change.to.species : undefined;
  const team = ((winning ?? counted.at(-1))?.team ?? []).map((s) => ({
    species: s.species,
    swapped: s.species === swappedIn,
  }));

  return {
    date,
    status,
    headline,
    cleared: !!winning,
    rows: (status === 'firstTry' ? [winning!] : counted).map(row),
    ...(practice && {
      practice: { ...row(practice), ...(swap?.kind === 'replace' && { with: swap.to.species }) },
    }),
    team,
    streak: status === 'failed' ? 'Streak reset' : streak > 0 ? `${streak}-day streak` : null,
    url,
  };
}

/** Pokémon left as squares: green, or grey (⬜) for a try that was given up. */
const squares = (r: ShareRow) =>
  (r.result === 'forfeit' ? '⬜' : '🟩').repeat(r.remaining) +
  '⬛'.repeat(Math.max(0, 6 - r.remaining));
const mark = (r: ShareRow) => (r.result === 'win' ? '✅' : '❌');

export function shareText(args: ShareArgs): string {
  return formatShareText(shareModel(args));
}

export function formatShareText(m: ShareModel): string {
  const lines = [`Daily Battle · ${m.date}`];
  const icon =
    m.status === 'firstTry' ? '⭐ ' : m.cleared ? '✅ ' : m.status === 'failed' ? '❌ ' : '';
  lines.push(`${icon}${m.headline}`);
  // One row per try, each led by one emoji so the squares line up; a practice
  // run is 🔁 with a short tag after its squares.
  for (const r of m.rows) lines.push(`${mark(r)} ${squares(r)}`);
  if (m.practice) {
    const tag = m.practice.with ? `practice, with ${m.practice.with}` : 'practice';
    lines.push(`🔁 ${squares(m.practice)} ${tag}`);
  }
  if (m.team.length) {
    lines.push(m.team.map((s) => (s.swapped ? `${s.species}*` : s.species)).join(', '));
  }
  if (m.streak) lines.push(`🔥 ${m.streak}`);
  if (m.url) lines.push(m.url);
  return lines.join('\n');
}

export type ShareOutcome = 'shared' | 'copied' | 'manual';

/**
 * Opens the system share sheet where there is one (phones), else copies to the
 * clipboard. 'manual' means neither worked and the caller should show the text.
 */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      // Dismissing the sheet isn't a failure; anything else falls through to copying.
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'manual';
  }
}

export type ImageMode = 'share' | 'copy' | 'save';

/** How this browser can pass on an image: the share sheet, the clipboard, or a download. */
export function imageMode(): ImageMode {
  if (typeof navigator === 'undefined') return 'save';
  // The system share sheet is best (phones). Browsers with a share sheet but
  // no canShare get to try it; shareImage falls back if it refuses the file.
  if (typeof navigator.share === 'function') {
    if (typeof navigator.canShare !== 'function') return 'share';
    try {
      const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' });
      if (navigator.canShare({ files: [probe] })) return 'share';
    } catch {
      // File unsupported: fall through.
    }
  }
  if (typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function') {
    return 'copy';
  }
  return 'save';
}

export type ImageOutcome = 'shared' | 'copied' | 'saved' | 'failed';

/** Passes on the share image the best way this browser can. */
export async function shareImage(blob: Blob, { name }: { name: string }): Promise<ImageOutcome> {
  const mode = imageMode();
  if (mode === 'share') {
    try {
      const file = new File([blob], name, { type: 'image/png' });
      // The image alone: with text alongside, iOS's Copy and some apps keep only
      // the text. The card already shows where to play.
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  if (mode !== 'save') {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'copied';
    } catch {
      // Fall back to a download.
    }
  }
  try {
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href, download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
    return 'saved';
  } catch {
    return 'failed';
  }
}
