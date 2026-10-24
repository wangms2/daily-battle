// One versus room: its state, a websocket per connected player, and its game
// (DESIGN.md §18): building from the pool, then rounds of battles until one
// player has lives left. Uses the hibernation API, so an idle room costs
// nothing; the state lives in storage and is read back when the room wakes,
// and a battle is rebuilt from its recorded choices the first time it's needed
// after that.
import { aiForStyle } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import { deriveSeed, makeRng, type Policy } from '@daily-battle/sim-bridge';
import { DurableObject } from 'cloudflare:workers';
import {
  afterDeparture,
  AI_ID,
  AI_NAME,
  alive,
  applyCommand,
  battleSlots,
  buildDone,
  cannotStartGame,
  clockDeadline,
  CLOSE,
  createRoom,
  endRound,
  fillTeams,
  joinRoom,
  matchOf,
  matchView,
  newMatch,
  nextDeadline,
  otherSide,
  pairByLives,
  parseClientMessage,
  playAgain,
  playerByToken,
  prepDone,
  putMatch,
  roomView,
  roundDone,
  sideOf,
  SIDES,
  startBuild,
  startClock,
  startRound,
  stopClock,
  submitTeam,
  TIMERS,
  updatePrep,
  upgradeRoom,
  withChange,
  type ClientMessage,
  type ErrorCode,
  type Match,
  type MatchEnd,
  type Pairing,
  type Player,
  type Prep,
  type RoomState,
  type ServerMessage,
  type Side,
} from '@daily-battle/versus';
import type { PRNGSeed } from '@pkmn/sim';
import { LiveBattle, randomSeed } from './battle';
import type { Env } from './env';
import { aiTeam, autoTeam, legalTeam, randomPool, weeklyPool } from './teams';

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

const random = () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32;

export class Room extends DurableObject<Env> {
  private room: RoomState | null = null;
  /** Live battles by match id. Lost when the room sleeps; rebuilt on demand. */
  private readonly battles = new Map<string, LiveBattle>();
  /** How many of each side's lines its player has been sent, by match id. */
  private readonly sent = new Map<string, Record<Side, number>>();
  /** The AI's policy in each battle against it, by match id. */
  private readonly policies = new Map<string, Policy>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      const saved = (await ctx.storage.get<RoomState>('room')) ?? null;
      this.room = saved && upgradeRoom(saved);
      // A room from before the pool existed gets one.
      if (this.room && !this.room.pool) {
        const { format } = this.room.settings;
        this.room = { ...this.room, pool: randomPool(format, this.room.code, 0) };
      }
      if (this.room !== saved && this.room) await ctx.storage.put('room', this.room);
    });
  }

  /** Sets up a new room under `code`, with a first random pool; false if the code is in use. */
  async create(code: string): Promise<boolean> {
    if (this.room) return false;
    const room = createRoom(code, Date.now());
    await this.save({ ...room, pool: randomPool(room.settings.format, code, 0) });
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
      case 'redraw':
        return this.redraw(ws, me);
      case 'start':
        return this.start(ws, me, now);
      case 'playAgain': {
        const result = playAgain(room, me);
        if (!result.ok) return this.send(ws, { type: 'error', code: result.error });
        this.battles.clear();
        this.sent.clear();
        await this.save(result.state);
        return this.broadcast();
      }
      case 'team':
        return this.team(ws, me, msg.team, now);
      case 'change':
        return this.prep(ws, me, { change: msg.change }, now);
      case 'lead':
        return this.prep(ws, me, { lead: msg.species }, now);
      case 'ready':
        return this.prep(ws, me, { ready: true }, now);
      case 'choose':
        return this.choose(ws, me, msg.choice, now);
      case 'forfeit':
        return this.forfeitFor(me, now);
    }

    // Leaving, or being removed, mid-game loses your battle first.
    if (msg.type === 'leave') await this.forfeitFor(me, now);
    if (msg.type === 'kick' && room.hostId === me && msg.player !== me) {
      await this.forfeitFor(msg.player, now);
    }
    const result = applyCommand(this.room!, me, msg);
    if (!result.ok) return this.send(ws, { type: 'error', code: result.error });
    let next = afterDeparture(result.state, now, random);
    // A new game or pool: the pool follows the settings.
    if (msg.type === 'settings' && ('format' in msg.settings || 'pool' in msg.settings)) {
      next = await this.withPool(ws, next);
    }
    // Anyone no longer in the room (they left, or the host removed them) is disconnected.
    for (const s of this.sockets()) {
      const id = playerOf(s);
      if (!id || next.players.some((p) => p.id === id && !p.left)) continue;
      if (id === me) {
        this.disconnect(s, CLOSE.left, 'Left the room');
      } else {
        this.send(s, { type: 'kicked' });
        this.disconnect(s, CLOSE.kicked, 'Removed by the host');
      }
    }
    await this.save(next);
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

  /** Moves the game on at its deadlines; deletes the room once it's been idle long enough. */
  override async alarm(): Promise<void> {
    const room = this.room;
    if (!room) return;
    const now = Date.now();
    if (room.phase === 'build' && buildDone(room, now)) {
      await this.beginGame(now);
    } else if (room.phase === 'intermission' && now >= (room.deadline ?? 0)) {
      await this.beginRound(room.next, now);
    } else if (room.phase === 'playing') {
      for (const id of room.matches.map((m) => m.id)) {
        // An earlier timeout may have ended the round.
        const m = this.room?.phase === 'playing' && this.room.matches.find((x) => x.id === id);
        if (!m) break;
        if (prepDone(m, now)) {
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
    } else if (room.phase === 'lobby' || room.phase === 'over') {
      if (!this.sockets().some((s) => playerOf(s))) {
        await this.ctx.storage.deleteAll();
        this.room = null;
        return;
      }
    }
    await this.schedule();
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
      if (!player || player.left) return this.refuse(ws, 'badToken');
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
    this.send(ws, { type: 'team', team: player.team });
    this.broadcast(ws);
    // Back in the middle of a round: your battle, and its whole log so far.
    const match = matchOf(next, player.id);
    if (match) {
      const side = sideOf(match, player.id)!;
      this.send(ws, { type: 'match', match: matchView(match, side, Date.now(), this.perTurnMs()) });
      if (match.stage === 'battle') {
        this.send(ws, {
          type: 'side',
          match: match.id,
          from: 0,
          update: this.battle(match).update(side, 0),
          resync: true,
        });
      }
    }
  }

  // The lobby

  /** The pool for the room's settings: a random draw, or this week's daily pool. */
  private async withPool(ws: WebSocket | null, room: RoomState, draw = 0): Promise<RoomState> {
    const { settings } = room;
    if (settings.pool === 'weekly') {
      const pool = await weeklyPool(this.env.ASSETS, settings);
      if (pool) return { ...room, pool };
      if (ws) this.send(ws, { type: 'error', code: 'noPool' });
      return { ...room, settings: { ...settings, pool: 'random' }, pool: this.random(room, draw) };
    }
    return { ...room, pool: this.random(room, draw) };
  }

  private random(room: RoomState, draw: number) {
    return randomPool(room.settings.format, room.code, draw);
  }

  private async redraw(ws: WebSocket, me: string) {
    const room = this.room!;
    if (room.hostId !== me) return this.send(ws, { type: 'error', code: 'notHost' });
    if (room.phase !== 'lobby' || room.settings.pool !== 'random') {
      return this.send(ws, { type: 'error', code: 'started' });
    }
    await this.save(await this.withPool(ws, room, (room.pool?.draw ?? 0) + 1));
    this.broadcast();
  }

  // Building

  private async start(ws: WebSocket, me: string, now: number) {
    const error = cannotStartGame(this.room!, me);
    if (error) return this.send(ws, { type: 'error', code: error });
    this.battles.clear();
    this.sent.clear();
    await this.save(startBuild(this.room!, now));
    this.broadcast();
    for (const p of this.room!.players) this.sendTo(p.id, { type: 'team', team: null });
  }

  private async team(ws: WebSocket, me: string, slots: Player['team'] & {}, now: number) {
    const room = this.room!;
    if (!legalTeam(room.settings.format, slots)) {
      return this.send(ws, { type: 'error', code: 'badTeam' });
    }
    const result = submitTeam(room, me, slots);
    if (!result.ok) return this.send(ws, { type: 'error', code: result.error });
    await this.save(result.state);
    this.sendTo(me, { type: 'team', team: slots });
    if (buildDone(result.state, now)) return this.beginGame(now);
    this.broadcast();
  }

  /** Building's over: anyone without a team gets one, and the first round starts. */
  private async beginGame(now: number) {
    const room = this.room!;
    const { format } = room.settings;
    const pool = room.pool!.species;
    const filled = fillTeams(room, (p) => autoTeam(format, pool, p.teamSize));
    this.room = filled;
    for (const p of filled.players) this.sendTo(p.id, { type: 'team', team: p.team });
    // The first round is paired like any other (all lives are equal).
    await this.beginRound(pairByLives(alive(filled), random), now);
  }

  // Rounds

  /** Starts a round from its pairings: each pair's match, in the swap. */
  private async beginRound(pairs: Pairing[], now: number) {
    const room = this.room!;
    const { format, timer } = room.settings;
    const round = room.round + 1;
    const player = (id: string) => room.players.find((p) => p.id === id)!;
    this.battles.clear();
    this.sent.clear();
    this.policies.clear();
    const matches = pairs.map(({ p1, p2 }, i) => {
      const a = player(p1);
      const ai =
        p2 === AI_ID ? aiTeam(format, `room:${room.code}:${round}:${i}`, a.teamSize) : null;
      return newMatch({
        id: `${round}-${i}`,
        players: { p1, p2 },
        names: { p1: a.name, p2: ai ? AI_NAME : player(p2).name },
        ai: ai ? 'p2' : null,
        aiStyle: ai?.style,
        format,
        seed: randomSeed(),
        slots: { p1: a.team!, p2: ai ? ai.slots : player(p2).team! },
        bankMs: TIMERS[timer].bank * 1000,
        now,
      });
    });
    await this.save(startRound(room, matches));
    this.broadcast();
    for (const m of matches) this.sendMatch(m, now);
    // Anyone out of the game has no battle this round.
    for (const p of room.players) {
      if (!matches.some((m) => sideOf(m, p.id))) this.sendTo(p.id, { type: 'match', match: null });
    }
  }

  private async prep(ws: WebSocket, me: string, update: Partial<Prep>, now: number) {
    const room = this.room!;
    const match = matchOf(room, me);
    const side = match && sideOf(match, me);
    if (!match || !side) return this.send(ws, { type: 'error', code: 'notYourTurn' });
    // A changed-in set must exist and keep the team legal.
    const change = update.change;
    if (change) {
      const team = withChange(match.slots[side], change);
      if (!legalTeam(match.format, team)) return this.send(ws, { type: 'error', code: 'badTeam' });
    }
    const next = updatePrep(match, side, update, room.pool!.species);
    if (!next) return this.send(ws, { type: 'error', code: 'notYourTurn' });
    if (prepDone(next, now)) return this.beginBattle(next, now);
    await this.save(putMatch(room, next));
    this.sendMatch(next, now);
  }

  /**
   * The swap is over: each side's change goes onto its team for good, the
   * battle starts lead first, and both players get its opening.
   */
  private async beginBattle(match: Match, now: number) {
    let room = this.room!;
    const slots = { p1: battleSlots(match, 'p1'), p2: battleSlots(match, 'p2') };
    for (const side of SIDES) {
      const id = match.players[side];
      const change = match.prep[side].change;
      if (id === AI_ID || !change) continue;
      room = {
        ...room,
        players: room.players.map((p) =>
          p.id === id ? { ...p, team: withChange(p.team!, change) } : p,
        ),
      };
      this.sendTo(id, { type: 'team', team: withChange(match.slots[side], change) });
    }
    let m: Match = {
      ...match,
      stage: 'battle',
      teams: {
        p1: legalTeam(match.format, slots.p1)!,
        p2: legalTeam(match.format, slots.p2)!,
      },
    };
    const battle = new LiveBattle(m);
    this.battles.set(m.id, battle);
    this.sent.set(m.id, { p1: 0, p2: 0 });
    m = this.runAi(m, battle);
    m = this.runClocks(m, battle, now);
    await this.save(putMatch(room, m));
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
    let m = record(match, side, choice);
    m = this.runAi(m, battle);
    if (battle.ended) return this.endMatch(m, battle.winner ? 'win' : 'tie', now);
    m = this.runClocks(m, battle, now);
    await this.save(putMatch(this.room!, m));
    for (const s of SIDES) this.sendSide(m, s);
    this.sendMatch(m, now);
  }

  /** The AI answers everything the battle asks of it; its choices are recorded like a player's. */
  private runAi(match: Match, battle: LiveBattle): Match {
    const side = match.ai;
    if (!side) return match;
    let policy = this.policies.get(match.id);
    if (!policy) {
      policy = aiForStyle(match.aiStyle ?? 'balance', { data: setsFor(match.format) });
      this.policies.set(match.id, policy);
    }
    let m = match;
    for (let view = battle.view(side); view && !battle.ended; view = battle.view(side)) {
      const rng = makeRng(deriveSeed(m.seed, m.choices[side].length) as PRNGSeed);
      const choice = policy.choose(view, rng);
      if (battle.choose(side, choice) === 'ok') m = record(m, side, choice);
    }
    return m;
  }

  /** Ends `player`'s battle this round as a loss for them: they gave up, or they're leaving. */
  private async forfeitFor(player: string, now: number) {
    const match = this.room && matchOf(this.room, player);
    const side = match && sideOf(match, player);
    if (!match || !side || match.stage === 'over') return;
    if (match.stage === 'battle') this.battle(match).forfeit(side);
    await this.endMatch(match, 'forfeit', now, otherSide(side));
  }

  /** Stops the clocks and records the result; once every battle is over, the round ends. */
  private async endMatch(match: Match, reason: MatchEnd, now: number, winner?: Side) {
    const battle = match.stage === 'battle' ? this.battle(match) : null;
    const m: Match = {
      ...match,
      stage: 'over',
      clocks: { p1: stopClock(match.clocks.p1, now), p2: stopClock(match.clocks.p2, now) },
      result: { winner: winner ?? battle?.winner ?? null, reason },
    };
    let room = putMatch(this.room!, m);
    if (battle) for (const s of SIDES) this.sendSide(m, s);
    this.sendMatch(m, now);
    // Players keep their result on screen until they go back to the room.
    if (roundDone(room)) room = endRound(room, now, random);
    await this.save(room);
    this.broadcast();
  }

  /** Each player's clock runs while they have a choice to make (the AI's never does). */
  private runClocks(match: Match, battle: LiveBattle, now: number): Match {
    const clocks = { ...match.clocks };
    for (const s of SIDES) {
      clocks[s] =
        s !== match.ai && battle.waitingOn(s)
          ? startClock(clocks[s], now)
          : stopClock(clocks[s], now);
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

  /** The alarm goes off at the game's next deadline, or when the room would go idle. */
  private async schedule() {
    const room = this.room;
    if (!room) return;
    const times = [
      ...(room.deadline !== null ? [room.deadline] : []),
      ...room.matches.flatMap((m) => nextDeadline(m, this.perTurnMs()) ?? []),
    ];
    await this.ctx.storage.setAlarm(times.length ? Math.min(...times) : Date.now() + IDLE_MS);
  }

  // Sending

  /** Open sockets. */
  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((s) => s.readyState === WebSocket.OPEN);
  }

  private view() {
    const online = new Set(this.sockets().flatMap((s) => playerOf(s) ?? []));
    return roomView(this.room!, online, Date.now());
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
      if (side === match.ai) continue;
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
    if (side === match.ai) return;
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

/** A match with one more accepted choice for a side. */
const record = (match: Match, side: Side, choice: string): Match => ({
  ...match,
  choices: { ...match.choices, [side]: [...match.choices[side], choice] },
});
