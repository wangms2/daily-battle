// After a win, Showdown-style: the player's name is theirs on this device only
// until they protect it with a password. Then their progress is saved to it and
// they can sign in anywhere (DESIGN.md §10). It's always offered after a win
// until then, and never in the way: nothing needs it.
import { useState } from 'react';
import type { ProtectResult } from '../state/account';
import { Button } from './bits';

/** The shortest password a name can be protected with (as the server checks). */
export const PASSWORD_MIN = 5;

export function ProtectCard({
  name,
  streak,
  onProtect,
}: {
  name: string;
  streak: number;
  /** Registers the name with this password (and, if taken, under the new name given). */
  onProtect: (name: string, password: string) => Promise<ProtectResult>;
}) {
  const [password, setPassword] = useState('');
  const [newName, setNewName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = password.length < PASSWORD_MIN;

  const submit = async () => {
    setBusy(true);
    setError(null);
    const result = await onProtect(newName ?? name, password);
    setBusy(false);
    if (result === 'taken') {
      setNewName(newName ?? name);
      setError('Someone already protected that name. Pick another?');
    } else if (result === 'offline') {
      setError('Couldn’t reach the server. Try again in a moment.');
    }
  };

  return (
    <form
      className="mt-4 grid grid-cols-[minmax(0,1fr)] gap-2 rounded-card bg-surface-2 p-3 text-left"
      aria-label="Protect your streak"
      onSubmit={(e) => {
        e.preventDefault();
        if (!short && !busy) void submit();
      }}
    >
      <p className="text-[15px] font-semibold">
        🔒 Protect {streak > 1 ? `your ${streak}-day streak` : 'your progress'}?
      </p>
      <p className="text-[13px] leading-snug text-muted">
        Set a password for <strong className="text-ink">{newName ?? name}</strong> to keep your
        stars and streaks on any device.
      </p>
      {newName !== null && (
        <input
          className="h-10 rounded-btn border border-line bg-surface px-3 text-[15px] font-semibold"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={16}
          aria-label="Your name"
          autoComplete="username"
        />
      )}
      <div className="flex gap-2">
        <input
          type="password"
          className="h-10 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-[15px]"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          autoComplete="new-password"
        />
        <Button type="submit" className="h-10 shrink-0 px-4" disabled={short || busy}>
          {busy ? 'Saving…' : 'Protect'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
    </form>
  );
}
