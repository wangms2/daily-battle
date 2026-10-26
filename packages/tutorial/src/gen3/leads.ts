import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

const SKARMORY = { species: 'Skarmory', moves: ['Spikes', 'Drill Peck', 'Toxic'] };
const SALAMENCE = {
  species: 'Salamence',
  moves: ['Dragon Dance', 'Dragon Claw', 'Earthquake', 'Rock Slide'],
};
const STARMIE = { species: 'Starmie', moves: ['Surf', 'Ice Beam', 'Thunderbolt', 'Rapid Spin'] };
const METAGROSS = { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Rock Slide'] };

export const leads: Lesson = {
  id: 'gen3-leads',
  format: FORMAT,
  number: 11,
  title: 'Leads',
  summary: 'Gen 3 has no Team Preview. Choose a lead that’s useful whatever the foe sends out.',
  steps: [
    {
      kind: 'card',
      title: 'No Team Preview',
      text: [
        'In Gen 3, neither player sees the other’s team in battle. You only learn a foe Pokémon when it comes out, and its moves when it uses them.',
        'In Daily Battle, the daily brief shows the foe’s six Pokémon before you start. You still don’t know their moves, items, or which one they’ll lead with.',
      ],
    },
    {
      kind: 'card',
      title: 'What makes a good lead',
      text: [
        'Your lead is the first Pokémon you send out, and you pick it on the daily brief. It faces a foe you can’t predict.',
        'A good lead is safe against most of the foe’s team and does something useful right away, like laying Spikes.',
        'Keep your sweeper out of the lead. It does its best work later, once the Pokémon that can stop it are weakened or gone.',
      ],
      sprites: ['Skarmory', 'Salamence'],
    },
    {
      kind: 'pick',
      target: 'lead',
      prompt:
        'The foe’s team is Snorlax, Celebi, Metagross, and Blissey. Which of your four should lead?',
      team: [],
      foe: ['Snorlax', 'Celebi', 'Metagross', 'Blissey'],
      picks: 1,
      options: [
        {
          mon: SKARMORY,
          role: 'Spikes',
          grade: 'best',
          why: 'Skarmory matches up well with all four: it’s immune to Earthquake and resists Normal, Grass, Psychic, and Steel moves, so it can usually lay Spikes on turn 1.',
        },
        {
          mon: STARMIE,
          role: 'Special attacker',
          grade: 'ok',
          why: 'Starmie is fast and hits hard, but Celebi’s Grass moves are super effective on it, and it can’t lay Spikes.',
        },
        {
          mon: METAGROSS,
          role: 'Physical attacker',
          grade: 'ok',
          why: 'Metagross is tough and hits hard, but Snorlax and the foe’s Metagross often carry Earthquake, which is super effective on it. It can’t lay Spikes either.',
        },
        {
          mon: SALAMENCE,
          role: 'Dragon Dance sweeper',
          grade: 'wrong',
          why: 'Salamence is your sweeper: save it for later, once the foe’s walls are worn down. Blissey often carries Ice Beam, which does 4× damage to it.',
        },
      ],
      done: 'Skarmory leads. Once you see the foe’s lead, you can plan your next move.',
    },
    {
      kind: 'battle',
      intro:
        'Four on four against the Easy AI. Skarmory leads. Lay Spikes, see what the foe has, and save Salamence for the right moment.',
      player: [SKARMORY, STARMIE, METAGROSS, SALAMENCE],
      foe: [
        { species: 'Snorlax', moves: ['Body Slam', 'Earthquake', 'Shadow Ball'] },
        { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake', 'Psychic'] },
        { species: 'Celebi', moves: ['Giga Drain', 'Psychic'] },
        { species: 'Blissey', moves: ['Seismic Toss', 'Ice Beam'] },
      ],
      foeAi: 'easy',
      seed: 'tutorial:gen3-leads:battle',
      noLuck: false,
      prompts: [
        {
          turn: 1,
          text: 'Snorlax leads. Skarmory resists its Normal moves, so lay Spikes.',
        },
        {
          turn: 3,
          text: 'Each foe you see tells you more. Who on your team handles the Pokémon that are left?',
        },
      ],
      takeaway:
        'Without Team Preview, lead with a Pokémon that’s safe against most foes and useful from turn 1. Save your sweeper for later.',
    },
  ],
};
