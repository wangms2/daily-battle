// Battle effects from Pokémon Showdown's fx/ folder (CC0), self-hosted under
// /fx by scripts/fx.ts. All fx paths go through here.

const fx = (file: string) => `${import.meta.env.BASE_URL}fx/${file}`;

/** The Gen 4 battle backgrounds, one per day. */
export const BACKGROUNDS = [
  'bg-gen4.png',
  'bg-gen4-cave.png',
  'bg-gen4-snow.png',
  'bg-gen4-indoors.png',
  'bg-gen4-water.png',
] as const;

/** The background for a day (`YYYY-MM-DD`): the same for every try, and on resume. */
export function backgroundFor(day: string): string {
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fx(BACKGROUNDS[h % BACKGROUNDS.length]!);
}

/** Overlay image for each weather, by the condition names `View.weather` uses. */
export const WEATHER_FX: Record<string, string> = {
  Sandstorm: fx('weather-sandstorm.png'),
  RainDance: fx('weather-raindance.jpg'),
  SunnyDay: fx('weather-sunnyday.jpg'),
  Hail: fx('weather-hail.png'),
};

export const HAZARD_FX = {
  rocks: [fx('rock1.png'), fx('rock2.png')],
  spikes: fx('caltrop.png'),
  toxicSpikes: fx('poisoncaltrop.png'),
  pokeball: fx('pokeball.png'),
};
