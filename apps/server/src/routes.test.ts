import { describe, expect, it } from 'vitest';
import { matchRoute, sameOrigin } from './routes';

describe('matchRoute', () => {
  it('routes room creation and room sockets', () => {
    expect(matchRoute('POST', '/api/rooms')).toEqual({ kind: 'create' });
    expect(matchRoute('GET', '/api/rooms/BCDFG/socket')).toEqual({ kind: 'socket', code: 'BCDFG' });
  });

  it('routes an admin deleting a player, by DELETE only', () => {
    expect(matchRoute('DELETE', '/api/admin/accounts/Misty%20W')).toEqual({
      kind: 'adminDelete',
      name: 'Misty W',
    });
    expect(matchRoute('GET', '/api/admin/accounts/Misty')).toBeNull();
    expect(matchRoute('DELETE', '/api/admin/accounts/%E0')).toBeNull();
  });

  it('leaves everything else alone', () => {
    expect(matchRoute('GET', '/api/rooms')).toBeNull();
    expect(matchRoute('GET', '/api/rooms/bcdfg/socket')).toBeNull();
    expect(matchRoute('GET', '/api/rooms/ABCDE/socket')).toBeNull();
    expect(matchRoute('POST', '/api/rooms/BCDFG/socket')).toBeNull();
    expect(matchRoute('GET', '/')).toBeNull();
  });
});

describe('sameOrigin', () => {
  const req = (origin?: string) =>
    new Request('https://battle.example.com/api/rooms', {
      headers: origin ? { Origin: origin } : {},
    });

  it('allows our own pages only', () => {
    expect(sameOrigin(req('https://battle.example.com'))).toBe(true);
    expect(sameOrigin(req('https://evil.example.com'))).toBe(false);
    expect(sameOrigin(req())).toBe(false);
    expect(sameOrigin(req('null'))).toBe(false);
  });
});
