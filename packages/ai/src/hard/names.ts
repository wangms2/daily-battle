// Names as poke-engine spells them: Showdown ids, upper-cased.
import { toId } from '../state';

// The client keeps some revealed effects with their kind prefix ("item: Leftovers").
export const engineId = (name: string): string =>
  toId(name.replace(/^(item|ability|move):\s*/i, '')).toUpperCase() || 'NONE';

/**
 * A move's engine id. Hidden Power carries its type and base power
 * (HIDDENPOWERICE70; 60 from Gen 6), however the request or set spelled it.
 */
export function engineMove(name: string, gen: number): string {
  const id = toId(name);
  const hp = /^hiddenpower([a-z]+?)\d*$/.exec(id);
  if (hp?.[1]) return `HIDDENPOWER${hp[1].toUpperCase()}${gen >= 6 ? 60 : 70}`;
  return id.toUpperCase() || 'NONE';
}

const STATUS: Record<string, string> = {
  slp: 'SLEEP',
  psn: 'POISON',
  tox: 'TOXIC',
  brn: 'BURN',
  par: 'PARALYZE',
  frz: 'FREEZE',
};
export const engineStatus = (status: string | undefined): string => STATUS[status ?? ''] ?? 'NONE';

const WEATHER: Record<string, string> = {
  sandstorm: 'SAND',
  raindance: 'RAIN',
  sunnyday: 'SUN',
  hail: 'HAIL',
  snow: 'SNOW',
  snowscape: 'SNOW',
  desolateland: 'HARSHSUN',
  primordialsea: 'HEAVYRAIN',
  deltastream: 'DELTASTREAM',
};
export const engineWeather = (id: string): string => WEATHER[id] ?? 'NONE';

const TERRAIN: Record<string, string> = {
  electricterrain: 'ELECTRICTERRAIN',
  grassyterrain: 'GRASSYTERRAIN',
  mistyterrain: 'MISTYTERRAIN',
  psychicterrain: 'PSYCHICTERRAIN',
};
export const engineTerrain = (id: string): string => TERRAIN[id] ?? 'NONE';

/**
 * Client volatiles the engine models under the same id. The rest (typechange,
 * disable, two-turn charging…) are left out: the engine would need details we
 * don't have, and the request already disables what can't be used.
 */
export const VOLATILES = new Set([
  'aquaring',
  'attract',
  'charge',
  'confusion',
  'curse',
  'defensecurl',
  'destinybond',
  'embargo',
  'encore',
  'flashfire',
  'focusenergy',
  'foresight',
  'gastroacid',
  'healblock',
  'imprison',
  'ingrain',
  'leechseed',
  'magnetrise',
  'minimize',
  'miracleeye',
  'mustrecharge',
  'nightmare',
  'partiallytrapped',
  'perish1',
  'perish2',
  'perish3',
  'perish4',
  'powertrick',
  'roost',
  'slowstart',
  'smackdown',
  'stockpile',
  'substitute',
  'taunt',
  'telekinesis',
  'torment',
  'trapped',
  'truant',
  'uproar',
  'yawn',
]);
