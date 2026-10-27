// Course lesson 6, Switching (docs/plan-tutorial-coach.md, step 4b): instead
// of a move you can switch in a teammate. The switch uses your turn, so the
// new Pokémon takes the foe's move. Switch when a teammate does much more to
// the foe. Builds on lessons 1–5: each switch here is away from a move the foe
// is immune to (lesson 3).
import type { Lesson, Mon } from '../../types';

const JOLTEON: Mon = { species: 'Jolteon', moves: ['Thunderbolt'] };
const CELEBI: Mon = { species: 'Celebi', moves: ['Giga Drain'] };
const SWAMPERT: Mon = { species: 'Swampert', moves: ['Earthquake'] };
const SKARMORY: Mon = { species: 'Skarmory', moves: ['Drill Peck'] };

export const switching: Lesson = {
  id: 'gen3-switching-course',
  format: 'gen3ou',
  number: 6,
  title: 'Switching',
  summary: 'Swap in a teammate that does more to the foe.',
  steps: [
    {
      kind: 'demo',
      position: { p1: [JOLTEON, CELEBI], p2: [SWAMPERT], seed: 'course:switching:look' },
      // The player taps it: the card that opens has the Switch button.
      before: 'Tap Celebi below to see its moves and stats. Its card has the Switch button.',
      spotlight: { before: ['switch Celebi'] },
    },
    {
      kind: 'demo',
      position: { p1: [JOLTEON, CELEBI], p2: [SWAMPERT], seed: 'course:switching:demo1' },
      turn: { p1: 'switch Celebi', p2: 'move Earthquake' },
      whole: true,
      before:
        'Swampert is part Ground, so Thunderbolt does nothing. Instead of a move, you can switch.',
      after:
        'Celebi came in and took the Earthquake. A switch uses your turn: the foe still moves.',
      spotlight: { before: ['switch Celebi'], after: ['you-hp', 'log'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [CELEBI, JOLTEON],
        p2: [SWAMPERT],
        hp: { p1: [90] },
        seed: 'course:switching:demo2',
      },
      turn: { p1: 'move Giga Drain', p2: 'move Earthquake' },
      before: 'Grass is strong against both of Swampert’s types, Water and Ground.',
      after: 'Giga Drain hit hard. Celebi does far more to Swampert than Jolteon could.',
      spotlight: { before: ['move Giga Drain', 'foe-types'], after: ['foe-hp'] },
    },
    {
      kind: 'practice',
      prompt: 'Thunderbolt can’t touch Swampert. What now?',
      position: {
        p1: [JOLTEON, CELEBI],
        p2: [SWAMPERT, SKARMORY],
        seed: 'course:switching:practice1',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'switch Celebi',
          grade: 'best',
          why: 'Celebi takes Earthquake well, and Giga Drain hits Swampert hard. Jolteon stays healthy for Skarmory.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Swampert is part Ground, so Thunderbolt does nothing, and Earthquake knocks Jolteon out. Then nothing beats Skarmory.',
        },
      ],
      otherwise: 'Switch to Celebi: Swampert can’t hurt it much, and Giga Drain hits hard.',
      spotlight: ['foe-types'],
    },
    {
      kind: 'practice',
      prompt: 'Thunderbolt can’t touch Swampert, and Earthquake hits Magneton hard. What now?',
      position: {
        p1: [
          { species: 'Magneton', moves: ['Thunderbolt'] },
          // Gyarados is part Flying, and its Hidden Power is a Grass move.
          { species: 'Gyarados', moves: ['Hidden Power Grass'] },
        ],
        p2: [SWAMPERT, SKARMORY],
        seed: 'course:switching:practice2',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'switch Gyarados',
          grade: 'best',
          why: 'Gyarados is part Flying, so Earthquake does nothing to it. Its Hidden Power is a Grass move: strong against both of Swampert’s types. Magneton stays healthy for Skarmory.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Thunderbolt does nothing to Swampert, and Earthquake knocks Magneton out. Then nothing beats Skarmory.',
        },
      ],
      otherwise: 'Switch to Gyarados: Earthquake does nothing to it.',
      spotlight: ['foe-types'],
    },
    {
      kind: 'battle',
      intro:
        'Two on two against the Easy AI. When your Pokémon can’t hurt the foe, switch to one that can.',
      player: [
        { species: 'Jolteon', moves: ['Thunderbolt', 'Shadow Ball'] },
        { species: 'Celebi', moves: ['Giga Drain', 'Psychic'] },
      ],
      foe: [SWAMPERT, SKARMORY],
      seed: 'course:switching:battle',
      noLuck: true,
      takeaway:
        'A switch uses your turn, and the new Pokémon takes the foe’s move. Switch to the teammate that does more.',
      hint: 'Thunderbolt does nothing to Swampert. Switch to Celebi: Giga Drain hits Swampert 4×.',
    },
  ],
};
