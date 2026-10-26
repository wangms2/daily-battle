import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const spikes: Lesson = {
  id: 'gen3-spikes',
  format: FORMAT,
  number: 7,
  title: 'Spikes and Rapid Spin',
  summary: 'Make every switch cost HP, and clear the Spikes the foe lays on you.',
  steps: [
    {
      kind: 'card',
      title: 'Spikes',
      text: [
        'Spikes scatters spikes on the foe’s side of the field. From then on, every foe Pokémon that switches in loses HP, including the one sent in after a faint.',
        'You can lay up to three layers. One layer takes 1/8 of max HP, two take 1/6, and three take 1/4. Spikes stay for the whole battle unless they’re cleared.',
      ],
      sprites: ['Skarmory', 'Forretress'],
    },
    {
      kind: 'card',
      title: 'Who Spikes can’t touch',
      text: [
        'Spikes are on the ground, so Flying types and Pokémon with Levitate don’t take damage from them.',
        'Gen 3 has no Stealth Rock. Spikes is the only hazard you need to know.',
      ],
      sprites: ['Skarmory', 'Gengar'],
    },
    {
      kind: 'card',
      title: 'Rapid Spin',
      text: [
        'Rapid Spin is a weak Normal attack that also clears all Spikes from your own side of the field.',
        'It has to hit to work. Ghost types are immune to Normal moves, so Rapid Spin does nothing against them.',
      ],
      sprites: ['Starmie', 'Forretress'],
    },
    {
      kind: 'card',
      title: 'Why Spikes matter',
      text: [
        'A little damage on every switch adds up. The same foe switching in three times with two layers down loses half its HP, without you attacking it.',
        'That makes switching, which you learned in lesson 5, more costly for the foe. A good time to lay Spikes is when the foe can’t hurt you much.',
      ],
    },
    {
      kind: 'card',
      title: 'Luck is back',
      text: [
        'Until now, lesson battles had no luck. From here on they play like real battles: some moves can miss, a critical hit can deal extra damage, and moves like Body Slam sometimes add a side effect.',
        'You can’t control luck, but good choices win most games anyway. If an unlucky turn costs you a lesson battle, just try again.',
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Blissey can barely hurt Skarmory, and Skarmory can barely hurt her. The foe has two more Pokémon in the back. What should Skarmory do?',
      position: {
        p1: [{ species: 'Skarmory', moves: ['Spikes', 'Drill Peck'] }],
        p2: [
          { species: 'Blissey', moves: ['Seismic Toss', 'Soft-Boiled', 'Ice Beam'] },
          { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
          { species: 'Tyranitar', moves: ['Rock Slide', 'Earthquake', 'Crunch'] },
        ],
        seed: 'tutorial:gen3-spikes:quiz1',
      },
      answers: [
        {
          choice: 'move Spikes',
          grade: 'best',
          why: 'Blissey can’t threaten Skarmory, so this is a free turn. Spikes will hurt Swampert and Tyranitar every time they switch in.',
        },
        {
          choice: 'move Drill Peck',
          grade: 'wrong',
          why: 'Blissey has so much HP that Drill Peck barely dents her, and Soft-Boiled heals it right back. Spikes does lasting damage instead.',
        },
      ],
    },
    {
      kind: 'quiz',
      prompt:
        'Forretress laid two layers of Spikes on your side. Your other Pokémon will lose 1/6 of their HP every time they switch in. What should Starmie do?',
      position: {
        p1: [
          { species: 'Starmie', moves: ['Rapid Spin', 'Psychic', 'Recover'] },
          { species: 'Snorlax', moves: ['Body Slam', 'Earthquake', 'Shadow Ball'] },
          { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
        ],
        p2: [{ species: 'Forretress', moves: ['Spikes', 'Rapid Spin', 'Earthquake'] }],
        seed: 'tutorial:gen3-spikes:quiz2',
        rounds: [
          { p1: 'move Psychic', p2: 'move Spikes' },
          { p1: 'move Psychic', p2: 'move Spikes' },
        ],
      },
      answers: [
        {
          choice: 'move Rapid Spin',
          grade: 'best',
          why: 'Rapid Spin clears both layers, so Snorlax and Swampert can switch in for free again. Forretress has to spend more turns to lay them back.',
        },
        {
          choice: 'move Psychic',
          grade: 'wrong',
          why: 'Steel types resist Psychic, so it does little to Forretress, and the Spikes stay to keep hurting your team.',
        },
        {
          choice: 'move Recover',
          grade: 'wrong',
          why: 'Starmie is at full HP, so Recover does nothing. Clear the Spikes instead.',
        },
      ],
      otherwise:
        'Switching costs your Pokémon 1/6 of its HP while the Spikes are down. Starmie can clear them with Rapid Spin instead.',
    },
    {
      kind: 'battle',
      intro:
        'Three on three against the Easy AI, with normal luck. Lay Spikes with Skarmory, and clear the foe’s Spikes with Starmie.',
      player: [
        { species: 'Skarmory', moves: ['Spikes', 'Drill Peck'] },
        { species: 'Starmie', moves: ['Rapid Spin', 'Surf', 'Thunderbolt', 'Ice Beam'] },
        { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
      ],
      foe: [
        { species: 'Forretress', moves: ['Spikes', 'Earthquake', 'Toxic'] },
        { species: 'Snorlax', moves: ['Body Slam', 'Earthquake', 'Shadow Ball'] },
        { species: 'Heracross', moves: ['Megahorn', 'Brick Break', 'Rock Slide'] },
      ],
      foeAi: 'easy',
      seed: 'tutorial:gen3-spikes:battle',
      noLuck: false,
      prompts: [
        {
          turn: 1,
          text: 'Forretress can’t hurt Skarmory much. Lay Spikes: every foe switch-in will lose HP.',
        },
        { turn: 2, text: 'Another layer means more damage. Three layers take 1/4 of max HP.' },
        {
          turn: 4,
          text: 'If the foe laid Spikes on your side, switch to Starmie and use Rapid Spin to clear them.',
        },
      ],
      takeaway:
        'Spikes make every foe switch cost HP, all battle long. Lay them when the foe can’t hurt you, and clear your side with Rapid Spin.',
    },
  ],
};
