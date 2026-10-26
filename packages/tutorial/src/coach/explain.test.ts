import { turnFacts } from '@daily-battle/ai';
import { setsFor } from '@daily-battle/data';
import { describe, expect, it } from 'vitest';
import { startPosition } from '../battle';
import type { Position } from '../types';
import { explainWarning, QUIET_REASONS, winningAnyway } from './explain';
import type { Verdict } from './judge';

const data = setsFor('gen3ou');
const SWAMPERT = { species: 'Swampert', moves: ['Surf', 'Earthquake', 'Protect', 'Toxic'] };
const MENCE = { species: 'Salamence', setId: 'salamence-dragon-dance' };
const HERACROSS = { species: 'Heracross', setId: 'heracross-standard' };

/** The judge says `choice` is clearly worse than `top`: what does the coach say? */
const explain = (pos: Omit<Position, 'seed'>, choice: string, top: string, worse = true) => {
  const view = startPosition('gen3ou', { ...pos, seed: 'explain' }).view('p1')!;
  const verdict: Verdict = { choice, top, worse, gap: 0.2, agree: 1, value: 0.3, topValue: 0.5 };
  return explainWarning(view, turnFacts(view, data), verdict);
};

describe('Warning explanations', () => {
  it('names the risk of a switch into a knockout', () => {
    const e = explain({ p1: [SWAMPERT, HERACROSS], p2: [MENCE] }, 'switch 2', 'move 1');
    expect(e?.reason).toBe('switchKo');
    expect(e!.text).toMatch(
      /^Risky: if Salamence uses .+, Heracross is knocked out as it comes in/,
    );
  });

  it('explains a move that does nothing, then what the better one does', () => {
    const e = explain(
      { p1: [{ species: 'Swampert', moves: ['Surf', 'Earthquake', 'Ice Beam'] }], p2: [MENCE] },
      'move 2',
      'move 3',
    );
    expect(e?.reason).toBe('noEffect');
    expect(e!.text).toMatch(
      /^Salamence is immune to Ground moves, so Earthquake will do nothing\. Ice Beam (can knock out|does about \d+% to) Salamence\.$/,
    );
  });

  it('warns about staying in to be knocked out when the top choice is a safe switch', () => {
    const e = explain(
      {
        p1: [HERACROSS, { species: 'Swampert', setId: 'swampert-standard-defensive' }],
        p2: [MENCE],
      },
      'move 1',
      'switch 2',
    );
    expect(e).toMatchObject({
      reason: 'staysKo',
      text: 'Risky: Salamence can knock out Heracross this turn. Swampert takes the hit much better.',
    });
  });

  it('says why Rapid Spin is wasted with no Spikes to clear', () => {
    const e = explain(
      {
        p1: [{ species: 'Starmie', moves: ['Rapid Spin', 'Surf', 'Ice Beam', 'Recover'] }],
        p2: [{ species: 'Snorlax', setId: 'snorlax-curserestlax' }],
      },
      'move 1',
      'move 2',
    );
    expect(e?.reason).toBe('noSpikes');
    expect(e!.text).toContain('no Spikes on your side');
  });

  it('says a healing move fails at full HP', () => {
    const e = explain(
      { p1: [{ species: 'Starmie', moves: ['Recover', 'Surf'] }], p2: [MENCE] },
      'move 1',
      'move 2',
    );
    expect(e).toMatchObject({ reason: 'fails' });
    expect(e!.text).toMatch(/^Starmie is at full HP, so Recover will do nothing\./);
  });

  it('keeps quiet about reasons that failed the offline check against this opponent', () => {
    // Explosion into a Skarmory: it resists, so it won't knock it out.
    const pos = {
      p1: [{ species: 'Metagross', moves: ['Explosion', 'Earthquake'] }],
      p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
    };
    const view = startPosition('gen3ou', { ...pos, seed: 'explain' }).view('p1')!;
    const verdict: Verdict = {
      choice: 'move 1',
      top: 'move 2',
      worse: true,
      gap: 0.2,
      agree: 1,
      value: 0.3,
      topValue: 0.5,
    };
    const f = turnFacts(view, data);
    expect(explainWarning(view, f, verdict, { quiet: QUIET_REASONS.normal })?.reason).toBe(
      'selfKo',
    );
    expect(explainWarning(view, f, verdict, { quiet: QUIET_REASONS.easy })).toBeUndefined();
  });

  it('in a lesson, says nothing the player hasn’t learned yet', () => {
    const at = (pos: Omit<Position, 'seed'>, choice: string, top: string, taught: number) => {
      const view = startPosition('gen3ou', { ...pos, seed: 'explain' }).view('p1')!;
      const verdict: Verdict = {
        choice,
        top,
        worse: true,
        gap: 0.2,
        agree: 1,
        value: 0.3,
        topValue: 0.5,
      };
      return explainWarning(view, turnFacts(view, data), verdict, { taught });
    };
    // Immunity to Ground is lesson 4.
    const immune = {
      p1: [{ species: 'Swampert', moves: ['Surf', 'Earthquake', 'Ice Beam'] }],
      p2: [MENCE],
    };
    expect(at(immune, 'move 2', 'move 3', 3)).toBeUndefined();
    expect(at(immune, 'move 2', 'move 3', 4)?.reason).toBe('noEffect');
    // Steel can't be poisoned: status, lesson 12, even though it's a "does nothing".
    const steel = {
      p1: [{ species: 'Jirachi', moves: ['Toxic', 'Psychic'] }],
      p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
    };
    expect(at(steel, 'move 1', 'move 2', 4)).toBeUndefined();
    expect(at(steel, 'move 1', 'move 2', 12)?.noEffect).toBe('statusImmune');
  });

  it('stays quiet when no reason is true', () => {
    // Surf over Toxic: no template explains why the search prefers Toxic.
    expect(explain({ p1: [SWAMPERT], p2: [MENCE] }, 'move 1', 'move 4')).toBeUndefined();
  });

  it('stays quiet unless the judge says the pick is clearly worse', () => {
    expect(explain({ p1: [SWAMPERT], p2: [MENCE] }, 'move 2', 'move 1', false)).toBeUndefined();
  });

  it('stays quiet when the player is winning anyway', () => {
    const pos = {
      p1: [SWAMPERT, HERACROSS, { species: 'Skarmory', setId: 'skarmory-standard' }],
      p2: [MENCE],
    };
    const view = startPosition('gen3ou', { ...pos, seed: 'explain' }).view('p1')!;
    expect(winningAnyway(turnFacts(view, data))).toBe(true);
    expect(explain(pos, 'move 2', 'move 1')).toBeUndefined();
  });

  it('calls our Pokémon "your" when the foe is the same species', () => {
    const e = explain(
      {
        p1: [SWAMPERT, { species: 'Salamence', setId: 'salamence-dragon-dance' }],
        p2: [{ species: 'Salamence', setId: 'salamence-dragon-dance' }],
      },
      'move 2',
      'switch 2',
    );
    expect(e?.text ?? '').not.toContain('Salamence takes Salamence');
  });
});
