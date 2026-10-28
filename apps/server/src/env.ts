import type { Account } from './account';
import type { Room } from './room';

/** Bindings from wrangler.jsonc. */
export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  /** One per protected name (accounts.ts). */
  ACCOUNTS: DurableObjectNamespace<Account>;
  /** The static site, for the published schedules (this week's pool). */
  ASSETS: Fetcher;
  /** Stats for the admin page (stats.ts); writes are skipped without it. */
  DB?: D1Database;
  /** The admin page's password (a secret); the admin API is off without it. */
  ADMIN_TOKEN?: string;
}
