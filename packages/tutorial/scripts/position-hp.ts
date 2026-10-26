// For writing lesson positions (docs/plan-tutorial-coach.md, step 4b): a
// position at given HP, and what each of your moves leads to this turn.
//   pnpm --filter @daily-battle/tutorial exec tsx scripts/position-hp.ts <your Mon json> <foe Mon json> <foe step> <your HP %> <foe HP %>
import { resolveStep } from '@daily-battle/sim-bridge';
import { startPosition } from '../src';
import type { Mon } from '../src/types';
const [p1, p2, foeMove, me, them] = [
  JSON.parse(process.argv[2]!) as Mon,
  JSON.parse(process.argv[3]!) as Mon,
  process.argv[4]!,
  Number(process.argv[5]),
  Number(process.argv[6]),
];
const hp = (s: ReturnType<typeof startPosition>, i: number) => {
  const p = (
    s as unknown as {
      battle: { sides: { active: { hp: number; maxhp: number; fainted: boolean }[] }[] };
    }
  ).battle.sides[i]!.active[0];
  return p && !p.fainted ? Math.round((100 * p.hp) / p.maxhp) : 0;
};
for (const m of (p1 as { moves: string[] }).moves) {
  const pos = { p1: [p1], p2: [p2], seed: 'hp', hp: { p1: [me], p2: [them] } };
  const s = startPosition('gen3ou', pos);
  s.choose('p1', resolveStep(`move ${m}`, s.request('p1')!)!);
  s.choose('p2', resolveStep(foeMove, s.request('p2')!)!);
  console.log(m.padEnd(14), 'you', hp(s, 0), 'foe', hp(s, 1), s.ended ? `ended ${s.winner}` : '');
}
