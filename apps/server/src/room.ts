// One versus room: its state, a websocket per connected player, and this
// round's battles. Uses the hibernation API, so an idle room costs nothing; the
// state lives in storage and is read back when the room wakes, and a battle is
// rebuilt from its recorded choices the first time it's needed after that.
import { makeRng } from '@daily-battle/sim-bridge';
import { DurableObject } from 'cloudflare:workers';
import {
  applyCommand,
  cannotStart,
  chooseLead,
  clockDeadline,
  CLOSE,
  createRoom,
  joinRoom,
  leadsReady,
  matchOf,
  matchView,
  newMatch,
  nextDeadline,
  otherSide,
  pairUp,
  parseClientMessage,
  playerByToken,
  putMatch,
  roomView,
  sideOf,
  SIDES,
  startClock,
  startRound,
  stopClock,
  TIMERS,
  type ClientMessage,
  type ErrorCode,
  type Match,
  type MatchEnd,
  type Player,
  type RoomState,
  type ServerMessage,
  type Side,
} from '@daily-battle/versus';
import type { PRNGSeed } from '@pkmn/sim';
import { dealTeam, LiveBattle, randomSeed } from './battle';
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
  /** Live battles by match id. Lost when the room sleeps; rebuilt on demand. */
  private readonly battles = new Map<string, LiveBattle>();
  /** How many of each side's lines its player has been sent, by match id. */
  private readonly sent = new Map<string, Record<Side, number>>();

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
      if (!me) await this.join(ws, room, msg);
      return;
    }
    if (!me) return this.send(ws, { type: 'error', code: 'notJoined' });

    const now = Date.now();
    switch (msg.type) {
      case 'start':
        return this.start(ws, me, now);
      case 'lead':
        return this.lead(ws, me, msg.species, now);
      case 'choose':
        return this.choose(ws, me, msg.choice, now);
      case 'forfeit':
        return this.forfeitFor(me, now);
    }

    // Leaving, or being removed, mid-round forfeits your battle first.
    if (msg.type === 'leave') await this.forfeitFor(me, now);
    if (msg.type === 'kick' && room.hostId === me && msg.player !== me) {
      await this.forfeitFor(msg.player, now);
    }
    const result = applyCommand(this.room!, me, msg);
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
    // A player's clock keeps running while they're away; it's what ends an abandoned battle.
    if (!this.sockets().some((s) => playerOf(s))) await this.schedule();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws, 1011, 'Error');
  }

  /** Times out lead picking and clocks; deletes the room once it's been idle long enough. */
  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    if (room.phase === 'playing') {
      for (const id of room.matches.map((m) => m.id)) {
        // An earlier timeout may have ended the round.
        const m = this.room?.phase === 'playing' && this.room.matches.find((x) => x.id === id);
        if (!m) break;
        if (leadsReady(m, now)) {
          await this.beginBattle(m, now);
          continue;
        }
        if (m.stage !== 'battle') continue;
        const late = SIDES.find((s) => {
          const deadline = clockDeadline(m.clocks[s], this.perTurnMs());
          return deadline !== null && now >= deadline;
        });
        if (late) {
          this.battle(m).forfeit(late);
          await this.endMatch(m, 'timeout', now);
        }
      }
      return this.schedule();
    }
    if (this.sockets().some((s) => playerOf(s))) return this.schedule();
    await this.ctx.storage.deleteAll();
    this.room = null;
  }

  // Joining

  private async join(
    ws: WebSocket,
    room: RoomState,
    msg: Extract<ClientMessage, { type: 'join' | 'rejoin' }>,
  ) {
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
      if (playerOf(other) === player.id) this.disconnect(other, CLOSE.replaced, 'Opened elsewhere');
    }
    ws.serializeAttachment({ player: player.id } satisfies Attachment);
    if (next !== room) await this.save(next);
    this.send(ws, { type: 'welcome', you: player.id, token: player.token, room: this.view() });
    this.broadcast(ws);
    // Back in the middle of a round: your battle, and its whole log so far.
    const match = matchOf(next, player.id);
    if (match) {
      const side = sideOf(match, player.id)!;
      this.send(ws, { type: 'match', match: matchView(match, side, Date.now(), this.perTurnMs()) });
      if (match.stage === 'battle') {
        const battle = this.battle(match);
        this.send(ws, {
          type: 'side',
          match: match.id,
          from: 0,
          update: battle.update(side, 0),
          resync: true,
        });
      }
    }
  }

  // A round

  private async start(ws: WebSocket, me: string, now: number) {
    const room = this.room!;
    const error = cannotStart(room, me);
    if (error) return this.send(ws, { type: 'error', code: error });
    const { format, timer } = room.settings;
    const deal = makeRng(randomSeed() as PRNGSeed);
    const { pairs, sittingOut } = pairUp(
      room.players.map((p) => p.id),
      deal,
    );
    const player = (id: string) => room.players.find((p) => p.id === id)!;
    const matches = pairs.map(([p1, p2], i) =>
      newMatch({
        id: `${room.round + 1}-${i}`,
        players: { p1, p2 },
        names: { p1: player(p1).name, p2: player(p2).name },
        format,
        seed: randomSeed(),
        teams: {
          p1: dealTeam(format, deal, player(p1).teamSize),
          p2: dealTeam(format, deal, player(p2).teamSize),
        },
        bankMs: TIMERS[timer].bank * 1000,
        now,
      }),
    );
    this.battles.clear();
    this.sent.clear();
    await this.save(startRound(room, matches, sittingOut));
    this.broadcast();
    for (const m of matches) this.sendMatch(m, now);
    if (sittingOut) this.sendTo(sittingOut, { type: 'match', match: null });
  }

  private async lead(ws: WebSocket, me: string, species: string, now: number) {
    const match = matchOf(this.room!, me);
    const side = match && sideOf(match, me);
    const next = match && side && chooseLead(match, side, species);
    if (!next) return this.send(ws, { type: 'error', code: 'notYourTurn' });
    if (leadsReady(next, now)) return this.beginBattle(next, now);
    await this.save(putMatch(this.room!, next));
    this.sendMatch(next, now);
  }

  /** Both leads are in (or time is up): the battle starts, and both players get its opening. */
  private async beginBattle(match: Match, now: number) {
    const leads = {
      p1: match.leads.p1 ?? match.teams.p1[0]!.species,
      p2: match.leads.p2 ?? match.teams.p2[0]!.species,
    };
    let m: Match = { ...match, leads, stage: 'battle' };
    const battle = new LiveBattle(m);
    this.battles.set(m.id, battle);
    this.sent.set(m.id, { p1: 0, p2: 0 });
    m = this.runClocks(m, battle, now);
    await this.save(putMatch(this.room!, m));
    this.broadcast();
    this.sendMatch(m, now);
    for (const side of SIDES) this.sendSide(m, side);
  }

  private async choose(ws: WebSocket, me: string, choice: string, now: number) {
    const match = matchOf(this.room!, me);
    const side = match && sideOf(match, me);
    if (!match || !side || match.stage !== 'battle') {
      return this.send(ws, { type: 'error', code: 'notYourTurn' });
    }
    const battle = this.battle(match);
    const outcome = battle.choose(side, choice);
    if (outcome !== 'ok') {
      // Either way the player gets their request back, so they can choose again.
      if (outcome === 'illegal') this.send(ws, { type: 'error', code: 'notYourTurn' });
      return this.sendSide(match, side, outcome === 'blocked');
    }
    let m: Match = {
      ...match,
      choices: { ...match.choices, [side]: [...match.choices[side], choice] },
    };
    if (battle.ended) return this.endMatch(m, battle.winner ? 'win' : 'tie', now);
    m = this.runClocks(m, battle, now);
    await this.save(putMatch(this.room!, m));
    for (const s of SIDES) this.sendSide(m, s);
    this.sendMatch(m, now);
  }

  /** Ends `player`'s battle this round as a loss for them: they gave up, or they're leaving. */
  private async forfeitFor(player: string, now: number) {
    const match = this.room && matchOf(this.room, player);
    const side = match && sideOf(match, player);
    if (!match || !side || match.stage === 'over') return;
    if (match.stage === 'battle') this.battle(match).forfeit(side);
    await this.endMatch(match, 'forfeit', now, otherSide(side));
  }

  /** Stops the clocks and records the result; the room returns to the lobby once all are over. */
  private async endMatch(match: Match, reason: MatchEnd, now: number, winner?: Side) {
    const battle = match.stage === 'battle' ? this.battle(match) : null;
    const m: Match = {
      ...match,
      stage: 'over',
      clocks: { p1: stopClock(match.clocks.p1, now), p2: stopClock(match.clocks.p2, now) },
      result: { winner: winner ?? battle?.winner ?? null, reason },
    };
    const room = putMatch(this.room!, m);
    await this.save(room);
    if (battle) for (const s of SIDES) this.sendSide(m, s);
    this.sendMatch(m, now);
    // The round's over: players keep their result on screen until they go back to the room.
    if (room.phase === 'lobby') {
      this.battles.clear();
      this.sent.clear();
    }
    this.broadcast();
  }

  /** Each side's clock runs while it has a choice to make. */
  private runClocks(match: Match, battle: LiveBattle, now: number): Match {
    const clocks = { ...match.clocks };
    for (const s of SIDES) {
      clocks[s] = battle.waitingOn(s) ? startClock(clocks[s], now) : stopClock(clocks[s], now);
    }
    return { ...match, clocks };
  }

  /** The match's battle, rebuilt from its record if the room slept since. */
  private battle(match: Match): LiveBattle {
    let battle = this.battles.get(match.id);
    if (!battle) {
      battle = new LiveBattle(match);
      this.battles.set(match.id, battle);
      // Everything up to the last recorded choice was sent before the room slept.
      this.sent.set(match.id, { p1: battle.logLength('p1'), p2: battle.logLength('p2') });
    }
    return battle;
  }

  private perTurnMs(): number {
    return TIMERS[this.room!.settings.timer].perTurn * 1000;
  }

  // Storage and the alarm

  private async save(room: RoomState) {
    this.room = room;
    await this.ctx.storage.put('room', room);
    await this.schedule();
  }

  /** The alarm goes off at the next timeout in any battle, or when the room would go idle. */
  private async schedule() {
    const room = this.room;
    if (!room) return;
    const times = room.matches.flatMap((m) => nextDeadline(m, this.perTurnMs()) ?? []);
    await this.ctx.storage.setAlarm(times.length ? Math.min(...times) : Date.now() + IDLE_MS);
  }

  // Sending

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

  private sendTo(player: string, msg: ServerMessage) {
    for (const s of this.sockets()) if (playerOf(s) === player) this.send(s, msg);
  }

  /** Each player's own view of the match. */
  private sendMatch(match: Match, now: number) {
    for (const side of SIDES) {
      this.sendTo(match.players[side], {
        type: 'match',
        match: matchView(match, side, now, this.perTurnMs()),
      });
    }
  }

  /** The side's new battle lines and request (always sent, so a choice is always answered). */
  private sendSide(match: Match, side: Side, blocked = false) {
    const battle = this.battle(match);
    const sent = this.sent.get(match.id)!;
    const from = sent[side];
    sent[side] = battle.logLength(side);
    this.sendTo(match.players[side], {
      type: 'side',
      match: match.id,
      from,
      update: battle.update(side, from, blocked),
    });
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
