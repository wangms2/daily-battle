// The server's routes. Everything else is the static site, served by
// Cloudflare's asset handling before the Worker runs.
import { CODE_PATTERN } from '@daily-battle/versus';

export type Route =
  | { kind: 'create' }
  | { kind: 'socket'; code: string }
  /** An account's request: its name (decoded) and the rest of the path. */
  | { kind: 'account'; name: string; path: '' | '/session' | '/save' }
  /** The admin page's stats (admin.ts). */
  | { kind: 'admin' };

export function matchRoute(method: string, pathname: string): Route | null {
  if (pathname === '/api/rooms') return method === 'POST' ? { kind: 'create' } : null;
  if (pathname === '/api/admin/stats') return method === 'GET' ? { kind: 'admin' } : null;
  const m = /^\/api\/rooms\/([^/]+)\/socket$/.exec(pathname);
  if (m && method === 'GET' && CODE_PATTERN.test(m[1]!)) return { kind: 'socket', code: m[1]! };
  const a = /^\/api\/accounts\/([^/]+)(\/session|\/save)?$/.exec(pathname);
  if (a) {
    try {
      const name = decodeURIComponent(a[1]!);
      return { kind: 'account', name, path: (a[2] ?? '') as '' | '/session' | '/save' };
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Whether a request comes from our own pages: browsers send Origin on
 * websocket upgrades and POSTs, so another site can't open rooms or sockets
 * as one of our players.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
