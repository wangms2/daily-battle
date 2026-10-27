import { act, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NameScreen } from './NameScreen';

vi.mock('../state/account', () => ({ nameTaken: async () => false }));

// Like App: re-renders every second, with a new onDone each time.
function Ticking({ onDone }: { onDone: (name: string) => void }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return <NameScreen initial="Misty" onDone={(n) => onDone(n)} onSignedIn={() => {}} />;
}

describe('NameScreen', () => {
  afterEach(() => vi.useRealTimers());

  it('goes away after the greeting even while the page re-renders every second', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Ticking onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'That’s me!' }));
    expect(screen.getByRole('status')).toHaveTextContent('Nice to meet you, Misty');
    for (let s = 0; s < 5; s++) act(() => vi.advanceTimersByTime(1000));
    expect(onDone).toHaveBeenCalledExactlyOnceWith('Misty');
  });

  it('goes away at the button once greeted', () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<Ticking onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'That’s me!' }));
    const go = screen.getByRole('button', { name: 'Let’s go!' });
    expect(go).toHaveFocus();
    fireEvent.click(go);
    act(() => vi.advanceTimersByTime(400));
    expect(onDone).toHaveBeenCalledExactlyOnceWith('Misty');
  });
});
