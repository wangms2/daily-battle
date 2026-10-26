// Course lesson 3, Super effective and resisted (docs/plan-tutorial-coach.md,
// step 4b). Prototype of the redesigned lessons: the idea is shown on the
// battle screen, one turn at a time. Positions keep later ideas out of play:
// no knockouts, no weather, no abilities that act, full HP on both sides,
// and the turn ends with your move (the foe's isn't shown).
import type { Lesson, Mon } from '../../types';

// Starmie is faster than each foe here, so its move lands first and the demo ends there.
const STARMIE: Mon = { species: 'Starmie', moves: ['Surf', 'Ice Beam', 'Thunderbolt', 'Psychic'] };

export const effective: Lesson = {
  id: 'gen3-effective',
  draft: true,
  format: 'gen3ou',
  number: 3,
  title: 'Super effective and resisted',
  summary: 'A move’s type against the target’s types decides how hard it hits.',
  steps: [
    {
      kind: 'demo',
      position: {
        p1: [STARMIE],
        p2: [{ species: 'Houndoom', moves: ['Crunch'] }],
        seed: 'course:effective:demo1',
      },
      turn: { p1: 'move Surf', p2: 'move Crunch' },
      before: 'Every move has a type. Surf is a Water move, and Houndoom is a Dark and Fire type.',
      after: 'Water is strong against Fire: Surf is super effective and does double damage.',
      spotlight: { before: ['move Surf', 'foe-types'], after: ['foe-hp'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [STARMIE],
        p2: [{ species: 'Celebi', moves: ['Psychic'] }],
        seed: 'course:effective:demo2',
      },
      turn: { p1: 'move Surf', p2: 'move Psychic' },
      before: 'Celebi is a Psychic and Grass type. Watch the same Surf hit it.',
      after: 'Grass resists Water: Surf is not very effective and does only half damage.',
      spotlight: { before: ['move Surf', 'foe-types'], after: ['foe-hp'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [STARMIE],
        p2: [{ species: 'Flygon', moves: ['Dragon Claw'] }],
        seed: 'course:effective:demo3',
      },
      turn: { p1: 'move Ice Beam', p2: 'move Dragon Claw' },
      before: 'Flygon is a Ground and Dragon type. Ice is strong against both.',
      after:
        'Weak to Ice twice over: Ice Beam does four times the damage, enough to knock Flygon out.',
      spotlight: { before: ['move Ice Beam', 'foe-types'], after: ['log'] },
    },
  ],
};
