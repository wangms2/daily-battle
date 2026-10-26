import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const winning: Lesson = {
  id: 'gen3-winning',
  format: FORMAT,
  number: 12,
  title: 'Planning to win',
  summary:
    'Protect the Pokémon that can win, expect moves the foe hasn’t used yet, and close out the game.',
  steps: [
    {
      kind: 'card',
      title: 'Your win condition',
      text: [
        'Your win condition is the Pokémon most likely to win the game for you, often a sweeper like Salamence.',
        'Keep it healthy. Don’t let it take hits it doesn’t need to. Switch it out from foes that threaten it, and bring it back when it can do damage.',
      ],
      sprites: ['Salamence'],
    },
    {
      kind: 'quiz',
      prompt:
        'Salamence is your win condition: once Blissey is gone, nothing on the foe’s team can stop it. Blissey is in, and her Ice Beam does 4× damage to Salamence. What should you do?',
      position: {
        p1: [
          { species: 'Salamence', moves: ['Dragon Dance', 'Dragon Claw', 'Earthquake'] },
          { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Rock Slide'] },
        ],
        p2: [
          { species: 'Blissey', moves: ['Ice Beam', 'Seismic Toss'] },
          { species: 'Snorlax', moves: ['Body Slam', 'Shadow Ball'] },
        ],
        seed: 'tutorial:gen3-winning:quiz1',
      },
      check: 'outcome',
      answers: [
        {
          choice: 'switch Metagross',
          grade: 'best',
          why: 'Metagross resists Ice and can wear Blissey down. Salamence stays healthy for when Blissey is gone.',
        },
        {
          choice: 'move Dragon Dance',
          grade: 'wrong',
          why: 'Blissey’s Ice Beam does 4× damage, so Salamence loses most of its HP for one boost. Don’t risk your win condition.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Blissey has so much HP that Earthquake can’t knock her out, and her Ice Beam does 4× damage back.',
        },
        {
          choice: 'move Dragon Claw',
          grade: 'wrong',
          why: 'Blissey has so much HP that Dragon Claw can’t knock her out, and her Ice Beam does 4× damage back.',
        },
      ],
    },
    {
      kind: 'card',
      title: 'Moves you haven’t seen yet',
      text: [
        'A foe usually has four moves, but you only see one when it’s used. Before you switch in, think about what else it might carry.',
        'With Beginner hints on, tap a foe Pokémon in battle to see the sets it might have.',
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Breloom fainted to Celebi’s Psychic. Celebi has only used Psychic so far, but it almost always carries a Grass move like Giga Drain too. Who do you send in?',
      position: {
        p1: [
          { species: 'Breloom', moves: ['Sky Uppercut', 'Mach Punch'] },
          { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
          { species: 'Skarmory', moves: ['Drill Peck', 'Spikes'] },
        ],
        p2: [
          { species: 'Celebi', moves: ['Psychic', 'Giga Drain', 'Leech Seed'] },
          { species: 'Snorlax', moves: ['Body Slam', 'Shadow Ball'] },
        ],
        seed: 'tutorial:gen3-winning:quiz2',
        rounds: [{ p1: 'move Sky Uppercut', p2: 'move Psychic' }],
      },
      check: 'outcome',
      answers: [
        {
          choice: 'switch Skarmory',
          grade: 'best',
          why: 'Skarmory resists both Grass and Psychic, and Drill Peck is super effective on Celebi.',
        },
        {
          choice: 'switch Swampert',
          grade: 'wrong',
          why: 'Celebi hasn’t used a Grass move yet, but it very likely has one. Giga Drain does 4× damage to Swampert.',
        },
      ],
    },
    {
      kind: 'card',
      title: 'Closing out the game',
      text: [
        'Near the end, count. How much HP does each side have left, who moves first, and who can knock out whom?',
        'If you’re faster and your attack knocks out the foe’s last Pokémon, just take the win. Don’t give the foe another turn.',
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Gyarados is the foe’s last Pokémon, and Starmie is your last. Starmie is low on HP, but it’s faster. What should you do?',
      position: {
        p1: [{ species: 'Starmie', moves: ['Surf', 'Thunderbolt', 'Recover'] }],
        p2: [{ species: 'Gyarados', moves: ['Double-Edge', 'Earthquake'] }],
        seed: 'tutorial:gen3-winning:quiz3',
        rounds: [
          { p1: 'move Surf', p2: 'move Double-Edge' },
          { p1: 'move Surf', p2: 'move Double-Edge' },
        ],
      },
      check: 'outcome',
      foeAi: { moves: ['move Double-Edge', 'move Double-Edge', 'move Double-Edge'] },
      answers: [
        {
          choice: 'move Thunderbolt',
          grade: 'best',
          why: 'Starmie moves first, and Thunderbolt does 4× damage to Gyarados. It knocks Gyarados out and the game is won.',
        },
        {
          choice: 'move Recover',
          grade: 'ok',
          why: 'Recover keeps Starmie alive, but it gives Gyarados another attack for nothing. You’re faster and can knock it out now, so take the win.',
        },
        {
          choice: 'move Surf',
          grade: 'wrong',
          why: 'Gyarados is a Water type, so it resists Surf. It survives and knocks Starmie out. Thunderbolt does 4× damage instead.',
        },
      ],
    },
  ],
};
