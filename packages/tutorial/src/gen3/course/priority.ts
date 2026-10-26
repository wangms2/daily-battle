// Course lesson 8, Priority (docs/plan-tutorial-coach.md, step 4b): a few
// moves go first whatever the Speed, so they can finish a faster foe. They're
// weaker, so they're for finishing. Builds on lessons 1–7 (knockouts, Speed).
import type { Lesson, Mon } from '../../types';

const BRELOOM: Mon = { species: 'Breloom', moves: ['Sky Uppercut', 'Mach Punch'] };
const HOUNDOOM: Mon = { species: 'Houndoom', moves: ['Flamethrower'] };
const LINOONE: Mon = { species: 'Linoone', moves: ['Shadow Ball', 'Extreme Speed'] };
const ALAKAZAM: Mon = { species: 'Alakazam', moves: ['Psychic'] };

export const priority: Lesson = {
  id: 'gen3-priority',
  format: 'gen3ou',
  number: 8,
  title: 'Priority',
  summary: 'A few moves always go first.',
  steps: [
    {
      kind: 'demo',
      position: {
        p1: [BRELOOM],
        p2: [HOUNDOOM],
        hp: { p1: [30], p2: [20] },
        seed: 'course:priority:demo1',
      },
      turn: { p1: 'move Mach Punch', p2: 'move Flamethrower' },
      before: 'Houndoom is faster than Breloom. But Mach Punch is a priority move: it goes first.',
      after: 'Mach Punch landed first and knocked Houndoom out.',
      spotlight: { before: ['move Mach Punch', 'foe-plate'], after: ['log'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [BRELOOM],
        p2: [{ species: 'Swampert', moves: ['Earthquake'] }],
        seed: 'course:priority:demo2',
      },
      turn: { p1: 'move Mach Punch', p2: 'move Earthquake' },
      before: 'Priority moves are weak, though. Against a healthy Swampert…',
      after: 'Mach Punch barely hurt it. Priority is for finishing a foe that’s low.',
      spotlight: { before: ['move Mach Punch'], after: ['foe-hp'] },
    },
    {
      kind: 'practice',
      prompt: 'Houndoom is faster, and both are low on HP. Which move?',
      position: {
        p1: [BRELOOM],
        p2: [HOUNDOOM],
        hp: { p1: [30], p2: [20] },
        seed: 'course:priority:practice1',
      },
      foe: 'move Flamethrower',
      answers: [
        {
          choice: 'move Mach Punch',
          grade: 'best',
          why: 'Mach Punch goes first and knocks Houndoom out.',
        },
        {
          choice: 'move Sky Uppercut',
          grade: 'wrong',
          why: 'Sky Uppercut is stronger, but Houndoom is faster: Flamethrower knocks Breloom out first.',
        },
      ],
      otherwise: 'Mach Punch goes first and knocks Houndoom out.',
      spotlight: ['move Mach Punch', 'foe-plate'],
    },
    {
      kind: 'practice',
      prompt: 'Alakazam is faster, and both are low on HP. Which move?',
      position: {
        p1: [LINOONE],
        p2: [ALAKAZAM],
        hp: { p1: [30], p2: [20] },
        seed: 'course:priority:practice2',
      },
      foe: 'move Psychic',
      answers: [
        {
          choice: 'move Extreme Speed',
          grade: 'best',
          why: 'Extreme Speed goes first and knocks Alakazam out.',
        },
        {
          choice: 'move Shadow Ball',
          grade: 'wrong',
          why: 'Ghost is strong against Psychic, but Alakazam is faster: Psychic knocks Linoone out first.',
        },
      ],
      otherwise: 'Extreme Speed goes first and knocks Alakazam out.',
      spotlight: ['move Extreme Speed', 'foe-plate'],
    },
    {
      kind: 'battle',
      intro:
        'Two on two against the Easy AI. Hit hard while the foe is healthy; finish it with priority.',
      player: [
        { species: 'Breloom', moves: ['Sky Uppercut', 'Mach Punch'] },
        { species: 'Linoone', moves: ['Shadow Ball', 'Extreme Speed'] },
      ],
      foe: [HOUNDOOM, ALAKAZAM],
      seed: 'course:priority:battle',
      noLuck: true,
      takeaway: 'Priority moves go first, whatever the Speed. Use them to finish a faster foe.',
    },
  ],
};
