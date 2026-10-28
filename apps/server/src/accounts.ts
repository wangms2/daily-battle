// Accounts (DESIGN.md §10): a name protected with a password, Showdown-style,
// holding the player's save so it follows them to other devices. No email.
// One Durable Object per name keeps a record: the password's PBKDF2 hash, the
// signed-in devices' token hashes, and the save. The logic is here, over a
// small store, so it runs (and is tested) without the Workers runtime.
import { cleanName } from '@daily-battle/versus';

/** The shortest password a name can be protected with. */
export const PASSWORD_MIN = 5;
/** A save bigger than this is refused (a year of every game is well under it). */
export const SAVE_MAX = 1_000_000;
/** Wrong passwords in a row before sign-in pauses, and for how long. */
export const MAX_FAILS = 10;
export const LOCK_MS = 15 * 60 * 1000;
/** Signed-in devices kept per name; the oldest is signed out past this. */
export const MAX_DEVICES = 10;
/** PBKDF2 rounds: the most the Workers runtime allows. */
const ITERATIONS = 100_000;

export interface Store {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  deleteAll(): Promise<void>;
}

export interface Account {
  name: string;
  salt: string;
  hash: string;
  /** SHA-256 of each signed-in device's token, oldest first. */
  tokens: string[];
  save: string | null;
  updatedAt: number;
  fails: number;
  lockedUntil: number;
}

/** The key a name is stored under: case and spacing don't make a new name. */
export const nameKey = (name: string) => name.replace(/\s+/g, ' ').trim().toLowerCase();

const hex = (bytes: ArrayBuffer | Uint8Array) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => new Uint8Array(s.match(/../g)!.map((h) => parseInt(h, 16)));
const random = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(salt), iterations: ITERATIONS },
    key,
    256,
  );
  return hex(bits);
}

export const sha256 = async (s: string) =>
  hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/** Compares in time that doesn't depend on where the strings differ. */
export function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (error: string, status: number) => json({ error }, status);

async function body(request: Request): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > SAVE_MAX + 1000) return null;
  try {
    const v = JSON.parse(text) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The device's token from `Authorization: Bearer …`, checked against the account. */
async function signedIn(account: Account | undefined, request: Request): Promise<string | null> {
  const token = /^Bearer (\w+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!account || !token) return null;
  const hashed = await sha256(token);
  return account.tokens.some((t) => same(t, hashed)) ? hashed : null;
}

async function newToken(account: Account): Promise<string> {
  const token = random(32);
  account.tokens = [...account.tokens, await sha256(token)].slice(-MAX_DEVICES);
  return token;
}

/**
 * One account's requests; `path` is what follows `/api/accounts/<name>`:
 *   GET ''                                   whether the name is protected → {taken}
 *   POST ''          {password, save}        register the name → {token, name, updatedAt}
 *   POST '/session'  {password}              sign in → {token, name}
 *   DELETE '/session'                        sign this device out
 *   GET '/save'                              → {save, updatedAt}
 *   PUT '/save'      {save, base}            → {updatedAt}; 409 if another device saved since base
 *   DELETE ''        {password}              delete the account
 */
export async function accountRequest(
  store: Store,
  /** The name from the URL (the store is this name's). */
  urlName: string,
  method: string,
  path: string,
  request: Request,
  now = Date.now(),
): Promise<Response> {
  const account = await store.get<Account>('account');

  // Anyone may ask whether a name is taken (picking a name checks it); nothing else.
  if (method === 'GET' && path === '') return json({ taken: !!account });

  if (method === 'POST' && path === '') {
    const b = await body(request);
    const name = cleanName(urlName);
    const password = b?.password;
    if (!name || typeof password !== 'string' || password.length < PASSWORD_MIN) {
      return fail('bad', 400);
    }
    if (account) return fail('taken', 409);
    const save = typeof b?.save === 'string' && b.save.length <= SAVE_MAX ? b.save : null;
    const salt = random(16);
    const created: Account = {
      name,
      salt,
      hash: await hashPassword(password, salt),
      tokens: [],
      save,
      updatedAt: now,
      fails: 0,
      lockedUntil: 0,
    };
    const token = await newToken(created);
    await store.put('account', created);
    return json({ token, name, updatedAt: now }, 201);
  }

  if (method === 'POST' && path === '/session') {
    if (!account) return fail('wrong', 401);
    if (account.lockedUntil > now) return fail('locked', 429);
    const b = await body(request);
    const password = typeof b?.password === 'string' ? b.password : '';
    if (!same(await hashPassword(password, account.salt), account.hash)) {
      account.fails += 1;
      if (account.fails >= MAX_FAILS) {
        account.fails = 0;
        account.lockedUntil = now + LOCK_MS;
      }
      await store.put('account', account);
      return fail('wrong', 401);
    }
    account.fails = 0;
    const token = await newToken(account);
    await store.put('account', account);
    return json({ token, name: account.name });
  }

  const device = await signedIn(account, request);
  if (!account || !device) return fail('signedOut', 401);

  if (method === 'GET' && path === '/save') {
    return json({ save: account.save, updatedAt: account.updatedAt });
  }

  if (method === 'PUT' && path === '/save') {
    const b = await body(request);
    if (typeof b?.save !== 'string' || b.save.length > SAVE_MAX || typeof b.base !== 'number') {
      return fail('bad', 400);
    }
    if (b.base < account.updatedAt) return fail('stale', 409);
    account.save = b.save;
    account.updatedAt = Math.max(now, account.updatedAt + 1);
    await store.put('account', account);
    return json({ updatedAt: account.updatedAt });
  }

  if (method === 'DELETE' && path === '/session') {
    account.tokens = account.tokens.filter((t) => t !== device);
    await store.put('account', account);
    return new Response(null, { status: 204 });
  }

  if (method === 'DELETE' && path === '') {
    const b = await body(request);
    const password = typeof b?.password === 'string' ? b.password : '';
    if (!same(await hashPassword(password, account.salt), account.hash)) {
      return fail('wrong', 401);
    }
    await store.deleteAll();
    return new Response(null, { status: 204 });
  }

  return fail('notFound', 404);
}
