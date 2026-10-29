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
  format: 'gen3ou',
  number: 5,
  title: 'Physical and special',
  summary: 'In Gen 3, a move’s type decides which stats it uses.',
  steps: [
    // Where to look: a move's details say physical or special, and the foe's
    // card has its base stats.
    {
      kind: 'demo',
      position: { p1: [SWAMPERT], p2: [BLISSEY], seed: 'course:split:look1' },
      card: 'move Surf',
      before:
        'In Gen 3, a move’s type decides whether it’s physical or special. Hold a move to see which: Surf is a Water move, so it’s special.',
      spotlight: { before: ['move Surf', 'move-details'] },
    },
    {
      kind: 'demo',
      position: { p1: [SWAMPERT], p2: [BLISSEY], seed: 'course:split:look2' },
      card: 'foe',
      before:
        'Tap the foe for its base stats. Blissey’s Defense is tiny (10), and its Special Defense is huge (135).',
      spotlight: { before: ['foe-stats'] },
    },
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
      after: 'Earthquake took more than half of Blissey’s HP. Hit the defense that’s weaker.',
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
        'Your Salamence against two foes and the Easy AI. Everyone is low on HP, so each move must knock the foe out. Check each foe’s Defense and Special Defense first.',
      // Salamence alone, so switching (lesson 6) never comes up, and it outspeeds
      // both foes, so Speed (lesson 7) never decides a turn. Its physical moves
      // don't match its type, and its special moves are equally strong, so:
      // - Donphan (Defense 120, Special Defense 60) takes neutral damage from
      //   all four. Special moves hit its weaker side, and of those, Dragon Claw
      //   matches Salamence's type (lesson 4): it knocks Donphan out; Crunch and
      //   the physical moves (even Earthquake, the strongest) don't.
      // - Blissey (Defense 10, Special Defense 135): physical moves hit its
      //   weaker side, and of those, Brick Break is super effective (lesson 2):
      //   it knocks Blissey out; Earthquake, with more power, doesn't.
      // Salamence starts low, so a wrong pick lets the foe knock it out.
      player: [
        {
          species: 'Salamence',
          moves: ['Dragon Claw', 'Crunch', 'Earthquake', 'Brick Break'],
        },
      ],
      foe: [{ species: 'Donphan', moves: ['Rock Slide'] }, BLISSEY],
      seed: 'course:split:battle',
      hp: { p1: [25], p2: [35, 60] },
      noLuck: true,
      takeaway:
        'Physical moves hit Defense; special moves hit Special Defense. Aim at the weaker one, then pick the best move of that kind.',
      hint: 'Donphan’s Special Defense is lower: use a special move, and Dragon Claw matches Salamence’s type. Blissey’s Defense is tiny: use a physical move, and Brick Break is super effective on it.',
    },
  ],
};
