import { setsFor } from '@daily-battle/data';
import {
  BattleSession,
  deriveSeed,
  legalChoices,
  makeRng,
  randomTeam,
  type SideID,
} from '@daily-battle/sim-bridge';
import type { PokemonSet, PRNGSeed } from '@pkmn/sim';
import { describe, expect, it } from 'vitest';
import type { TurnPackage } from './frames';
import { SidePresenter } from './presenter';

/**
 * Two players, each seeing only its own side through a presenter, both choosing
 * at random, as in a versus battle with no AI.
 */
function versus(i: number, format = 'gen4ou') {
  const rng = makeRng(deriveSeed('presenter:teams', i));
  const data = setsFor(format);
  const teams: Record<SideID, PokemonSet[]> = {
    p1: randomTeam(rng, data),
    p2: randomTeam(rng, data),
  };
  const session = new BattleSession({
    format,
    seed: deriveSeed('presenter:battle', i) as PRNGSeed,
    p1: { team: teams.p1 },
    p2: { team: teams.p2 },
  });
  const sides: SideID[] = ['p1', 'p2'];
  const presenters = {
    p1: new SidePresenter('p1', teams.p1, format),
    p2: new SidePresenter('p2', teams.p2, format),
  };
  const packages: Record<SideID, TurnPackage[]> = { p1: [], p2: [] };
  const present = () => {
    for (const side of sides) {
      packages[side].push(
        presenters[side].present(
          {
            lines: session.drain(side),
            request: session.request(side),
            ended: session.ended,
            winner: session.winner,
          },
          false,
        ),
      );
    }
  };
  const pick = makeRng(deriveSeed('presenter:choices', i));
  // Team Preview: each side keeps its order.
  for (const side of sides) {
    if (session.request(side)?.requestType === 'team') session.choose(side, 'team 123456');
  }
  present();
  for (let n = 0; n < 400 && !session.ended; n++) {
    for (const side of sides) {
      const request = session.request(side);
      if (!request || session.ended) continue;
      const options = legalChoices(request);
      session.choose(side, options[Math.floor(pick() * options.length)]!);
    }
    present();
  }
  return { teams, session, packages };
}

describe('SidePresenter', () => {
  it('shows each side its own Pokémon as "you"', () => {
    const { teams, packages } = versus(0);
    for (const side of ['p1', 'p2'] as const) {
      const other = side === 'p1' ? 'p2' : 'p1';
      const first = packages[side][0]!;
      const view = first.frames.at(-1)!.view;
      expect(view.you?.species).toBe(teams[side][0]!.species);
      expect(view.foe?.species).toBe(teams[other][0]!.species);
      expect(first.team.map((m) => m.species)).toEqual(teams[side].map((s) => s.species));
      expect(first.team.every((m) => m.hpExact.max > 0)).toBe(true);
      expect(first.controls?.kind).toBe('move');
      // Your send-out reads as yours ("Go! X!"), the foe's as theirs.
      expect(first.frames.some((f) => f.text.includes(`Go! **${teams[side][0]!.species}`))).toBe(
        true,
      );
    }
  });

  it('agrees between the two sides on who moved and who won', () => {
    for (let i = 1; i < 4; i++) {
      const { session, packages } = versus(i);
      expect(session.ended).toBe(true);
      const moves = (side: SideID, who: 'you' | 'foe') =>
        packages[side]
          .flatMap((p) => p.frames)
          .filter((f) => f.event?.kind === 'move' && f.event.who === who).length;
      expect(moves('p1', 'you')).toBe(moves('p2', 'foe'));
      expect(moves('p2', 'you')).toBe(moves('p1', 'foe'));
      const e1 = packages.p1.at(-1)!.end!;
      const e2 = packages.p2.at(-1)!.end!;
      expect(e1.winner === 'you').toBe(session.winner === 'p1');
      expect(e2.winner === 'you').toBe(session.winner === 'p2');
      expect(e1.youLeft).toBe(e2.foeLeft);
      expect(e1.foeLeft).toBe(e2.youLeft);
    }
  }, 60_000);

  it('works from the second side with Team Preview (Gen 5)', () => {
    const { teams, session, packages } = versus(5, 'gen5ou');
    expect(session.ended).toBe(true);
    expect(packages.p2[0]!.frames.at(-1)!.view.you?.species).toBe(teams.p2[0]!.species);
  }, 60_000);
});
