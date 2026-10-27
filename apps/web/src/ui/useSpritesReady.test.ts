import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const pending: (() => void)[] = [];
vi.mock('../lib/sprites', () => ({
  loadSprites: () => new Promise<void>((resolve) => pending.push(resolve)),
}));

const { useSpritesReady } = await import('./useSpritesReady');

afterEach(() => {
  pending.length = 0;
  vi.useRealTimers();
});

describe('useSpritesReady', () => {
  it('holds nothing, then the old list, until every new sprite has loaded', async () => {
    const { result, rerender } = renderHook(({ s }) => useSpritesReady(s, 'icon'), {
      initialProps: { s: ['Pikachu', 'Eevee'] },
    });
    expect(result.current).toBeNull();
    await act(async () => pending.shift()!());
    expect(result.current).toEqual(['Pikachu', 'Eevee']);

    rerender({ s: ['Mew', 'Ditto'] });
    expect(result.current).toEqual(['Pikachu', 'Eevee']);
    await act(async () => pending.shift()!());
    expect(result.current).toEqual(['Mew', 'Ditto']);
  });

  it('shows the list anyway when a sprite is slow', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useSpritesReady(['Mew'], 'icon'));
    act(() => vi.advanceTimersByTime(2500));
    expect(result.current).toEqual(['Mew']);
  });
});
