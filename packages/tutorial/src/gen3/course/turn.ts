// Course lesson 1, A turn (docs/plan-tutorial-coach.md, step 4b): each turn
// both sides pick, then both moves happen; HP, fainting, and winning. Every
// matchup here is neutral (types come in lesson 2), and your Pokémon is the
// faster one (Speed comes in lesson 7).
import type { Lesson, Mon } from '../../types';

const SWAMPERT: Mon = { species: 'Swampert', moves: ['Earthquake', 'Rock Slide'] };
const SNORLAX: Mon = { species: 'Snorlax', moves: ['Body Slam'] };
const SLOWBRO: Mon = { species: 'Slowbro', moves: ['Surf'] };
const BLISSEY: Mon = { species: 'Blissey', moves: ['Seismic Toss'] };

export const turn: Lesson = {
  id: 'gen3-turn',
  format: 'gen3ou',
  number: 1,
  title: 'A turn',
  summary: 'Each turn, both sides pick a move. Knock out every foe to win.',
  steps: [
    // The screen first: where your moves are, and who's left on each side.
    {
      kind: 'demo',
      position: {
        p1: [SWAMPERT, { species: 'Metagross', moves: ['Meteor Mash'] }],
        p2: [SNORLAX, BLISSEY],
        seed: 'course:turn:look1',
      },
      // Nothing opens by itself: the player holds the move to see its details.
      before:
        'These are your moves. Tap one to use it. Press and hold Earthquake to see what it does.',
      spotlight: { before: ['move Earthquake'] },
    },
    {
      kind: 'demo',
      position: {
        p1: [SWAMPERT, { species: 'Metagross', moves: ['Meteor Mash'] }],
        p2: [SNORLAX, BLISSEY],
        seed: 'course:turn:look2',
      },
      before:
        'Your team is in the bottom row, and the foe’s is under its name: who’s left on each side. Tap one to see it.',
      spotlight: { before: ['your-team', 'foe-team'] },
    },
    {
      kind: 'demo',
      position: { p1: [SWAMPERT], p2: [SNORLAX], seed: 'course:turn:demo1' },
      turn: { p1: 'move Earthquake', p2: 'move Body Slam' },
      whole: true,
      before: 'Each turn, you and the foe both pick a move. You’ll pick Earthquake.',
      after: 'Both moves happened: each one took some of the other’s HP.',
      spotlight: { before: ['move Earthquake'], after: ['foe-hp', 'you-hp'] },
    },
    // One story to the win: Slowbro faints and Blissey comes in, already low;
    // the next step goes on from there, so nothing that fainted comes back.
    {
      kind: 'demo',
      position: {
        p1: [SWAMPERT],
        p2: [SLOWBRO, BLISSEY],
        hp: { p2: [15, 15] },
        seed: 'course:turn:demo2',
      },
      turn: { p1: 'move Earthquake', p2: 'move Surf' },
      before: 'Slowbro is low on HP. Watch what happens when it reaches zero.',
      after: 'At zero HP a Pokémon faints and can’t battle again. The foe sent in its next one.',
      spotlight: { before: ['foe-hp'], after: ['log'] },
    },
    {
      kind: 'demo',
      position: { p1: [SWAMPERT], p2: [BLISSEY], hp: { p2: [15] }, seed: 'course:turn:demo3' },
      turn: { p1: 'move Earthquake', p2: 'move Seismic Toss' },
      before: 'Blissey is low on HP too, and it’s the foe’s last Pokémon.',
      after: 'Knock out all of the foe’s Pokémon and you win.',
      spotlight: { before: ['foe-plate'], after: ['log'] },
    },
    {
      kind: 'practice',
      prompt: 'Swampert and Snorlax are both low on HP. Which move?',
      position: {
        p1: [SWAMPERT],
        p2: [SNORLAX],
        hp: { p1: [30], p2: [30] },
        seed: 'course:turn:practice1',
      },
      foe: 'move Body Slam',
      answers: [
        {
          choice: 'move Earthquake',
          grade: 'best',
          why: 'Earthquake is the stronger move: it knocks Snorlax out before it can hit back.',
        },
        {
          choice: 'move Rock Slide',
          grade: 'wrong',
          why: 'Rock Slide is weaker. Snorlax survives and knocks Swampert out.',
        },
      ],
      otherwise: 'Earthquake knocks Snorlax out this turn.',
      spotlight: ['foe-hp', 'you-hp'],
    },
    {
      kind: 'practice',
      prompt: 'Metagross and Snorlax are both low on HP. Which move?',
      position: {
        p1: [{ species: 'Metagross', moves: ['Aerial Ace', 'Meteor Mash'] }],
        p2: [SNORLAX],
        hp: { p1: [12], p2: [30] },
        seed: 'course:turn:practice2',
      },
      foe: 'move Body Slam',
      answers: [
        {
          choice: 'move Meteor Mash',
          grade: 'best',
          why: 'Meteor Mash is the stronger move: it knocks Snorlax out before it can hit back.',
        },
        {
          choice: 'move Aerial Ace',
          grade: 'wrong',
          why: 'Aerial Ace is weaker. Snorlax survives and knocks Metagross out.',
        },
      ],
      otherwise: 'Meteor Mash knocks Snorlax out this turn.',
      spotlight: ['foe-hp', 'you-hp'],
    },
    {
      kind: 'battle',
      intro: 'One on one against the Easy AI. Pick a move each turn, and knock Ursaring out.',
      player: [{ species: 'Swampert', moves: ['Earthquake', 'Surf', 'Rock Slide'] }],
      // Slower than Swampert, with neutral matchups both ways.
      foe: [{ species: 'Ursaring', moves: ['Return'] }],
      seed: 'course:turn:battle',
      noLuck: true,
      takeaway: 'Stronger moves take more HP. Knock out every foe Pokémon to win.',
      hint: 'Earthquake is Swampert’s strongest move here. Use it every turn.',
    },
  ],
};
