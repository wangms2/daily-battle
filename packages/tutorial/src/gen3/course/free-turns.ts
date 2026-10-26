// Course lesson 11, Free turns (docs/plan-tutorial-coach.md, step 4b): a turn
// the foe can't hurt you much is a free turn. Use it: hit as hard as you can,
// or heal. (Spikes and setting up come back to it in lessons 14 and 15.)
// Unlocks the coach's noHeal warning. Builds on lessons 1–10.
import type { Lesson, Mon } from '../../types';

const FLYGON: Mon = { species: 'Flygon', moves: ['Rock Slide', 'Earthquake'] };
// Zapdos has only Thunderbolt, and Flygon is part Ground.
const ZAPDOS: Mon = { species: 'Zapdos', moves: ['Thunderbolt'] };
const BLISSEY: Mon = { species: 'Blissey', moves: ['Soft-Boiled', 'Seismic Toss'] };
// Starmie's Surf barely dents Blissey's huge Special Defense.
const STARMIE: Mon = { species: 'Starmie', moves: ['Surf'] };

export const freeTurns: Lesson = {
  id: 'gen3-free-turns',
  format: 'gen3ou',
  number: 11,
  title: 'Free turns',
  summary: 'When the foe can’t hurt you much, make the turn count.',
  steps: [
    {
      kind: 'demo',
      position: { p1: [FLYGON], p2: [ZAPDOS], seed: 'course:free-turns:demo1' },
      turn: { p1: 'move Rock Slide', p2: 'move Thunderbolt' },
      whole: true,
      before: 'Zapdos has only Thunderbolt, and Flygon is part Ground.',
      after: 'Thunderbolt did nothing: a free turn. Flygon used it to hit as hard as it could.',
      spotlight: { before: ['you-types', 'move Rock Slide'], after: ['log'] },
    },
    {
      kind: 'demo',
      position: { p1: [BLISSEY], p2: [STARMIE], hp: { p1: [45] }, seed: 'course:free-turns:demo2' },
      turn: { p1: 'move Soft-Boiled', p2: 'move Surf' },
      whole: true,
      before: 'Starmie can barely hurt Blissey, and Blissey is low. A free turn to heal.',
      after: 'Surf took only a little, and Soft-Boiled healed half of Blissey’s HP.',
      spotlight: { before: ['move Soft-Boiled'], after: ['you-hp'] },
    },
    {
      kind: 'practice',
      prompt: 'Blissey is low. What now?',
      position: {
        p1: [BLISSEY],
        p2: [STARMIE],
        hp: { p1: [25] },
        seed: 'course:free-turns:practice1',
      },
      foe: 'move Surf',
      answers: [
        {
          choice: 'move Soft-Boiled',
          grade: 'best',
          why: 'Starmie can barely hurt Blissey: a free turn to heal. Blissey outlasts it.',
        },
        {
          choice: 'move Seismic Toss',
          grade: 'wrong',
          why: 'Starmie can barely hurt Blissey, so this was a free turn to heal. Low on HP, Blissey falls first.',
        },
      ],
      otherwise: 'Heal with Soft-Boiled: Starmie can barely hurt Blissey.',
    },
    {
      kind: 'practice',
      prompt: 'Celebi is low. What now?',
      position: {
        p1: [{ species: 'Celebi', moves: ['Recover', 'Psychic'] }],
        // Grass resists Ground: Earthquake barely hurts Celebi, but Swampert has lots of HP.
        p2: [{ species: 'Swampert', moves: ['Earthquake'] }],
        hp: { p1: [15] },
        seed: 'course:free-turns:practice2',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'move Recover',
          grade: 'best',
          why: 'Swampert can barely hurt Celebi: a free turn to heal. Celebi outlasts it.',
        },
        {
          choice: 'move Psychic',
          grade: 'wrong',
          why: 'Swampert can barely hurt Celebi, so this was a free turn to heal. Low on HP, Celebi falls first.',
        },
      ],
      otherwise: 'Heal with Recover: Swampert can barely hurt Celebi.',
    },
    {
      kind: 'battle',
      intro:
        'Three on three against the Easy AI. When the foe can’t hurt you much, make the turn count: hit hard, or heal.',
      player: [FLYGON, BLISSEY, { species: 'Swampert', moves: ['Surf', 'Earthquake'] }],
      foe: [
        ZAPDOS,
        { species: 'Starmie', moves: ['Surf', 'Ice Beam'] },
        { species: 'Tyranitar', moves: ['Rock Slide', 'Crunch'] },
      ],
      seed: 'course:free-turns:battle',
      noLuck: true,
      takeaway: 'A turn the foe can’t hurt you is a free turn. Hit as hard as you can, or heal.',
    },
  ],
};
