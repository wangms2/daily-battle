import { describe, expect, it } from 'vitest';
import { uiScale } from './uiScale';

describe('uiScale', () => {
  it('leaves phones and tablets alone', () => {
    for (const w of [375, 768, 1024, 1100]) expect(uiScale(w)).toBe(1);
  });
  it('grows steadily on computers: a laptop a little, 1440p at 1.6×, unscaled 4K over 2×', () => {
    expect(uiScale(1280)).toBeCloseTo(1.1);
    expect(uiScale(1920)).toBeCloseTo(1.35);
    expect(uiScale(2560)).toBeCloseTo(1.6);
    expect(uiScale(3840)).toBeCloseTo(2.15);
    expect(uiScale(6000)).toBe(2.25);
  });
});
