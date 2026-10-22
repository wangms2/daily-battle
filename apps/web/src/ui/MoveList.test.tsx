import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { moveInfo } from '../lib/data';
import { sets } from '@daily-battle/data';
import { MoveList } from './MoveList';

describe('MoveList', () => {
  it('has details for every move a set uses', () => {
    const moves = Object.values(sets.species).flatMap((e) => e.sets.flatMap((s) => s.moves));
    expect(moves.filter((m) => !moveInfo(m))).toEqual([]);
  });

  it('shows a move card on tap and closes it on a tap elsewhere', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <MoveList moves={['Stealth Rock', 'Mach Punch', 'Hidden Power Fire', 'Earthquake']} />
        <p>elsewhere</p>
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Mach Punch' }));
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Physical');
    expect(card).toHaveTextContent('Power40');
    expect(card).toHaveTextContent('Priority +1');
    expect(card).toHaveTextContent('Usually goes first.');

    await user.click(screen.getByRole('button', { name: 'Hidden Power Fire' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Fire on this set');

    await user.click(screen.getByText('elsewhere'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
