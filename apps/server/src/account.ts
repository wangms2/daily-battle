// One protected name's Durable Object (DESIGN.md §10): the account's record in
// its storage, and its requests handled by accounts.ts. Successful ones are
// noted in the stats (stats.ts) after the response.
import { DurableObject } from 'cloudflare:workers';
import { accountRequest, type Account as AccountRecord } from './accounts';
import type { Env } from './env';
import { accountDeleted, accountSeen, record, type SeenKind } from './stats';

/** Syncs update the stats at most this often (sign-ups and sign-ins always do). */
const SYNC_STATS_MS = 10 * 60 * 1000;

export class Account extends DurableObject<Env> {
  /** When this account last updated the stats; forgotten when the object sleeps, which is fine. */
  private statsAt = 0;

  /** `name` is the one from the URL; `path` is what follows it. */
  async handle(name: string, path: string, request: Request): Promise<Response> {
    const method = request.method;
    const response = await accountRequest(this.ctx.storage, name, method, path, request);
    const kind = seenKind(method, path, response.status);
    if (kind === 'deleted') {
      this.ctx.waitUntil(record(this.env.DB, (db) => accountDeleted(db, name)));
    } else if (kind) {
      const now = Date.now();
      if (kind !== 'sync' || now - this.statsAt >= SYNC_STATS_MS) {
        this.statsAt = now;
        const account = await this.ctx.storage.get<AccountRecord>('account');
        if (account) {
          this.ctx.waitUntil(
            record(this.env.DB, (db) => accountSeen(db, account.name, kind, now, account.save)),
          );
        }
      }
    }
    return response;
  }

  /** An admin's delete: the whole record (password, devices, save). Whether there was one. */
  async wipe(): Promise<boolean> {
    const had = !!(await this.ctx.storage.get('account'));
    await this.ctx.storage.deleteAll();
    return had;
  }
}

function seenKind(method: string, path: string, status: number): SeenKind | 'deleted' | null {
  if (status >= 300) return null;
  if (method === 'POST' && path === '') return 'created';
  if (method === 'POST' && path === '/session') return 'signin';
  if (path === '/save' && (method === 'GET' || method === 'PUT')) return 'sync';
  if (method === 'DELETE' && path === '') return 'deleted';
  return null;
}
