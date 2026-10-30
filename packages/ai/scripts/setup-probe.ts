// Diagnoses how Hard handles a foe setting up: a player that uses a boosting
// move whenever it can (otherwise plays like the strong bot) plays Hard, and
// every Hard decision facing a boosted foe is logged with the search's view.
//   tsx scripts/setup-probe.ts [--format gen4ou] [--n 40] [--out probe.json]
import { writeFileSync } from 'node:fs';
import { setsFor } from '@daily-battle/data';
import {
  addDays,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import {
  deriveSeed,
  makeRng,
  runBattle,
  type Policy,
  type SideView,
} from '@daily-battle/sim-bridge';
import { HardPolicy, searchWorlds, strongBot, toChoice } from '../src/index';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const FORMAT = arg('format') ?? 'gen4ou';
const N = Number(arg('n') ?? 40);
const sets = setsFor(FORMAT);
const engine = loadEngine(Number(FORMAT[3]));
/** `--boost 1` (upstream), `--boost 2,linear` or `--boost 2,linear,foe`: Hard's boost weights (default: DEFAULT_BOOST_EVAL). */
if (arg('boost')) {
  const [scale, ...flags] = arg('boost')!.split(',');
  engine.setBoostEval(Number(scale), flags.includes('linear'), flags.includes('foe'));
}
const SETUP = new Set([
  'swordsdance',
  'dragondance',
  'nastyplot',
  'calmmind',
  'bulkup',
  'agility',
  'rockpolish',
  'curse',
  'tailglow',
  'quiverdance',
  'shellsmash',
  'shiftgear',
  'coil',
  'growth',
  'workup',
  'honeclaws',
]);
type PokemonSet = ReturnType<typeof toPokemonSet>;

function poolTeam(i: number, week: string): PokemonSet[] {
  const rng = rngFor(`probe:${FORMAT}:${i}`);
  const species = [...generatePool(week, sets).species];
  // Setup sweepers first, so most battles have one.
  const team: PokemonSet[] = [];
  const isSetup = (s: string) =>
    sets.species[s]!.sets.some((x) => x.moves.some((m) => SETUP.has(id(m))));
  const setupers = species.filter(isSetup);
  const picks: string[] = [];
  for (let k = 0; k < 2 && setupers.length; k++)
    picks.push(setupers.splice(Math.floor(rng() * setupers.length), 1)[0]!);
  const rest = species.filter((s) => !picks.includes(s));
  while (picks.length < 6) picks.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]!);
  for (const name of picks) {
    const opts = sets.species[name]!.sets;
    const set =
      opts.find((x) => x.moves.some((m) => SETUP.has(id(m)))) ??
      opts[Math.floor(rng() * opts.length)]!;
    team.push(toPokemonSet(name, set));
  }
  return team;
}
const id = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const boostOf = (b: Record<string, number | undefined>) =>
  Math.max(b.atk ?? 0, b.spa ?? 0) + Math.max(0, b.spe ?? 0) / 2;

/** Boosts whenever it can (below +6), else the strong bot. */
function setupPlayer(): Policy {
  const strong = strongBot({ data: sets });
  return {
    choose(view, rng) {
      const r = view.request;
      if (r.requestType === 'move') {
        const me = view.battle[view.side].active[0];
        const moves = r.active[0]!.moves as Move[];
        const k = moves.findIndex(
          (m) => !m.disabled && SETUP.has(id(m.move ?? m.id)) && (m.pp ?? 0) > 0,
        );
        const b = me?.boosts ?? {};
        if (k >= 0 && Math.max(b.atk ?? 0, b.spa ?? 0, b.spe ?? 0) < 6) return `move ${k + 1}`;
      }
      return strong.choose(view, rng);
    },
  };
}

/** A request's move slot (a Recharge slot has only a name and id). */
type Move = { move?: string; id: string; pp?: number; disabled?: boolean };

interface Row {
  battle: number;
  turn: number;
  foe: string;
  foeBoosts: Record<string, number>;
  foeHp: number;
  me: string;
  myHp: number;
  moves: string[];
  choice: string;
  options: { c: string; share: number; value: number }[];
}
const rows: Row[] = [];
const peaks: { battle: number; peak: number; won: boolean; turns: number }[] = [];

for (let i = 0; i < N; i++) {
  const week = addDays('2026-03-02', 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const pool = generatePool(week, sets).species;
  const hard = new HardPolicy({ engine, data: sets, pool });
  let peak = 0;
  const logged: Policy = {
    choose(view: SideView, rng) {
      const choice = hard.choose(view, rng);
      const foeSide = view.battle[view.side === 'p1' ? 'p2' : 'p1'];
      const foe = foeSide.active[0];
      const b = boostOf(foe?.boosts ?? {});
      peak = Math.max(peak, b);
      if (b >= 2 && view.request.requestType === 'move') {
        const res = searchWorlds(engine, view, sets, makeRng(deriveSeed('probe', rows.length)), {
          pool,
        });
        const agg: Record<string, { share: number; value: number }> = {};
        for (const { weight, result } of res)
          for (const o of result.s1) {
            const c = toChoice(o.c, view.request) ?? o.c;
            const a = (agg[c] ??= { share: 0, value: 0 });
            if (result.n) a.share += (weight * o.v) / result.n;
            if (o.v) a.value += (weight * o.s) / o.v;
          }
        const me = view.battle[view.side].active[0];
        rows.push({
          battle: i,
          turn: view.battle.turn,
          foe: foe!.speciesForme,
          foeBoosts: { ...(foe!.boosts as Record<string, number>) },
          foeHp: foe!.hp / foe!.maxhp,
          me: me?.speciesForme ?? '?',
          myHp: me ? me.hp / me.maxhp : 0,
          moves: (view.request.active[0]!.moves as Move[]).map((m) => m.move ?? m.id),
          choice,
          options: Object.entries(agg)
            .map(([c, a]) => ({ c, share: +a.share.toFixed(3), value: +a.value.toFixed(3) }))
            .sort((x, y) => y.share - x.share),
        });
      }
      return choice;
    },
  };
  const result = runBattle({
    format: FORMAT,
    seed: deriveSeed('probe:battle', i),
    p1: { team: poolTeam(i, week), policy: setupPlayer(), seed: deriveSeed('probe:p1', i) },
    p2: {
      team: teamSets(sets, generateOpponent(day, sets).team),
      policy: logged,
      seed: deriveSeed('probe:p2', i),
    },
  });
  peaks.push({ battle: i, peak, won: result.winner === 'p2', turns: result.turns });
  process.stdout.write(`${i}:${peak}${result.winner === 'p2' ? 'W' : 'L'} `);
}
console.log();
const hist = (lo: number) => peaks.filter((p) => p.peak >= lo);
console.log(`${FORMAT}: Hard won ${peaks.filter((p) => p.won).length}/${N} vs the setup player`);
for (const lo of [2, 4, 6])
  console.log(
    `  foe reached >= +${lo}: ${hist(lo).length} battles, Hard won ${hist(lo).filter((p) => p.won).length}`,
  );
writeFileSync(arg('out') ?? `probe-${FORMAT}.json`, JSON.stringify({ peaks, rows }, null, 1));
