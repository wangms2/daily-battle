import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { setActiveFormat } from '../lib/data';
import { TypeChartSheet } from '../sheets/TypeChart';
import { TypeTrainer } from './TypeTrainer';

describe('TypeTrainer', () => {
  it('asks ten questions, explains each, then shows the score and every answer', async () => {
    setActiveFormat('gen3ou');
    const onBoxes = vi.fn();
    render(
      <TypeTrainer
        boxes={{}}
        onBoxes={onBoxes}
        onBack={() => {}}
        onChart={() => {}}
        onSettings={() => {}}
      />,
    );
    for (let i = 0; i < 10; i++) {
      expect(screen.getByText(`${i + 1} of 10`)).toBeInTheDocument();
      const answers = screen.getByRole('group', { name: 'How hard it hits' });
      await userEvent.click(within(answers).getByRole('button', { name: 'Normal damage, ×1' }));
      expect(screen.getByText(/^(Right!|It’s )/)).toBeInTheDocument();
      await userEvent.click(
        screen.getByRole('button', { name: i < 9 ? 'Next' : 'See your score' }),
      );
    }
    expect(onBoxes).toHaveBeenCalledTimes(10);
    expect(screen.getByText('/ 10')).toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Your answers' })).getAllByRole('listitem'),
    ).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Another round' })).toBeInTheDocument();
  });
});

describe('TypeChartSheet', () => {
  it('shows what a type hits hard and what it takes, for the game being played', async () => {
    setActiveFormat('gen3ou');
    render(<TypeChartSheet open onOpenChange={() => {}} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Ground' }));
    const dialog = screen.getByRole('dialog');
    const row = (label: string) => screen.getByText(label).parentElement!;
    expect(row('Not at all (×0)')).toHaveTextContent('Flying');
    expect(row('Hard (×2)')).toHaveTextContent(/Fire.*Electric.*Poison.*Rock.*Steel/);
    expect(row('Double from (×2)')).toHaveTextContent(/Water.*Grass.*Ice/);
    expect(within(dialog).queryByRole('radio', { name: 'Fairy' })).not.toBeInTheDocument();
  });
});
