import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const setup: Lesson = {
  id: 'gen3-setup',
  format: FORMAT,
  number: 8,
  title: 'Setting up and sweeping',
  summary: 'Boost your stats on a free turn, then knock out the foe’s team.',
  steps: [
    {
      kind: 'card',
      title: 'Stat boosts',
      text: [
        'Some moves raise your own stats. Dragon Dance raises Attack and Speed. Calm Mind raises Special Attack and Special Defense. Swords Dance raises Attack twice.',
        'Each boost is a stage. One stage multiplies the stat by 1.5, two stages by 2, and it keeps going up to six stages.',
      ],
      sprites: ['Salamence', 'Suicune'],
    },
    {
      kind: 'card',
      title: 'When to set up',
      text: [
        'Setting up costs a turn. Use it when the foe can’t hurt you much, so you keep your HP.',
        'Boosts disappear when you switch out or faint. Setting up in front of a foe that can knock you out wastes the boost.',
      ],
    },
    {
      kind: 'card',
      title: 'Sweeping',
      text: [
        'A sweep is when one boosted Pokémon knocks out several foes in a row. After a Dragon Dance, Salamence outspeeds and hits much harder than most of the foe’s team.',
        'Calm Mind works the other way round: Suicune gets tougher against special attacks with every boost, so special walls like Blissey struggle to stop it.',
      ],
      sprites: ['Salamence', 'Blissey'],
    },
    {
      kind: 'card',
      title: 'Baton Pass',
      text: [
        'Baton Pass switches out but keeps your stat boosts and hands them to the Pokémon coming in.',
        'A Pokémon can set up safely, then Baton Pass the boosts to a teammate that makes better use of them.',
      ],
      sprites: ['Celebi'],
    },
    {
      kind: 'quiz',
      prompt:
        'Blissey walls special attacks, and her moves barely hurt Suicune. What should Suicune do?',
      position: {
        p1: [{ species: 'Suicune', moves: ['Calm Mind', 'Surf', 'Ice Beam'] }],
        p2: [{ species: 'Blissey', moves: ['Ice Beam', 'Flamethrower', 'Soft-Boiled'] }],
        seed: 'tutorial:gen3-setup:quiz1',
      },
      check: 'outcome',
      answers: [
        {
          choice: 'move Calm Mind',
          grade: 'best',
          why: 'Blissey can’t threaten Suicune, so this is a safe turn to boost. After a few Calm Minds, Surf hits hard enough to beat Soft-Boiled.',
        },
        {
          choice: 'move Surf',
          grade: 'wrong',
          why: 'Unboosted, Surf barely dents Blissey, and Soft-Boiled heals it right back.',
        },
        {
          choice: 'move Ice Beam',
          grade: 'wrong',
          why: 'Unboosted, Ice Beam barely dents Blissey, and Soft-Boiled heals it right back.',
        },
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Gyarados wants to Dragon Dance, but Zapdos is faster and has Thunderbolt. Electric is 4× effective on Gyarados. What should you do?',
      position: {
        p1: [
          { species: 'Gyarados', moves: ['Dragon Dance', 'Double-Edge', 'Earthquake'] },
          { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
          { species: 'Skarmory', moves: ['Drill Peck', 'Toxic'] },
        ],
        p2: [
          { species: 'Zapdos', moves: ['Thunderbolt', 'Drill Peck'] },
          { species: 'Celebi', moves: ['Giga Drain', 'Psychic'] },
        ],
        seed: 'tutorial:gen3-setup:quiz2',
      },
      check: 'outcome',
      answers: [
        {
          choice: 'switch Swampert',
          grade: 'best',
          why: 'Swampert is a Ground type, so it’s immune to Thunderbolt. Gyarados stays healthy to set up later, against a foe that can’t hurt it.',
        },
        {
          choice: 'switch Skarmory',
          grade: 'wrong',
          why: 'Skarmory is part Flying, so Thunderbolt is super effective on it too. Swampert takes no damage at all.',
        },
        {
          choice: 'move Dragon Dance',
          grade: 'wrong',
          why: 'Zapdos moves first and Thunderbolt knocks Gyarados out. The boost is lost before you can use it.',
        },
        {
          choice: 'move Double-Edge',
          grade: 'wrong',
          why: 'Zapdos moves first and Thunderbolt knocks Gyarados out before it can attack.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Zapdos is a Flying type, so it’s immune to Earthquake. And Thunderbolt knocks Gyarados out first.',
        },
      ],
    },
    {
      kind: 'battle',
      intro:
        'Three on three against the Easy AI, with normal luck. Set up on a foe that can’t hurt you, then sweep.',
      player: [
        { species: 'Suicune', moves: ['Calm Mind', 'Surf', 'Ice Beam'] },
        {
          species: 'Salamence',
          moves: ['Dragon Dance', 'Dragon Claw', 'Earthquake', 'Rock Slide'],
        },
        { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
      ],
      foe: [
        { species: 'Blissey', moves: ['Ice Beam', 'Flamethrower', 'Soft-Boiled'] },
        { species: 'Snorlax', moves: ['Body Slam', 'Earthquake', 'Shadow Ball'] },
        { species: 'Skarmory', moves: ['Drill Peck', 'Toxic'] },
      ],
      foeAi: 'easy',
      seed: 'tutorial:gen3-setup:battle',
      noLuck: false,
      prompts: [
        {
          turn: 1,
          text: 'Blissey can barely hurt Suicune. Use Calm Mind to boost while it’s safe.',
        },
        {
          turn: 2,
          text: 'Keep boosting. Each Calm Mind makes Surf hit harder and Suicune tougher.',
        },
        {
          turn: 4,
          text: 'Now attack. If a foe threatens Suicune, switch: Salamence can Dragon Dance on a foe that can’t hurt it.',
        },
      ],
      takeaway:
        'Boost on a turn when the foe can’t hurt you, then attack. Never set up in front of a foe that can knock you out.',
    },
  ],
};
