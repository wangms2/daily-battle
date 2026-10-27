// Fun trainer names for the name screen's 🎲: an adjective and a Pokémon, short
// enough for the versus name limit (16).
import { NAME_MAX } from '@daily-battle/versus';

const ADJECTIVES = [
  'Sleepy',
  'Brave',
  'Sneaky',
  'Jolly',
  'Hasty',
  'Calm',
  'Bold',
  'Sassy',
  'Quirky',
  'Gentle',
  'Rash',
  'Lonely',
  'Naive',
  'Mild',
  'Lax',
  'Timid',
  'Fluffy',
  'Spicy',
  'Shiny',
  'Lucky',
  'Zippy',
  'Grumpy',
  'Cosmic',
  'Tiny',
];
const POKEMON = [
  'Snorlax',
  'Pikachu',
  'Mudkip',
  'Eevee',
  'Gengar',
  'Togepi',
  'Psyduck',
  'Ditto',
  'Lapras',
  'Slowpoke',
  'Torchic',
  'Treecko',
  'Swablu',
  'Wobbuffet',
  'Bidoof',
  'Piplup',
  'Skarmory',
  'Metagross',
  'Jirachi',
  'Spheal',
  'Magikarp',
  'Jigglypuff',
  'Azurill',
  'Celebi',
  'Absol',
  'Zigzagoon',
];

const pick = <T>(list: readonly T[], random: () => number) =>
  list[Math.floor(random() * list.length)]!;

export function randomName(random: () => number = Math.random): string {
  for (;;) {
    const name = pick(ADJECTIVES, random) + pick(POKEMON, random);
    if (name.length <= NAME_MAX) return name;
  }
}
