import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const items: Lesson = {
  id: 'gen3-items',
  format: FORMAT,
  number: 9,
  title: 'Items',
  summary: 'Leftovers, Choice Band, and Lum Berry: what each one is for.',
  steps: [
    {
      kind: 'card',
      title: 'Held items',
      text: [
        'Each Pokémon holds one item that works on its own during battle. You don’t use it like a move.',
        'The foe’s items are hidden. You learn one when it does something, like a berry being eaten or Leftovers healing.',
      ],
    },
    {
      kind: 'card',
      title: 'Leftovers',
      text: [
        'Leftovers heals 1/16 of max HP at the end of every turn. It’s the most common item, because it helps any Pokémon that stays in for a while.',
      ],
      sprites: ['Snorlax', 'Skarmory'],
    },
    {
      kind: 'card',
      title: 'Choice Band',
      text: [
        'Choice Band raises Attack by half, so physical moves hit much harder.',
        'The catch: the holder is locked into the first move it uses. It can only use that move until it switches out. If the foe switches to a Pokémon that resists it, switch out too.',
      ],
      sprites: ['Heracross', 'Salamence'],
    },
    {
      kind: 'card',
      title: 'Lum Berry',
      text: [
        'Lum Berry cures any status condition the moment it’s inflicted. Then it’s used up.',
        'It lets a Pokémon shrug off one burn, paralysis, poison, or sleep. Against a Lum Berry holder, your first status move is wasted.',
      ],
      sprites: ['Salamence'],
    },
    {
      kind: 'quiz',
      prompt:
        'Your Heracross holds a Choice Band and used Megahorn, so it’s locked into Megahorn. The foe switched to Skarmory, which resists Bug and is faster. What should you do?',
      position: {
        p1: [
          {
            species: 'Heracross',
            item: 'Choice Band',
            moves: ['Megahorn', 'Brick Break', 'Rock Slide', 'Earthquake'],
          },
          { species: 'Zapdos', moves: ['Thunderbolt', 'Drill Peck'] },
        ],
        p2: [
          { species: 'Celebi', moves: ['Giga Drain', 'Psychic'] },
          { species: 'Skarmory', moves: ['Drill Peck', 'Toxic'] },
        ],
        seed: 'tutorial:gen3-items:quiz1',
        rounds: [{ p1: 'move Megahorn', p2: 'switch Skarmory' }],
      },
      check: 'outcome',
      answers: [
        {
          choice: 'switch Zapdos',
          grade: 'best',
          why: 'Switching out ends the lock. Zapdos takes Drill Peck well and threatens Skarmory with super-effective Thunderbolt.',
        },
        {
          choice: 'move Megahorn',
          grade: 'wrong',
          why: 'Heracross can only use Megahorn, which Skarmory resists. Meanwhile Skarmory’s Drill Peck is super effective on Heracross.',
        },
      ],
    },
    {
      kind: 'battle',
      intro:
        'Three on three against the Easy AI. Watch your items work: Heracross’s Choice Band, and Zapdos and Snorlax’s Leftovers.',
      player: [
        {
          species: 'Heracross',
          item: 'Choice Band',
          moves: ['Megahorn', 'Brick Break', 'Rock Slide', 'Earthquake'],
        },
        { species: 'Zapdos', item: 'Leftovers', moves: ['Thunderbolt', 'Drill Peck'] },
        {
          species: 'Snorlax',
          item: 'Leftovers',
          moves: ['Body Slam', 'Earthquake', 'Shadow Ball'],
        },
      ],
      foe: [
        { species: 'Celebi', item: 'Leftovers', moves: ['Giga Drain', 'Psychic'] },
        { species: 'Skarmory', item: 'Leftovers', moves: ['Drill Peck', 'Toxic'] },
        {
          species: 'Metagross',
          item: 'Choice Band',
          moves: ['Meteor Mash', 'Earthquake', 'Rock Slide'],
        },
      ],
      foeAi: 'easy',
      seed: 'tutorial:gen3-items:battle',
      noLuck: false,
      prompts: [
        {
          turn: 1,
          text: 'Megahorn is super effective on Celebi, and Choice Band makes it hit even harder.',
        },
        {
          turn: 2,
          text: 'Heracross is locked into its first move. If the foe brings in a Pokémon that resists it, switch.',
        },
        {
          turn: 3,
          text: 'See the HP coming back at the end of each turn? That’s Leftovers.',
        },
      ],
      takeaway:
        'Leftovers heals a little every turn. Choice Band hits hard but locks you into one move until you switch. Lum Berry cures one status.',
    },
  ],
};
