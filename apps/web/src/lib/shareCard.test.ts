import { FORMATS } from '@daily-battle/data/formats';
import { describe, expect, it } from 'vitest';
import { summarizeDay } from './results';
import { shareModel } from './share';
import { LIDS } from './genColors';

/** WCAG contrast of white text on a `#rrggbb` colour. */
function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r! + 0.7152 * g! + 0.0722 * b! + 0.05);
}

describe('share card colours', () => {
  it('gives every game its own lid, readable under white text', () => {
    const ids = Object.keys(FORMATS);
    expect(Object.keys(LIDS).sort()).toEqual([...ids].sort());
    expect(new Set(ids.map((f) => LIDS[f as keyof typeof LIDS].lid)).size).toBe(ids.length);
    for (const { lid, deep } of Object.values(LIDS)) {
      expect(contrastWithWhite(lid)).toBeGreaterThanOrEqual(4.5);
      expect(contrastWithWhite(deep)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('carries the game played into the share model', () => {
    const summary = summarizeDay(undefined, true);
    expect(shareModel({ day: '2026-10-21', summary, streak: 0, format: 'gen5ou' }).format).toBe(
      'gen5ou',
    );
    expect(shareModel({ day: '2026-10-21', summary, streak: 0 })).not.toHaveProperty('format');
  });
});
