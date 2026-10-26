import { effective } from './course/effective';
import { immune } from './course/immune';
import { split as splitCourse } from './course/split';
import { stab } from './course/stab';
import { turn } from './course/turn';
import type { Lesson } from '../types';
import { speed } from './speed';
import { status } from './status';
import { spikes } from './spikes';
import { setup } from './setup';
import { items } from './items';
import { roles } from './roles';
import { leads } from './leads';
import { winning } from './winning';
import { graduation } from './graduation';
import { switching } from './switching';

const FORMAT = 'gen3ou';

const basics: Lesson = {
  id: 'gen3-basics',
  format: FORMAT,
  number: 1,
  title: 'Battle basics',
  summary: 'Six Pokémon each, one out at a time. Each turn, attack or switch.',
  steps: [
    {
      kind: 'card',
      title: 'How a battle works',
      text: [
        'You and your opponent each bring a team of six Pokémon. One Pokémon from each side is out at a time. This is a singles battle.',
        'Every turn, both players choose at the same time: use one of your Pokémon’s moves, or switch it out for another team member. Then the turn plays out.',
      ],
    },
    {
      kind: 'card',
      title: 'HP and fainting',
      text: [
        'Each Pokémon has an HP bar. Attacks lower it. When it reaches zero, the Pokémon faints and can’t battle again, and its trainer sends in another one.',
        'You win when every Pokémon on the other team has fainted.',
      ],
    },
    {
      kind: 'card',
      title: 'Moves',
      text: [
        'Each Pokémon knows up to four moves. Attacking moves deal damage. Status moves do something else, like healing or putting the foe to sleep.',
        'Usually the faster Pokémon moves first. Lesson 4 covers turn order in detail.',
      ],
      sprites: ['Swampert'],
    },
    {
      kind: 'battle',
      intro: 'Your first battle: your Swampert against an Entei. Pick a move each turn.',
      player: [{ species: 'Swampert', moves: ['Surf', 'Earthquake', 'Ice Beam', 'Protect'] }],
      foe: [{ species: 'Entei', moves: ['Flamethrower', 'Return', 'Fire Blast', 'Calm Mind'] }],
      foeAi: { moves: ['move Flamethrower', 'move Return', 'move Flamethrower'] },
      seed: 'tutorial:gen3-basics:battle',
      noLuck: true,
      prompts: [
        { turn: 1, text: 'Tap one of Swampert’s moves to attack. Your opponent is choosing too.' },
        { turn: 2, text: 'Watch the HP bars. When Entei’s reaches zero, it faints.' },
      ],
      takeaway:
        'Each turn you pick a move or a switch. Knock out every Pokémon on the other side to win.',
      intended: { moves: ['move Surf', 'move Surf', 'move Surf'] },
    },
  ],
};

const types: Lesson = {
  id: 'gen3-types',
  format: FORMAT,
  number: 2,
  title: 'Types',
  summary: 'Super effective, resisted, immune, and the same-type bonus.',
  steps: [
    {
      kind: 'card',
      title: 'Type matchups',
      text: [
        'Every move has a type, and every Pokémon has one or two. Some types are strong against others.',
        'Super effective moves deal 2× damage. Resisted ("not very effective") moves deal ½×. If both of the target’s types are weak to a move, it deals 4×.',
      ],
    },
    {
      kind: 'card',
      title: 'Immunities',
      text: [
        'Some types take no damage at all from a move: Flying from Ground, Ghost from Normal and Fighting, Ground from Electric, Dark from Psychic, and Normal from Ghost.',
        'Some abilities do the same. Levitate (Gengar, Flygon, Weezing, Claydol) makes a Pokémon immune to Ground moves, so Earthquake misses them entirely.',
      ],
      sprites: ['Gengar', 'Flygon'],
    },
    {
      kind: 'card',
      title: 'Same-type attack bonus',
      text: [
        'A move that matches one of its user’s types gets a 1.5× boost. This is called STAB (same-type attack bonus).',
        'So a neutral STAB move often beats a neutral move without STAB, even if the second one has a bit more power.',
      ],
    },
    {
      kind: 'quiz',
      prompt: 'Salamence is Dragon/Flying. Which move should Swampert use?',
      check: 'damage',
      position: {
        p1: [{ species: 'Swampert', moves: ['Surf', 'Earthquake', 'Ice Beam', 'Protect'] }],
        p2: [{ species: 'Salamence', setId: 'salamence-dragon-dance' }],
        seed: 'tutorial:gen3-types:quiz1',
      },
      answers: [
        {
          choice: 'move Ice Beam',
          grade: 'best',
          why: 'Ice is super effective on both Dragon and Flying, so it deals 4× damage.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Flying types are immune to Ground moves. Earthquake would do nothing.',
        },
        {
          choice: 'move Surf',
          grade: 'wrong',
          why: 'Dragon resists Water, so Surf only deals ½× damage, even with STAB.',
        },
      ],
      otherwise: 'Protect only blocks one attack. Ice Beam can deal 4× damage instead.',
    },
    {
      kind: 'quiz',
      prompt: 'Gengar is Ghost/Poison with Levitate. What should Metagross use?',
      check: 'damage',
      position: {
        p1: [
          { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Psychic', 'Explosion'] },
        ],
        p2: [{ species: 'Gengar', setId: 'gengar-offensive' }],
        seed: 'tutorial:gen3-types:quiz2',
      },
      answers: [
        {
          choice: 'move Psychic',
          grade: 'best',
          why: 'Psychic is super effective on Poison, and it gets STAB from Metagross’s Psychic type.',
        },
        {
          choice: 'move Meteor Mash',
          grade: 'ok',
          why: 'A strong STAB move, but only neutral on Gengar. Psychic hits harder here.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Levitate makes Gengar immune to Ground moves.',
        },
        {
          choice: 'move Explosion',
          grade: 'wrong',
          why: 'Explosion is a Normal move, and Ghosts are immune. Metagross would faint for nothing.',
        },
      ],
    },
    {
      kind: 'quiz',
      prompt: 'Snorlax is a Normal type. Which move hits Zapdos hardest?',
      check: 'damage',
      position: {
        p1: [{ species: 'Snorlax', moves: ['Body Slam', 'Shadow Ball', 'Earthquake', 'Rest'] }],
        p2: [{ species: 'Zapdos', setId: 'zapdos-mixed' }],
        seed: 'tutorial:gen3-types:quiz3',
      },
      answers: [
        {
          choice: 'move Body Slam',
          grade: 'best',
          why: 'Body Slam is Normal, like Snorlax, so it gets the 1.5× STAB boost.',
        },
        {
          choice: 'move Shadow Ball',
          grade: 'ok',
          why: 'Neutral damage, but without STAB it’s weaker than Body Slam.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Zapdos is part Flying, so it’s immune to Ground moves.',
        },
        {
          choice: 'move Rest',
          grade: 'wrong',
          why: 'Rest heals, but Snorlax is at full HP, so it would fail.',
        },
      ],
    },
    {
      kind: 'battle',
      intro:
        'Two on two. The foe has Gyarados (Water/Flying) and Flygon (Ground/Dragon, with Levitate). Use your types well.',
      player: [
        { species: 'Swampert', moves: ['Surf', 'Earthquake', 'Ice Beam', 'Protect'] },
        {
          species: 'Jolteon',
          moves: ['Thunderbolt', 'Shadow Ball', 'Baton Pass', 'Thunder Wave'],
        },
      ],
      foe: [
        {
          species: 'Gyarados',
          moves: ['Double-Edge', 'Earthquake', 'Dragon Dance', 'Thunder Wave'],
        },
        { species: 'Flygon', moves: ['Earthquake', 'Dragon Claw', 'Fire Blast', 'Rock Slide'] },
      ],
      foeAi: { moves: ['move Double-Edge', 'move Earthquake'], switches: ['switch Flygon'] },
      seed: 'tutorial:gen3-types:battle',
      noLuck: true,
      prompts: [
        {
          turn: 1,
          text: 'Gyarados is Water/Flying: Electric hits it 4×. Switch to Jolteon!',
        },
        { turn: 2, text: 'Now Thunderbolt. Super effective on both of Gyarados’s types.' },
        {
          turn: 3,
          text: 'Flygon is part Ground, so Electric does nothing. And Levitate stops Earthquake. Swampert’s Ice Beam hits it 4×.',
        },
      ],
      takeaway:
        'Check the foe’s types before you attack: find the super effective move, and avoid the ones it’s immune to.',
      intended: {
        moves: [
          'switch Jolteon',
          'move Thunderbolt',
          'switch Swampert',
          'move Ice Beam',
          'move Ice Beam',
        ],
        switches: ['switch Swampert'],
      },
    },
  ],
};

const split: Lesson = {
  id: 'gen3-split',
  format: FORMAT,
  number: 3,
  title: 'Physical and special',
  summary: 'In Gen 3, a move’s type decides which stats it uses.',
  steps: [
    {
      kind: 'card',
      title: 'Two kinds of attack',
      text: [
        'Physical moves use the attacker’s Attack against the target’s Defense. Special moves use Special Attack against Special Defense.',
        'In Gen 3, the move’s type decides which kind it is.',
      ],
    },
    {
      kind: 'card',
      title: 'Which types are which',
      text: [
        'Physical: Normal, Fighting, Flying, Ground, Rock, Bug, Ghost, Poison, Steel.',
        'Special: Fire, Water, Grass, Electric, Ice, Psychic, Dragon, Dark.',
        'So Crunch (Dark) and Dragon Claw (Dragon) are special, while Shadow Ball (Ghost) is physical.',
      ],
    },
    {
      kind: 'card',
      title: 'Using it',
      text: [
        'Prefer moves that use your Pokémon’s stronger attacking stat.',
        'Aim at the foe’s weaker defense. Blissey has huge Special Defense but tiny Defense. Skarmory is the opposite.',
      ],
      sprites: ['Blissey', 'Skarmory'],
    },
    {
      kind: 'quiz',
      prompt:
        'Blissey has very low Defense and very high Special Defense. What should Tyranitar use?',
      check: 'damage',
      position: {
        p1: [{ species: 'Tyranitar', moves: ['Rock Slide', 'Earthquake', 'Crunch', 'Fire Blast'] }],
        p2: [{ species: 'Blissey', setId: 'blissey-utility' }],
        seed: 'tutorial:gen3-split:quiz1',
      },
      answers: [
        {
          choice: 'move Rock Slide',
          grade: 'best',
          why: 'Rock is physical, so it hits Blissey’s weak Defense, with STAB from Tyranitar’s Rock type.',
        },
        {
          choice: 'move Earthquake',
          grade: 'best',
          why: 'Ground is physical, so it targets Blissey’s weak Defense. About as strong as Rock Slide here.',
        },
        {
          choice: 'move Crunch',
          grade: 'wrong',
          why: 'In Gen 3, Dark moves are special. Crunch runs into Blissey’s huge Special Defense.',
        },
        {
          choice: 'move Fire Blast',
          grade: 'wrong',
          why: 'Fire is special, and Tyranitar’s Special Attack is much lower than its Attack.',
        },
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Skarmory (Steel/Flying) has huge Defense but low Special Defense. What should Gengar use?',
      check: 'damage',
      position: {
        p1: [{ species: 'Gengar', moves: ['Thunderbolt', 'Shadow Ball', 'Psychic', 'Giga Drain'] }],
        p2: [{ species: 'Skarmory', setId: 'skarmory-standard' }],
        seed: 'tutorial:gen3-split:quiz2',
      },
      answers: [
        {
          choice: 'move Thunderbolt',
          grade: 'best',
          why: 'Electric is special and super effective on Flying. Gengar’s strong Special Attack hits Skarmory’s weak side.',
        },
        {
          choice: 'move Shadow Ball',
          grade: 'wrong',
          why: 'Ghost is physical in Gen 3, so it uses Gengar’s low Attack against Skarmory’s huge Defense. Steel resists it, too.',
        },
        {
          choice: 'move Psychic',
          grade: 'wrong',
          why: 'Special, but Steel resists Psychic.',
        },
        {
          choice: 'move Giga Drain',
          grade: 'wrong',
          why: 'Special, but Steel and Flying both resist Grass.',
        },
      ],
    },
    {
      kind: 'quiz',
      prompt: 'Snorlax has low Defense and high Special Defense. What should Salamence use?',
      check: 'damage',
      position: {
        p1: [
          {
            species: 'Salamence',
            moves: ['Dragon Claw', 'Earthquake', 'Brick Break', 'Fire Blast'],
          },
        ],
        p2: [{ species: 'Snorlax', setId: 'snorlax-utility-lax' }],
        seed: 'tutorial:gen3-split:quiz3',
      },
      answers: [
        {
          choice: 'move Brick Break',
          grade: 'best',
          why: 'Fighting is physical and super effective on Normal, so it hits Snorlax’s weaker Defense for 2×.',
        },
        {
          choice: 'move Earthquake',
          grade: 'ok',
          why: 'Physical, which is good against Snorlax, but only neutral. Brick Break does more.',
        },
        {
          choice: 'move Dragon Claw',
          grade: 'wrong',
          why: 'Dragon is special in Gen 3, so Dragon Claw hits Snorlax’s high Special Defense.',
        },
        {
          choice: 'move Fire Blast',
          grade: 'wrong',
          why: 'Fire is special, so it runs into Snorlax’s high Special Defense.',
        },
      ],
    },
  ],
};

/** The Gen 3 lessons, in order. */
export const gen3Lessons: Lesson[] = [
  basics,
  types,
  split,
  speed,
  switching,
  status,
  spikes,
  setup,
  items,
  roles,
  leads,
  winning,
  graduation,
  // The redesigned course (step 4b), as drafts until it replaces these.
  turn,
  effective,
  immune,
  stab,
  splitCourse,
];
