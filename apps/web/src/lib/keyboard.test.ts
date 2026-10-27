import { describe, expect, it } from 'vitest';
import { keyboardInset } from './keyboard';

describe('keyboardInset', () => {
  it('is the part of the page the keyboard covers', () => {
    // An iPhone: 667 tall, the keyboard leaves 371 visible.
    expect(keyboardInset(667, { height: 371, offsetTop: 0 })).toBe(296);
    // Safari scrolled the page up to show the field: the visible part starts lower.
    expect(keyboardInset(667, { height: 371, offsetTop: 120 })).toBe(176);
  });

  it('is 0 with no keyboard, or when only the browser bar changed', () => {
    expect(keyboardInset(667, { height: 667, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(667, { height: 610, offsetTop: 0 })).toBe(0);
  });
});
