import type { Account } from './account';
import type { Room } from './room';

/** Bindings from wrangler.jsonc. */
export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** One per protected name (accounts.ts). */
  ACCOUNTS: DurableObjectNamespace<Account>;
  /** The static site, for the published schedules (this week's pool). */
  ASSETS: Fetcher;
}
