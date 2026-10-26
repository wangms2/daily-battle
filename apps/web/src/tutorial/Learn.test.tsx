import { gen3Lessons } from '@daily-battle/tutorial/lessons';
import type { CourseUnit, DemoStep, Lesson } from '@daily-battle/tutorial/lessons';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BattleBackendContext } from '../battle/backend';
import { inlineBackend } from '../battle/inline-backend';
import { initialState } from '../state/schema';
import { CourseMap } from './CourseMap';
import { LessonPlayer } from './LessonPlayer';

describe('CourseMap', () => {
  const course: CourseUnit[] = [
    {
      title: 'Damage',
      lessons: [
        { number: 1, title: 'A turn', star: 'Swampert', id: 'gen3-turn' },
        { number: 2, title: 'Immune', star: 'Gengar', id: 'gen3-immune' },
        { number: 3, title: 'Not built', star: 'Starmie' },
      ],
    },
  ];
  it('walks the course by unit, checks done lessons, and starts the next', async () => {
    const onOpen = vi.fn();
    render(
      <CourseMap
        game="Gen 3"
        course={course}
        lessons={gen3Lessons}
        progress={{ completed: ['gen3-turn'] }}
        onOpen={onOpen}
        onBack={() => {}}
        onSettings={() => {}}
      />,
    );
    expect(screen.getByRole('heading', { name: /Unit 1 · Damage/ })).toHaveTextContent('1 of 3');
    expect(screen.getByRole('button', { name: 'Lesson 1: A turn, done' })).toBeEnabled();
    const next = screen.getByRole('button', { name: 'Lesson 2: Immune' });
    expect(next).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: 'Lesson 3: Not built, coming soon' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: /Up next · Lesson 2/ }));
    expect(onOpen).toHaveBeenCalledWith(gen3Lessons.find((l) => l.id === 'gen3-immune'));
  });

  it('folds units: finished ones closed with a check, the next lesson’s open, a tap toggles', async () => {
    const units: CourseUnit[] = [
      {
        title: 'The battle',
        lessons: [{ number: 1, title: 'A turn', star: 'Swampert', id: 'gen3-turn' }],
      },
      {
        title: 'Damage',
        lessons: [{ number: 2, title: 'Immune', star: 'Gengar', id: 'gen3-immune' }],
      },
      { title: 'Later', lessons: [{ number: 3, title: 'Not built', star: 'Starmie' }] },
    ];
    render(
      <CourseMap
        game="Gen 3"
        course={units}
        lessons={gen3Lessons}
        progress={{ completed: ['gen3-turn'] }}
        onOpen={() => {}}
        onBack={() => {}}
        onSettings={() => {}}
      />,
    );
    const unit = (n: RegExp) => screen.getByRole('button', { name: n });
    expect(unit(/Unit 1 · The battle/)).toHaveAttribute('aria-expanded', 'false');
    expect(unit(/Unit 2 · Damage/)).toHaveAttribute('aria-expanded', 'true');
    expect(unit(/Unit 3 · Later/)).toHaveTextContent('1 lesson');
    expect(screen.queryByRole('button', { name: /Lesson 1: A turn/ })).not.toBeInTheDocument();
    await userEvent.click(unit(/Unit 1 · The battle/));
    expect(screen.getByRole('button', { name: 'Lesson 1: A turn, done' })).toBeInTheDocument();
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

  it('practice: plays your pick, shows the better choice on request, and passes the best', async () => {
    const practice: Lesson = {
      ...demoLesson,
      steps: [
        {
          kind: 'practice',
          prompt: 'Which move hits Skarmory hardest?',
          position: {
            p1: [{ species: 'Starmie', moves: ['Surf', 'Thunderbolt', 'Psychic'] }],
            p2: [{ species: 'Skarmory', moves: ['Drill Peck'] }],
            seed: 'learn:practice',
          },
          foe: 'move Drill Peck',
          answers: [
            { choice: 'move Thunderbolt', grade: 'best', why: 'Electric beats Flying.' },
            { choice: 'move Psychic', grade: 'wrong', why: 'Steel resists Psychic.' },
          ],
          otherwise: 'Thunderbolt does double damage.',
        },
      ],
    };
    const backend = inlineBackend();
    const onDone = vi.fn();
    render(
      <BattleBackendContext.Provider value={() => backend}>
        <LessonPlayer
          lesson={practice}
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
    await userEvent.click(await screen.findByRole('button', { name: /^Psychic, / }));
    expect(await screen.findByText('Steel resists Psychic.')).toBeInTheDocument();
    // The answer waits for Show better.
    expect(screen.queryByRole('button', { name: /, Better$/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show better' }));
    await userEvent.click(await screen.findByRole('button', { name: /Watch/ }));
    expect(
      await screen.findByRole('button', { name: /^Thunderbolt, .*, Better$/ }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(await screen.findByRole('button', { name: /^Thunderbolt, / }));
    expect(await screen.findByText(/That’s it/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onDone).toHaveBeenCalled();
  });

  it('a look: the screen at the position, with Next at once', async () => {
    const look: Lesson = {
      ...demoLesson,
      steps: [
        {
          kind: 'demo',
          position: (demoLesson.steps[0] as DemoStep).position,
          card: 'foe',
          before: 'Tap a foe to see its Speed.',
          spotlight: { before: ['foe-speed'] },
        },
      ],
    };
    const backend = inlineBackend();
    const onDone = vi.fn();
    render(
      <BattleBackendContext.Provider value={() => backend}>
        <LessonPlayer
          lesson={look}
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
    expect(card).toHaveTextContent('Tap a foe to see its Speed.');
    expect(within(card).queryByRole('button', { name: /Watch/ })).not.toBeInTheDocument();
    // The foe's card is open, with its exact Speed (a lesson foe's set is known).
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Speed \d+/);
    await userEvent.click(within(card).getByRole('button', { name: 'Finish' }));
    expect(onDone).toHaveBeenCalled();
  });
});
