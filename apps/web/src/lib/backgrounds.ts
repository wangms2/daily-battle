// Battle backgrounds by format, from Showdown's fx/ folder (CC0). Plain data, so
// scripts/fx.ts can read it in Node to download them.

/** One per day: Showdown's Gen 4 and Gen 5 rotations (battle-animations.ts). */
export const BACKGROUNDS: Record<string, readonly string[]> = {
  gen4ou: [
    'bg-gen4.png',
    'bg-gen4-cave.png',
    'bg-gen4-snow.png',
    'bg-gen4-indoors.png',
    'bg-gen4-water.png',
  ],
  gen5ou: [
    'bg-beach.png',
    'bg-beachshore.png',
    'bg-desert.png',
    'bg-meadow.png',
    'bg-thunderplains.png',
    'bg-city.png',
    'bg-earthycave.png',
    'bg-mountain.png',
    'bg-volcanocave.png',
    'bg-dampcave.png',
    'bg-forest.png',
    'bg-river.png',
    'bg-deepsea.png',
    'bg-icecave.png',
    'bg-route.png',
  ],
};
