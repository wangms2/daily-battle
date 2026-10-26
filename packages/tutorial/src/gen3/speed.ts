import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const speed: Lesson = {
  id: 'gen3-speed',
  format: FORMAT,
  number: 4,
  title: 'Speed and priority',
  summary: 'Who moves first, and the moves that always go first.',
  steps: [
    {
      kind: 'card',
      title: 'Turn order',
      text: [
        'Both players choose, then the faster Pokémon moves first. Speed is a stat, like Attack. If two Pokémon have the same Speed, it’s a coin flip.',
        'Moving first matters most when either side can knock the other out: the faster one hits first, and a fainted Pokémon doesn’t get to attack.',
      ],
      sprites: ['Jolteon', 'Snorlax'],
    },
    {
      kind: 'card',
      title: 'Switching goes first',
      text: [
        'Switching always happens before any attack. If you switch, the new Pokémon takes the foe’s attack that turn.',
        'So if a faster foe is about to knock you out, attacking won’t help: you’ll faint first. Switch to something that can take the hit instead.',
      ],
    },
    {
      kind: 'card',
      title: 'Priority moves',
      text: [
        'A few moves have priority: they go before normal moves, whatever the Speed. Extreme Speed, Mach Punch, and Quick Attack are the common ones in Gen 3.',
        'They’re weaker than big attacks, but they let a slower Pokémon hit a faster one first, which is often enough to finish it off.',
      ],
      sprites: ['Linoone', 'Breloom'],
    },
    {
      kind: 'quiz',
      prompt:
        'Zapdos is faster than Heracross, and its Drill Peck hits Heracross 4×. What should you do?',
      check: 'outcome',
      position: {
        p1: [
          {
            species: 'Heracross',
            moves: ['Megahorn', 'Rock Slide', 'Brick Break', 'Swords Dance'],
          },
          { species: 'Snorlax', moves: ['Body Slam', 'Shadow Ball', 'Earthquake', 'Rest'] },
        ],
        p2: [{ species: 'Zapdos', moves: ['Drill Peck', 'Thunderbolt', 'Toxic', 'Rest'] }],
        seed: 'tutorial:gen3-speed:quiz1',
      },
      foeAi: { moves: ['move Drill Peck', 'move Thunderbolt'] },
      answers: [
        {
          choice: 'switch Snorlax',
          grade: 'best',
          why: 'Snorlax takes Drill Peck easily, and its Body Slam hits back hard. Switching happens before Zapdos moves.',
        },
        {
          choice: 'move Rock Slide',
          grade: 'wrong',
          why: 'Rock Slide is super effective, but Zapdos is faster: Drill Peck knocks Heracross out before it can attack.',
        },
        {
          choice: 'move Swords Dance',
          grade: 'wrong',
          why: 'Zapdos moves first and knocks Heracross out, so the boost is wasted.',
        },
      ],
      otherwise:
        'Zapdos is faster and Drill Peck hits Heracross 4×, so Heracross faints before it moves.',
    },
    {
      kind: 'quiz',
      prompt:
        'Houndoom is faster than Breloom, and its Fire Blast would knock Breloom out. Houndoom is low on HP. Which move?',
      check: 'outcome',
      position: {
        p1: [{ species: 'Breloom', moves: ['Mach Punch', 'Sky Uppercut', 'Spore', 'Focus Punch'] }],
        p2: [{ species: 'Houndoom', moves: ['Fire Blast', 'Crunch', 'Will-O-Wisp', 'Pursuit'] }],
        seed: 'tutorial:gen3-speed:quiz2',
        rounds: [{ p1: 'move Mach Punch', p2: 'move Crunch' }],
      },
      foeAi: { moves: ['move Fire Blast', 'move Fire Blast', 'move Fire Blast'] },
      answers: [
        {
          choice: 'move Mach Punch',
          grade: 'best',
          why: 'Mach Punch has priority, so Breloom hits first even though Houndoom is faster. It’s super effective, too.',
        },
        {
          choice: 'move Sky Uppercut',
          grade: 'wrong',
          why: 'Stronger, but it moves at normal speed: Houndoom is faster, and Fire Blast knocks Breloom out first.',
        },
        {
          choice: 'move Focus Punch',
          grade: 'wrong',
          why: 'Focus Punch goes last, and Houndoom’s Fire Blast knocks Breloom out before it.',
        },
      ],
      otherwise:
        'Houndoom moves first and Fire Blast knocks Breloom out. Mach Punch has priority and finishes it.',
    },
    {
      kind: 'battle',
      intro:
        'Your Starmie and Linoone against Camerupt and Alakazam. Use Speed to strike first, and priority when you’re slower.',
      player: [
        { species: 'Starmie', moves: ['Surf', 'Ice Beam', 'Psychic', 'Recover'] },
        { species: 'Linoone', moves: ['Extreme Speed', 'Shadow Ball', 'Belly Drum', 'Rest'] },
      ],
      foe: [
        { species: 'Camerupt', moves: ['Earthquake', 'Fire Blast', 'Rock Slide', 'Explosion'] },
        { species: 'Alakazam', moves: ['Psychic', 'Thunder Punch', 'Fire Punch', 'Calm Mind'] },
      ],
      foeAi: {
        moves: ['move Earthquake', 'move Thunder Punch', 'move Thunder Punch', 'move Psychic'],
        switches: ['switch Alakazam'],
      },
      seed: 'tutorial:gen3-speed:battle',
      noLuck: true,
      prompts: [
        {
          turn: 1,
          text: 'Starmie is faster than Camerupt, and Surf hits it 4×. Knock it out before it moves!',
        },
        {
          turn: 2,
          text: 'Alakazam is faster than Starmie, so it moves first. Hit back with Surf.',
        },
        {
          turn: 4,
          text: 'Alakazam is faster than Linoone too, but Extreme Speed has priority: it always goes first.',
        },
      ],
      takeaway:
        'The faster Pokémon moves first, and a fainted Pokémon doesn’t move. Priority moves go first no matter the Speed.',
      intended: {
        moves: ['move Surf', 'move Surf', 'move Surf', 'move Extreme Speed', 'move Extreme Speed'],
        switches: ['switch Linoone'],
      },
    },
  ],
};
