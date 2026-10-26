// The redesigned Gen 3 course (docs/plan-tutorial-coach.md, step 4b): 18 short
// lessons in 7 units, then graduation. Each lesson builds only on the ones
// before it. The course map shows this outline; a lesson with an `id` is built
// (the rest are still being made).

export interface CourseLesson {
  number: number;
  title: string;
  /** The Pokémon that stars in it: its sprite marks the lesson on the map. */
  star: string;
  /** The built lesson's id, once it exists. */
  id?: string;
}

export interface CourseUnit {
  title: string;
  lessons: CourseLesson[];
}

export const gen3Course: CourseUnit[] = [
  {
    title: 'The battle',
    lessons: [
      { number: 1, title: 'A turn', star: 'Swampert' },
      { number: 2, title: 'Switching', star: 'Skarmory' },
    ],
  },
  {
    title: 'Damage',
    lessons: [
      { number: 3, title: 'Super effective and resisted', star: 'Starmie', id: 'gen3-effective' },
      { number: 4, title: 'Immune', star: 'Gengar' },
      { number: 5, title: 'Same-type bonus', star: 'Salamence' },
      { number: 6, title: 'Physical and special', star: 'Blissey' },
    ],
  },
  {
    title: 'Turn order',
    lessons: [
      { number: 7, title: 'Speed', star: 'Jolteon' },
      { number: 8, title: 'Priority', star: 'Breloom' },
    ],
  },
  {
    title: 'Risk and switching',
    lessons: [
      { number: 9, title: 'What can the foe do to you?', star: 'Metagross' },
      { number: 10, title: 'Switch to take the hit', star: 'Swampert' },
      { number: 11, title: 'Free turns', star: 'Flygon' },
    ],
  },
  {
    title: 'Lasting effects',
    lessons: [
      { number: 12, title: 'Burn and paralysis', star: 'Weezing' },
      { number: 13, title: 'Toxic and sleep', star: 'Venusaur' },
      { number: 14, title: 'Spikes and Rapid Spin', star: 'Forretress' },
    ],
  },
  {
    title: 'Getting ahead',
    lessons: [
      { number: 15, title: 'Setting up', star: 'Suicune' },
      { number: 16, title: 'Items', star: 'Heracross' },
    ],
  },
  {
    title: 'The whole game',
    lessons: [
      { number: 17, title: 'Team roles and leads', star: 'Aerodactyl' },
      { number: 18, title: 'Win conditions and closing out', star: 'Snorlax' },
    ],
  },
];
