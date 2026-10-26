import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const roles: Lesson = {
  id: 'gen3-roles',
  format: FORMAT,
  number: 10,
  title: 'Roles and team building',
  summary: 'Attackers, walls, and support: build a team where each Pokémon has a job.',
  steps: [
    {
      kind: 'card',
      title: 'Every Pokémon has a job',
      text: [
        'Attackers deal damage. Fast, strong Pokémon like Salamence and Metagross knock out foes, often after setting up.',
        'Walls take hits. Skarmory blocks physical attacks and Blissey blocks special ones, so your team can survive the foe’s best moves.',
        'Support Pokémon help the team: Forretress lays Spikes and clears them with Rapid Spin, and others spread status.',
      ],
      sprites: ['Metagross', 'Blissey', 'Forretress'],
    },
    {
      kind: 'card',
      title: 'Cover your weaknesses',
      text: [
        'A good team has an answer to each common threat: something that can switch in on its attacks and something that can knock it out.',
        'Avoid stacking weaknesses. If three of your Pokémon are weak to Ice, one Ice Beam user can tear through your team.',
      ],
    },
    {
      kind: 'card',
      title: 'Your weekly team',
      text: [
        'In Daily Battle, each week you build a team of 6 from a pool of 12 Pokémon and pick a set for each. The team stays the same all week.',
        'Each set has a role name, like “Spikes” or “Dragon Dance”. Not sure where to start? The team builder suggests full teams too.',
      ],
    },
    {
      kind: 'pick',
      prompt:
        'This team has two attackers in Salamence and Metagross, plus Swampert and Zapdos. It has no special wall and no Spikes or Rapid Spin. Pick two more Pokémon.',
      team: [
        {
          species: 'Salamence',
          moves: ['Dragon Dance', 'Dragon Claw', 'Earthquake', 'Rock Slide'],
        },
        { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Rock Slide'] },
        { species: 'Swampert', moves: ['Earthquake', 'Surf', 'Ice Beam'] },
        { species: 'Zapdos', moves: ['Thunderbolt', 'Drill Peck'] },
      ],
      picks: 2,
      options: [
        {
          mon: { species: 'Blissey', moves: ['Seismic Toss', 'Soft-Boiled', 'Ice Beam', 'Toxic'] },
          role: 'Special wall',
          grade: 'best',
          why: 'Nothing on this team takes special hits well. Blissey can switch in on Ice Beams aimed at Salamence and barely notice.',
        },
        {
          mon: { species: 'Forretress', moves: ['Spikes', 'Rapid Spin', 'Earthquake', 'Toxic'] },
          role: 'Support',
          grade: 'best',
          why: 'Forretress does both jobs the team is missing: it lays Spikes on the foe’s side and clears the foe’s Spikes with Rapid Spin.',
        },
        {
          mon: { species: 'Starmie', moves: ['Rapid Spin', 'Surf', 'Ice Beam', 'Recover'] },
          role: 'Spinner',
          grade: 'ok',
          why: 'Starmie clears Spikes with Rapid Spin, but it can’t lay them, and it doesn’t take special hits nearly as well as Blissey.',
        },
        {
          mon: {
            species: 'Flygon',
            moves: ['Earthquake', 'Dragon Claw', 'Rock Slide', 'Fire Blast'],
          },
          role: 'Attacker',
          grade: 'wrong',
          why: 'Flygon takes 4× damage from Ice, just like Salamence, so one Ice Beam user threatens both. The team also already has two attackers.',
        },
      ],
      done: 'Now the team has attackers to score knockouts, walls to take hits, and support to control the field.',
    },
  ],
};
