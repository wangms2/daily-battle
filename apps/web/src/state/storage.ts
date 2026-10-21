// localStorage with a safety net (DESIGN.md §10): every access is guarded, and
// if storage is unavailable the game keeps working in memory.
import { initialState, type State } from './schema';

export const STORAGE_KEY = 'daily-battle:state';

/** Upgrades older saved shapes to the current one. Add a step per version bump. */
export function migrate(raw: unknown): State {
  const fresh = initialState();
  if (!raw || typeof raw !== 'object') return fresh;
  const saved = raw as Partial<State> & { version?: number };
  if (saved.version === 1) {
    return {
      ...fresh,
      ...saved,
      stats: { ...fresh.stats, ...saved.stats },
      settings: { ...fresh.settings, ...saved.settings },
      version: 1,
    };
  }
  // Unknown or future version: start fresh rather than misread it.
  return fresh;
}

export interface Storage {
  load(): State;
  save(state: State): void;
  /** False if the browser won't persist anything (private mode, blocked, full). */
  readonly available: boolean;
}

export function createStorage(
  backend: globalThis.Storage | undefined = safeLocalStorage(),
): Storage {
  let available = !!backend;
  if (backend) {
    try {
      const probe = `${STORAGE_KEY}:probe`;
      backend.setItem(probe, '1');
      backend.removeItem(probe);
    } catch {
      available = false;
    }
  }
  return {
    get available() {
      return available;
    },
    load() {
      if (!available) return initialState();
      try {
        const text = backend!.getItem(STORAGE_KEY);
        return migrate(text ? JSON.parse(text) : null);
      } catch {
        return initialState();
      }
    },
    save(state) {
      if (!available) return;
      try {
        backend!.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        available = false;
      }
    },
  };
}

function safeLocalStorage(): globalThis.Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
