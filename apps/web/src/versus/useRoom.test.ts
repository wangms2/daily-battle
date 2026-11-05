import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_MS, useRoom } from './useRoom';

vi.mock('../lib/audio', () => ({ playChime: () => {} }));

/** A websocket the test drives: it opens, receives, and drops on cue. */
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static all: FakeSocket[] = [];
  readyState = FakeSocket.CONNECTING;
  sent: unknown[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  constructor() {
    FakeSocket.all.push(this);
  }
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.readyState = FakeSocket.CLOSED;
  }
  open() {
    this.readyState = FakeSocket.OPEN;
    act(() => this.onopen?.());
  }
  receive(msg: object) {
    act(() => this.onmessage?.({ data: JSON.stringify(msg) }));
  }
  drop() {
    this.readyState = FakeSocket.CLOSED;
    act(() => this.onclose?.({ code: 1006 }));
  }
}

const last = () => FakeSocket.all.at(-1)!;

const roomIn = (phase: string, matches: { id: string; stage: string }[] = []) => ({
  code: 'ABCDE',
  phase,
  players: [],
  spectators: [],
  matches,
});
const welcome = (phase: string, matches: { id: string; stage: string }[] = []) => ({
  type: 'welcome',
  you: 'me',
  token: 'tok',
  room: roomIn(phase, matches),
});
const side = (match: string) => ({
  type: 'side',
  match,
  from: 0,
  update: { lines: ['|turn|1'], request: null, ended: false, winner: null },
});

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  vi.stubGlobal('WebSocket', FakeSocket);
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function joined() {
  const hook = renderHook(() => useRoom('ABCDE', 'Ash'));
  last().open();
  last().receive(welcome('playing', [{ id: '1-0', stage: 'battle' }]));
  last().receive({ type: 'match', match: { id: '1-0', stage: 'battle' } });
  last().receive(side('1-0'));
  return hook;
}

describe('useRoom', () => {
  it('drops the last game’s battles when a new game starts', () => {
    const { result } = joined();
    last().receive({ type: 'match', match: { id: '1-0', stage: 'over' } });
    last().receive({ type: 'room', room: roomIn('over') });
    expect(result.current.match?.id).toBe('1-0');
    const game = result.current.game;

    // Play again: the next game's battles can have the same ids.
    last().receive({ type: 'room', room: roomIn('lobby') });
    expect(result.current.match).toBeNull();
    expect(result.current.feedFor('1-0').size).toBe(0);
    expect(result.current.game).toBe(game + 1);
  });

  it('drops a battle the room no longer has after reconnecting', () => {
    const { result } = joined();
    last().drop();
    act(() => vi.advanceTimersByTime(1000));
    last().open();
    expect(last().sent).toEqual([{ type: 'rejoin', token: 'tok' }]);
    last().receive(welcome('intermission'));
    expect(result.current.match).toBeNull();
  });

  it('keeps a battle still in play after reconnecting', () => {
    const { result } = joined();
    last().drop();
    act(() => vi.advanceTimersByTime(1000));
    last().open();
    last().receive(welcome('playing', [{ id: '1-0', stage: 'battle' }]));
    expect(result.current.match?.id).toBe('1-0');
  });

  it('gives up once back when you gave up while disconnected', () => {
    const { result } = joined();
    last().drop();
    act(() => result.current.forfeit());
    act(() => vi.advanceTimersByTime(1000));
    last().open();
    last().receive(welcome('playing', [{ id: '1-0', stage: 'battle' }]));
    expect(last().sent).toContainEqual({ type: 'forfeit' });
  });

  it('reconnects a silent connection when the tab comes back', () => {
    joined();
    const before = last();
    act(() => vi.advanceTimersByTime(STALE_MS + 1000));
    // A quiet room isn't reconnected while you're away…
    expect(last()).toBe(before);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    // …but coming back to it checks.
    expect(last()).not.toBe(before);
    expect(before.readyState).toBe(FakeSocket.CLOSED);
    last().open();
    expect(last().sent).toEqual([{ type: 'rejoin', token: 'tok' }]);
  });

  it('reconnects straight away when back online after a drop', () => {
    joined();
    last().drop();
    const waiting = FakeSocket.all.length;
    // Backing off: two drops in a row wait two seconds.
    act(() => vi.advanceTimersByTime(1000));
    last().drop();
    act(() => window.dispatchEvent(new Event('online')));
    expect(FakeSocket.all.length).toBe(waiting + 2);
  });
});
