import { setsFor } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import { engineBuilt, loadEngine } from '@daily-battle/engine-wasm/node';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../battle';
import type { Position } from '../types';
import { Judge } from './judge';

const data = setsFor('gen3ou');
const SWAMPERT = { species: 'Swampert', moves: ['Surf', 'Earthquake', 'Protect', 'Toxic'] };
const MENCE = { species: 'Salamence', setId: 'salamence-dragon-dance' };
const viewOf = (pos: Omit<Position, 'seed'>) =>
  startPosition('gen3ou', { ...pos, seed: 'judge' }).view('p1')!;

describe.skipIf(!engineBuilt(3))('Judge', () => {
  const judged = (pos: Omit<Position, 'seed'>, choice: string, key = 'k') => {
    const judge = new Judge(loadEngine(3), data);
    judge.begin(viewOf(pos), key);
    return judge.settle(choice, Infinity);
  };

  it('finds a move that does nothing worse in every world', () => {
    // Earthquake into Zapdos, when Ice Beam hits it super effectively.
    const v = judged(
      {
        p1: [
          { species: 'Swampert', setId: 'swampert-standard-defensive' },
          { species: 'Skarmory', setId: 'skarmory-standard' },
        ],
        p2: [
          { species: 'Zapdos', setId: 'zapdos-standard-offensive' },
          { species: 'Tyranitar', setId: 'tyranitar-choice-band' },
        ],
      },
      'move 1',
    );
    expect(v).toMatchObject({ top: 'move 2', agree: 1 });
    expect(v!.gap).toBeGreaterThan(0);
  });

  it('stays quiet when nothing helps: a lost one-on-one', () => {
    // Earthquake does nothing to Salamence, but Swampert loses to it either way.
    expect(judged({ p1: [SWAMPERT], p2: [MENCE] }, 'move 2')).toMatchObject({ worse: false });
  });

  it('finds a switch into a knockout clearly worse', () => {
    const v = judged(
      { p1: [SWAMPERT, { species: 'Heracross', setId: 'heracross-standard' }], p2: [MENCE] },
      'switch 2',
    );
    expect(v).toMatchObject({ worse: true });
    expect(v!.topValue - v!.value).toBeCloseTo(v!.gap);
  });

  it('names the foe’s likely replies to a pick, from its possible sets', () => {
    const judge = new Judge(loadEngine(3), data);
    judge.begin(
      viewOf({
        p1: [SWAMPERT, { species: 'Heracross', setId: 'heracross-standard' }],
        p2: [MENCE],
      }),
      'k',
    );
    judge.settle('switch 2', Infinity);
    const replies = judge.replies('switch 2');
    const moves = new Set(data.species.Salamence!.sets.flatMap((s) => s.moves));
    expect(replies.length).toBeGreaterThan(0);
    expect(moves.has(replies[0]!.reply)).toBe(true);
    expect(replies[0]!.share).toBeGreaterThan(replies.at(-1)!.share - 1e-9);
  });

  it('never calls its own top choice worse', () => {
    const judge = new Judge(loadEngine(3), data);
    judge.begin(viewOf({ p1: [SWAMPERT], p2: [MENCE] }), 'k');
    const any = judge.settle('move 1', Infinity)!;
    expect(judge.verdict(any.top)).toMatchObject({ worse: false, choice: any.top });
  });

  it('gives the same verdict for the same key', () => {
    const pos = { p1: [SWAMPERT], p2: [MENCE] };
    expect(judged(pos, 'move 3', 'same')).toEqual(judged(pos, 'move 3', 'same'));
  });

  it('works a slice at a time, and has nothing to say before it has searched', () => {
    const judge = new Judge(loadEngine(3), data, { iterations: 4000 });
    judge.begin(viewOf({ p1: [SWAMPERT], p2: [MENCE] }), 'k');
    expect(judge.verdict('move 2')).toBeUndefined();
    expect(judge.settle('move 2', 0)).toBeUndefined();
    let steps = 0;
    while (judge.step()) steps++;
    expect(steps).toBeGreaterThan(1);
    expect(judge.busy).toBe(false);
    expect(judge.verdict('move 2')).toBeDefined();
  });

  it('never sees the foe’s hidden set', () => {
    const verdicts = (setId: string) => {
      const judge = new Judge(loadEngine(3), data, { iterations: 4000 });
      judge.begin(viewOf({ p1: [SWAMPERT], p2: [{ species: 'Salamence', setId }] }), 'k');
      while (judge.step());
      return ['move 1', 'move 2', 'move 3', 'move 4'].map((c) => judge.verdict(c));
    };
    expect(verdicts('salamence-mixed')).toEqual(verdicts('salamence-dragon-dance'));
  });
});

describe('Judge without a working engine', () => {
  it('stays quiet', () => {
    const broken = {
      search() {
        throw new Error('engine down');
      },
      options() {
        throw new Error('engine down');
      },
    } as unknown as Engine;
    const judge = new Judge(broken, data);
    judge.begin(viewOf({ p1: [SWAMPERT], p2: [MENCE] }), 'k');
    expect(judge.settle('move 2', Infinity)).toBeUndefined();
    expect(judge.busy).toBe(false);
  });
});
