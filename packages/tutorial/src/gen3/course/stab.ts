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
      intro:
        'Your Starmie against two foes and the Easy AI. Everyone is low on HP, so each move must knock the foe out. Thunderbolt has more power than Psychic, but which one matches Starmie’s type?',
      // Starmie alone, so switching (lesson 6) never comes up, and it outspeeds
      // both foes, so Speed (lesson 7) never decides a turn. Both moves are
      // special (lesson 5). Every Pokémon starts low, so each turn is one
      // knockout, and a wrong pick lets the foe knock Starmie out:
      // - Snorlax is neutral to both: Psychic with the bonus (90 × 1.5) beats
      //   Thunderbolt (95). Psychic always knocks it out; Thunderbolt never does.
      // - Skarmory resists Psychic and is weak to Electric, so the bonus can't
      //   save Psychic: Thunderbolt knocks it out, Psychic doesn't.
      player: [{ species: 'Starmie', moves: ['Psychic', 'Thunderbolt'] }],
      foe: [
        { species: 'Snorlax', moves: ['Body Slam'] },
        { species: 'Skarmory', moves: ['Drill Peck'] },
      ],
      seed: 'course:stab:battle',
      hp: { p1: [25], p2: [17, 55] },
      noLuck: true,
      takeaway:
        'A move of your Pokémon’s own type hits 1.5× as hard, often harder than a move with more power. But a resisted move stays weak, bonus or not.',
      hint: 'Psychic matches Starmie’s type: use it on Snorlax. Skarmory is part Steel, which resists Psychic, and Electric is super effective on it: use Thunderbolt.',
    },
  ],
};
