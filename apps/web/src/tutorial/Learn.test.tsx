import { gen3Lessons } from '@daily-battle/tutorial/lessons';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BattleBackendContext } from '../battle/backend';
import { inlineBackend } from '../battle/inline-backend';
import { initialState } from '../state/schema';
import { Learn } from './Learn';
import { LessonPlayer } from './LessonPlayer';

const types = gen3Lessons.find((l) => l.id === 'gen3-types')!;
const firstQuiz = types.steps.findIndex((s) => s.kind === 'quiz');

function play(step: number, handlers: { onStep?: () => void; onDone?: () => void } = {}) {
  const backend = inlineBackend();
  return render(
    <BattleBackendContext.Provider value={() => backend}>
      <LessonPlayer
        lesson={types}
        step={step}
        settings={initialState().settings}
        onSetting={() => {}}
        onExplainerSeen={() => {}}
        onStep={handlers.onStep ?? (() => {})}
        onDone={handlers.onDone ?? (() => {})}
        onExit={() => {}}
        onSettings={() => {}}
      />
    </BattleBackendContext.Provider>,
  );
}

describe('Learn', () => {
  it('checks finished lessons and points to the next one', () => {
    render(
      <Learn
        game="Gen 3"
        lessons={gen3Lessons}
        progress={{ completed: ['gen3-basics'], current: { lesson: 'gen3-types', step: 2 } }}
        onOpen={() => {}}
        onBack={() => {}}
        onSettings={() => {}}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByLabelText('Done')).toBeTruthy();
    const next = within(items[1]!).getByRole('button');
    expect(next.getAttribute('aria-current')).toBe('step');
    expect(within(next).getByText('Resume')).toBeTruthy();
    expect(within(items[2]!).getByRole('button').getAttribute('aria-current')).toBeNull();
  });
});

describe('LessonPlayer', () => {
  it('moves through cards', async () => {
    const onStep = vi.fn();
    play(0, { onStep });
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(onStep).toHaveBeenCalledWith(1);
  });

  it('shows a quiz in the battle UI, explains a wrong pick, then every option once solved', async () => {
    const onStep = vi.fn();
    play(firstQuiz, { onStep });
    // The position loads in the real controls: Swampert's moves against Salamence.
    await userEvent.click(
      await screen.findByRole('button', { name: /Earthquake/ }, { timeout: 10_000 }),
    );
    expect(screen.getByRole('status').textContent).toMatch(/immune to Ground/);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(screen.getByRole('button', { name: /Protect/ }));
    expect(screen.getByRole('status').textContent).toMatch(/Protect only blocks/);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await userEvent.click(screen.getByRole('button', { name: /Ice Beam/ }));
    const solved = screen.getByRole('status');
    expect(solved.textContent).toMatch(/4× damage/);
    // Every graded option is listed; its reason shows only when tapped.
    expect(within(solved).queryByText(/Dragon resists Water/)).toBeNull();
    await userEvent.click(within(solved).getByRole('button', { name: /Surf/ }));
    expect(within(solved).getByText(/Dragon resists Water/)).toBeTruthy();
    await userEvent.click(within(solved).getByRole('button', { name: 'Continue' }));
    expect(onStep).toHaveBeenCalledWith(firstQuiz + 1);
  }, 20_000);
});
