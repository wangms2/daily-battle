// Unit review: Damage (docs/plan-tutorial-coach.md, step 4b). Practice only,
// mixing lessons 1–5 (knockouts, super effective and resisted, immune,
// same-type bonus, physical and special); the prompts don't say which idea
// applies, so the player has to spot it.
import type { Lesson } from '../../types';

export const reviewDamage: Lesson = {
  id: 'gen3-review-damage',
  format: 'gen3ou',
  number: 5,
  review: true,
  title: 'Damage',
  summary: 'Four positions mixing the damage lessons.',
  steps: [
    {
      kind: 'practice',
      prompt: 'Starmie is low on HP. What now?',
      position: {
        p1: [{ species: 'Starmie', moves: ['Surf', 'Ice Beam', 'Thunderbolt'] }],
        p2: [{ species: 'Gyarados', moves: ['Double-Edge'] }],
        hp: { p1: [35], p2: [60] },
        seed: 'course:review-damage:1',
      },
      foe: 'move Double-Edge',
      answers: [
        {
          choice: 'move Thunderbolt',
          grade: 'best',
          why: 'Electric is strong against both Water and Flying: four times the damage. It knocks Gyarados out.',
        },
        {
          choice: 'move Surf',
          grade: 'wrong',
          why: 'Gyarados is part Water, which resists Water. Surf barely hurts, and Double-Edge knocks Starmie out.',
        },
      ],
      otherwise: 'Thunderbolt is four times as strong here: Electric beats both Water and Flying.',
    },
    {
      kind: 'practice',
      prompt: 'Gengar is low on HP. What now?',
      position: {
        p1: [{ species: 'Metagross', moves: ['Meteor Mash', 'Earthquake'] }],
        p2: [{ species: 'Gengar', moves: ['Fire Punch'] }],
        hp: { p1: [70], p2: [30] },
        seed: 'course:review-damage:2',
      },
      foe: 'move Fire Punch',
      answers: [
        {
          choice: 'move Meteor Mash',
          grade: 'best',
          why: 'Meteor Mash knocks Gengar out.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Gengar’s Levitate keeps it off the ground: Earthquake does nothing, and Fire Punch knocks Metagross out next turn.',
        },
      ],
      otherwise: 'Meteor Mash knocks Gengar out this turn.',
    },
    {
      kind: 'practice',
      prompt: 'What now?',
      position: {
        p1: [{ species: 'Heracross', moves: ['Megahorn', 'Brick Break'] }],
        p2: [{ species: 'Celebi', moves: ['Psychic'] }],
        seed: 'course:review-damage:3',
      },
      foe: 'move Psychic',
      answers: [
        {
          choice: 'move Megahorn',
          grade: 'best',
          why: 'Bug is strong against both Psychic and Grass, and Megahorn matches Heracross’s type: it knocks Celebi out.',
        },
        {
          choice: 'move Brick Break',
          grade: 'wrong',
          why: 'Psychic resists Fighting, so Brick Break barely hurts. Celebi’s next Psychic knocks Heracross out.',
        },
      ],
      otherwise: 'Megahorn: same-type and four times as strong against Celebi.',
    },
    {
      kind: 'practice',
      prompt: 'Forretress has huge Defense. What now?',
      position: {
        p1: [{ species: 'Swampert', moves: ['Surf', 'Earthquake'] }],
        p2: [{ species: 'Forretress', moves: ['Earthquake'] }],
        hp: { p1: [20], p2: [40] },
        seed: 'course:review-damage:4',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'move Surf',
          grade: 'best',
          why: 'Surf is special, so it hits Forretress’s much lower Special Defense.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Earthquake is physical and runs into Forretress’s huge Defense.',
        },
      ],
      otherwise: 'Surf is special: it hits Forretress’s weaker side.',
    },
  ],
};
