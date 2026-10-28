// The Worker in front of the static site: it only handles /api (versus rooms,
// DESIGN.md §18). Creating a room picks a free code; a room's socket goes
// straight to that room's Durable Object.
import { makeCode } from '@daily-battle/versus';
import type { Env } from './env';
import { adminRequest, isAdmin } from './admin';
import { parsePing, playerSeen } from './players';
import { forgetPlayer, record } from './stats';
import { nameKey } from './accounts';
import { matchRoute, sameOrigin } from './routes';

export { Account } from './account';
export { Room } from './room';

const random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

export default {
  async fetch(request, env): Promise<Response> {
    const route = matchRoute(request.method, new URL(request.url).pathname);
    if (!route) return new Response('Not found', { status: 404 });
    // The admin token is the check (a GET, so browsers send no Origin).
    if (route.kind === 'admin') return adminRequest(env.DB, env.ADMIN_TOKEN, request);
    // An admin deleting a player (curl, so no Origin): the token is the check.
    if (route.kind === 'adminDelete') {
      if (!env.DB || !env.ADMIN_TOKEN) return new Response('Not found', { status: 404 });
      if (!(await isAdmin(request, env.ADMIN_TOKEN))) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      const id = env.ACCOUNTS.idFromName(nameKey(route.name));
      const account = await env.ACCOUNTS.get(id).wipe();
      const stats = await forgetPlayer(env.DB, route.name);
      return Response.json({ account, ...stats }, { headers: { 'Cache-Control': 'no-store' } });
    }
    // Browsers leave Origin off same-site GETs. Reading a save needs the device's
    // token, which another site can't have, so it doesn't need the check.
    const tokenRead = route.kind === 'account' && request.method === 'GET';
    if (!tokenRead && !sameOrigin(request)) return new Response('Forbidden', { status: 403 });
    if (route.kind === 'ping') {
      // Small and best-effort: a bad ping is refused, a failed write only logged.
      const text = await request.text();
      if (text.length > 500) return new Response('Too big', { status: 413 });
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
      const now = Date.now();
      const ping = parsePing(body, now);
      if (!ping) return new Response('Bad ping', { status: 400 });
      await record(env.DB, (db) => playerSeen(db, ping, now));
      return new Response(null, { status: 204 });
    }
    if (route.kind === 'account') {
      const id = env.ACCOUNTS.idFromName(nameKey(route.name));
      return env.ACCOUNTS.get(id).handle(route.name, route.path, request);
    }
    if (route.kind === 'create') {
      // A taken code is rare (20^5 codes); try a few.
      for (let i = 0; i < 5; i++) {
        const code = makeCode(random);
        if (await env.ROOMS.get(env.ROOMS.idFromName(code)).create(code)) {
          return Response.json({ code }, { status: 201 });
        }
      }
      return new Response('Couldn’t find a free room code', { status: 503 });
    }
    return env.ROOMS.get(env.ROOMS.idFromName(route.code)).fetch(request);
  },
} satisfies ExportedHandler<Env>;
