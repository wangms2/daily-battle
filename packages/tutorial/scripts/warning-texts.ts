// The coach's warning texts (docs/plan-tutorial-coach.md, step 3) on real
// judged decisions from coach-eval runs: which judged mistakes get a warning
// (a true, relevant reason), what it says, and how following it did in the
// eval's rollouts.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/warning-texts.ts <coach-eval --out file>... [--examples 4]
import { readFileSync } from 'node:fs';
import { turnFacts } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import { loadEngine } from '@daily-battle/engine-wasm/node';
import {
  addDays,
  generateOpponent,
  generatePool,
  rngFor,
  teamSets,
  toPokemonSet,
} from '@daily-battle/gen';
import { BattleSession, deriveSeed } from '@daily-battle/sim-bridge';
import { Judge } from '../src/coach/judge';
import { explainWarning, type WarningReason } from '../src/coach/explain';

const data = setsFor('gen3ou');
const START = '2026-01-05';
type PokemonSet = ReturnType<typeof toPokemonSet>;

// The same matchups as coach-eval.
function poolTeam(i: number, week: string): PokemonSet[] {
  const rng = rngFor(`coach-eval:pool-team:${i}`);
  const species = [...generatePool(week, data).species];
  const team: PokemonSet[] = [];
  for (let k = 0; k < 6; k++) {
    const name = species.splice(Math.floor(rng() * species.length), 1)[0]!;
    const options = data.species[name]!.sets;
    let r = rng();
    const set = options.find((s) => (r -= s.weight) < 0) ?? options[options.length - 1]!;
    team.push(toPokemonSet(name, set));
  }
  return team;
}
function matchup(i: number) {
  const week = addDays(START, 7 * Math.floor(i / 7));
  const day = addDays(week, i % 7);
  const opp = generateOpponent(day, data);
  return {
    seed: deriveSeed('coach-eval:battle', i),
    p1: { team: poolTeam(i, week) },
    p2: { team: teamSets(data, opp.team) },
    pool: generatePool(week, data).species,
  };
}

const pct = (x: number) => `${Math.round(Math.min(1, x) * 100)}%`;
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const EXAMPLES = Number(arg('examples') ?? 4);
const files = process.argv
  .slice(2)
  .filter((a, i, all) => !a.startsWith('--') && !all[i - 1]?.startsWith('--'));

/** The fields of a coach-eval judge-mode result this uses. */
interface Judged {
  battle: number;
  turn: number;
  p1: string[];
  p2: string[];
  warned: string;
  alt: string;
  gap: number;
  agree: number;
  a: number;
  b: number;
  se: number;
}
interface Row {
  file: string;
  reason?: WarningReason;
  text?: string;
  position: string;
  gain: number;
  worse: boolean;
}

const engine = loadEngine(3);
const rows: Row[] = [];
for (const file of files) {
  const cases = (JSON.parse(readFileSync(file, 'utf8')).results as Judged[]).filter(
    (c) => c.gap >= 0.1 && c.agree >= 0.9,
  );
  for (const c of cases) {
    const m = matchup(c.battle);
    const session = new BattleSession({ format: 'gen3ou', ...m });
    const next: Record<string, number> = { p1: 0, p2: 0 };
    for (;;) {
      if (session.view('p1') && next.p1! >= c.p1.length) break;
      for (const side of ['p1', 'p2'] as const) {
        if (!session.view(side)) continue;
        if (next[side]! >= c[side].length) break;
        session.choose(side, c[side][next[side]!++]!);
      }
    }
    const view = session.view('p1')!;
    const facts = turnFacts(view, data);
    // The same key as coach-eval, so the same verdict.
    const judge = new Judge(engine, data, { pool: m.pool });
    judge.begin(view, `eval:${c.battle}:${c.turn}`);
    const v = judge.settle(c.warned, Infinity);
    const e = v && explainWarning(view, facts, v);
    const name = (ch: string) =>
      ch.startsWith('move')
        ? facts.moves.find((x) => x.choice === ch)?.name
        : `switch to ${facts.switches.find((x) => x.choice === ch)?.species}`;
    rows.push({
      file,
      ...(e ? { reason: e.reason, text: e.text } : {}),
      position:
        `${facts.me} ${pct(facts.state.ownActive?.hpFrac ?? 0)} vs ${facts.foe} ${pct(facts.state.foeActive?.hpFrac ?? 0)}: ` +
        `picked ${name(c.warned)}, judge prefers ${name(v?.top ?? c.alt)}; rollouts ${pct(c.b)} -> ${pct(c.a)}`,
      gain: c.a - c.b,
      worse: c.a - c.b < -2 * c.se,
    });
  }
}

const summary = (rs: Row[]) => {
  if (!rs.length) return 'n 0';
  const g = rs.reduce((s, r) => s + r.gain, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((s, r) => s + (r.gain - g) ** 2, 0) / Math.max(1, rs.length - 1));
  return `n ${rs.length}, gain ${(100 * g).toFixed(1)} (±${((196 * sd) / Math.sqrt(rs.length)).toFixed(1)}), clearly worse ${rs.filter((r) => r.worse).length}`;
};
console.log(`${rows.length} judged warnings (gap >= 0.1, ahead in >= 90% of worlds)`);
console.log(`  explained (shown):  ${summary(rows.filter((r) => r.reason))}`);
console.log(`  quiet (no reason):  ${summary(rows.filter((r) => !r.reason))}`);
const reasons = [...new Set(rows.map((r) => r.reason).filter(Boolean))] as WarningReason[];
for (const reason of reasons) {
  const rs = rows.filter((r) => r.reason === reason);
  console.log(`\n${reason}: ${summary(rs)}`);
  for (const r of rs.slice(0, EXAMPLES)) console.log(`  - ${r.position}\n    "${r.text}"`);
}
console.log('\nquiet, examples:');
for (const r of rows.filter((r) => !r.reason).slice(0, EXAMPLES * 2))
  console.log(`  - ${r.position}`);
