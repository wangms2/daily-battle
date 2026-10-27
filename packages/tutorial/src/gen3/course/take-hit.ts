// Course lesson 10, Switch to take the hit (docs/plan-tutorial-coach.md, step
// 4b): when the foe's best hit would knock you out, and you can't knock it
// out first, switch to the teammate that takes that hit. Unlocks the coach's
// staysKo warning. Builds on lessons 1–9 (what it has shown, and likely has).
import type { Lesson, Mon } from '../../types';

const CELEBI: Mon = { species: 'Celebi', moves: ['Giga Drain'] };
const SKARMORY: Mon = { species: 'Skarmory', moves: ['Drill Peck'] };
const HERACROSS: Mon = { species: 'Heracross', moves: ['Megahorn'] };
// Celebi is the one for Swampert, so it's worth keeping.
const SWAMPERT: Mon = { species: 'Swampert', moves: ['Surf'] };

export const takeHit: Lesson = {
  id: 'gen3-take-hit',
  format: 'gen3ou',
  number: 10,
  title: 'Switch to take the hit',
  summary: 'Swap in the teammate that takes the foe’s best hit.',
  steps: [
    {
      kind: 'demo',
      position: {
        p1: [CELEBI, SKARMORY],
        p2: [HERACROSS, SWAMPERT],
        seed: 'course:take-hit:demo1',
      },
      turn: { p1: 'move Giga Drain', p2: 'move Megahorn' },
      whole: true,
      before: 'Bug is strong against both of Celebi’s types. Stay in and attack?',
      after: 'Megahorn knocked Celebi out, and Giga Drain barely hurt Heracross.',
      spotlight: { before: ['move Giga Drain', 'you-types'], after: ['log'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [CELEBI, SKARMORY],
        p2: [HERACROSS, SWAMPERT],
        seed: 'course:take-hit:demo2',
      },
      turn: { p1: 'switch Skarmory', p2: 'move Megahorn' },
      whole: true,
      before: 'Skarmory is Steel and Flying: both resist Bug.',
      after: 'Skarmory took the hit for a quarter of the damage, and Celebi is safe for Swampert.',
      spotlight: { before: ['switch Skarmory'], after: ['you-hp', 'log'] },
    },
    {
      kind: 'practice',
      prompt: 'What now?',
      position: {
        p1: [CELEBI, SKARMORY],
        p2: [HERACROSS, SWAMPERT],
        // Skarmory alone can't also handle Swampert.
        hp: { p1: [null, 40] },
        seed: 'course:take-hit:practice1',
      },
      foe: 'move Megahorn',
      answers: [
        {
          choice: 'switch Skarmory',
          grade: 'best',
          why: 'Skarmory takes Megahorn for a quarter of the damage, and Drill Peck hits Heracross hard. Celebi stays healthy for Swampert.',
        },
        {
          choice: 'move Giga Drain',
          grade: 'wrong',
          why: 'Megahorn knocks Celebi out, and Giga Drain barely hurts Heracross. Then nothing beats Swampert.',
        },
      ],
      otherwise: 'Switch to Skarmory: it takes Megahorn easily.',
    },
    {
      kind: 'practice',
      prompt: 'Gengar is low. What now?',
      position: {
        p1: [
          { species: 'Gengar', moves: ['Thunderbolt'] },
          { species: 'Machamp', moves: ['Cross Chop'] },
        ],
        // Gengar is the one for Starmie, so it's worth keeping.
        p2: [
          { species: 'Tyranitar', moves: ['Crunch'] },
          { species: 'Starmie', moves: ['Surf'] },
        ],
        hp: { p1: [60] },
        seed: 'course:take-hit:practice2',
      },
      foe: 'move Crunch',
      answers: [
        {
          choice: 'switch Machamp',
          grade: 'best',
          why: 'Machamp resists Dark, and Fighting is strong against both of Tyranitar’s types. Gengar stays healthy for Starmie.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Thunderbolt doesn’t knock Tyranitar out, and Crunch knocks Gengar out.',
        },
      ],
      otherwise: 'Switch to Machamp: it takes Crunch well and hits Tyranitar hard.',
    },
    {
      kind: 'battle',
      intro:
        'Three on three against the Easy AI. When the foe’s best hit would knock you out, switch to the teammate that takes it.',
      player: [
        { species: 'Celebi', moves: ['Giga Drain', 'Psychic'] },
        SKARMORY,
        { species: 'Machamp', moves: ['Cross Chop', 'Rock Slide'] },
      ],
      foe: [HERACROSS, SWAMPERT, { species: 'Tyranitar', moves: ['Crunch', 'Rock Slide'] }],
      seed: 'course:take-hit:battle',
      noLuck: true,
      takeaway:
        'If the foe’s best hit would knock you out and you can’t knock it out first, switch to the teammate that takes it.',
      hint: 'When the foe’s best hit would knock you out, switch to the teammate that takes it, then hit back.',
    },
  ],
};
