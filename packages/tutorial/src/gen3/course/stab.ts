// Course lesson 4, Same-type bonus (docs/plan-tutorial-coach.md, step 4b): a
// move that matches its user's type gets 1.5× power. Each comparison here
// holds everything else equal: the same power, the same kind of move (physical
// or special is lesson 5), and neutral matchups.
import type { Lesson, Mon } from '../../types';

const METAGROSS: Mon = { species: 'Metagross', moves: ['Earthquake', 'Meteor Mash'] };
const SWAMPERT: Mon = { species: 'Swampert', moves: ['Ice Beam', 'Surf'] };
const URSARING: Mon = { species: 'Ursaring', moves: ['Return'] };

export const stab: Lesson = {
  id: 'gen3-stab',
  format: 'gen3ou',
  number: 4,
  title: 'Same-type bonus',
  summary: 'A move of its user’s own type hits 1.5× as hard.',
  steps: [
    {
      kind: 'demo',
      position: { p1: [METAGROSS], p2: [URSARING], seed: 'course:stab:demo1' },
      turn: { p1: 'move Meteor Mash', p2: 'move Return' },
      before:
        'Metagross is a Steel and Psychic type, and Meteor Mash is a Steel move. A move that matches its user’s type gets a bonus: 1.5× the power.',
      after: 'Same type, so Meteor Mash hit with the bonus.',
      spotlight: { before: ['move Meteor Mash', 'you-types'], after: ['foe-hp'] },
    },
    {
      kind: 'demo',
      position: { p1: [METAGROSS], p2: [URSARING], seed: 'course:stab:demo2' },
      turn: { p1: 'move Earthquake', p2: 'move Return' },
      before: 'Earthquake is just as strong as Meteor Mash, but it’s a Ground move.',
      after: 'No match, no bonus: Earthquake did less than Meteor Mash.',
      spotlight: { before: ['move Earthquake', 'you-types'], after: ['foe-hp'] },
    },
    {
      kind: 'practice',
      prompt: 'Surf and Ice Beam are equally strong. Which one, to finish Ursaring?',
      position: {
        p1: [SWAMPERT],
        p2: [URSARING],
        hp: { p1: [35], p2: [30] },
        seed: 'course:stab:practice1',
      },
      foe: 'move Return',
      answers: [
        {
          choice: 'move Surf',
          grade: 'best',
          why: 'Swampert is a Water type, so Surf gets the bonus and knocks Ursaring out.',
        },
        {
          choice: 'move Ice Beam',
          grade: 'wrong',
          why: 'Ice Beam gets no bonus from Swampert. Ursaring survives and knocks Swampert out.',
        },
      ],
      otherwise: 'Surf gets the same-type bonus and knocks Ursaring out.',
      spotlight: ['you-types'],
    },
    {
      kind: 'practice',
      prompt: 'Metagross is low on HP. Which move, to finish Ursaring?',
      position: {
        p1: [METAGROSS],
        p2: [URSARING],
        hp: { p1: [15], p2: [45] },
        seed: 'course:stab:practice2',
      },
      foe: 'move Return',
      answers: [
        {
          choice: 'move Meteor Mash',
          grade: 'best',
          why: 'Meteor Mash is Steel, like Metagross: with the bonus it knocks Ursaring out.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Earthquake gets no bonus from Metagross. Ursaring survives and knocks Metagross out.',
        },
      ],
      otherwise: 'Meteor Mash gets the same-type bonus and knocks Ursaring out.',
      spotlight: ['you-types'],
    },
    {
      kind: 'battle',
      intro: 'Two on two against the Easy AI. Look for moves that match your Pokémon’s type.',
      // Both of yours outspeed both foes; every matchup is neutral or resisted only by type.
      player: [
        { species: 'Metagross', moves: ['Meteor Mash', 'Earthquake'] },
        { species: 'Swampert', moves: ['Surf', 'Ice Beam'] },
      ],
      foe: [URSARING, { species: 'Snorlax', moves: ['Body Slam'] }],
      seed: 'course:stab:battle',
      noLuck: true,
      takeaway: 'A move of your Pokémon’s own type hits 1.5× as hard. Look for the match.',
      hint: 'Use moves that match your Pokémon’s type: Meteor Mash for Metagross, Surf for Swampert.',
    },
  ],
};
