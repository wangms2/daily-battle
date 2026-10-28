// Counting players anonymously (DESIGN.md §18a): this device's random id, sent
// with the day and what was played, at most once per activity a day. A
// signed-in device names its account, so one person on two devices counts once.
// Never blocks play: no storage means no id and nothing sent; a failed send is
// dropped.
import { dayKey } from '@daily-battle/gen/dates';
import type { FormatId } from '@daily-battle/data/formats';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { ClockContext, useAccount, useStore } from '../state/context';
import type { State } from '../state/schema';

const KEY = 'daily-battle:player';

export type Activity = `${'daily' | 'lessons' | 'trainer'}-${FormatId}` | 'versus';

interface Saved {
  id: string;
  /** The day `sent` is for. */
  day: string;
  sent: string[];
}

function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // A version 4 UUID by hand, where randomUUID is missing (older browsers).
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** The earliest day in the save, so a player from before this counting isn't new. */
export function firstDay(state: State): string | undefined {
  const days = Object.values(state.games).flatMap((g) => Object.keys(g.days));
  return days.length ? days.sort()[0] : undefined;
}

export interface PlayContext {
  day: string;
  since?: string;
  account?: string | null;
}

/** Sends `activity` for `day`, unless this device already did today. */
export function notePlay(
  activity: Activity,
  { day, since, account }: PlayContext,
  storage: globalThis.Storage = window.localStorage,
  send: typeof fetch = (...args) => fetch(...args),
): void {
  let saved: Saved;
  try {
    const raw = JSON.parse(storage.getItem(KEY) ?? 'null') as Saved | null;
    saved = raw?.id ? raw : { id: newId(), day, sent: [] };
    if (saved.day !== day) saved = { ...saved, day, sent: [] };
    if (saved.sent.includes(activity)) return;
    saved.sent = [...saved.sent, activity];
    storage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // No storage: without a lasting id every visit would count as someone new.
    return;
  }
  const body = { id: saved.id, day, activity, since, ...(account ? { account } : {}) };
  void send('/api/ping', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

/** `notePlay` with today, the save's first day, and the signed-in account filled in. */
export function useNotePlay(): (activity: Activity) => void {
  const { state } = useStore();
  const { name } = useAccount();
  const clock = useContext(ClockContext);
  const latest = useRef({ state, name });
  useEffect(() => {
    latest.current = { state, name };
  }, [state, name]);
  return useCallback(
    (activity) =>
      notePlay(activity, {
        day: dayKey(clock()),
        since: firstDay(latest.current.state),
        account: latest.current.name,
      }),
    [clock],
  );
}

/** How much of each activity the save holds, to notice when one grows. */
function progress(state: State): Partial<Record<Activity, string>> {
  const out: Partial<Record<Activity, string>> = {};
  for (const [format, game] of Object.entries(state.games) as [
    FormatId,
    State['games'][FormatId],
  ][]) {
    const tries = Object.values(game.days).flatMap((d) => d.attempts);
    out[`daily-${format}`] = String(tries.length);
  }
  const s = state.settings;
  for (const [format, t] of Object.entries(s.tutorial ?? {})) {
    out[`lessons-${format as FormatId}`] = JSON.stringify([t?.completed, t?.current]);
  }
  for (const [format, boxes] of Object.entries(s.typeTrainer ?? {})) {
    out[`trainer-${format as FormatId}`] = JSON.stringify(boxes);
  }
  return out;
}

/**
 * Notes a play when this device's save grows: a daily try started, a lesson
 * step or lesson done, a type trainer answer. Not on opening, and not for
 * another device's progress arriving by sync (a try counts only if it began
 * in the last few minutes).
 */
export function useTrackPlays() {
  const { state } = useStore();
  const note = useNotePlay();
  const clock = useContext(ClockContext);
  const seen = useRef<Partial<Record<Activity, string>> | null>(null);
  useEffect(() => {
    const now = progress(state);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const recent = clock().getTime() - 10 * 60 * 1000;
    for (const [activity, value] of Object.entries(now) as [Activity, string][]) {
      if (before[activity] === value) continue;
      if (activity.startsWith('daily-')) {
        const format = activity.slice('daily-'.length) as FormatId;
        const fresh = Object.values(state.games[format]?.days ?? {}).some((d) =>
          d.attempts.some((a) => a.ts >= recent),
        );
        if (!fresh) continue;
      }
      note(activity);
    }
  }, [state, note, clock]);
}
