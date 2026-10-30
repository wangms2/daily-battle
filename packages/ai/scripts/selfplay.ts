// Training data for the value network (tools/net): Hard plays a mix of
// opponents on daily-format matchups, and every searched decision is written
// with the battle's outcome. One JSON line per battle, one file per shard,
// appended as each battle ends, so a run can be stopped at any time.
//   npx tsx scripts/selfplay.ts --out ../../tools/net/data/raw/run1 [--formats gen3ou,...]
//     [--n 100000] [--jobs 19] [--minutes 600] [--seed run1] [--start 2026-03-02]
import { execSync, fork } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FORMATS, setsFor, type SetEntry, type SetsFile } from '@daily-battle/data';
import {
  addDays,
  findSet,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import type { Engine } from '@daily-battle/engine-wasm';
import { deriveSeed, runBattle, type Policy } from '@daily-battle/sim-bridge';
import { aiFor, HardPolicy, type DecisionRecord } from '../src/index';
import { varyPool } from './vary';

type PokemonSet = ReturnType<typeof toPokemonSet>;

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const OUT = resolve(arg('out') ?? '../../tools/net/data/raw/run');
const FORMAT_IDS = (arg('formats') ?? Object.keys(FORMATS).join(',')).split(',');
const N = Number(arg('n') ?? 100_000);
const JOBS = Number(arg('jobs') ?? 1);
const MINUTES = Number(arg('minutes') ?? Infinity);
const SEED = arg('seed') ?? 'run1';
const START = arg('start') ?? '2026-03-02';
/** The share of matchups played with a varied set pool. */
const VARY = Number(arg('vary') ?? 0.25);
/** A worker's exit code when it hands over to a fresh process. */
const RECYCLE_EXIT = 3;

/** A side's player: Hard at some budget and variety, or Normal. */
interface Player {
  name: string;
  iterations?: number;
  worlds?: number;
  variety?: number;
  normal?: boolean;
}
const HARD: Player = { name: 'hard', iterations: 150_000, worlds: 8, variety: 0.9 };
/** The league, by share: mostly Hard mirrors, plus weaker and noisier opponents. */
const LEAGUE: { share: number; a: Player; b: Player }[] = [
  { share: 0.4, a: HARD, b: HARD },
  { share: 0.25, a: { name: 'hard-50k', iterations: 50_000, worlds: 4, variety: 0.9 }, b: HARD },
  { share: 0.2, a: { ...HARD, name: 'hard-v0.7', variety: 0.7 }, b: HARD },
  { share: 0.15, a: { name: 'normal', normal: true }, b: HARD },
];

interface Task {
  format: string;
  i: number;
  swap: boolean;
}

function poolTeam(sets: SetsFile, format: string, i: number, week: string) {
  const rng = rngFor(`selfplay:${SEED}:pool-team:${format}:${i}`);
  const species = [...generatePool(week, sets).species];
  const team: PokemonSet[] = [];
  const slots: { species: string; set: number }[] = [];
  for (let k = 0; k < 6; k++) {
    const name = species.splice(Math.floor(rng() * species.length), 1)[0]!;
    const options = sets.species[name]!.sets;
    let r = rng();
    const set = options.find((s) => (r -= s.weight) < 0) ?? options[options.length - 1]!;
    team.push(toPokemonSet(name, set));
    slots.push(slotOf(name, set, options));
  }
  return { team, slots };
}

/** A team slot as recorded: the set's pool index and contents (the set heads' targets). */
const slotOf = (species: string, set: SetEntry, options: SetEntry[]) => ({
  species,
  set: options.indexOf(set),
  moves: set.moves,
  item: set.item,
  ability: set.ability,
});

const engines = new Map<number, Engine>();
function engineFor(format: string): Engine {
  const gen = FORMATS[format as keyof typeof FORMATS].gen;
  if (!engineBuilt(gen)) throw new Error(`no engine for ${format}: run build:wasm first`);
  let e = engines.get(gen);
  if (!e) engines.set(gen, (e = loadEngine(gen)));
  return e;
}

function playTask({ format, i, swap }: Task) {
  const gen = FORMATS[format as keyof typeof FORMATS].gen;
  // Varied pools, the same for both sides of a matchup (see vary.ts).
  const varied = rngFor(`selfplay:${SEED}:vary:${format}:${i}`)() < VARY;
  const sets = varied
    ? varyPool(
        setsFor(format),
        gen,
        engineFor(format),
        rngFor(`selfplay:${SEED}:pool:${format}:${i}`),
      )
    : setsFor(format);
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const pool = generatePool(week, sets).species;
  const mine = poolTeam(sets, format, i, week);
  const opp = generateOpponent(day, sets);
  const dailySlots = opp.team.map((s) => {
    const options = sets.species[s.species]!.sets;
    return slotOf(s.species, findSet(sets, s), options);
  });
  // Deterministic league pick per matchup, the same for both sides of it.
  let r = rngFor(`selfplay:${SEED}:league:${format}:${i}`)();
  const pair = LEAGUE.find((l) => (r -= l.share) < 0) ?? LEAGUE[0]!;
  const decisions: (DecisionRecord & { side: 'p1' | 'p2' })[] = [];
  const make = (p: Player, side: 'p1' | 'p2'): Policy =>
    p.normal
      ? aiFor({ difficulty: 'normal', style: opp.style, data: sets })
      : new HardPolicy({
          engine: engineFor(format),
          data: sets,
          pool,
          iterations: p.iterations!,
          worlds: p.worlds!,
          variety: p.variety!,
          record: (d) => decisions.push({ side, ...d }),
        });
  const [p1Player, p2Player] = swap ? [pair.b, pair.a] : [pair.a, pair.b];
  const seed = `selfplay:${SEED}:${format}`;
  const result = runBattle({
    format,
    seed: deriveSeed(`${seed}:battle`, i),
    p1: { team: mine.team, policy: make(p1Player, 'p1'), seed: deriveSeed(`${seed}:p1`, i) },
    p2: {
      team: teamSets(sets, opp.team),
      policy: make(p2Player, 'p2'),
      seed: deriveSeed(`${seed}:p2`, i),
    },
  });
  return {
    format,
    gen: FORMATS[format as keyof typeof FORMATS].gen,
    i,
    swap,
    varied,
    players: { p1: p1Player.name, p2: p2Player.name },
    winner: result.winner,
    turns: result.turns,
    teams: { p1: mine.slots, p2: dailySlots },
    decisions,
  };
}

// Matchup-major, so every gen gets equal coverage however long the run lasts.
const TASKS = N * FORMAT_IDS.length * 2;
const taskAt = (k: number): Task => ({
  format: FORMAT_IDS[Math.floor(k / 2) % FORMAT_IDS.length]!,
  i: Math.floor(k / (2 * FORMAT_IDS.length)),
  swap: k % 2 === 1,
});

/** Battles per worker process before it's replaced, so memory can't creep up overnight. */
const RECYCLE = Number(arg('recycle') ?? 150);

const child = process.argv.indexOf('--child');
if (child > 0) {
  const [shard, jobs, from] = process.argv.slice(child + 1).map(Number);
  const file = join(OUT, `${SEED}-${shard}.jsonl`);
  let played = 0;
  for (let k = from!; k < TASKS; k += jobs!) {
    if (played++ >= RECYCLE) process.exit(RECYCLE_EXIT);
    let battle: ReturnType<typeof playTask>;
    try {
      battle = playTask(taskAt(k));
    } catch (err) {
      // One bad battle (an engine panic, say) is logged and skipped.
      appendFileSync(
        join(OUT, `${SEED}-errors.log`),
        `${new Date().toISOString()} task ${k} ${JSON.stringify(taskAt(k))}: ${(err as Error).stack ?? err}\n`,
      );
      process.send!({ k, decisions: 0, error: true });
      continue;
    }
    appendFileSync(file, JSON.stringify(battle) + '\n');
    process.send!({ k, decisions: battle.decisions.length });
  }
  process.exit(0);
}

mkdirSync(OUT, { recursive: true });
writeFileSync(
  join(OUT, `${SEED}-run.json`),
  JSON.stringify(
    {
      seed: SEED,
      args: process.argv.slice(2),
      commit: execSync('git rev-parse HEAD').toString().trim(),
      dirty: execSync('git status --porcelain').toString().trim().split('\n').filter(Boolean),
      startedAt: new Date().toISOString(),
    },
    null,
    1,
  ),
);
console.log(`selfplay ${SEED}: ${FORMAT_IDS.join(',')}, ${JOBS} job(s), out ${OUT}`);
const t0 = performance.now();
let battles = 0;
let positions = 0;
let errors = 0;
let restarts = 0;
const children = new Set<ReturnType<typeof fork>>();
const self = fileURLToPath(import.meta.url);
let timer: ReturnType<typeof setTimeout> | undefined;
let stopping = false;

/** Runs a shard to the end, restarting its worker after each recycle or crash. */
function runShard(shard: number): Promise<void> {
  return new Promise<void>((done) => {
    let next = shard;
    const spawn = () => {
      const p = fork(
        self,
        [...process.argv.slice(2), '--child', String(shard), String(JOBS), String(next)],
        { execArgv: process.execArgv },
      );
      children.add(p);
      p.on('message', (m) => {
        const msg = m as { k: number; decisions: number; error?: boolean };
        next = msg.k + JOBS;
        battles++;
        if (msg.error) errors++;
        positions += msg.decisions;
        if (battles % 50 === 0)
          console.log(
            `  ${battles} battles, ${positions} positions, ${errors} errors, ${restarts} restarts, ` +
              `${((performance.now() - t0) / 60000).toFixed(1)} min`,
          );
      });
      p.on('exit', (code) => {
        children.delete(p);
        if (stopping || code === 0) return done();
        // A crash mid-battle skips that battle; a recycle resumes where it left off.
        if (code !== RECYCLE_EXIT) {
          restarts++;
          appendFileSync(
            join(OUT, `${SEED}-errors.log`),
            `${new Date().toISOString()} shard ${shard} exited ${code} at task ${next}\n`,
          );
          next += JOBS;
        }
        if (next >= TASKS) return done();
        spawn();
      });
    };
    spawn();
  });
}

await Promise.race([
  Promise.all(Array.from({ length: JOBS }, (_, shard) => runShard(shard))),
  new Promise<void>((done) => {
    if (Number.isFinite(MINUTES)) timer = setTimeout(done, MINUTES * 60000);
  }),
]);
stopping = true;
clearTimeout(timer);
for (const p of children) p.kill();
console.log(
  `done: ${battles} battles (${errors} errors, ${restarts} restarts), ${positions} positions in ${((performance.now() - t0) / 60000).toFixed(1)} min`,
);
