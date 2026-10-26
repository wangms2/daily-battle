import { gen3Lessons } from '@daily-battle/tutorial/lessons';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BattleBackendContext } from '../battle/backend';
import { inlineBackend } from '../battle/inline-backend';
import { initialState } from '../state/schema';
import { Learn } from './Learn';
import { LessonPlayer, Pick } from './LessonPlayer';
import type { Lesson, PickStep } from '@daily-battle/tutorial/lessons';
import { nextLesson } from './lesson';

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
        onPlay={() => {}}
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
    expect(screen.queryByText(/You graduated/)).toBeNull();
  });

  it('offers the daily after graduation', async () => {
    const onPlay = vi.fn();
    render(
      <Learn
        game="Gen 3"
        lessons={gen3Lessons}
        progress={{ completed: gen3Lessons.map((l) => l.id) }}
        onOpen={() => {}}
        onPlay={onPlay}
        onBack={() => {}}
        onSettings={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Play today’s Gen 3 daily' }));
    expect(onPlay).toHaveBeenCalled();
  });
});

function pickStep(id: string) {
  return gen3Lessons.find((l) => l.id === id)!.steps.find((s) => s.kind === 'pick') as PickStep;
}

describe('Pick', () => {
  it('rejects a wrong pick with its reason and finishes once the team is full', async () => {
    const onNext = vi.fn();
    render(<Pick step={pickStep('gen3-roles')} last={false} onNext={onNext} />);
    const option = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    await userEvent.click(option('Flygon'));
    expect(option('Flygon').getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('status').textContent).toMatch(/not a good fit/);
    await userEvent.click(option('Blissey'));
    expect(screen.getByRole('status').textContent).toMatch(/added/);
    expect(screen.getByText('Pick 1 more.')).toBeTruthy();
    await userEvent.click(option('Forretress'));
    expect(screen.getByText('Team complete.')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(onNext).toHaveBeenCalled();
  });

  it('picks a lead against a shown foe team', async () => {
    render(<Pick step={pickStep('gen3-leads')} last={false} onNext={() => {}} />);
    expect(within(screen.getByLabelText('Their team')).getAllByRole('img').length).toBe(
      pickStep('gen3-leads').foe!.length,
    );
    const option = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    await userEvent.click(option('Salamence'));
    expect(screen.getByRole('status').textContent).toMatch(/not a good lead/);
    await userEvent.click(option('Skarmory'));
    expect(screen.getByText('Lead chosen.')).toBeTruthy();
    await userEvent.click(option('Starmie'));
    expect(screen.getByRole('status').textContent).toMatch(/already picked a lead/);
    expect(option('Starmie').getAttribute('aria-pressed')).toBe('false');
  });
});

describe('demo steps', () => {
  const demoLesson: Lesson = {
    id: 'test-demo',
    format: 'gen3ou',
    number: 3,
    title: 'Super effective',
    summary: '',
    steps: [
      {
        kind: 'demo',
        position: {
          p1: [{ species: 'Starmie', moves: ['Surf', 'Ice Beam'] }],
          p2: [{ species: 'Houndoom', moves: ['Crunch'] }],
          seed: 'learn:demo',
        },
        turn: { p1: 'move Surf', p2: 'move Crunch' },
        before: 'Surf is a Water move.',
        after: 'Water is strong against Fire.',
        spotlight: { before: ['move Surf', 'foe-types'], after: ['foe-hp'] },
      },
    ],
  };

  it('shows the idea, plays the turn on Watch, then offers Again and Next', async () => {
    const backend = inlineBackend();
    const onDone = vi.fn();
    render(
      <BattleBackendContext.Provider value={() => backend}>
        <LessonPlayer
          lesson={demoLesson}
          step={0}
          settings={{ ...initialState().settings, battleSpeed: 'instant' }}
          onSetting={() => {}}
          onExplainerSeen={() => {}}
          onStep={() => {}}
          onDone={onDone}
          onExit={() => {}}
          onSettings={() => {}}
        />
      </BattleBackendContext.Provider>,
    );
    const card = await screen.findByRole('note', { name: 'Lesson' });
    expect(card).toHaveTextContent('Surf is a Water move.');
    await userEvent.click(await within(card).findByRole('button', { name: /Watch/ }));
    const after = await screen.findByText('Water is strong against Fire.');
    const done = after.closest('[role="note"]') as HTMLElement;
    expect(within(done).getByRole('button', { name: 'Again' })).toBeInTheDocument();
    await userEvent.click(within(done).getByRole('button', { name: 'Finish' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('keeps draft lessons out of the list', () => {
    render(
      <Learn
        game="Gen 3"
        lessons={gen3Lessons}
        progress={undefined}
        onOpen={() => {}}
        onPlay={() => {}}
        onBack={() => {}}
        onSettings={() => {}}
      />,
    );
    expect(screen.queryByText(/Super effective and resisted/)).not.toBeInTheDocument();
    expect(nextLesson(gen3Lessons, undefined)?.draft).toBeFalsy();
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
