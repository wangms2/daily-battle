// Course lesson 7, Speed (docs/plan-tutorial-coach.md, step 4b): the faster
// Pokémon moves first, so a foe that's faster and can knock you out does it
// before your move lands. Builds on lessons 1–6: the way out here is a switch
// (lesson 6) to a teammate that takes the hit. It starts with where to look:
// the foe's card shows its Speed against yours.
import type { Lesson, Mon } from '../../types';

const HERACROSS: Mon = { species: 'Heracross', moves: ['Rock Slide', 'Megahorn'] };
// Drill Peck is strong against both of Heracross's types: it knocks it out from full.
const ZAPDOS: Mon = { species: 'Zapdos', moves: ['Drill Peck'] };
const SNORLAX: Mon = { species: 'Snorlax', moves: ['Body Slam', 'Ice Beam'] };
const TYRANITAR: Mon = { species: 'Tyranitar', moves: ['Rock Slide'] };
const JOLTEON: Mon = { species: 'Jolteon', moves: ['Thunderbolt'] };
const GENGAR: Mon = { species: 'Gengar', moves: ['Psychic', 'Ice Punch'] };

export const speed: Lesson = {
  id: 'gen3-speed-course',
  draft: true,
  format: 'gen3ou',
  number: 7,
  title: 'Speed',
  summary: 'The faster Pokémon moves first.',
  steps: [
    {
      kind: 'demo',
      position: { p1: [HERACROSS, SNORLAX], p2: [ZAPDOS], seed: 'course:speed:look1' },
      card: 'foe',
      before:
        'Tap a foe to see its Speed. Zapdos’s is 257, and Heracross’s is 227: Zapdos moves first.',
      spotlight: { before: ['foe-speed'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [JOLTEON],
        p2: [GENGAR],
        hp: { p1: [30], p2: [30] },
        seed: 'course:speed:demo1',
      },
      turn: { p1: 'move Thunderbolt', p2: 'move Psychic' },
      before: 'Jolteon and Gengar can each knock the other out. Jolteon is faster.',
      after: 'The faster Pokémon moves first: Gengar went down before it could move.',
      spotlight: { before: ['you-plate', 'foe-plate'], after: ['log'] },
    },
    {
      kind: 'demo',
      // Snorlax on the bench, so the battle goes on after Heracross falls.
      position: { p1: [HERACROSS, SNORLAX], p2: [ZAPDOS], seed: 'course:speed:demo2' },
      turn: { p1: 'move Rock Slide', p2: 'move Drill Peck' },
      whole: true,
      before: 'Rock Slide is strong against Zapdos. But Zapdos is faster.',
      after:
        'Drill Peck is strong against both of Heracross’s types. Heracross went down before Rock Slide could land.',
      spotlight: { before: ['move Rock Slide', 'foe-plate'], after: ['log'] },
    },
    {
      kind: 'demo',
      // A real Zapdos: its sets run from 237 to 328.
      position: { p1: [JOLTEON], p2: [ZAPDOS], seed: 'course:speed:look2' },
      card: 'foe',
      realSets: true,
      before:
        'In a real battle you don’t know the foe’s set, so you see a range. If it could be either, it might go first.',
      spotlight: { before: ['foe-speed'] },
    },
    {
      kind: 'practice',
      prompt: 'Zapdos is faster, and Drill Peck can knock Heracross out. What now?',
      position: {
        p1: [HERACROSS, SNORLAX],
        p2: [ZAPDOS, TYRANITAR],
        seed: 'course:speed:practice1',
      },
      foe: 'move Drill Peck',
      answers: [
        {
          choice: 'switch Snorlax',
          grade: 'best',
          why: 'Snorlax takes Drill Peck easily, and Heracross stays healthy for Tyranitar.',
        },
        {
          choice: 'move Rock Slide',
          grade: 'wrong',
          why: 'Zapdos moves first and knocks Heracross out before Rock Slide lands. Then nothing beats Tyranitar.',
        },
      ],
      otherwise: 'Switch to Snorlax: it takes Drill Peck easily.',
      spotlight: ['foe-plate', 'switch Snorlax'],
    },
    {
      kind: 'practice',
      prompt: 'Jolteon and Gengar are both low on HP. Jolteon is faster. What now?',
      position: {
        p1: [JOLTEON, { species: 'Snorlax', moves: ['Body Slam'] }],
        p2: [GENGAR],
        hp: { p1: [30], p2: [30] },
        seed: 'course:speed:practice2',
      },
      foe: 'move Psychic',
      answers: [
        {
          choice: 'move Thunderbolt',
          grade: 'best',
          why: 'Jolteon moves first, and Thunderbolt knocks Gengar out before it can move.',
        },
        {
          choice: 'switch Snorlax',
          grade: 'wrong',
          why: 'Jolteon was faster and could knock Gengar out. Switching gave Gengar a free hit, and Body Slam can’t touch a Ghost.',
        },
      ],
      otherwise: 'Jolteon is faster: Thunderbolt knocks Gengar out first.',
      spotlight: ['you-plate', 'foe-plate'],
    },
    {
      kind: 'battle',
      intro:
        'Two on two against the Easy AI. Before you attack, ask: is the foe faster, and can it knock you out?',
      player: [HERACROSS, SNORLAX],
      foe: [ZAPDOS, TYRANITAR],
      foeAi: 'easy',
      seed: 'course:speed:battle',
      noLuck: true,
      prompts: [],
      takeaway:
        'The faster Pokémon moves first. If a faster foe can knock you out, your move may never land.',
    },
  ],
};
