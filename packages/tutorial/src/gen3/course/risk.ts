// Course lesson 9, What can the foe do to you? (docs/plan-tutorial-coach.md,
// step 4b): a foe has more moves than it has shown. Before you switch in,
// check what it likely has (its card's Likely line), not just what you've
// seen. Unlocks the coach's switch-in warnings (switchKo, bigHit). Builds on
// lessons 1–8; prediction stays out.
import type { Lesson, Mon } from '../../types';

// Tyranitar has shown Rock Slide; Earthquake is the move it hasn't.
const TYRANITAR: Mon = { species: 'Tyranitar', moves: ['Rock Slide', 'Earthquake'] };
const SNORLAX: Mon = { species: 'Snorlax', moves: ['Body Slam'] };
const JOLTEON: Mon = { species: 'Jolteon', moves: ['Thunderbolt'] };
const SWAMPERT: Mon = { species: 'Swampert', moves: ['Surf'] };
/** Snorlax leads and Tyranitar shows Rock Slide: the turn before each position. */
const SHOWN = [{ p1: 'move Body Slam', p2: 'move Rock Slide' }];

export const risk: Lesson = {
  id: 'gen3-risk',
  format: 'gen3ou',
  number: 9,
  title: 'What can the foe do to you?',
  summary: 'A foe has more moves than it has shown.',
  steps: [
    {
      kind: 'demo',
      position: {
        p1: [SNORLAX, JOLTEON, SWAMPERT],
        p2: [TYRANITAR],
        rounds: SHOWN,
        seed: 'course:risk:look',
      },
      card: 'foe',
      before:
        'Tyranitar has only used Rock Slide. Its card lists the moves it likely has but hasn’t shown.',
      spotlight: { before: ['foe-likely'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [SNORLAX, JOLTEON, SWAMPERT],
        p2: [TYRANITAR],
        rounds: SHOWN,
        seed: 'course:risk:demo',
      },
      turn: { p1: 'switch Jolteon', p2: 'move Earthquake' },
      whole: true,
      before: 'Jolteon takes Rock Slide fine. Switch it in?',
      after: 'Tyranitar had Earthquake too. Check what a foe likely has, not just what it’s shown.',
      spotlight: { before: ['switch Jolteon'], after: ['log'] },
    },
    {
      kind: 'practice',
      prompt: 'Salamence has only used Dragon Claw, and Magneton resists it. What now?',
      position: {
        p1: [
          { species: 'Magneton', moves: ['Thunderbolt'] },
          { species: 'Skarmory', moves: ['Drill Peck'] },
        ],
        // Magneton is the one for Starmie, so it's worth keeping.
        p2: [
          { species: 'Salamence', moves: ['Dragon Claw', 'Earthquake'] },
          { species: 'Starmie', moves: ['Surf'] },
        ],
        rounds: [{ p1: 'move Thunderbolt', p2: 'move Dragon Claw' }],
        seed: 'course:risk:magneton',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'switch Skarmory',
          grade: 'best',
          why: 'Salamence likely has Earthquake, four times the damage on Magneton. Skarmory takes nothing from it.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Salamence is faster and likely has Earthquake: it knocks Magneton out before Thunderbolt lands.',
        },
      ],
      otherwise:
        'Salamence likely has Earthquake. Switch to Skarmory, which takes nothing from it.',
      spotlight: ['foe-plate'],
    },
    {
      kind: 'practice',
      prompt: 'Salamence has only used Dragon Claw. Who do you switch in?',
      position: {
        p1: [
          { species: 'Celebi', moves: ['Psychic'] },
          { species: 'Magneton', moves: ['Thunderbolt'] },
          { species: 'Skarmory', moves: ['Drill Peck'] },
        ],
        // Magneton is the one for Starmie, so it's worth keeping.
        p2: [
          { species: 'Salamence', moves: ['Dragon Claw', 'Earthquake'] },
          { species: 'Starmie', moves: ['Surf'] },
        ],
        rounds: [{ p1: 'move Psychic', p2: 'move Dragon Claw' }],
        hp: { p1: [30] },
        seed: 'course:risk:practice2',
      },
      foe: 'move Earthquake',
      answers: [
        {
          choice: 'switch Skarmory',
          grade: 'best',
          why: 'Skarmory resists Dragon, and Flying types take nothing from Earthquake.',
        },
        {
          choice: 'switch Magneton',
          grade: 'wrong',
          why: 'Magneton resists Dragon Claw, but Salamence likely has Earthquake: four times the damage on Magneton.',
        },
      ],
      otherwise: 'Skarmory takes Dragon Claw and Earthquake well.',
      spotlight: ['foe-plate'],
    },
    {
      kind: 'battle',
      intro:
        'Three on three against the Easy AI. Before you switch in, check the foe’s card: what it likely has, not just what it’s shown.',
      player: [
        { species: 'Swampert', moves: ['Surf', 'Earthquake'] },
        { species: 'Skarmory', moves: ['Drill Peck'] },
        { species: 'Jolteon', moves: ['Thunderbolt'] },
      ],
      foe: [
        TYRANITAR,
        { species: 'Salamence', moves: ['Dragon Claw', 'Earthquake'] },
        { species: 'Starmie', moves: ['Surf', 'Thunderbolt'] },
      ],
      seed: 'course:risk:battle',
      noLuck: true,
      takeaway:
        'A foe has four moves, and you’ve seen only some. Before you switch in, check what it likely has.',
    },
  ],
};
