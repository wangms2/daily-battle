import type { Room } from './room';

/** Bindings from wrangler.jsonc. */
export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** The static site, for the published schedules (this week's pool). */
  ASSETS: Fetcher;
}
