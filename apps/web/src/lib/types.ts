/** Type colors (the familiar game palette), with text that meets WCAG AA (4.5:1) on each. */
export const TYPE_COLORS: Record<string, { bg: string; fg: string }> = {
  Normal: { bg: '#9fa19f', fg: '#16181f' },
  Fire: { bg: '#e8622c', fg: '#16181f' },
  Water: { bg: '#2f80ed', fg: '#16181f' },
  Electric: { bg: '#f2c12e', fg: '#16181f' },
  Grass: { bg: '#3fa34d', fg: '#16181f' },
  Ice: { bg: '#4cc3d9', fg: '#16181f' },
  Fighting: { bg: '#c23b2e', fg: '#ffffff' },
  Poison: { bg: '#9443b5', fg: '#ffffff' },
  Ground: { bg: '#b8873a', fg: '#16181f' },
  Flying: { bg: '#7f9ee8', fg: '#16181f' },
  Psychic: { bg: '#e94f84', fg: '#16181f' },
  Bug: { bg: '#8fa320', fg: '#16181f' },
  Rock: { bg: '#a99050', fg: '#16181f' },
  Ghost: { bg: '#6a4f8f', fg: '#ffffff' },
  Dragon: { bg: '#5b5fd6', fg: '#ffffff' },
  Dark: { bg: '#4f4442', fg: '#ffffff' },
  Steel: { bg: '#7d95a5', fg: '#16181f' },
};

export const typeAbbr = (t: string) => t.slice(0, 3).toUpperCase();
