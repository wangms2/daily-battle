import { setsFor } from '@daily-battle/data';
import { deriveSeed, legalChoices, makeRng, randomTeam } from '@daily-battle/sim-bridge';
import { newMatch, SIDES, type Match, type Side } from '@daily-battle/versus';
import { describe, expect, it } from 'vitest';
import { LiveBattle, randomSeed } from './battle';

/** A match in battle with random teams, lead first as the room stores them. */
function match(i: number, format: 'gen4ou' | 'gen5ou' = 'gen4ou', size = 6): Match {
  const rng = makeRng(deriveSeed('server:teams', i));
  const team = () => randomTeam(rng, setsFor(format)).slice(0, size);
  const m = newMatch({
    id: `1-${i}`,
    players: { p1: 'a', p2: 'b' },
    names: { p1: 'Ash', p2: 'Misty' },
    format,
    seed: deriveSeed('server:battle', i),
    slots: { p1: [], p2: [] },
    bankMs: 240_000,
    now: 0,
  });
  return { ...m, stage: 'battle', teams: { p1: team(), p2: team() } };
}

/** Plays random legal choices to the end, recording them on the match as the room does. */
function playOut(m: Match, seed: number): { m: Match; battle: LiveBattle } {
  let current: Match = { ...m, stage: 'battle', choices: { p1: [], p2: [] } };
  const battle = new LiveBattle(current);
  const pick = makeRng(deriveSeed('server:choices', seed));
  for (let n = 0; n < 1000 && !battle.ended; n++) {
    for (const side of SIDES) {
      if (battle.ended || !battle.waitingOn(side)) continue;
      const options = legalChoices(battle.update(side, 0).request as never);
      const choice = options[Math.floor(pick() * options.length)]!;
      if (battle.choose(side, choice) === 'ok') {
        current = {
          ...current,
          choices: { ...current.choices, [side]: [...current.choices[side], choice] },
        };
      }
    }
  }
  return { m: current, battle };
}

describe('LiveBattle', () => {
  it('plays to an end and rebuilds exactly from its choices', () => {
    for (let i = 0; i < 3; i++) {
      const { m, battle } = playOut(match(i), i);
      expect(battle.ended).toBe(true);
      const rebuilt = new LiveBattle(m);
      expect(rebuilt.ended).toBe(true);
      expect(rebuilt.winner).toBe(battle.winner);
      // The same lines, apart from the sim's wall-clock timestamps (|t:|); the
      // same count, so a reconnecting client lines up.
      const lines = (b: LiveBattle, side: Side) =>
        b.update(side, 0).lines.filter((l) => !l.startsWith('|t:|'));
      for (const side of SIDES) {
        expect(rebuilt.logLength(side)).toBe(battle.logLength(side));
        expect(lines(rebuilt, side)).toEqual(lines(battle, side));
      }
    }
  }, 60_000);

  it('sends each lead first, and works with Team Preview and smaller teams', () => {
    const m = match(7, 'gen5ou', 4);
    const lead = m.teams.p2[0]!.species;
    const battle = new LiveBattle(m);
    const lines = battle.update('p2', 0).lines.join('\n');
    expect(lines).toMatch(new RegExp(`\\|switch\\|p2a: ${lead}`));
    expect(battle.waitingOn('p1') && battle.waitingOn('p2')).toBe(true);
    const { battle: done } = playOut(m, 7);
    expect(done.ended).toBe(true);
  }, 60_000);

  it('keeps each side to its own view and refuses illegal choices', () => {
    const m: Match = match(3);
    const battle = new LiveBattle(m);
    const foeSets = (side: Side) => m.teams[side === 'p1' ? 'p2' : 'p1'];
    for (const side of SIDES) {
      const update = JSON.stringify(battle.update(side, 0));
      // The foe's moves never show before they're used (only the leads are out).
      for (const set of foeSets(side).slice(1)) expect(update).not.toContain(set.species);
    }
    expect(battle.choose('p1', 'switch 1')).toBe('illegal'); // already active
    expect(battle.choose('p1', 'move 9')).toBe('illegal');
    expect(battle.choose('p1', 'move 1')).toBe('ok');
    expect(battle.choose('p1', 'move 1')).toBe('illegal'); // waiting on the foe
    expect(battle.waitingOn('p1')).toBe(false);
  });

  it('records a forfeit as a loss for that side', () => {
    const battle = new LiveBattle(match(4));
    battle.forfeit('p2');
    expect(battle.ended).toBe(true);
    expect(battle.winner).toBe('p1');
    expect(battle.update('p2', 0).ended).toBe(true);
  });

  it('makes seeds the sim accepts', () => {
    expect(randomSeed()).toMatch(/^\d+,\d+,\d+,\d+$/);
  });
});
