import type { Room } from './room';

/** Bindings from wrangler.jsonc. */
export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
}
