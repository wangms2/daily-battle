// One protected name's Durable Object (DESIGN.md §10): the account's record in
// its storage, and its requests handled by accounts.ts.
import { DurableObject } from 'cloudflare:workers';
import { accountRequest } from './accounts';
import type { Env } from './env';

export class Account extends DurableObject<Env> {
  /** `name` is the one from the URL; `path` is what follows it. */
  async handle(name: string, path: string, request: Request): Promise<Response> {
    return accountRequest(this.ctx.storage, name, request.method, path, request);
  }
}
