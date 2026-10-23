// localStorage with a safety net (DESIGN.md §10): every access is guarded, and
// if storage is unavailable the game keeps working in memory.
import { initialState, type GameState, type State } from './schema';

export const STORAGE_KEY = 'daily-battle:state';

/** Upgrades older saved shapes to the current one. Add a step per version bump. */
export function migrate(raw: unknown): State {
  const fresh = initialState();
  if (!raw || typeof raw !== 'object') return fresh;
  const saved = raw as Partial<Omit<State, 'version'>> & {
    version?: number;
    stats?: unknown;
    weeks?: GameState['weeks'];
    days?: GameState['days'];
  };
  if (saved.version === 4) {
    // Formats added since the save get an empty game.
    return {
      version: 4,
      games: { ...fresh.games, ...saved.games },
      settings: { ...fresh.settings, ...saved.settings },
    };
  }
  if (saved.version === 1 || saved.version === 2 || saved.version === 3) {
    // v1: attempts saved before M7 lack the team and engine fields, and the
    // stored stats block is gone (streaks and stats are derived since M8).
    const days = Object.fromEntries(
      Object.entries(saved.days ?? {}).map(([k, d]) => [
        k,
        {
          ...d,
          attempts: d.attempts.map((a) => ({ ...a, team: a.team ?? [], engine: a.engine ?? '' })),
        },
      ]),
    );
    const settings = { ...fresh.settings, ...saved.settings };
    // v3: the speeds became slow / normal / fast with new timings (and no instant),
    // so older saves start on the new default.
    if (saved.version !== 3) settings.battleSpeed = fresh.settings.battleSpeed;
    // v4: a game per format. Everything so far was Gen 4 OU, which these
    // players picked by playing it, so they stay on it.
    return {
      version: 4,
      games: { ...fresh.games, gen4ou: { weeks: saved.weeks ?? {}, days } },
      settings: { ...settings, format: settings.format ?? 'gen4ou' },
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
