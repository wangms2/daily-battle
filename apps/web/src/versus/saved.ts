// What a browser remembers about versus rooms: the name you play under, and
// your token for each room you're in, so a reload or a dropped connection
// puts you back in your seat. Kept apart from the daily games' save (§10);
// losing it only means joining again.
const KEY = 'daily-battle:versus';

interface Saved {
  name: string;
  /** Room code → your token in it. */
  tokens: Record<string, string>;
}

function read(): Saved {
  try {
    const raw = window.localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : {};
    return {
      name: typeof v.name === 'string' ? v.name : '',
      tokens: v.tokens && typeof v.tokens === 'object' ? v.tokens : {},
    };
  } catch {
    return { name: '', tokens: {} };
  }
}

function write(saved: Saved) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // Storage unavailable: rooms still work until the page closes.
  }
}

export const savedName = () => read().name;
export const saveName = (name: string) => write({ ...read(), name });
export const tokenFor = (code: string): string | undefined => read().tokens[code];

export function saveToken(code: string, token: string) {
  const saved = read();
  write({ ...saved, tokens: { ...saved.tokens, [code]: token } });
}

export function forgetToken(code: string) {
  const saved = read();
  const { [code]: _, ...tokens } = saved.tokens;
  write({ ...saved, tokens });
}
