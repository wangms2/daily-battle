import type { Lesson } from '../types';

const FORMAT = 'gen3ou';

export const graduation: Lesson = {
  id: 'gen3-graduation',
  format: FORMAT,
  number: 13,
  graduation: true,
  title: 'Graduation',
  summary: 'A full six-on-six battle with real OU teams. Put it all together.',
  steps: [
    {
      kind: 'card',
      title: 'Your final battle',
      text: [
        'This is a real Gen 3 OU battle: six Pokémon each, real sets, and normal luck, against the Easy AI.',
        'The sets have a few moves you haven’t learned yet, like Explosion and Roar. Long-press a move (or hover over it) to read what it does.',
      ],
    },
    {
      kind: 'card',
      title: 'Abilities',
      text: [
        'Every Pokémon has an ability, like Levitate. Most do something small, but a few in this battle change how you should play.',
        'Their Heracross has Guts: a status raises its Attack, so don’t burn it. Their Snorlax has Immunity: it can’t be poisoned. Their Milotic has Marvel Scale: a status raises its Defense.',
        'Your Blissey and Starmie have Natural Cure: switching out cures their status. Your Salamence has Intimidate: it lowers the foe’s Attack when it comes in.',
        'Tap a Pokémon in battle to see its ability.',
      ],
      sprites: ['Heracross', 'Snorlax', 'Milotic', 'Blissey', 'Starmie', 'Salamence'],
    },
    {
      kind: 'card',
      title: 'Your team',
      text: [
        'Skarmory lays Spikes and walls physical attackers. Blissey walls special attackers.',
        'Starmie clears Spikes with Rapid Spin. Swampert and Metagross are tough attackers.',
        'Salamence is your Dragon Dance sweeper and your win condition: keep it healthy until the foe’s answers to it are gone.',
      ],
      sprites: ['Skarmory', 'Blissey', 'Starmie', 'Swampert', 'Metagross', 'Salamence'],
    },
    {
      kind: 'battle',
      intro:
        'Six on six against the Easy AI. Skarmory leads. Use everything you’ve learned: matchups, switching, Spikes, status, and setting up.',
      player: [
        { species: 'Skarmory', setId: 'skarmory-standard' },
        { species: 'Blissey', setId: 'blissey-utility' },
        { species: 'Starmie', setId: 'starmie-offensive' },
        { species: 'Swampert', setId: 'swampert-standard-defensive' },
        { species: 'Metagross', setId: 'metagross-bulky-attacker' },
        {
          species: 'Salamence',
          setId: 'salamence-dragon-dance',
          moves: ['Dragon Dance', 'Earthquake', 'Rock Slide', 'Brick Break'],
        },
      ],
      foe: [
        { species: 'Milotic', setId: 'milotic-specially-defensive' },
        { species: 'Snorlax', setId: 'snorlax-utility-lax' },
        {
          species: 'Zapdos',
          setId: 'zapdos-mixed',
          moves: ['Thunderbolt', 'Drill Peck', 'Toxic', 'Thunder Wave'],
        },
        {
          species: 'Gengar',
          setId: 'gengar-offensive',
          moves: ['Thunderbolt', 'Ice Punch', 'Fire Punch', 'Explosion'],
        },
        { species: 'Heracross', setId: 'heracross-standard' },
        {
          species: 'Flygon',
          setId: 'flygon-offensive',
          moves: ['Earthquake', 'Rock Slide', 'Dragon Claw', 'Fire Blast'],
        },
      ],
      foeAi: 'easy',
      seed: 'tutorial:gen3-graduation:battle',
      noLuck: false,
      prompts: [
        {
          turn: 1,
          text: 'Their Milotic leads. It’s a wall, and its attacks do little to Skarmory: a safe turn to lay Spikes.',
        },
      ],
      takeaway:
        'You know enough to play Gen 3 OU. Build a weekly team, pick a lead, and take on the daily battle.',
    },
  ],
};
