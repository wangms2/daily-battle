import { describe, expect, it } from 'vitest';
import { matchRoute, sameOrigin } from './routes';

describe('matchRoute', () => {
  it('routes room creation and room sockets', () => {
    expect(matchRoute('POST', '/api/rooms')).toEqual({ kind: 'create' });
    expect(matchRoute('GET', '/api/rooms/BCDFG/socket')).toEqual({ kind: 'socket', code: 'BCDFG' });
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
