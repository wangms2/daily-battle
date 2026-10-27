// The player's protected name on this device (DESIGN.md §10): the session token,
// kept apart from the save like versus/saved.ts, and the calls to the account
// server (apps/server/src/accounts.ts). Signed in, the save is pushed after
// changes and merged with other devices' (merge.ts). Nothing here ever blocks
// play: offline, the game carries on and syncs later.
import { mergeStates } from './merge';
import { migrate } from './storage';
import type { State } from './schema';

const KEY = 'daily-battle:account';

export interface Session {
  name: string;
  token: string;
  /** The server's version of the save this device last saw (for stale-write checks). */
  updatedAt: number;
}

export function loadSession(): Session | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Session> | null;
    return v && typeof v.name === 'string' && typeof v.token === 'string'
      ? {
          name: v.name,
          token: v.token,
          updatedAt: typeof v.updatedAt === 'number' ? v.updatedAt : 0,
        }
      : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable: signed in until the page closes.
  }
}

const url = (name: string, path = '') => `/api/accounts/${encodeURIComponent(name)}${path}`;

async function call(
  name: string,
  path: string,
  method: string,
  body?: unknown,
  token?: string,
): Promise<Response> {
  return fetch(url(name, path), {
    method,
    headers: {
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
}

/** Whether someone has protected `name`; null when the server can't be reached. */
export async function nameTaken(name: string): Promise<boolean | null> {
  try {
    const res = await fetch(url(name));
    if (!res.ok) return null;
    return ((await res.json()) as { taken: boolean }).taken;
  } catch {
    return null;
  }
}

export type ProtectResult = 'ok' | 'taken' | 'offline';

/** Protects `name` with `password`, saving this device's progress to it. */
export async function protect(
  name: string,
  password: string,
  state: State,
): Promise<{ result: ProtectResult; session?: Session }> {
  try {
    const res = await call(name, '', 'POST', { password, save: JSON.stringify(state) });
    if (res.status === 409) return { result: 'taken' };
    if (!res.ok) return { result: 'offline' };
    const {
      token,
      name: saved,
      updatedAt,
    } = (await res.json()) as {
      token: string;
      name: string;
      updatedAt: number;
    };
    return { result: 'ok', session: { name: saved, token, updatedAt } };
  } catch {
    return { result: 'offline' };
  }
}

export type SignInResult = 'ok' | 'wrong' | 'locked' | 'offline';

/** Signs in, and merges the saved progress with this device's. */
export async function signIn(
  name: string,
  password: string,
  state: State,
): Promise<{ result: SignInResult; session?: Session; state?: State }> {
  try {
    const res = await call(name, '/session', 'POST', { password });
    if (res.status === 401) return { result: 'wrong' };
    if (res.status === 429) return { result: 'locked' };
    if (!res.ok) return { result: 'offline' };
    const { token, name: saved } = (await res.json()) as { token: string; name: string };
    const session = { name: saved, token, updatedAt: 0 };
    const pulled = await pull(session, state);
    return {
      result: 'ok',
      session: pulled?.session ?? session,
      state: pulled?.state ?? state,
    };
  } catch {
    return { result: 'offline' };
  }
}

/** The server's save merged into `state`, or null if it can't be reached. */
export async function pull(
  session: Session,
  state: State,
): Promise<{ session: Session; state: State } | null> {
  try {
    const res = await call(session.name, '/save', 'GET', undefined, session.token);
    if (!res.ok) return null;
    const { save, updatedAt } = (await res.json()) as { save: string | null; updatedAt: number };
    const theirs = save ? migrate(JSON.parse(save)) : null;
    return {
      session: { ...session, updatedAt },
      state: theirs ? mergeStates(state, theirs) : state,
    };
  } catch {
    return null;
  }
}

export type PushResult = 'ok' | 'stale' | 'signedOut' | 'offline';

/** Saves `state` over the version this device last saw. */
export async function push(
  session: Session,
  state: State,
): Promise<{ result: PushResult; session?: Session }> {
  try {
    const res = await call(
      session.name,
      '/save',
      'PUT',
      { save: JSON.stringify(state), base: session.updatedAt },
      session.token,
    );
    if (res.status === 409) return { result: 'stale' };
    if (res.status === 401) return { result: 'signedOut' };
    if (!res.ok) return { result: 'offline' };
    const { updatedAt } = (await res.json()) as { updatedAt: number };
    return { result: 'ok', session: { ...session, updatedAt } };
  } catch {
    return { result: 'offline' };
  }
}

/** Signs this device out (its progress stays here). */
export async function signOut(session: Session): Promise<void> {
  try {
    await call(session.name, '/session', 'DELETE', undefined, session.token);
  } catch {
    // Offline: the token is forgotten here anyway.
  }
}

/** Deletes the account; false on a wrong password or no connection. */
export async function deleteAccount(session: Session, password: string): Promise<boolean> {
  try {
    const res = await call(session.name, '', 'DELETE', { password }, session.token);
    return res.ok;
  } catch {
    return false;
  }
}
