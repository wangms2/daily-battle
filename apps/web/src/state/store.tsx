import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import * as account from './account';
import { AccountContext, ClockContext, StoreContext, type AccountValue } from './context';
import { reducer } from './reducer';
import { createStorage, type Storage } from './storage';

/** How long after a change the save goes to the server (changes come in bursts). */
const PUSH_DELAY_MS = 2000;

/** Removes the game's keys from this browser (the owner's admin sign-in stays). */
function eraseDevice() {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const keys = Array.from({ length: store.length }, (_, i) => store.key(i) ?? '');
      for (const k of keys) {
        if (k.startsWith('daily-battle:') && k !== 'daily-battle:admin') store.removeItem(k);
      }
    } catch {
      // Storage blocked: there's nothing saved to erase.
    }
  }
}

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

  // A protected name: the save follows the player to their other devices.
  const [session, setSessionState] = useState(account.loadSession);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const latest = useRef({ state, session });
  useEffect(() => {
    latest.current = { state, session };
  });
  const setSession = useCallback((next: account.Session | null) => {
    account.saveSession(next);
    setSessionState(next);
  }, []);

  /** Pushes the save; another device saved since, so merge theirs in first. */
  const sync = useCallback(async () => {
    const { state: s, session: me } = latest.current;
    if (!me) return;
    const pushed = await account.push(me, s);
    if (pushed.session) {
      setSession(pushed.session);
      setSyncedAt(Date.now());
    } else if (pushed.result === 'stale') {
      const pulled = await account.pull(me, latest.current.state);
      if (!pulled) return;
      setSession(pulled.session);
      // The merged save lands in state, and that change pushes it.
      dispatch({ type: 'load', state: pulled.state });
    } else if (pushed.result === 'signedOut') {
      setSession(null);
    }
  }, [setSession]);

  // On opening: bring in what other devices played.
  useEffect(() => {
    const me = latest.current.session;
    if (!me) return;
    void account.pull(me, latest.current.state).then((pulled) => {
      if (!pulled) return;
      setSession(pulled.session);
      dispatch({ type: 'load', state: pulled.state });
    });
  }, [setSession]);

  // After each change, and right away when the page is put away.
  useEffect(() => {
    if (!session) return;
    const t = setTimeout(() => void sync(), PUSH_DELAY_MS);
    return () => clearTimeout(t);
    // Only a change of progress (or signing in) needs a push, not a new token version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, session?.token, sync]);
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === 'hidden') void sync();
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, [sync]);

  const accountValue = useMemo<AccountValue>(
    () => ({
      name: session?.name ?? null,
      syncedAt,
      async protect(name, password) {
        const { result, session: next } = await account.protect(
          name,
          password,
          latest.current.state,
        );
        if (next) {
          setSession(next);
          setSyncedAt(Date.now());
          if (latest.current.state.settings.name !== next.name) {
            dispatch({ type: 'setSetting', key: 'name', value: next.name });
          }
        }
        return result;
      },
      async signIn(name, password) {
        const res = await account.signIn(name, password, latest.current.state);
        if (res.session && res.state) {
          setSession(res.session);
          dispatch({
            type: 'load',
            state: { ...res.state, settings: { ...res.state.settings, name: res.session.name } },
          });
        }
        return res.result;
      },
      async signOut() {
        const me = latest.current.session;
        if (me) {
          await sync();
          await account.signOut(me);
        }
        setSession(null);
        setSyncedAt(null);
      },
      async deleteAccount(password) {
        const me = latest.current.session;
        if (!me || !(await account.deleteAccount(me, password))) return false;
        setSession(null);
        setSyncedAt(null);
        return true;
      },
      async startOver() {
        const me = latest.current.session;
        // Nothing may push this device's save again, not even the page hiding.
        latest.current.session = null;
        setSession(null);
        if (me) await account.signOut(me);
        eraseDevice();
        window.location.reload();
      },
    }),
    [session?.name, syncedAt, setSession, sync],
  );

  const value = useMemo(
    () => ({ state, dispatch, storageAvailable: storage.available }),
    [state, storage],
  );
  const [clock] = useState(() => now ?? (() => new Date()));
  return (
    <ClockContext.Provider value={clock}>
      <StoreContext.Provider value={value}>
        <AccountContext.Provider value={accountValue}>{children}</AccountContext.Provider>
      </StoreContext.Provider>
    </ClockContext.Provider>
  );
}
