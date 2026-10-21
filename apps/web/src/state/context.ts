import { createContext, useContext, useEffect, useState } from 'react';
import type { Action } from './reducer';
import type { State } from './schema';

export interface StoreValue {
  state: State;
  dispatch: (action: Action) => void;
  storageAvailable: boolean;
}

export const StoreContext = createContext<StoreValue | null>(null);
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
