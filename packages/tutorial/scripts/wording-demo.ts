// Draft risk wording for judged warnings (docs/plan-tutorial-coach.md, step 3),
// on real positions from a coach-eval run, to review before building it.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/wording-demo.ts <coach-eval --out file> [count] [min gap] [max gap]
import { readFileSync } from 'node:fs';
import { turnFacts, type Facts } from '@daily-battle/ai';
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
import { Coach, noEffectText } from '../src/coach/simple';

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
const SETUP = new Set([
  'swordsdance',
  'dragondance',
  'calmmind',
  'bulkup',
  'curse',
  'agility',
  'spikes',
  'toxic',
  'thunderwave',
  'willowisp',
  'substitute',
  'rest',
  'recover',
  'softboiled',
  'protect',
  'roar',
  'whirlwind',
  'rapidspin',
]);

/** One plain sentence on what a choice does, for the alternative. */
function better(f: Facts, top: string): string {
  const m = f.moves.find((x) => x.choice === top);
  if (m) {
    if (m.ko >= 0.85) return `${m.name} can knock it out.`;
    if (m.category !== 'Status' && m.damage >= 0.25)
      return `${m.name} does about ${pct(m.damage)} to it.`;
    return `${m.name} is the better move here.`;
  }
  const s = f.switches.find((x) => x.choice === top);
  if (s) return `${s.species} takes ${f.foe}’s hits much better.`;
  return '';
}

/** Draft wording: name the risk of the pick, then the better choice. One idea per sentence. */
function draft(f: Facts, pick: string, top: string, reply?: string): string {
  const foe = f.foe!;
  const me = f.me!;
  const m = f.moves.find((x) => x.choice === pick);
  const s = f.switches.find((x) => x.choice === pick);
  const hit = reply && !reply.startsWith('switch') ? reply : undefined;
  if (m?.noEffect) return `${noEffectText(foe, m.name, m.noEffect)} ${better(f, top)}`;
  if (s) {
    const move = hit ?? s.taken.move;
    if (s.taken.ko >= 0.5)
      return `Risky: if ${foe} uses ${move}, ${s.species} is knocked out as it comes in. ${better(f, top)}`;
    if (s.taken.frac + s.entry >= 0.35)
      return `Risky: ${s.species} takes a big hit coming in, about ${pct(s.taken.frac + s.entry)} from ${move}. ${better(f, top)}`;
    if (s.best < 0.2) return `${s.species} can’t hurt ${foe} much. ${better(f, top)}`;
    return `${better(f, top)}`;
  }
  if (m) {
    const threat = f.threat;
    const topSwitch = f.switches.find((x) => x.choice === top);
    if (topSwitch && threat && threat.ko >= 0.5)
      return `Risky: if ${foe} attacks, ${me} is knocked out. ${topSwitch.species} takes the hit safely.`;
    if (topSwitch && threat && threat.frac >= 0.35)
      return `Risky: ${foe} can hit ${me} for about ${pct(threat.frac)}. ${topSwitch.species} takes much less.`;
    if (SETUP.has(m.id) && threat && threat.frac >= 0.3)
      return `No time for ${m.name}: ${foe} can hit ${me} for about ${pct(threat.frac)} this turn. ${better(f, top)}`;
    const t = f.moves.find((x) => x.choice === top);
    if (t && t.category !== 'Status' && m.category !== 'Status' && t.damage > m.damage + 0.1)
      return `${t.name} does about ${pct(t.damage)} to ${foe}. ${m.name} does about ${pct(m.damage)}.`;
    return better(f, top);
  }
  return better(f, top);
}

const file = process.argv[2]!;
const count = Number(process.argv[3] ?? 12);
const MIN = Number(process.argv[4] ?? 0.1);
const MAX = Number(process.argv[5] ?? Infinity);
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
}
const cases = (JSON.parse(readFileSync(file, 'utf8')).results as Judged[])
  .filter((c) => c.gap >= MIN && c.gap < MAX && c.agree >= 0.9 && c.b < 0.85)
  // A spread: a few of each kind of pick, best-supported first.
  .sort((a, b) => b.gap - a.gap);
const engine = loadEngine(3);
let shown = 0;
const kinds: Record<string, number> = {};
for (const c of cases) {
  if (shown >= count) break;
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
  const kind = `${c.warned.split(' ')[0]}->${c.alt.split(' ')[0]}`;
  if ((kinds[kind] ?? 0) >= 4) continue;
  kinds[kind] = (kinds[kind] ?? 0) + 1;
  const judge = new Judge(engine, data, { pool: m.pool });
  judge.begin(view, `demo:${c.battle}:${c.turn}`);
  const v = judge.settle(c.warned, Infinity);
  const reply = judge.replies(c.warned)[0];
  const rule = new Coach(data).turn(view).warnings[c.warned];
  const name = (ch: string) =>
    ch.startsWith('move')
      ? facts.moves.find((x) => x.choice === ch)?.name
      : `switch to ${facts.switches.find((x) => x.choice === ch)?.species}`;
  shown++;
  console.log(
    `\n${shown}. ${facts.me} ${pct(facts.state.ownActive?.hpFrac ?? 0)} vs ${facts.foe} ${pct(facts.state.foeActive?.hpFrac ?? 0)}: ` +
      `picked ${name(c.warned)}, judge prefers ${name(c.alt)} (gap ${c.gap.toFixed(2)}; in rollouts ${pct(c.a)} vs ${pct(c.b)})`,
  );
  console.log(
    `   foe's likely reply to the pick: ${reply ? `${reply.reply} (${pct(reply.share)})` : '?'}`,
  );
  console.log(`   today's rule text: ${rule ? `"${rule.text}"` : '(none: no warning today)'}`);
  console.log(`   draft:             "${draft(facts, c.warned, v?.top ?? c.alt, reply?.reply)}"`);
}
