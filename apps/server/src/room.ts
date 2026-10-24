// One versus room: its state, and a websocket per connected player. Uses the
// hibernation API, so an idle room costs nothing; the state lives in storage
// and is read back when the room wakes.
import { DurableObject } from 'cloudflare:workers';
import {
  applyCommand,
  CLOSE,
  createRoom,
  joinRoom,
  parseClientMessage,
  playerByToken,
  roomView,
  type ErrorCode,
  type Player,
  type RoomState,
  type ServerMessage,
} from '@daily-battle/versus';
import type { Env } from './env';

/** Which player a socket belongs to, kept on the socket so it survives hibernation. */
interface Attachment {
  player?: string;
}

/** A room nobody has connected to for this long is deleted. */
const IDLE_MS = 24 * 60 * 60 * 1000;

/** Join errors you can fix without reconnecting (pick another name). */
const RETRYABLE: ErrorCode[] = ['badName', 'nameTaken'];

const playerOf = (ws: WebSocket): string | undefined =>
  (ws.deserializeAttachment() as Attachment | null)?.player;

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<RoomState>('room')) ?? null;
    });
  }

  /** Sets up a new room under `code`; false if this one is already in use. */
  async create(code: string): Promise<boolean> {
    if (this.room) return false;
    await this.save(createRoom(code, Date.now()));
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected a websocket', { status: 426 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({} satisfies Attachment);
    if (!this.room) {
      this.send(server, { type: 'error', code: 'noRoom' });
      server.close(CLOSE.noRoom, 'No such room');
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const room = this.room;
    if (!room) {
      this.send(ws, { type: 'error', code: 'noRoom' });
      ws.close(CLOSE.noRoom, 'No such room');
      return;
    }
    const msg = parseClientMessage(typeof data === 'string' ? data : null);
    if (!msg) return this.send(ws, { type: 'error', code: 'badMessage' });
    const me = playerOf(ws);

    if (msg.type === 'join' || msg.type === 'rejoin') {
      if (me) return;
      let player: Player | undefined;
      let next = room;
      if (msg.type === 'rejoin') {
        player = playerByToken(room, msg.token);
        if (!player) return this.refuse(ws, 'badToken');
      } else {
        const result = joinRoom(room, {
          id: crypto.randomUUID(),
          name: msg.name,
          token: crypto.randomUUID(),
        });
        if (!result.ok) return this.refuse(ws, result.error);
        next = result.state;
        player = next.players.at(-1)!;
      }
      // The same player in another tab gives way to this one.
      for (const other of this.sockets()) {
        if (playerOf(other) === player.id)
          this.disconnect(other, CLOSE.replaced, 'Opened elsewhere');
      }
      ws.serializeAttachment({ player: player.id } satisfies Attachment);
      if (next !== room) await this.save(next);
      this.send(ws, { type: 'welcome', you: player.id, token: player.token, room: this.view() });
      this.broadcast(ws);
      return;
    }

    if (!me) return this.send(ws, { type: 'error', code: 'notJoined' });
    const result = applyCommand(room, me, msg);
    if (!result.ok) return this.send(ws, { type: 'error', code: result.error });
    // Anyone no longer in the room (they left, or the host removed them) is disconnected.
    for (const s of this.sockets()) {
      const id = playerOf(s);
      if (!id || result.state.players.some((p) => p.id === id)) continue;
      if (id === me) {
        this.disconnect(s, CLOSE.left, 'Left the room');
      } else {
        this.send(s, { type: 'kicked' });
        this.disconnect(s, CLOSE.kicked, 'Removed by the host');
      }
    }
    await this.save(result.state);
    this.broadcast();
  }

  override async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    const wasPlayer = !!playerOf(ws);
    ws.serializeAttachment({} satisfies Attachment);
    try {
      // 1005 and 1006 mean no code was sent; they can't be sent back.
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // Already closed.
    }
    if (wasPlayer) this.broadcast();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011, 'Error');
  }

  override async alarm(): Promise<void> {
    if (this.sockets().some((s) => playerOf(s))) {
      await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.room = null;
  }

  private async save(room: RoomState) {
    this.room = room;
    await this.ctx.storage.put('room', room);
    await this.ctx.storage.setAlarm(Date.now() + IDLE_MS);
  }

  /** Open sockets. */
  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s.readyState === WebSocket.OPEN);
  }

  private view() {
    const online = new Set(this.sockets().flatMap((s) => playerOf(s) ?? []));
    return roomView(this.room!, online);
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // The socket closed in the meantime; its close handler tidies up.
    }
  }

  /** Sends everyone in the room the current room, except `skip`. */
  private broadcast(skip?: WebSocket) {
    if (!this.room) return;
    const msg: ServerMessage = { type: 'room', room: this.view() };
    for (const s of this.sockets()) if (s !== skip && playerOf(s)) this.send(s, msg);
  }

  private refuse(ws: WebSocket, code: ErrorCode) {
    this.send(ws, { type: 'error', code });
    if (!RETRYABLE.includes(code)) ws.close(CLOSE.refused, code);
  }

  private disconnect(ws: WebSocket, code: number, reason: string) {
    ws.serializeAttachment({} satisfies Attachment);
    ws.close(code, reason);
  }
}
