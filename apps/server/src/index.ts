// The Worker in front of the static site: it only handles /api (versus rooms,
// DESIGN.md §18). Creating a room picks a free code; a room's socket goes
// straight to that room's Durable Object.
import { makeCode } from '@daily-battle/versus';
import type { Env } from './env';
import { matchRoute, sameOrigin } from './routes';

export { Room } from './room';

const random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

export default {
  async fetch(request, env): Promise<Response> {
    const route = matchRoute(request.method, new URL(request.url).pathname);
    if (!route) return new Response('Not found', { status: 404 });
    if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
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
