import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './protocol';
import {
  applyCommand,
  cleanName,
  createRoom,
  joinRoom,
  makeCode,
  MAX_PLAYERS,
  normalizeCode,
  playerByToken,
  roomView,
  type Result,
  type RoomState,
  ROOM_VERSION,
  upgradeRoom,
} from './room';

const ok = (r: Result): RoomState => {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.state;
};

function roomWith(...names: string[]): RoomState {
  let state = createRoom('BCDFG', 0);
  for (const [i, name] of names.entries()) {
    state = ok(joinRoom(state, { id: `id${i}`, name, token: `token${i}` }));
  }
  return state;
}

describe('room codes', () => {
  it('makes codes from the code letters', () => {
    let n = 0;
    const code = makeCode(() => (n++ * 0.37) % 1);
    expect(normalizeCode(code)).toBe(code);
  });

  it('reads typed codes in any case, and rejects others', () => {
    expect(normalizeCode(' bcd fg ')).toBe('BCDFG');
    expect(normalizeCode('ABCDE')).toBeNull(); // vowels aren't used
    expect(normalizeCode('BCDF')).toBeNull();
  });
});

describe('joining', () => {
  it('makes the first player the host', () => {
    const state = roomWith('Ash', 'Misty');
    expect(state.hostId).toBe('id0');
    expect(state.players.map((p) => p.name)).toEqual(['Ash', 'Misty']);
    expect(state.players.every((p) => p.teamSize === 6)).toBe(true);
  });

  it('refuses a name already taken, in any case', () => {
    const r = joinRoom(roomWith('Ash'), { id: 'x', name: ' ash ', token: 't' });
    expect(r).toEqual({ ok: false, error: 'nameTaken' });
  });

  it('refuses empty, long, or control-character names', () => {
    expect(cleanName('   ')).toBeNull();
    expect(cleanName('x'.repeat(17))).toBeNull();
    expect(cleanName('a\u0007b')).toBeNull();
    expect(cleanName('  Red   Blue ')).toBe('Red Blue');
  });

  it('refuses a ninth player', () => {
    const state = roomWith(...Array.from({ length: MAX_PLAYERS }, (_, i) => `P${i}`));
    expect(joinRoom(state, { id: 'x', name: 'Late', token: 't' })).toEqual({
      ok: false,
      error: 'full',
    });
  });

  it('finds a player by token', () => {
    expect(playerByToken(roomWith('Ash', 'Misty'), 'token1')?.name).toBe('Misty');
    expect(playerByToken(roomWith('Ash'), 'nope')).toBeUndefined();
  });
});

describe('commands', () => {
  it('lets only the host change settings', () => {
    const state = roomWith('Ash', 'Misty');
    const changed = ok(applyCommand(state, 'id0', { type: 'settings', settings: { lives: 3 } }));
    expect(changed.settings.lives).toBe(3);
    expect(changed.settings.format).toBe('gen4ou');
    expect(applyCommand(state, 'id1', { type: 'settings', settings: { lives: 3 } })).toEqual({
      ok: false,
      error: 'notHost',
    });
  });

  it('sets a handicap team size', () => {
    const state = ok(
      applyCommand(roomWith('Ash', 'Misty'), 'id0', { type: 'teamSize', player: 'id1', size: 4 }),
    );
    expect(state.players[1]!.teamSize).toBe(4);
  });

  it('lets a player set their own handicap, but not anyone else’s', () => {
    const room = roomWith('Ash', 'Misty', 'Brock');
    const own = ok(applyCommand(room, 'id1', { type: 'teamSize', player: 'id1', size: 3 }));
    expect(own.players[1]!.teamSize).toBe(3);
    expect(applyCommand(room, 'id1', { type: 'teamSize', player: 'id2', size: 3 })).toEqual({
      ok: false,
      error: 'notHost',
    });
  });

  it('passes the host on when the host leaves', () => {
    const state = ok(applyCommand(roomWith('Ash', 'Misty', 'Brock'), 'id0', { type: 'leave' }));
    expect(state.hostId).toBe('id1');
    expect(state.players.map((p) => p.name)).toEqual(['Misty', 'Brock']);
    expect(ok(applyCommand(roomWith('Ash'), 'id0', { type: 'leave' })).hostId).toBeNull();
  });

  it('lets the host remove others but not themselves', () => {
    const state = roomWith('Ash', 'Misty');
    expect(ok(applyCommand(state, 'id0', { type: 'kick', player: 'id1' })).players).toHaveLength(1);
    expect(applyCommand(state, 'id0', { type: 'kick', player: 'id0' }).ok).toBe(false);
    expect(applyCommand(state, 'id1', { type: 'kick', player: 'id0' }).ok).toBe(false);
  });

  it('ignores commands from someone not in the room', () => {
    expect(applyCommand(roomWith('Ash'), 'ghost', { type: 'leave' })).toEqual({
      ok: false,
      error: 'notJoined',
    });
  });
});

describe('the room view', () => {
  it('never includes tokens', () => {
    const view = roomView(roomWith('Ash', 'Misty'), new Set(['id0']), 0);
    expect(JSON.stringify(view)).not.toContain('token');
    expect(view.players.map((p) => p.online)).toEqual([true, false]);
  });
});

describe('parseClientMessage', () => {
  const parse = (v: unknown) => parseClientMessage(JSON.stringify(v));

  it('accepts the room’s messages', () => {
    expect(parse({ type: 'join', name: 'Ash' })).toEqual({ type: 'join', name: 'Ash' });
    expect(parse({ type: 'settings', settings: { format: 'gen5ou', pool: 'weekly' } })).toEqual({
      type: 'settings',
      settings: { format: 'gen5ou', pool: 'weekly' },
    });
    expect(parse({ type: 'settings', settings: { rivalDifficulty: 'hard' } })).toEqual({
      type: 'settings',
      settings: { rivalDifficulty: 'hard' },
    });
    expect(parse({ type: 'teamSize', player: 'id1', size: 3 })).toEqual({
      type: 'teamSize',
      player: 'id1',
      size: 3,
    });
  });

  it('rejects anything else', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('x'.repeat(5000))).toBeNull();
    expect(parse({ type: 'nope' })).toBeNull();
    expect(parse({ type: 'settings', settings: { lives: 0 } })).toBeNull();
    expect(parse({ type: 'settings', settings: { lives: 2.5 } })).toBeNull();
    expect(parse({ type: 'settings', settings: { format: 'gen9ou' } })).toBeNull();
    expect(parse({ type: 'settings', settings: { format: 'toString' } })).toBeNull();
    expect(parse({ type: 'settings', settings: { hostId: 'me' } })).toBeNull();
    expect(parse({ type: 'settings', settings: { rivalDifficulty: 'expert' } })).toBeNull();
    expect(parse({ type: 'teamSize', player: 'id1', size: 2 })).toBeNull();
    expect(parse({ type: 'rejoin', token: 42 })).toBeNull();
    expect(parse(['join'])).toBeNull();
  });
});

describe('upgradeRoom', () => {
  it('brings an older room back to the lobby, keeping its players and settings', () => {
    const old = {
      code: 'BCDFG',
      createdAt: 5,
      phase: 'playing',
      hostId: 'id1',
      players: [
        { id: 'id0', name: 'Ash', token: 't0', teamSize: 4 },
        { id: 'id1', name: 'Misty', token: 't1', teamSize: 6 },
      ],
      settings: { format: 'gen5ou', lives: 3, timer: 'fast', pool: 'random' },
      matches: [{ id: '1-0', stage: 'battle' }],
    } as unknown as RoomState;
    const room = upgradeRoom(old);
    expect(room.version).toBe(ROOM_VERSION);
    expect(room.phase).toBe('lobby');
    expect(room.matches).toEqual([]);
    expect(room.hostId).toBe('id1');
    expect(room.settings).toMatchObject({ format: 'gen5ou', lives: 3, timer: 'fast' });
    expect(room.players.map((p) => [p.name, p.token, p.teamSize, p.lives])).toEqual([
      ['Ash', 't0', 4, 3],
      ['Misty', 't1', 6, 3],
    ]);
    const current = createRoom('BCDFG', 0);
    expect(upgradeRoom(current)).toBe(current);
  });
});

describe('upgradeRoom from version 4', () => {
  it('keeps the game going, adding spectators and fainted counts', () => {
    const v4 = {
      ...createRoom('BCDFG', 0),
      version: 4,
      phase: 'playing',
      matches: [{ id: '1-0', stage: 'battle' }],
    } as unknown as RoomState;
    delete (v4 as Partial<RoomState>).spectators;
    const room = upgradeRoom(v4);
    expect(room.phase).toBe('playing');
    expect(room.spectators).toEqual([]);
    expect(room.matches[0]!.fainted).toEqual({ p1: 0, p2: 0 });
  });
});
