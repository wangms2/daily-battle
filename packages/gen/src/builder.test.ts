import { describe, expect, it } from 'vitest';
import { styleFor } from './builder';

describe('styleFor', () => {
  const days = Array.from({ length: 60 }, (_, i) =>
    new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10),
  );

  it.each([3, 4, 5, 6])('gen %i: 40/40/20, defensive days spaced out', (gen) => {
    const styles = days.map((d) => styleFor(d, gen));
    const count = (s: string) => styles.filter((x) => x === s).length;
    expect([count('offense'), count('balance'), count('stall')]).toEqual([24, 24, 12]);
    styles.forEach((s, i) => {
      if (s === 'stall') expect(styles.slice(i + 1, i + 5)).not.toContain('stall');
    });
  });

  it('shifts by gen, so the games differ on a day', () => {
    const day = '2026-11-09';
    expect(new Set([3, 4, 5, 6].map((g) => styleFor(day, g))).size).toBeGreaterThan(1);
  });
});
