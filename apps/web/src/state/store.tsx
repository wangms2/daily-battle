import { useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { ClockContext, StoreContext } from './context';
import { reducer } from './reducer';
import { createStorage, type Storage } from './storage';

export function StoreProvider({
  children,
  storage: given,
  now,
}: {
  children: ReactNode;
  storage?: Storage;
  /** Injected clock, for tests and previews. */
  now?: () => Date;
}) {
  const [storage] = useState(() => given ?? createStorage());
  const [state, dispatch] = useReducer(reducer, undefined, () => storage.load());
  useEffect(() => {
    storage.save(state);
  }, [storage, state]);
  const value = useMemo(
    () => ({ state, dispatch, storageAvailable: storage.available }),
    [state, storage],
  );
  const [clock] = useState(() => now ?? (() => new Date()));
  return (
    <ClockContext.Provider value={clock}>
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </ClockContext.Provider>
  );
}
