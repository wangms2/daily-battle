// The share text (DESIGN.md §11) and the share action. Plain text that pastes
// anywhere; never opponent species, sets, or turn counts.
import type { Difficulty } from '@daily-battle/ai/version';
import type { FormatId } from '@daily-battle/data/formats';
import type { Attempt, DayChange } from '../state/schema';
import { condenseTries, streakBroken, tryCount, type DaySummary } from './results';

export interface ShareArgs {
  /** `YYYY-MM-DD` */
  day: string;
  summary: DaySummary;
  streak: number;
  change?: DayChange;
  /** Where to play, added as the last line so friends can tap through. */
  url?: string;
  /** The game's name, "Gen 4 OU", shown after "Pokémon Daily". */
  game?: string;
  /** The game played; the image card's header takes its colour. */
  format?: FormatId;
  /** The CPU difficulty; only Easy and Hard show. */
  difficulty?: Difficulty;
  /** The coached tries (any difficulty): the header says so, with the deciding try's difficulty. */
  coached?: boolean;
}

export interface ShareRow {
  result: 'win' | 'loss' | 'forfeit';
  /** Pokémon left, 0–6. */
  remaining: number;
}

/** What a share says, whether as text or as the image card (lib/shareCard.ts). */
export interface ShareModel {
  /** "Gen 5", or nothing. */
  game?: string;
  format?: FormatId;
  /** "Easy" or "Hard"; nothing for Normal. */
  level?: string;
  /** The coach helped (DESIGN.md §22). */
  coached?: true;
  date: string;
  status: DaySummary['status'];
  /** "First try! 4/6 left", "Won on try 2 · 3/6 left", … (no emoji). */
  headline: string;
  /** Won today, on any try. */
  cleared: boolean;
  /** Every try that counted, up to the win (just the win on a first try). Practice runs after a win never show. */
  rows: ShareRow[];
  /** The deciding try's team; `swapped` marks today's change. */
  team: { species: string; swapped: boolean }[];
  /** "5-day streak", "Streak reset", or nothing. */
  streak: string | null;
  url?: string;
}

export const DIFFICULTY_NAME: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
};

/** What follows "Pokémon Daily": "Gen 4 OU · Hard · Oct 21", "Gen 3 OU · Easy · Coached · Oct 21". */
export const shareHeader = (m: Pick<ShareModel, 'game' | 'level' | 'coached' | 'date'>) =>
  [m.game, m.level, m.coached && 'Coached', m.date].filter(Boolean).join(' · ');

const row = (a: Attempt): ShareRow => ({
  result: a.result === 'inProgress' ? 'loss' : a.result,
  remaining: a.remaining,
});

export function shareModel({
  day,
  summary,
  streak,
  change,
  url,
  game,
  format,
  difficulty,
  coached,
}: ShareArgs): ShareModel {
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
          ? 'Not cleared'
          : `Not cleared yet · ${tryCount(counted.length)}`;

  // The team from the deciding try: the win, or the latest try that counted.
  const swappedIn = change?.kind === 'replace' ? change.to.species : undefined;
  const team = ((winning ?? counted.at(-1))?.team ?? []).map((s) => ({
    species: s.species,
    swapped: s.species === swappedIn,
  }));

  // Coached tries can span difficulties: name the one the result came from.
  const level = coached ? (winning ?? counted.at(-1))?.difficulty : difficulty;
  return {
    ...(game && { game }),
    ...(format && { format }),
    ...(level && level !== 'normal' && { level: DIFFICULTY_NAME[level] }),
    ...(coached && { coached: true as const }),
    date,
    status,
    headline,
    cleared: !!winning,
    rows: (status === 'firstTry' ? [winning!] : counted).map(row),
    team,
    streak: streakBroken(summary) ? 'Streak reset' : streak > 0 ? `${streak}-day streak` : null,
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
  const lines = [`Pokémon Daily · ${shareHeader(m)}`];
  const icon =
    m.status === 'firstTry' ? '⭐ ' : m.cleared ? '✅ ' : m.status === 'failed' ? '❌ ' : '';
  lines.push(`${icon}${m.headline}`);
  // One row per try, each led by one emoji so the squares line up. Past ten
  // tries, the middle ones become a count.
  for (const r of condenseTries(m.rows, 10)) {
    lines.push('more' in r ? `⋯ ${tryCount(r.more)} more` : `${mark(r)} ${squares(r)}`);
  }
  if (m.team.length) {
    lines.push(m.team.map((s) => (s.swapped ? `${s.species}*` : s.species)).join(', '));
  }
  if (m.streak) lines.push(`🔥 ${m.streak}`);
  if (m.url) lines.push(m.url);
  return lines.join('\n');
}

/**
 * Every game played today in one share. One game is that game's own full share;
 * two or more get a compact line pair each (no team), as `ShareAll`.
 */
export interface ShareAll {
  date: string;
  /** Today's played games, in picker order. */
  games: ShareModel[];
  url?: string;
}

/** Today's played games as one share: the single game's own share, or the compact one. */
export function shareAll(games: ShareModel[], url?: string): ShareModel | ShareAll | null {
  const played = games.filter((m) => m.status !== 'none');
  if (played.length < 2) return played[0] ?? null;
  return { date: played[0]!.date, games: played, ...(url && { url }) };
}

export const isShareAll = (m: ShareModel | ShareAll): m is ShareAll => 'games' in m;

/** "First try!", "Won on try 2", "Not cleared yet · 2 tries": the squares show what's left. */
export function shortHeadline(m: ShareModel): string {
  if (m.status === 'firstTry') return 'First try!';
  if (m.cleared) return `Won on try ${m.rows.length}`;
  if (m.status === 'failed') return 'Not cleared';
  return `Not cleared yet · ${tryCount(m.rows.length)}`;
}

/** "Gen 3 OU · Easy · Coached": a game's name in the compact share. */
export const gameLabel = (m: ShareModel) =>
  [m.game, m.level, m.coached && 'Coached'].filter(Boolean).join(' · ');

/**
 * Pokémon Daily · Oct 21
 * Gen 3 OU · Easy · 🔥 5-day streak
 * ⭐ 🟩🟩🟩🟩⬛⬛ First try!
 * Gen 4 OU · Streak reset
 * ❌ ⬛⬛⬛⬛⬛⬛ Not cleared yet · 1 try
 */
export function formatShareAllText(all: ShareAll): string {
  const lines = [`Pokémon Daily · ${all.date}`];
  for (const m of all.games) {
    const streak = m.streak && (m.streak === 'Streak reset' ? m.streak : `🔥 ${m.streak}`);
    lines.push([gameLabel(m), streak].filter(Boolean).join(' · '));
    const icon = m.status === 'firstTry' ? '⭐' : m.cleared ? '✅' : '❌';
    lines.push(`${icon} ${squares(m.rows.at(-1)!)} ${shortHeadline(m)}`);
  }
  if (all.url) lines.push(all.url);
  return lines.join('\n');
}

/** The text for either kind of share. */
export const anyShareText = (m: ShareModel | ShareAll) =>
  isShareAll(m) ? formatShareAllText(m) : formatShareText(m);

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

/** Copies to the clipboard, never the share sheet; 'manual' means show it to copy by hand. */
export async function copyText(text: string): Promise<ShareOutcome> {
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
  const canCopy =
    typeof ClipboardItem !== 'undefined' && typeof navigator.clipboard?.write === 'function';
  // Desktops copy the picture itself: the Windows share sheet's Copy puts a
  // file on the clipboard, which chat apps won't paste as an image.
  const desktop =
    typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (desktop && canCopy) return 'copy';
  // Otherwise the system share sheet is best (phones). Browsers with a share
  // sheet but no canShare get to try it; shareImage falls back if it refuses the file.
  if (typeof navigator.share === 'function') {
    if (typeof navigator.canShare !== 'function') return 'share';
    try {
      const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' });
      if (navigator.canShare({ files: [probe] })) return 'share';
    } catch {
      // File unsupported: fall through.
    }
  }
  return canCopy ? 'copy' : 'save';
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
