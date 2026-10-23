// Battle effects from Pokémon Showdown's fx/ folder (CC0), self-hosted under
// /fx by scripts/fx.ts. All fx paths go through here.

import { BACKGROUNDS } from './backgrounds';

const fx = (file: string) => `${import.meta.env.BASE_URL}fx/${file}`;

export { BACKGROUNDS };

/** The background for a day (`YYYY-MM-DD`): the same for every try, and on resume. */
export function backgroundFor(day: string, format = 'gen4ou'): string {
  const list = BACKGROUNDS[format] ?? BACKGROUNDS.gen4ou!;
  let h = 0;
  for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  // Gen 4 keeps the plain hash it launched with. With 15 backgrounds that hash
  // clumps, so other formats mix it first to spread days evenly.
  if (format !== 'gen4ou') {
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
  }
  return fx(list[h % list.length]!);
}

/** Overlay image for each weather, by the condition names `View.weather` uses. */
export const WEATHER_FX: Record<string, string> = {
  Sandstorm: fx('weather-sandstorm.png'),
  RainDance: fx('weather-raindance.jpg'),
  SunnyDay: fx('weather-sunnyday.jpg'),
  Hail: fx('weather-hail.png'),
};

/** The doll that stands in for a Pokémon behind a substitute (our own drawing). */
export const SUBSTITUTE_FX = fx('substitute.svg');

export const HAZARD_FX = {
  rocks: [fx('rock1.png'), fx('rock2.png')],
  spikes: fx('caltrop.png'),
  toxicSpikes: fx('poisoncaltrop.png'),
  pokeball: fx('pokeball.png'),
};
