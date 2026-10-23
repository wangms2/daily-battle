import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { setsOf, speciesInfo } from '../lib/data';
import { finalStats } from '../lib/stats';
import { FinalStatsRow, StatLines } from './StatLines';

const set = setsOf('Heatran')[0]!;

describe('StatLines', () => {
  it('shows base stats alone without a set', () => {
    render(<StatLines species="Heatran" />);
    expect(screen.getByLabelText('Stats')).toHaveTextContent(
      String(speciesInfo('Heatran').baseStats.hp),
    );
    expect(screen.queryByText('Final')).toBeNull();
  });

  it('adds each final stat beside the base stat when a set is known', () => {
    render(<StatLines species="Heatran" set={set} />);
    const final = finalStats(speciesInfo('Heatran').baseStats, set);
    const list = screen.getByLabelText('Stats');
    for (const v of Object.values(final)) expect(list).toHaveTextContent(String(v));
    expect(screen.getAllByText(/Final/).length).toBeGreaterThan(0);
  });

  it('lists the six final stats on one line', () => {
    render(<FinalStatsRow species="Heatran" set={set} />);
    expect(screen.getByLabelText('Final stats at level 100').children).toHaveLength(6);
  });
});
