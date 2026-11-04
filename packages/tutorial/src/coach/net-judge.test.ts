import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MASTER_NET_PATH } from '@daily-battle/ai/version';
import { setsFor } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../battle';
import type { Position } from '../types';
import { replyKey } from './judge';
import { NetJudge } from './net-judge';

const NET = join(fileURLToPath(import.meta.url), '../../../../../apps/web/public', MASTER_NET_PATH);
const data = setsFor('gen3ou');
const SWAMPERT = { species: 'Swampert', moves: ['Surf', 'Earthquake', 'Ice Beam', 'Protect'] };
const SKARMORY = { species: 'Skarmory', setId: 'skarmory-standard' };
const MENCE = { species: 'Salamence', setId: 'salamence-dragon-dance' };
/** Ice Beam knocks Salamence out; nothing else comes close. */
const ICE_BEAM = { p1: [SWAMPERT, SKARMORY], p2: [MENCE] };
/** Zapdos has several sets, so the judge samples several worlds. */
const zapdos = (setId: string) => ({
  p1: [{ species: 'Swampert', setId: 'swampert-standard-defensive' }, SKARMORY],
  p2: [
    { species: 'Zapdos', setId },
    { species: 'Tyranitar', setId: 'tyranitar-choice-band' },
  ],
});
const viewOf = (pos: Omit<Position, 'seed'>) =>
  startPosition('gen3ou', { ...pos, seed: 'net-judge' }).view('p1')!;

let bytes: Uint8Array | undefined;
const netEngine = () => {
  const engine = loadEngine(3);
  engine.netLoad((bytes ??= new Uint8Array(readFileSync(NET))));
  return engine;
};

describe.skipIf(!engineBuilt(3))('NetJudge', () => {
  const judge = (pos: Omit<Position, 'seed'>, key = 'k') => {
    const j = new NetJudge(netEngine(), data);
    j.begin(viewOf(pos), key);
    return j;
  };

  it('finds a move that misses the knockout clearly worse', () => {
    const j = judge(ICE_BEAM);
    const v = j.settle('move 2', Infinity);
    expect(v).toMatchObject({ top: 'move 3', worse: true, agree: 1 });
    expect(v!.topValue - v!.value).toBeCloseTo(v!.gap);
    expect(j.verdict('switch 2')).toMatchObject({ worse: true });
  });

  it('stays quiet when nothing helps: a lost one-on-one', () => {
    const j = judge({
      p1: [{ ...SWAMPERT, moves: ['Surf', 'Earthquake', 'Protect', 'Toxic'] }],
      p2: [MENCE],
    });
    for (const c of ['move 1', 'move 2', 'move 3', 'move 4'])
      expect(j.settle(c, Infinity)).toMatchObject({ worse: false });
  });

  it('never calls its own top choice worse', () => {
    const j = judge(zapdos('zapdos-standard-offensive'));
    const any = j.settle('move 1', Infinity)!;
    expect(j.verdict(any.top)).toMatchObject({ worse: false, gap: 0, choice: any.top });
  });

  it('gives the same verdicts for the same key', () => {
    const verdicts = (key: string) => {
      const j = judge(zapdos('zapdos-standard-offensive'), key);
      return ['move 1', 'move 2', 'switch 2'].map((c) => j.settle(c, Infinity));
    };
    expect(verdicts('same')).toEqual(verdicts('same'));
  });

  it('works a world at a time, and has nothing to say before it has searched', () => {
    const j = judge(zapdos('zapdos-standard-offensive'));
    expect(j.verdict('move 2')).toBeUndefined();
    expect(j.settle('move 2', 0)).toBeUndefined();
    let steps = 1;
    while (j.step()) steps++;
    expect(steps).toBeGreaterThan(1);
    expect(j.busy).toBe(false);
    expect(j.verdict('move 2')).toBeDefined();
  });

  it('never sees the foe’s hidden set', () => {
    const verdicts = (setId: string) => {
      const j = judge(zapdos(setId));
      while (j.step());
      return ['move 1', 'move 2', 'move 3', 'move 4', 'switch 2'].map((c) => j.verdict(c));
    };
    expect(verdicts('zapdos-rest')).toEqual(verdicts('zapdos-standard-offensive'));
  });

  it('scores every choice against the foe’s replies, from the same search', () => {
    const j = judge(ICE_BEAM);
    expect(j.against({ likely: {} })).toBeUndefined();
    while (j.step());
    const quake = replyKey('move', 'Earthquake');
    const dd = replyKey('move', 'Dragon Dance');
    const read = j.against({ likely: { [dd]: 0.5, [quake]: 0.5 }, actual: dd })!;
    expect(Object.keys(read).sort()).toEqual(['move 1', 'move 2', 'move 3', 'move 4', 'switch 2']);
    for (const r of Object.values(read)) {
      expect(r.expected).toBeGreaterThanOrEqual(0);
      expect(r.expected).toBeLessThanOrEqual(1);
      expect(r.actual).toBeDefined();
    }
    // A read of Dragon Dance alone values each choice against Dragon Dance.
    const ddOnly = j.against({ likely: { [dd]: 1 } })!;
    expect(ddOnly['move 1']!.expected).toBeCloseTo(read['move 1']!.actual!);
  });

  it('gives the same verdicts with worlds searched elsewhere, given back in any order', () => {
    const choices = ['move 1', 'move 2', 'move 3', 'move 4', 'switch 2'];
    const here = judge(zapdos('zapdos-standard-offensive'));
    while (here.step());
    const j = judge(zapdos('zapdos-standard-offensive'));
    const helper = netEngine();
    const claims = [];
    for (let c = j.claim(); c; c = j.claim()) claims.push(c);
    expect(claims.length).toBeGreaterThan(1);
    // Everything's out: nothing to search here, but not ready either.
    expect(j.step()).toBe(false);
    expect(j.busy).toBe(true);
    expect(j.verdict('move 1')).toBeUndefined();
    // One never comes back: settle searches it here.
    const [lost, ...rest] = claims;
    for (const c of rest.reverse()) c.give(helper.netSearch(c.net.params, [c.net.world])[0]!);
    expect(j.busy).toBe(true);
    expect(j.settle('move 1', Infinity)).toEqual(here.verdict('move 1'));
    expect(choices.map((c) => j.verdict(c))).toEqual(choices.map((c) => here.verdict(c)));
    // A late answer, for a world searched here since, changes nothing.
    lost!.give(helper.netSearch(rest[0]!.net.params, [rest[0]!.net.world])[0]!);
    expect(choices.map((c) => j.verdict(c))).toEqual(choices.map((c) => here.verdict(c)));
  });
});

describe('NetJudge without a working engine', () => {
  it('stays quiet', () => {
    const down = () => {
      throw new Error('engine down');
    };
    const broken = {
      netForward: down,
      netSearch: down,
      options: down,
      encode: down,
    } as unknown as Engine;
    const j = new NetJudge(broken, data);
    j.begin(viewOf(ICE_BEAM), 'k');
    expect(j.settle('move 2', Infinity)).toBeUndefined();
    expect(j.busy).toBe(false);
  });
});
