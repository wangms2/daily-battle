import { describe, expect, it } from 'vitest';
import { accountRequest, LOCK_MS, MAX_FAILS, nameKey, type Store } from './accounts';
import { matchRoute } from './routes';

/** One name's storage, in memory. */
function memory(): Store {
  const data = new Map<string, unknown>();
  return {
    get: async <T>(k: string) => structuredClone(data.get(k)) as T | undefined,
    put: async (k, v) => void data.set(k, structuredClone(v)),
    deleteAll: async () => data.clear(),
  };
}

const call = (
  store: Store,
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  now = 1000,
) =>
  accountRequest(
    store,
    'Lucky Absol',
    method,
    path,
    new Request('https://x/api', {
      method,
      ...(body !== undefined && { body: JSON.stringify(body) }),
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    now,
  );

async function registered() {
  const store = memory();
  const res = await call(store, 'POST', '', { password: 'pikachu', save: '{"v":1}' });
  expect(res.status).toBe(201);
  const { token } = (await res.json()) as { token: string };
  return { store, token };
}

describe('accounts', () => {
  it('protects a name with a password and keeps its save', async () => {
    const { store, token } = await registered();
    const res = await call(store, 'GET', '/save', undefined, token);
    expect(await res.json()).toEqual({ save: '{"v":1}', updatedAt: 1000 });
  });

  it('says whether a name is taken, to anyone, and nothing more', async () => {
    expect(await (await call(memory(), 'GET', '')).json()).toEqual({ taken: false });
    const { store } = await registered();
    expect(await (await call(store, 'GET', '')).json()).toEqual({ taken: true });
  });

  it('refuses a short password, and a name someone already protected', async () => {
    expect((await call(memory(), 'POST', '', { password: 'abcd' })).status).toBe(400);
    const { store } = await registered();
    expect((await call(store, 'POST', '', { password: 'another' })).status).toBe(409);
  });

  it('signs in on another device with the password, and not without it', async () => {
    const { store } = await registered();
    expect((await call(store, 'POST', '/session', { password: 'nope!' })).status).toBe(401);
    const res = await call(store, 'POST', '/session', { password: 'pikachu' });
    const { token, name } = (await res.json()) as { token: string; name: string };
    expect(name).toBe('Lucky Absol');
    expect((await call(store, 'GET', '/save', undefined, token)).status).toBe(200);
    // An unprotected name has nothing to sign into.
    expect((await call(memory(), 'POST', '/session', { password: 'pikachu' })).status).toBe(401);
  });

  it('pauses sign-in after too many wrong passwords', async () => {
    const { store } = await registered();
    for (let i = 0; i < MAX_FAILS; i++) await call(store, 'POST', '/session', { password: 'x' });
    expect((await call(store, 'POST', '/session', { password: 'pikachu' })).status).toBe(429);
    const later = await call(
      store,
      'POST',
      '/session',
      { password: 'pikachu' },
      undefined,
      1000 + LOCK_MS + 1,
    );
    expect(later.status).toBe(200);
  });

  it('saves only over the version a device last saw', async () => {
    const { store, token } = await registered();
    const first = await call(store, 'PUT', '/save', { save: '{"v":2}', base: 1000 }, token, 2000);
    expect(await first.json()).toEqual({ updatedAt: 2000 });
    // Another device still on 1000 gets told to merge first.
    expect((await call(store, 'PUT', '/save', { save: '{"v":3}', base: 1000 }, token)).status).toBe(
      409,
    );
  });

  it('turns away a missing or wrong token', async () => {
    const { store } = await registered();
    expect((await call(store, 'GET', '/save')).status).toBe(401);
    expect((await call(store, 'GET', '/save', undefined, 'abc123')).status).toBe(401);
  });

  it('signs a device out, and deletes the account with the password', async () => {
    const { store, token } = await registered();
    expect((await call(store, 'DELETE', '/session', undefined, token)).status).toBe(204);
    expect((await call(store, 'GET', '/save', undefined, token)).status).toBe(401);
    const res = await call(store, 'POST', '/session', { password: 'pikachu' });
    const { token: again } = (await res.json()) as { token: string };
    expect((await call(store, 'DELETE', '', { password: 'wrong' }, again)).status).toBe(401);
    expect((await call(store, 'DELETE', '', { password: 'pikachu' }, again)).status).toBe(204);
    // The name is free again.
    expect((await call(store, 'POST', '', { password: 'pikachu' })).status).toBe(201);
  });

  it('treats case and spacing as the same name, and routes by it', () => {
    expect(nameKey('  Lucky   Absol ')).toBe(nameKey('lucky absol'));
    expect(matchRoute('POST', '/api/accounts/Lucky%20Absol')).toEqual({
      kind: 'account',
      name: 'Lucky Absol',
      path: '',
    });
    expect(matchRoute('PUT', '/api/accounts/x/save')).toMatchObject({ path: '/save' });
    expect(matchRoute('GET', '/api/accounts/x/other')).toBeNull();
  });
});
