import { sets } from '@daily-battle/data';
import { AI_VERSION } from '@daily-battle/ai/version';

/** A fresh seed in the simulator's `a,b,c,d` form (DESIGN.md §6.1: battle RNG is never shared). */
export function randomSeed(): string {
  const parts = new Uint16Array(4);
  crypto.getRandomValues(parts);
  return [...parts].join(',');
}

/** Saved with each attempt; a battle saved under another version is forfeited, not resumed (§15). */
export const ENGINE_VERSION = `sim ${sets.meta.simVersion} ai ${AI_VERSION}`;
