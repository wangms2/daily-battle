import type { Protocol } from '@pkmn/protocol';
import { describe, expect, it } from 'vitest';
import { legalChoices } from './random';

const mon = (name: string, opts: { active?: boolean; condition?: string } = {}) =>
  ({
    ident: `p1: ${name}`,
    active: opts.active ?? false,
    condition: opts.condition ?? '100/100',
  }) as Protocol.Request.Pokemon;

const side = (pokemon: Protocol.Request.Pokemon[]) =>
  ({ name: 'p1', id: 'p1', pokemon }) as Protocol.Request.SideInfo;

const team = side([
  mon('Heatran', { active: true }),
  mon('Skarmory'),
  mon('Blissey', { condition: '0 fnt' }),
  mon('Starmie'),
]);

const move = (name: string, opts: { pp?: number; disabled?: boolean } = {}) => ({
  name,
  id: name.toLowerCase(),
  pp: opts.pp ?? 10,
  maxpp: 16,
  target: 'normal',
  disabled: opts.disabled ?? false,
});

const moveRequest = (
  moves: ReturnType<typeof move>[],
  extra: Partial<Protocol.Request.ActivePokemon> = {},
) =>
  ({
    requestType: 'move',
    rqid: 1,
    side: team,
    active: [{ moves, ...extra }],
  }) as unknown as Protocol.Request;

describe('legalChoices', () => {
  it('offers usable moves and switches to healthy benched Pokémon', () => {
    const request = moveRequest([
      move('Fire Blast'),
      move('Earth Power', { pp: 0 }),
      move('Stealth Rock', { disabled: true }),
      move('Protect'),
    ]);
    expect(legalChoices(request)).toEqual(['move 1', 'move 4', 'switch 2', 'switch 4']);
  });

  it('offers no switches when trapped', () => {
    expect(legalChoices(moveRequest([move('Fire Blast')], { trapped: true }))).toEqual(['move 1']);
    expect(legalChoices(moveRequest([move('Fire Blast')], { maybeTrapped: true }))).toEqual([
      'move 1',
    ]);
  });

  it('offers only switches on a forced switch', () => {
    const request = {
      requestType: 'switch',
      rqid: 1,
      side: team,
      forceSwitch: [true],
    } as unknown as Protocol.Request;
    expect(legalChoices(request)).toEqual(['switch 2', 'switch 4']);
  });

  it('handles a lone Struggle entry', () => {
    const request = moveRequest([{ name: 'Struggle', id: 'struggle' } as ReturnType<typeof move>], {
      trapped: true,
    });
    expect(legalChoices(request)).toEqual(['move 1']);
  });

  it('offers nothing while waiting', () => {
    expect(legalChoices({ requestType: 'wait', rqid: 1 } as Protocol.Request)).toEqual([]);
  });

  it('adds a Mega Evolving version of each usable move when the Pokémon can Mega Evolve', () => {
    const request = moveRequest([move('Flare Blitz'), move('Roost', { pp: 0 })], {
      canMegaEvo: true,
      trapped: true,
    });
    expect(legalChoices(request)).toEqual(['move 1', 'move 1 mega']);
  });
});
