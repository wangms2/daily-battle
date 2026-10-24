// An incremental battle: create it, read each side's request and view, make
// choices one at a time, and drain each side's new protocol lines. runBattle
// and replayBattle drive it in a loop; the web client drives it turn by turn
// inside a worker.
import { DEFAULT_FORMAT } from '@daily-battle/data';
import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Protocol } from '@pkmn/protocol';
import { Battle, Dex, extractChannelMessages, type PRNGSeed } from '@pkmn/sim';
import type { BattleResult, ReplayInput, SideID, SideView } from './types';

const gens = new Generations(Dex as unknown as ConstructorParameters<typeof Generations>[0]);
export const SIDES: SideID[] = ['p1', 'p2'];
const CHANNEL = { spectator: 0, p1: 1, p2: 2 } as const;

export class BattleError extends Error {
  constructor(
    message: string,
    readonly details: { seed: PRNGSeed; turn: number; side?: SideID; choice?: string },
  ) {
    super(`${message} (seed ${details.seed}, turn ${details.turn})`);
    this.name = 'BattleError';
  }
}

interface SideState {
  client: ClientBattle;
  log: string[];
  /** Index into `log` of the first line not yet drained. */
  drained: number;
  request: Protocol.Request | null;
  error: string | null;
  choices: string[];
}

export class BattleSession {
  readonly spectatorLog: string[] = [];
  private readonly sides: Record<SideID, SideState>;
  private readonly battle: Battle;
  private readonly maxTurns: number;
  private turnCapped = false;

  constructor(readonly input: ReplayInput) {
    const { format = DEFAULT_FORMAT, seed, maxTurns = 300 } = input;
    this.maxTurns = maxTurns;
    const side = (): SideState => ({
      client: new ClientBattle(gens),
      log: [],
      drained: 0,
      request: null,
      error: null,
      choices: [],
    });
    this.sides = { p1: side(), p2: side() };
    this.battle = new Battle({
      formatid: format as never,
      seed,
      send: (t, d) => this.receive(t, d),
    });
    this.battle.setPlayer('p1', { name: input.p1.name ?? 'p1', team: input.p1.team });
    this.battle.setPlayer('p2', { name: input.p2.name ?? 'p2', team: input.p2.team });
    this.battle.sendUpdates();
  }

  get ended(): boolean {
    return this.battle.ended;
  }

  get turn(): number {
    return this.battle.turn;
  }

  get winner(): SideID | null {
    // The sim records the winner by player name, which defaults to the side id.
    const w = this.battle.winner;
    return SIDES.find((side) => this.battle[side].name === w) ?? null;
  }

  /** The side's pending request, or null if it has nothing to choose right now. */
  request(side: SideID): Protocol.Request | null {
    const r = this.sides[side].request;
    return r && r.requestType !== 'wait' && !this.ended ? r : null;
  }

  /** What the side may see when choosing; null if it has nothing to choose. */
  view(side: SideID): SideView | null {
    const request = this.request(side);
    if (!request) return null;
    const s = this.sides[side];
    return { side, request, battle: s.client, log: s.log };
  }

  /** Every choice the side has made, in order. */
  choices(side: SideID): readonly string[] {
    return this.sides[side].choices;
  }

  /**
   * Makes a choice for a side. Throws BattleError if the sim rejects it, except
   * for a choice that hidden information made unavailable (a move the foe's
   * Imprison blocks, say): the sim then sends an updated request, the side
   * chooses again, and the rejected choice stays out of the record. Returns
   * false in that case.
   */
  choose(side: SideID, choice: string): boolean {
    const s = this.sides[side];
    if (!this.request(side)) {
      throw new BattleError(`No pending request for ${side}`, {
        seed: this.input.seed,
        turn: this.turn,
        side,
        choice,
      });
    }
    s.request = null;
    s.error = null;
    s.choices.push(choice);
    const ok = this.battle.choose(side, choice);
    this.battle.sendUpdates();
    // `receive` set these during battle.choose, which TypeScript can't see.
    const error = s.error as string | null;
    if (error?.startsWith('|error|[Unavailable choice]') && s.request) {
      s.choices.pop();
      return false;
    }
    if (!ok || s.error) {
      throw new BattleError(`Invalid choice "${choice}": ${s.error ?? 'rejected'}`, {
        seed: this.input.seed,
        turn: this.turn,
        side,
        choice,
      });
    }
    if (!this.ended && this.turn > this.maxTurns) {
      this.battle.tie();
      this.battle.sendUpdates();
      this.turnCapped = true;
    }
    return true;
  }

  /** Ends the battle with `side` losing (giving up). */
  forfeit(side: SideID): void {
    if (this.ended) return;
    this.battle.forceWin(side === 'p1' ? 'p2' : 'p1');
    this.battle.sendUpdates();
  }

  /** The side's protocol lines since the last drain. */
  drain(side: SideID): string[] {
    const s = this.sides[side];
    const lines = s.log.slice(s.drained);
    s.drained = s.log.length;
    return lines;
  }

  /** Every protocol line the side has received so far (a reconnecting player's catch-up). */
  log(side: SideID): readonly string[] {
    return this.sides[side].log;
  }

  /** The side's client-side battle state (its own perspective). */
  client(side: SideID): ClientBattle {
    return this.sides[side].client;
  }

  result(): BattleResult {
    const winner = this.winner;
    return {
      winner,
      turns: this.turn,
      endReason: this.turnCapped ? 'turnCap' : winner ? 'win' : 'tie',
      choices: { p1: [...this.sides.p1.choices], p2: [...this.sides.p2.choices] },
      spectatorLog: this.spectatorLog,
    };
  }

  private receive(type: string, data: string | string[]) {
    const text = Array.isArray(data) ? data.join('\n') : data;
    if (type === 'update') {
      const channels = extractChannelMessages(text, [CHANNEL.spectator, CHANNEL.p1, CHANNEL.p2]);
      this.spectatorLog.push(...channels[CHANNEL.spectator]);
      for (const id of SIDES) {
        const s = this.sides[id];
        for (const line of channels[CHANNEL[id]]) {
          s.log.push(line);
          s.client.add(line);
        }
      }
    } else if (type === 'sideupdate') {
      const newline = text.indexOf('\n');
      const s = this.sides[text.slice(0, newline) as SideID];
      const message = text.slice(newline + 1);
      if (message.startsWith('|request|')) {
        const json = message.slice('|request|'.length) as Protocol.RequestJSON;
        s.request = Protocol.parseRequest(json);
        // Gives the client this side's own full team info (never the opponent's).
        s.client.update(s.request);
      } else if (message.startsWith('|error|')) {
        s.error = message;
      }
    }
  }
}
