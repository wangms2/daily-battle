import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Protocol } from '@pkmn/protocol';
import { Battle, Dex, extractChannelMessages, type PRNGSeed } from '@pkmn/sim';
import { makeRng, type Rng } from './rng';
import type { BattleResult, Policy, ReplayInput, RunBattleInput, SideID, SideView } from './types';

const gens = new Generations(Dex as unknown as ConstructorParameters<typeof Generations>[0]);
const SIDES: SideID[] = ['p1', 'p2'];
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
  id: SideID;
  client: ClientBattle;
  log: string[];
  request: Protocol.Request | null;
  error: string | null;
  choices: string[];
}

type Chooser = (side: SideState, view: SideView) => string;

/** Runs a battle to the end, asking each side's policy for its choices. */
export function runBattle(input: RunBattleInput): BattleResult {
  const policies: Record<SideID, Policy> = { p1: input.p1.policy, p2: input.p2.policy };
  const rngs: Record<SideID, Rng> = { p1: makeRng(input.p1.seed), p2: makeRng(input.p2.seed) };
  return drive(input, (side, view) => policies[side.id].choose(view, rngs[side.id]));
}

/**
 * Re-runs a battle from its seed, teams, and recorded choices. With the same
 * inputs it reproduces the same battle, which is how resume works (DESIGN.md §7).
 */
export function replayBattle(
  input: ReplayInput,
  choices: Record<SideID, readonly string[]>,
): BattleResult {
  const next: Record<SideID, number> = { p1: 0, p2: 0 };
  return drive(input, (side) => {
    const choice = choices[side.id][next[side.id]++];
    if (choice === undefined) {
      throw new BattleError('Ran out of recorded choices', {
        seed: input.seed,
        turn: -1,
        side: side.id,
      });
    }
    return choice;
  });
}

function drive(input: ReplayInput, chooser: Chooser): BattleResult {
  const { format = 'gen4ou', seed, maxTurns = 300 } = input;
  const sides: Record<SideID, SideState> = { p1: newSide('p1'), p2: newSide('p2') };
  const spectatorLog: string[] = [];

  const send = (type: string, data: string | string[]) => {
    const text = Array.isArray(data) ? data.join('\n') : data;
    if (type === 'update') {
      const channels = extractChannelMessages(text, [CHANNEL.spectator, CHANNEL.p1, CHANNEL.p2]);
      spectatorLog.push(...channels[CHANNEL.spectator]);
      for (const id of SIDES) receive(sides[id], channels[CHANNEL[id]]);
    } else if (type === 'sideupdate') {
      const newline = text.indexOf('\n');
      const side = sides[text.slice(0, newline) as SideID];
      const message = text.slice(newline + 1);
      if (message.startsWith('|request|')) {
        const json = message.slice('|request|'.length) as Protocol.RequestJSON;
        side.request = Protocol.parseRequest(json);
        // Gives the client this side's own full team info (never the opponent's).
        side.client.update(side.request);
      } else if (message.startsWith('|error|')) {
        side.error = message;
      }
    }
  };

  const battle = new Battle({ formatid: format as never, seed, send });
  battle.setPlayer('p1', { name: 'p1', team: input.p1.team });
  battle.setPlayer('p2', { name: 'p2', team: input.p2.team });
  battle.sendUpdates();

  let turnCapped = false;
  while (!battle.ended) {
    if (battle.turn > maxTurns) {
      battle.tie();
      battle.sendUpdates();
      turnCapped = true;
      break;
    }
    let acted = false;
    for (const id of SIDES) {
      const side = sides[id];
      const request = side.request;
      if (!request || request.requestType === 'wait') continue;
      side.request = null;
      side.error = null;
      const choice = chooser(side, { side: id, request, battle: side.client, log: side.log });
      side.choices.push(choice);
      const ok = battle.choose(id, choice);
      battle.sendUpdates();
      if (!ok || side.error) {
        throw new BattleError(`Invalid choice "${choice}": ${side.error ?? 'rejected'}`, {
          seed,
          turn: battle.turn,
          side: id,
          choice,
        });
      }
      acted = true;
      if (battle.ended) break;
    }
    if (!acted && !battle.ended) {
      throw new BattleError('Battle stalled: no side has a pending request', {
        seed,
        turn: battle.turn,
      });
    }
  }

  const winner = battle.winner === 'p1' || battle.winner === 'p2' ? battle.winner : null;
  return {
    winner,
    turns: battle.turn,
    endReason: turnCapped ? 'turnCap' : winner ? 'win' : 'tie',
    choices: { p1: sides.p1.choices, p2: sides.p2.choices },
    spectatorLog,
  };
}

function newSide(id: SideID): SideState {
  return { id, client: new ClientBattle(gens), log: [], request: null, error: null, choices: [] };
}

function receive(side: SideState, lines: string[]) {
  for (const line of lines) {
    side.log.push(line);
    side.client.add(line);
  }
}
