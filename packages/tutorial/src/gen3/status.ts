import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const status: Lesson = {
  id: 'gen3-status',
  format: FORMAT,
  number: 6,
  title: 'Status',
  summary: 'Burn, paralysis, poison, and sleep: lasting harm from one move.',
  steps: [
    {
      kind: 'card',
      title: 'Status conditions',
      text: [
        'Some moves don’t deal damage. They give the foe a status condition instead: burn, paralysis, poison, or sleep.',
        'Burn, paralysis, and poison last until they’re cured, even if the Pokémon switches out. Sleep wears off after a few turns. A Pokémon can only have one status at a time, so a status move fails on a Pokémon that already has one.',
      ],
    },
    {
      kind: 'card',
      title: 'Burn and paralysis',
      text: [
        'Burn (Will-O-Wisp) halves the target’s Attack, so its physical moves deal half damage. It also loses 1/8 of its HP every turn. Fire types can’t be burned.',
        'Paralysis (Thunder Wave) cuts the target’s Speed to a quarter, and each turn it has a 1-in-4 chance to be unable to move. Thunder Wave is an Electric move, so Ground types are immune.',
      ],
      sprites: ['Gengar', 'Jolteon'],
    },
    {
      kind: 'card',
      title: 'Toxic',
      text: [
        'Toxic badly poisons the target. It loses 1/16 of its HP the first turn, 2/16 the next, then 3/16, and so on. Switching out resets the count, but the poison stays.',
        'Toxic wears down bulky Pokémon that your attacks can’t hurt much. Steel and Poison types can’t be poisoned.',
      ],
      sprites: ['Blissey'],
    },
    {
      kind: 'card',
      title: 'Sleep and Sleep Clause',
      text: [
        'A sleeping Pokémon can’t move for one to four turns. Spore, Hypnosis, and Sleep Powder cause sleep. Each turn the foe stays asleep is a free chance to attack, but it can wake up on any turn.',
        'Sleep Clause: you can only put one of the foe’s Pokémon to sleep at a time. While it’s still asleep, your sleep moves fail on the others.',
      ],
      sprites: ['Breloom'],
    },
    {
      kind: 'quiz',
      prompt:
        'Metagross hits very hard with physical moves. Which of Weezing’s moves should you use?',
      position: {
        p1: [{ species: 'Weezing', moves: ['Will-O-Wisp', 'Toxic', 'Sludge Bomb', 'Haze'] }],
        p2: [
          { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Rock Slide', 'Explosion'] },
        ],
        seed: 'tutorial:gen3-status:quiz1',
      },
      answers: [
        {
          choice: 'move Will-O-Wisp',
          grade: 'best',
          why: 'A burn halves Metagross’s Attack, so its Meteor Mash and Rock Slide only deal half damage. It also loses HP every turn.',
        },
        {
          choice: 'move Toxic',
          grade: 'wrong',
          why: 'Metagross is a Steel type, and Steel types can’t be poisoned. Toxic fails.',
        },
        {
          choice: 'move Sludge Bomb',
          grade: 'wrong',
          why: 'Steel types are immune to Poison moves, so Sludge Bomb does nothing.',
        },
        {
          choice: 'move Haze',
          grade: 'wrong',
          why: 'Haze removes stat boosts, and Metagross doesn’t have any.',
        },
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Blissey has huge HP and Special Defense, so Thunderbolt barely hurts her. What should Jolteon use?',
      position: {
        p1: [{ species: 'Jolteon', moves: ['Toxic', 'Thunder Wave', 'Thunderbolt'] }],
        p2: [
          {
            species: 'Blissey',
            moves: ['Seismic Toss', 'Soft-Boiled', 'Ice Beam', 'Flamethrower'],
          },
        ],
        seed: 'tutorial:gen3-status:quiz2',
      },
      answers: [
        {
          choice: 'move Toxic',
          grade: 'best',
          why: 'Toxic’s damage grows every turn and ignores Blissey’s Special Defense. Soft-Boiled can’t keep up with it for long.',
        },
        {
          choice: 'move Thunder Wave',
          grade: 'wrong',
          why: 'Paralysis slows Blissey, but Jolteon is already much faster, and it does no damage.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Blissey’s Special Defense is so high that Thunderbolt barely scratches her, and Soft-Boiled heals it right back.',
        },
      ],
    },
    {
      kind: 'battle',
      intro:
        'Two on two. Put Snorlax to sleep, and burn Metagross to take the power out of its attacks.',
      player: [
        { species: 'Breloom', moves: ['Spore', 'Sky Uppercut', 'Mach Punch'] },
        { species: 'Dusclops', moves: ['Will-O-Wisp', 'Seismic Toss', 'Ice Beam'] },
      ],
      foe: [
        { species: 'Snorlax', moves: ['Body Slam', 'Earthquake', 'Shadow Ball'] },
        { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Rock Slide'] },
      ],
      foeAi: {
        moves: [
          'move Body Slam',
          'move Body Slam',
          'move Body Slam',
          'move Meteor Mash',
          'move Rock Slide',
          'move Meteor Mash',
          'move Meteor Mash',
          'move Meteor Mash',
          'move Meteor Mash',
        ],
        switches: ['switch Metagross'],
      },
      seed: 'tutorial:gen3-status:battle2',
      noLuck: true,
      prompts: [
        {
          turn: 1,
          text: 'Breloom is faster than Snorlax. Spore puts it to sleep before it can move.',
        },
        {
          turn: 2,
          text: 'Snorlax is asleep and can’t attack. Sky Uppercut is super effective on Normal.',
        },
        {
          turn: 4,
          text: 'Metagross hits hard with physical moves. Switch to Dusclops: it has huge Defense and resists Steel.',
        },
        { turn: 5, text: 'Burn Metagross with Will-O-Wisp to halve its Attack.' },
        {
          turn: 6,
          text: 'Burned, Metagross deals half damage. Bring Breloom back in to finish it.',
        },
      ],
      takeaway:
        'Sleep takes a foe out of the fight for a few turns. Burn halves a physical attacker’s damage for the rest of the battle. Pick the status that fits the foe.',
      intended: {
        moves: [
          'move Spore',
          'move Sky Uppercut',
          'move Sky Uppercut',
          'switch Dusclops',
          'move Will-O-Wisp',
          'switch Breloom',
          'move Sky Uppercut',
          'move Sky Uppercut',
          'move Sky Uppercut',
        ],
      },
    },
  ],
};
