import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const switching: Lesson = {
  id: 'gen3-switching',
  format: FORMAT,
  number: 5,
  title: 'Switching',
  summary: 'Switch to a Pokémon that can take the hit, then hit back.',
  steps: [
    {
      kind: 'card',
      title: 'Why switch?',
      text: [
        'Your Pokémon doesn’t have to stay in a bad matchup. If the foe threatens a super effective hit, switch to a teammate that resists it, or better, is immune.',
        'The switch happens first, so your new Pokémon takes the attack instead. A resisted hit does little, and an immune one does nothing.',
      ],
    },
    {
      kind: 'card',
      title: 'Free turns',
      text: [
        'When the foe’s attack does nothing, you’ve gained a free turn: you took no damage, and now you choose your next move from a good position.',
        'Use it to bring in the Pokémon that hits the foe hardest, or to attack right away.',
      ],
      sprites: ['Skarmory', 'Celebi'],
    },
    {
      kind: 'card',
      title: 'Your first prediction',
      text: [
        'You don’t know what the foe will pick, but you can guess. A foe usually uses its best move against your Pokémon: if Swampert faces Jolteon, expect Earthquake.',
        'So switch to the teammate that handles that move. That’s all prediction is at first: thinking about what the foe wants to do.',
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Swampert’s Earthquake would knock Jolteon out, and Swampert is immune to Thunderbolt. What should you do?',
      check: 'outcome',
      position: {
        p1: [
          { species: 'Jolteon', moves: ['Thunderbolt', 'Shadow Ball'] },
          { species: 'Skarmory', moves: ['Drill Peck', 'Steel Wing', 'Return', 'Aerial Ace'] },
          { species: 'Celebi', moves: ['Giga Drain', 'Psychic', 'Recover'] },
        ],
        p2: [{ species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] }],
        seed: 'tutorial:gen3-switching:quiz1',
      },
      foeAi: { moves: ['move Earthquake'] },
      answers: [
        {
          choice: 'switch Skarmory',
          grade: 'best',
          why: 'Skarmory is part Flying, so it’s immune to Earthquake and takes no damage at all. From there you can attack, or switch again to Celebi to hit Swampert hard.',
        },
        {
          choice: 'switch Celebi',
          grade: 'ok',
          why: 'Celebi resists Ground and hits Swampert 4× with Giga Drain. It takes a little damage, though, and Swampert’s Ice Beam hits it hard.',
        },
        {
          choice: 'move Thunderbolt',
          grade: 'wrong',
          why: 'Swampert is part Ground, so it’s immune to Electric. Then Earthquake knocks Jolteon out.',
        },
        {
          choice: 'move Shadow Ball',
          grade: 'wrong',
          why: 'Shadow Ball barely scratches Swampert, and Earthquake knocks Jolteon out.',
        },
      ],
    },
    {
      kind: 'battle',
      intro:
        'Three on three. Each foe has a big attack against one of your Pokémon, and each of your Pokémon is good against one foe. Switch to the right one.',
      player: [
        { species: 'Jolteon', moves: ['Thunderbolt', 'Shadow Ball'] },
        { species: 'Skarmory', moves: ['Drill Peck', 'Steel Wing', 'Return', 'Aerial Ace'] },
        { species: 'Celebi', moves: ['Giga Drain', 'Psychic', 'Recover'] },
      ],
      foe: [
        { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
        { species: 'Heracross', moves: ['Megahorn', 'Brick Break', 'Rock Slide'] },
        { species: 'Gyarados', moves: ['Double-Edge', 'Earthquake', 'Hydro Pump'] },
      ],
      foeAi: {
        moves: [
          'move Earthquake',
          'move Surf',
          'move Ice Beam',
          'move Ice Beam',
          'move Megahorn',
          'move Rock Slide',
          'move Double-Edge',
          'move Earthquake',
        ],
        switches: ['switch Heracross', 'switch Gyarados'],
      },
      seed: 'tutorial:gen3-switching:battle',
      noLuck: true,
      prompts: [
        {
          turn: 1,
          text: 'Swampert will want to Earthquake Jolteon. Skarmory is immune to Ground: switch to it!',
        },
        {
          turn: 2,
          text: 'A free turn! Celebi resists Water and Ground, and Giga Drain hits Swampert 4×. Switch to Celebi.',
        },
        { turn: 3, text: 'Now attack: Giga Drain. It also heals Celebi a little.' },
        {
          turn: 5,
          text: 'Heracross’s Megahorn is super effective on Celebi. Skarmory resists Bug and Fighting, and Drill Peck hits Heracross 4×.',
        },
        {
          turn: 7,
          text: 'Gyarados is Water/Flying: Thunderbolt hits it 4×. Switch to Jolteon. It takes one hit coming in, then it’s faster and knocks Gyarados out.',
        },
      ],
      takeaway:
        'Switch to the Pokémon that takes the foe’s best attack well, then hit back with the one that beats it.',
      intended: {
        moves: [
          'switch Skarmory',
          'switch Celebi',
          'move Giga Drain',
          'move Giga Drain',
          'switch Skarmory',
          'move Drill Peck',
          'switch Jolteon',
          'move Thunderbolt',
        ],
      },
    },
  ],
};
