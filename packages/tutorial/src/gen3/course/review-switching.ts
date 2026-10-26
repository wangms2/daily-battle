// Unit review: Switching and turn order (docs/plan-tutorial-coach.md, step 4b).
// Practice only, mixing lessons 6–8 (switching, Speed, priority) with the
// damage lessons before them; the prompts don't say which idea applies.
import type { Lesson } from '../../types';

export const reviewSwitching: Lesson = {
  id: 'gen3-review-switching',
  format: 'gen3ou',
  number: 8,
  review: true,
  title: 'Switching and turn order',
  summary: 'Four positions mixing switching, Speed and priority.',
  steps: [
    {
      kind: 'practice',
      prompt: 'What now?',
      position: {
        p1: [
          { species: 'Magneton', moves: ['Thunderbolt'] },
          { species: 'Exeggutor', moves: ['Giga Drain'] },
        ],
        p2: [
          { species: 'Swampert', moves: ['Earthquake'] },
          { species: 'Skarmory', moves: ['Drill Peck'] },
        ],
        seed: 'course:review-switching:1',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'switch Exeggutor',
          grade: 'best',
          why: 'Exeggutor takes Earthquake well, and Grass is strong against both of Swampert’s types. Magneton stays healthy for Skarmory.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Swampert is part Ground: Thunderbolt does nothing, and Earthquake knocks Magneton out.',
        },
      ],
      otherwise: 'Switch to Exeggutor: it takes Earthquake well.',
    },
    {
      kind: 'practice',
      prompt: 'What now?',
      position: {
        p1: [
          { species: 'Tyranitar', moves: ['Crunch', 'Rock Slide'] },
          { species: 'Gengar', moves: ['Psychic'] },
        ],
        // Alakazam's Psychic beats Gengar: Tyranitar is needed for it.
        p2: [
          { species: 'Heracross', moves: ['Brick Break'] },
          { species: 'Alakazam', moves: ['Psychic'] },
        ],
        seed: 'course:review-switching:2',
      },
      foe: 'move Brick Break',
      answers: [
        {
          choice: 'switch Gengar',
          grade: 'best',
          why: 'Heracross is faster, and Fighting is strong against both of Tyranitar’s types. Gengar is a Ghost: Brick Break does nothing to it. Tyranitar stays healthy for Alakazam.',
        },
        {
          choice: 'move Crunch',
          grade: 'wrong',
          why: 'Heracross is faster: Brick Break knocks Tyranitar out before Crunch lands. Then nothing beats Alakazam.',
        },
      ],
      otherwise: 'Heracross moves first. Switch to Gengar: Brick Break does nothing to a Ghost.',
    },
    {
      kind: 'practice',
      prompt: 'Both are low on HP. What now?',
      position: {
        p1: [{ species: 'Breloom', moves: ['Sky Uppercut', 'Mach Punch'] }],
        p2: [{ species: 'Aerodactyl', moves: ['Aerial Ace'] }],
        hp: { p1: [30], p2: [15] },
        seed: 'course:review-switching:3',
      },
      foe: 'move Aerial Ace',
      answers: [
        {
          choice: 'move Mach Punch',
          grade: 'best',
          why: 'Aerodactyl is faster, but Mach Punch goes first and knocks it out.',
        },
        {
          choice: 'move Sky Uppercut',
          grade: 'wrong',
          why: 'Aerodactyl is faster: Aerial Ace knocks Breloom out before Sky Uppercut lands.',
        },
      ],
      otherwise: 'Mach Punch goes first and knocks Aerodactyl out.',
    },
    {
      kind: 'practice',
      prompt: 'Both are low on HP. What now?',
      position: {
        p1: [
          { species: 'Starmie', moves: ['Psychic'] },
          { species: 'Snorlax', moves: ['Body Slam'] },
        ],
        p2: [{ species: 'Gengar', moves: ['Thunderbolt', 'Ice Punch'] }],
        hp: { p1: [30], p2: [30] },
        seed: 'course:review-switching:4',
      },
      foe: 'move Thunderbolt',
      answers: [
        {
          choice: 'move Psychic',
          grade: 'best',
          why: 'Starmie is faster, and Psychic is strong against Poison: it knocks Gengar out first.',
        },
        {
          choice: 'switch Snorlax',
          grade: 'wrong',
          why: 'Starmie was faster and could knock Gengar out. Switching gave Gengar a free hit, and Body Slam can’t touch a Ghost.',
        },
      ],
      otherwise: 'Starmie is faster: Psychic knocks Gengar out first.',
    },
  ],
};
