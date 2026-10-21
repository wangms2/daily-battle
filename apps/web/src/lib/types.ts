/** Type colors (the familiar game palette), with readable text on each. */
export const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Normal: { bg: '#9fa19f', fg: '#ffffff' },
  Fire: { bg: '#e8622c', fg: '#ffffff' },
  Water: { bg: '#2f80ed', fg: '#ffffff' },
  Electric: { bg: '#f2c12e', fg: '#2a2100' },
  Grass: { bg: '#3fa34d', fg: '#ffffff' },
  Ice: { bg: '#4cc3d9', fg: '#06262d' },
  Fighting: { bg: '#c23b2e', fg: '#ffffff' },
  Poison: { bg: '#9443b5', fg: '#ffffff' },
  Ground: { bg: '#b8873a', fg: '#ffffff' },
  Flying: { bg: '#7f9ee8', fg: '#ffffff' },
  Psychic: { bg: '#e94f84', fg: '#ffffff' },
  Bug: { bg: '#8fa320', fg: '#ffffff' },
  Rock: { bg: '#a99050', fg: '#ffffff' },
  Ghost: { bg: '#6a4f8f', fg: '#ffffff' },
  Dragon: { bg: '#5b5fd6', fg: '#ffffff' },
  Dark: { bg: '#4f4442', fg: '#ffffff' },
  Steel: { bg: '#7d95a5', fg: '#ffffff' },
};

export const typeAbbr = (t: string) => t.slice(0, 3).toUpperCase();
