// One simulated battle: a player bot on a pool team (p1) against the opponent
// AI on a daily opponent (p2). Plain data, so jobs can be sent to workers.
import { aiForStyle, midBot, NaivePolicy, strongBot, type KnownSets } from '@daily-battle/ai';
import { setsFor, type SetsFile } from '@daily-battle/data';
import type { Style } from '@daily-battle/gen';
import { deriveSeed, runBattle, type Policy } from '@daily-battle/sim-bridge';
import type { PokemonSet } from '@pkmn/sim';
import { PIPELINE } from './config';

export type Bot = 'mid' | 'informed' | 'naive' | 'strong';

export interface Job {
  /** The sim format, e.g. `gen4ou`; the AI and bots use that format's set data. */
  format: string;
  bot: Bot;
  player: PokemonSet[];
  opponent: PokemonSet[];
  style: Style;
  /** The opponent's real sets, for the informed bot. */
  known?: KnownSets;
  seed: string;
  index: number;
}

export interface JobResult {
  /** From the player's side. */
  outcome: 'win' | 'loss' | 'tie';
  turns: number;
  turnCap: boolean;
  /** Crits and misses landed by each side (luck metric, report only). */
  playerCrits: number;
  opponentCrits: number;
  playerMisses: number;
  opponentMisses: number;
}

function playerPolicy(job: Job, data: SetsFile): Policy {
  switch (job.bot) {
    case 'mid':
      return midBot({ data });
    case 'informed':
      return midBot({ data, knownSets: job.known });
    case 'naive':
      return new NaivePolicy(data);
    case 'strong':
      return strongBot({ data });
  }
}

export function runJob(job: Job): JobResult {
  const data = setsFor(job.format);
  const result = runBattle({
    format: job.format,
    seed: deriveSeed(`${job.seed}:battle`, job.index),
    maxTurns: PIPELINE.maxTurns,
    p1: {
      team: job.player,
      policy: playerPolicy(job, data),
      seed: deriveSeed(`${job.seed}:p1`, job.index),
    },
    p2: {
      team: job.opponent,
      policy: aiForStyle(job.style, { data }),
      seed: deriveSeed(`${job.seed}:p2`, job.index),
    },
  });
  const count = (prefix: string) => result.spectatorLog.filter((l) => l.startsWith(prefix)).length;
  return {
    outcome: result.winner === 'p1' ? 'win' : result.winner === 'p2' ? 'loss' : 'tie',
    turns: result.turns,
    turnCap: result.endReason === 'turnCap',
    // `|-crit|p2a: X` is a crit landed on p2, i.e. by the player.
    playerCrits: count('|-crit|p2'),
    opponentCrits: count('|-crit|p1'),
    // `|-miss|p1a: X|...` is a miss by p1.
    playerMisses: count('|-miss|p1'),
    opponentMisses: count('|-miss|p2'),
  };
}
