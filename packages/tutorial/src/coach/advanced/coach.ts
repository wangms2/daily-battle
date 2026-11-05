// The advanced coach in a battle (plan: integration): this decision's tips from
// the network judge's searched worlds (net-judge.ts `searched`), in order, each
// with its words, one-time key and review texts. Normal and Hard daily battles
// only (never lessons, Easy or Master). Win conditions and preserve tips are off
// (the oracle disagreed too often); sacrifice is on.
import type { Facts } from '@daily-battle/ai';
import type { NetWorld } from '@daily-battle/engine-wasm';
import { Dex } from '@pkmn/sim';
import type { BranchWorld } from '../facts/branches';
import { preserveText, preserveTip } from './preserve';
import { readText, readTip } from './reads';
import { advancedReview, type AdvancedReview, type AdvancedTip } from './review';
import { riskText, riskTip } from './risk';
import { slowText, slowTip } from './slow';

export type AdvancedRule = 'risk' | 'hazard' | 'pacing' | 'read' | 'sacrifice';

export interface AdvancedInput {
  worlds: readonly BranchWorld[];
  legal: readonly string[];
  /** The judge's top choice. */
  top: string;
  facts: Facts;
  /** A counterfactual world's win chance (net-judge.ts `value`). */
  value: (w: NetWorld) => number;
  /**
   * Whether a choice is sound against what the foe is really doing (judge.ts
   * `soundPick`), when that's known: a veto on read tips only.
   */
  sound?: (choice: string) => boolean;
}

export interface AdvancedFind {
  rule: AdvancedRule;
  /** One-time key: a tip shows at most once a battle. */
  key: string;
  text: string;
  tip: AdvancedTip;
  review: AdvancedReview;
}

/** A move choice without its Mega Evolution ("move 1 mega" is "move 1"). */
const base = (c: string) => c.replace(/ mega$/, '');

/** This decision's advanced tips, most important first. */
export function advancedTips(input: AdvancedInput): AdvancedFind[] {
  const { worlds, legal, top, facts } = input;
  if (!worlds.length || facts.forced || !facts.me || !facts.foe) return [];
  const dex = Dex.forGen(facts.gen);
  const move = (c: string) => facts.moves.find((m) => m.choice === base(c));
  const damaging = (c: string) => !!move(c) && move(c)!.category !== 'Status';
  const id = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const species = (x: string) =>
    [...facts.state.own, ...facts.state.foe].find((m) => id(m.forme) === x || id(m.species) === x)
      ?.forme ??
    (dex.species.get(x).name || x);
  const play = (c: string) => {
    const m = move(c);
    if (m) return m.name;
    const s = facts.switches.find((x) => x.choice === c);
    return s ? `switching to ${s.species}` : c;
  };
  const names = { play, species };
  const variant = facts.state.turn;
  const me = facts.me;
  const out: AdvancedFind[] = [];
  const add = (rule: AdvancedRule, key: string, text: string, tip: AdvancedTip) =>
    out.push({ rule, key, text, tip, review: advancedReview(tip, names) });

  const accuracy = (c: string) => {
    const m = move(c);
    const a = m && dex.moves.get(m.id).accuracy;
    return a === true ? 100 : a || undefined;
  };
  const r = riskTip(worlds, legal, top, accuracy);
  if (r)
    add(
      'risk',
      `risk:${me}:${move(r.risky)?.id}`,
      riskText(play(r.safe), play(r.risky), accuracy(r.risky) ?? 100, variant),
      { concept: 'risk', ...r },
    );

  const p = preserveTip(worlds, legal, top, input.value, damaging);
  if (p?.kind === 'sacrifice')
    add(
      'sacrifice',
      `sacrifice:${p.mon}`,
      preserveText(
        p.kind,
        { mon: species(p.mon), choice: play(p.choice), contrast: play(p.contrast) },
        variant,
      ),
      { concept: 'preserve', ...p },
    );

  const rd = readTip(worlds, legal, top);
  if (rd && (!input.sound || input.sound(rd.choice)))
    add(
      'read',
      `read:${me}:${rd.foe}`,
      readText(
        rd,
        {
          choice: play(rd.choice),
          contrast: play(rd.contrast),
          foe: species(rd.foe),
          target: species(rd.target),
        },
        variant + play(rd.choice).length,
      ),
      { concept: 'reads', ...rd },
    );

  const s = slowTip(worlds, legal, top, (c) => move(c)?.id, damaging, facts.gen);
  if (s) {
    const m = move(s.choice)!;
    const targets = s.targets?.map((x) => ({ name: species(x.species), frac: x.frac }));
    add(
      s.kind,
      `${s.kind}:${m.id}`,
      slowText(
        m.id,
        {
          move: m.name,
          contrast: play(s.contrast),
          foe: facts.foe,
          ...(targets ? { targets } : {}),
        },
        variant,
      ),
      { concept: 'slow', ...s },
    );
  }
  return out;
}
