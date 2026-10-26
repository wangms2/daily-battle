import type { FormatId } from '@daily-battle/data/formats';

/**
 * Each generation's color, used for its share card's header and its game screens'
 * header: one color from its games, deep enough for white text, and the ball's
 * centre button. Emerald for Gen 3, Diamond's steel blue for Gen 4, Black for Gen 5
 * (with a white button), and Y's red for Gen 6.
 */
export const LIDS: Record<FormatId, { lid: string; deep: string; button: string }> = {
  gen3ou: { lid: '#2f7a5c', deep: '#24624a', button: '#2f7a5c' },
  gen4ou: { lid: '#4a6890', deep: '#3a5578', button: '#4a6890' },
  gen5ou: { lid: '#2a2b31', deep: '#1c1d22', button: '#e2e2e8' },
  gen6ou: { lid: '#a83a48', deep: '#8c2e3b', button: '#a83a48' },
};

/** Each generation's mascot, on its landing button, picker cartridge, and share row. */
export const MASCOT: Record<FormatId, { species: string; gen: number }> = {
  gen3ou: { species: 'Swampert', gen: 3 },
  gen4ou: { species: 'Lucario', gen: 4 },
  gen5ou: { species: 'Volcarona', gen: 5 },
  gen6ou: { species: 'Sylveon', gen: 6 },
};
