// Course lesson 5, Physical and special (docs/plan-tutorial-coach.md, step
// 4b): in Gen 3 a move's type decides whether it's physical (Attack against
// Defense) or special (Special Attack against Special Defense). Each pair
// compared here is the same in everything else: both match the user's type,
// both are neutral on the foe.
import type { Lesson, Mon } from '../../types';

const SWAMPERT: Mon = { species: 'Swampert', moves: ['Surf', 'Earthquake'] };
const METAGROSS: Mon = { species: 'Metagross', moves: ['Psychic', 'Meteor Mash'] };
const BLISSEY: Mon = { species: 'Blissey', moves: ['Seismic Toss'] };

export const split: Lesson = {
  id: 'gen3-split-course',
  draft: true,
  format: 'gen3ou',
  number: 5,
  title: 'Physical and special',
  summary: 'In Gen 3, a move’s type decides which stats it uses.',
  steps: [
    {
      kind: 'demo',
      position: { p1: [SWAMPERT], p2: [BLISSEY], seed: 'course:split:demo1' },
      turn: { p1: 'move Surf', p2: 'move Seismic Toss' },
      before: 'In Gen 3, Water moves are special: they hit Special Defense. Blissey’s is huge.',
      after: 'Surf barely dented Blissey.',
      spotlight: { before: ['move Surf'], after: ['foe-hp'] },
    },
    {
      kind: 'demo',
      position: { p1: [SWAMPERT], p2: [BLISSEY], seed: 'course:split:demo2' },
      turn: { p1: 'move Earthquake', p2: 'move Seismic Toss' },
      before: 'Ground moves are physical: they hit Defense. Blissey’s Defense is tiny.',
      after: 'Earthquake took most of Blissey’s HP. Hit the defense that’s weaker.',
      spotlight: { before: ['move Earthquake'], after: ['foe-hp'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [SWAMPERT],
        p2: [{ species: 'Forretress', moves: ['Earthquake'] }],
        seed: 'course:split:demo3',
      },
      turn: { p1: 'move Surf', p2: 'move Earthquake' },
      before: 'Forretress is the other way round: huge Defense, lower Special Defense.',
      after: 'So here the special move, Surf, does more.',
      spotlight: { before: ['move Surf'], after: ['foe-hp'] },
    },
    {
      kind: 'practice',
      prompt: 'Blissey has huge Special Defense and tiny Defense. Which move?',
      position: {
        p1: [SWAMPERT],
        p2: [BLISSEY],
        hp: { p1: [25], p2: [30] },
        seed: 'course:split:practice1',
      },
      foe: 'move Seismic Toss',
      answers: [
        {
          choice: 'move Earthquake',
          grade: 'best',
          why: 'Earthquake is physical: it hits Blissey’s tiny Defense and knocks it out.',
        },
        {
          choice: 'move Surf',
          grade: 'wrong',
          why: 'Surf is special and runs into Blissey’s huge Special Defense. Blissey survives and knocks Swampert out.',
        },
      ],
      otherwise: 'Earthquake hits Blissey’s weak Defense and knocks it out.',
    },
    {
      kind: 'practice',
      prompt: 'Which of Metagross’s moves hits Blissey hardest?',
      position: {
        p1: [METAGROSS],
        p2: [BLISSEY],
        hp: { p1: [30], p2: [30] },
        seed: 'course:split:practice2',
      },
      foe: 'move Seismic Toss',
      answers: [
        {
          choice: 'move Meteor Mash',
          grade: 'best',
          why: 'Steel moves are physical: Meteor Mash hits Blissey’s tiny Defense and knocks it out.',
        },
        {
          choice: 'move Psychic',
          grade: 'wrong',
          why: 'Psychic moves are special and run into Blissey’s huge Special Defense. Blissey survives and knocks Metagross out.',
        },
      ],
      otherwise: 'Meteor Mash hits Blissey’s weak Defense and knocks it out.',
    },
    {
      kind: 'battle',
      intro:
        'Two on two against the Easy AI: a special wall and a physical wall. Hit each one’s weaker side.',
      // Both of yours outspeed both foes.
      player: [SWAMPERT, METAGROSS],
      foe: [BLISSEY, { species: 'Forretress', moves: ['Earthquake'] }],
      foeAi: 'easy',
      seed: 'course:split:battle',
      noLuck: true,
      prompts: [],
      takeaway:
        'Physical moves hit Defense; special moves hit Special Defense. Aim at the weaker one.',
    },
  ],
};
