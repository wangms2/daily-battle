// The share text (DESIGN.md §11) and the share action. Plain text that pastes
// anywhere; never opponent species, sets, or turn counts.
import type { Attempt, DayChange } from '../state/schema';
import type { DaySummary } from './results';

/** Pokémon left as squares: green, or grey (⬜) for a try that was given up. */
const squares = (a: Attempt) =>
  (a.result === 'forfeit' ? '⬜' : '🟩').repeat(a.remaining) +
  '⬛'.repeat(Math.max(0, 6 - a.remaining));

export function shareText({
  day,
  summary,
  streak,
  change,
  url,
}: {
  /** `YYYY-MM-DD` */
  day: string;
  summary: DaySummary;
  streak: number;
  change?: DayChange;
  /** Where to play, added as the last line so friends can tap through. */
  url?: string;
}): string {
  const { status, counted, tries, winTry } = summary;
  const date = new Date(`${day}T12:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
  const winning = winTry !== null ? tries[winTry - 1] : undefined;
  const lines = [`Daily Battle · ${date}`];

  if (status === 'firstTry') {
    lines.push(`⭐ First try! ${winning!.remaining}/6 left`, squares(winning!));
  } else {
    if (winning) lines.push(`✅ Won on try ${winTry} · ${winning.remaining}/6 left`);
    else if (status === 'failed') lines.push(`❌ Not cleared in 3 tries`);
    else lines.push(`Not cleared yet · ${counted.length} of 3 tries`);
    for (const a of counted) lines.push(`${a.result === 'win' ? '✅' : '❌'} ${squares(a)}`);
  }

  // The team from the deciding try: the win, or the latest try that counted.
  const team = (winning ?? counted.at(-1))?.team ?? [];
  const swappedIn = change?.kind === 'replace' ? change.to.species : undefined;
  if (team.length) {
    lines.push(team.map((s) => (s.species === swappedIn ? `${s.species}*` : s.species)).join(', '));
  }

  if (status === 'failed') lines.push('🔥 Streak reset');
  else if (streak > 0) lines.push(`🔥 ${streak}-day streak`);
  if (url) lines.push(url);
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
