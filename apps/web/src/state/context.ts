import { createContext, useContext, useEffect, useState } from 'react';
import type { ProtectResult, SignInResult } from './account';
import type { Action } from './reducer';
import type { State } from './schema';

export interface StoreValue {
  state: State;
  dispatch: (action: Action) => void;
  storageAvailable: boolean;
}

export const StoreContext = createContext<StoreValue | null>(null);

/** The protected name on this device, and what can be done with it (state/account.ts). */
export interface AccountValue {
  /** The protected name this device is signed in as, or null. */
  name: string | null;
  /** When the save last reached the server (ms), or null. */
  syncedAt: number | null;
  protect: (name: string, password: string) => Promise<ProtectResult>;
  signIn: (name: string, password: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  deleteAccount: (password: string) => Promise<boolean>;
  /** Erases everything this device saved (signing out first) and reloads the app. */
  startOver: () => Promise<void>;
}

export const AccountContext = createContext<AccountValue | null>(null);

export function useAccount(): AccountValue {
  const value = useContext(AccountContext);
  if (!value) throw new Error('useAccount outside StoreProvider');
  return value;
}
export const ClockContext = createContext<() => Date>(() => new Date());

export function useStore(): StoreValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore outside StoreProvider');
  return value;
}

/** The current time, re-rendering every `intervalMs`. */
export function useNow(intervalMs = 60_000): Date {
  const clock = useContext(ClockContext);
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setNow(clock()), intervalMs);
    return () => clearInterval(id);
  }, [clock, intervalMs]);
  return now;
}

/**
 * `key` of the current time (the day, say), checked every `intervalMs` but
 * re-rendering only when it changes: a whole screen can follow the day without
 * redrawing every second.
 */
export function useClockKey(key: (now: Date) => string, intervalMs = 1000): string {
  const clock = useContext(ClockContext);
  const [value, setValue] = useState(() => key(clock()));
  useEffect(() => {
    const id = setInterval(() => setValue(key(clock())), intervalMs);
    return () => clearInterval(id);
  }, [clock, key, intervalMs]);
  return value;
}
