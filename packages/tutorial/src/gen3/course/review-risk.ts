// Unit review: Risk and switching (docs/plan-tutorial-coach.md, step 4b).
// Practice only, mixing lessons 9–11 (what the foe likely has, switching to
// take the hit, free turns) with earlier ones; the prompts don't say which
// idea applies.
import type { Lesson } from '../../types';

export const reviewRisk: Lesson = {
  id: 'gen3-review-risk',
  format: 'gen3ou',
  number: 11,
  review: true,
  title: 'Risk and switching',
  summary: 'Four positions mixing risk, switching and free turns.',
  steps: [
    {
      kind: 'practice',
      prompt: 'Aerodactyl is faster. What now?',
      position: {
        p1: [
          { species: 'Magneton', moves: ['Thunderbolt'] },
          { species: 'Skarmory', moves: ['Drill Peck'] },
        ],
        // Magneton is the one for Starmie, so it's worth keeping.
        p2: [
          { species: 'Aerodactyl', moves: ['Rock Slide', 'Earthquake'] },
          { species: 'Starmie', moves: ['Surf'] },
        ],
        seed: 'course:review-risk:1',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'switch Skarmory',
          grade: 'best',
          why: 'Aerodactyl likely has Earthquake, four times the damage on Magneton. Skarmory takes nothing from it, and resists Rock Slide.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Aerodactyl is faster and likely has Earthquake: it knocks Magneton out before Thunderbolt lands.',
        },
      ],
      otherwise: 'Switch to Skarmory: it takes both of Aerodactyl’s likely moves well.',
    },
    {
      kind: 'practice',
      prompt: 'Blissey is low. What now?',
      position: {
        p1: [{ species: 'Blissey', moves: ['Soft-Boiled', 'Seismic Toss'] }],
        p2: [{ species: 'Jolteon', moves: ['Thunderbolt'] }],
        hp: { p1: [20] },
        seed: 'course:review-risk:2',
      },
      foe: 'move Thunderbolt',
      answers: [
        {
          choice: 'move Soft-Boiled',
          grade: 'best',
          why: 'Jolteon can barely hurt Blissey: a free turn to heal.',
        },
        {
          choice: 'move Seismic Toss',
          grade: 'wrong',
          why: 'Jolteon can barely hurt Blissey, so this was a free turn to heal. Low on HP, Blissey falls first.',
        },
      ],
      otherwise: 'Heal with Soft-Boiled: Jolteon can barely hurt Blissey.',
    },
    {
      kind: 'practice',
      prompt: 'What now?',
      position: {
        p1: [
          { species: 'Alakazam', moves: ['Psychic'] },
          { species: 'Machamp', moves: ['Cross Chop'] },
        ],
        // Alakazam is the one for Gengar, so it's worth keeping.
        p2: [
          { species: 'Tyranitar', moves: ['Crunch'] },
          { species: 'Gengar', moves: ['Psychic'] },
        ],
        hp: { p1: [60] },
        seed: 'course:review-risk:3',
      },
      foe: 'move Crunch',
      answers: [
        {
          choice: 'switch Machamp',
          grade: 'best',
          why: 'Machamp resists Dark, and Fighting is strong against both of Tyranitar’s types. Alakazam stays healthy for Gengar.',
        },
        {
          choice: 'move Psychic',
          grade: 'wrong',
          why: 'Tyranitar is part Dark, which takes nothing from Psychic moves, and Crunch knocks Alakazam out.',
        },
      ],
      otherwise: 'Switch to Machamp: it takes Crunch well and hits Tyranitar hard.',
    },
    {
      kind: 'practice',
      prompt: 'Both are low on HP. What now?',
      position: {
        p1: [{ species: 'Linoone', moves: ['Hidden Power Ground', 'Extreme Speed'] }],
        p2: [{ species: 'Jolteon', moves: ['Thunderbolt'] }],
        hp: { p1: [30], p2: [20] },
        seed: 'course:review-risk:4',
      },
      foe: 'move Thunderbolt',
      answers: [
        {
          choice: 'move Extreme Speed',
          grade: 'best',
          why: 'Jolteon is faster, but Extreme Speed goes first and knocks it out.',
        },
        {
          choice: 'move Hidden Power Ground',
          grade: 'wrong',
          why: 'Ground is strong against Electric, but Jolteon is faster: Thunderbolt knocks Linoone out first.',
        },
      ],
      otherwise: 'Extreme Speed goes first and knocks Jolteon out.',
    },
  ],
};
