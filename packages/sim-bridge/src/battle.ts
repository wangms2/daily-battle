import { BattleStreams, PRNG, RandomPlayerAI, Teams, type PRNGSeed } from '@pkmn/sim';

export interface RunBattleOptions {
  format?: string;
  /** Showdown export text for each side. */
  p1Team: string;
  p2Team: string;
  /** Battle seed, e.g. `1,2,3,4`. A fresh random seed is used if omitted. */
  seed?: PRNGSeed;
  /** Seeds for the two RandomPlayerAI policies. */
  p1Seed?: PRNGSeed;
  p2Seed?: PRNGSeed;
  /** Force a tie once this turn is reached. */
  maxTurns?: number;
}

export interface BattleResult {
  /** Winning player's name, or null for a tie. */
  winner: string | null;
  turns: number;
  /** Omniscient protocol log. */
  log: string[];
}

function packTeam(exported: string): string {
  const team = Teams.import(exported);
  if (!team) throw new Error('Could not parse team');
  return Teams.pack(team);
}

/** Runs one headless battle between two RandomPlayerAI policies. */
export async function runRandomBattle(opts: RunBattleOptions): Promise<BattleResult> {
  const { format = 'gen4ou', maxTurns = 300 } = opts;
  const streams = BattleStreams.getPlayerStreams(new BattleStreams.BattleStream());

  const p1 = new RandomPlayerAI(streams.p1, { seed: opts.p1Seed ?? null });
  const p2 = new RandomPlayerAI(streams.p2, { seed: opts.p2Seed ?? null });
  void p1.start();
  void p2.start();

  const seed = opts.seed ?? PRNG.generateSeed();
  void streams.omniscient.write(
    `>start ${JSON.stringify({ formatid: format, seed })}\n` +
      `>player p1 ${JSON.stringify({ name: 'p1', team: packTeam(opts.p1Team) })}\n` +
      `>player p2 ${JSON.stringify({ name: 'p2', team: packTeam(opts.p2Team) })}`,
  );

  const log: string[] = [];
  let turns = 0;
  let winner: string | null = null;
  for await (const chunk of streams.omniscient) {
    for (const line of chunk.split('\n')) {
      log.push(line);
      if (line.startsWith('|turn|')) {
        turns = Number(line.slice('|turn|'.length));
        if (turns >= maxTurns) void streams.omniscient.write('>forcetie');
      } else if (line.startsWith('|win|')) {
        winner = line.slice('|win|'.length);
      } else if (line.startsWith('|error|')) {
        throw new Error(`Sim error: ${line}`);
      }
    }
    if (log.some((l) => l.startsWith('|win|') || l === '|tie' || l.startsWith('|tie|'))) break;
  }
  void streams.omniscient.writeEnd();
  return { winner, turns, log };
}
