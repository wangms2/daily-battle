import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstDay, notePlay } from './plays';
import { createStorage } from '../state/storage';

const sent = (send: { mock: { calls: Parameters<typeof fetch>[] } }) =>
  send.mock.calls.map(([, init]) => JSON.parse((init as RequestInit).body as string));

describe('notePlay', () => {
  beforeEach(() => localStorage.clear());

  it('sends each activity once a day, with one lasting id', () => {
    const send = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null, { status: 204 })));
    const day = { day: '2026-10-28', since: '2026-09-01' };
    notePlay('daily-gen3ou', day, localStorage, send);
    notePlay('daily-gen3ou', day, localStorage, send);
    notePlay('lessons-gen3ou', day, localStorage, send);
    notePlay('daily-gen3ou', { day: '2026-10-29' }, localStorage, send);
    const pings = sent(send);
    expect(pings.map((p) => [p.day, p.activity])).toEqual([
      ['2026-10-28', 'daily-gen3ou'],
      ['2026-10-28', 'lessons-gen3ou'],
      ['2026-10-29', 'daily-gen3ou'],
    ]);
    expect(new Set(pings.map((p) => p.id)).size).toBe(1);
    expect(pings[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(pings[0].since).toBe('2026-09-01');
    expect(send.mock.calls[0]![0]).toBe('/api/ping');
  });

  it('names the account only when signed in', () => {
    const send = vi.fn<typeof fetch>(() => Promise.resolve(new Response(null)));
    notePlay('versus', { day: '2026-10-28', account: 'Misty' }, localStorage, send);
    notePlay('daily-gen4ou', { day: '2026-10-28', account: null }, localStorage, send);
    expect(sent(send).map((p) => p.account)).toEqual(['Misty', undefined]);
  });

  it('sends nothing without storage, and shrugs off a failed send', () => {
    const blocked = {
      getItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const send = vi.fn<typeof fetch>(() => Promise.reject(new Error('offline')));
    notePlay('versus', { day: '2026-10-28' }, blocked, send);
    expect(send).not.toHaveBeenCalled();
    expect(() => notePlay('versus', { day: '2026-10-28' }, localStorage, send)).not.toThrow();
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('firstDay', () => {
  it('is the earliest day in any game of the save, or none', () => {
    const state = createStorage().load();
    expect(firstDay(state)).toBeUndefined();
    state.games.gen5ou.days['2026-05-02'] = { swapUsed: false, attempts: [] };
    state.games.gen3ou.days['2026-03-09'] = { swapUsed: false, attempts: [] };
    expect(firstDay(state)).toBe('2026-03-09');
  });
});
