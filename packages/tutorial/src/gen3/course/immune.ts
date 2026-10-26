// Course lesson 3, Immune (docs/plan-tutorial-coach.md, step 4b): some types
// take nothing from some moves, and Levitate works the same way against
// Ground. Builds on lessons 1–2 (knockouts, type matchups).
import type { Lesson, Mon } from '../../types';

const SWAMPERT: Mon = { species: 'Swampert', moves: ['Surf', 'Earthquake'] };
const SNORLAX: Mon = { species: 'Snorlax', moves: ['Body Slam', 'Shadow Ball'] };

export const immune: Lesson = {
  id: 'gen3-immune',
  draft: true,
  format: 'gen3ou',
  number: 3,
  title: 'Immune',
  summary: 'Some types take nothing at all from some moves.',
  steps: [
    {
      kind: 'demo',
      position: {
        // Dugtrio outspeeds Skarmory, so its move lands first.
        // (Arena Trap, not Sand Veil, which OU bans.)
        p1: [{ species: 'Dugtrio', moves: ['Earthquake', 'Rock Slide'], ability: 'Arena Trap' }],
        p2: [{ species: 'Skarmory', moves: ['Drill Peck'] }],
        seed: 'course:immune:demo1',
      },
      turn: { p1: 'move Earthquake', p2: 'move Drill Peck' },
      before: 'Earthquake is a Ground move, and Skarmory is a Steel and Flying type.',
      after: 'Flying types take nothing from Ground moves: Earthquake did nothing.',
      spotlight: { before: ['move Earthquake', 'foe-types'], after: ['log'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [SNORLAX],
        p2: [{ species: 'Dusclops', moves: ['Seismic Toss'] }],
        seed: 'course:immune:demo2',
      },
      turn: { p1: 'move Body Slam', p2: 'move Seismic Toss' },
      before: 'Body Slam is a Normal move, and Dusclops is a Ghost type.',
      after: 'Ghost types take nothing from Normal moves: Body Slam did nothing.',
      spotlight: { before: ['move Body Slam', 'foe-types'], after: ['log'] },
    },
    {
      kind: 'demo',
      position: {
        // Metagross outspeeds Weezing, so its move lands first.
        p1: [{ species: 'Metagross', moves: ['Meteor Mash', 'Earthquake'] }],
        p2: [{ species: 'Weezing', moves: ['Sludge Bomb'] }],
        seed: 'course:immune:demo3',
      },
      turn: { p1: 'move Earthquake', p2: 'move Sludge Bomb' },
      before: 'Weezing is a Poison type, and Ground is strong against Poison. But Weezing floats.',
      after: 'Its ability, Levitate, keeps it off the ground: Ground moves do nothing to it.',
      spotlight: { before: ['move Earthquake', 'foe-types'], after: ['log'] },
    },
    {
      kind: 'practice',
      prompt: 'Swampert and Skarmory are both low on HP. Which move?',
      position: {
        p1: [SWAMPERT],
        p2: [{ species: 'Skarmory', moves: ['Drill Peck'] }],
        hp: { p1: [45], p2: [25] },
        seed: 'course:immune:practice1',
      },
      foe: 'move Drill Peck',
      answers: [
        {
          choice: 'move Surf',
          grade: 'best',
          why: 'Surf knocks Skarmory out.',
        },
        {
          choice: 'move Earthquake',
          grade: 'wrong',
          why: 'Skarmory is part Flying, so Earthquake does nothing. Skarmory knocks Swampert out next turn.',
        },
      ],
      otherwise: 'Surf knocks Skarmory out this turn.',
      spotlight: ['foe-types'],
    },
    {
      kind: 'practice',
      prompt: 'Snorlax and Dusclops are both low on HP. Which move?',
      position: {
        p1: [SNORLAX],
        p2: [{ species: 'Dusclops', moves: ['Seismic Toss'] }],
        hp: { p1: [20], p2: [30] },
        seed: 'course:immune:practice2',
      },
      foe: 'move Seismic Toss',
      answers: [
        {
          choice: 'move Shadow Ball',
          grade: 'best',
          why: 'Ghost is strong against Ghost: Shadow Ball knocks Dusclops out.',
        },
        {
          choice: 'move Body Slam',
          grade: 'wrong',
          why: 'Dusclops is a Ghost type, so Body Slam does nothing. Dusclops knocks Snorlax out.',
        },
      ],
      otherwise: 'Shadow Ball knocks Dusclops out this turn.',
      spotlight: ['foe-types'],
    },
    {
      kind: 'battle',
      intro: 'Two on two against the Easy AI. Before each move, check: can the foe take it at all?',
      // Both of yours outspeed both foes; Electric does nothing to Swampert.
      player: [
        { species: 'Starmie', moves: ['Surf', 'Ice Beam', 'Thunderbolt'] },
        { species: 'Jolteon', moves: ['Thunderbolt', 'Shadow Ball'] },
      ],
      foe: [
        { species: 'Swampert', moves: ['Earthquake', 'Surf'] },
        { species: 'Dusclops', moves: ['Seismic Toss'] },
      ],
      foeAi: 'easy',
      seed: 'course:immune:battle',
      noLuck: true,
      prompts: [],
      takeaway: 'A move the foe is immune to does nothing at all. Check its types first.',
    },
  ],
};
