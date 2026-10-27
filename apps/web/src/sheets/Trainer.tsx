// The player's name in Settings (DESIGN.md §10): rename it while it's only on
// this device, protect it with a password, sign in to a protected name from
// another device, sign out, or delete the account.
import { cleanName } from '@daily-battle/versus';
import { useState, type FormEvent } from 'react';
import { ChevronIcon } from '../ui/icons';
import { useAccount } from '../state/context';
import { Button } from '../ui/bits';
import { PASSWORD_MIN } from '../ui/ProtectCard';
import { saveName } from '../versus/saved';

const input = 'field h-10 min-w-0 px-3 text-[15px] placeholder:text-muted';

const SIGN_IN_ERROR = {
  wrong: 'That name and password don’t match.',
  locked: 'Too many tries. Wait a few minutes and try again.',
  offline: 'Couldn’t reach the server. Try again in a moment.',
} as const;

/** Name and password for a name protected on another device. */
export function SignInForm({ onDone }: { onDone?: () => void }) {
  const account = useAccount();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await account.signIn(name, password);
    setBusy(false);
    if (result === 'ok') {
      saveName(name);
      onDone?.();
    } else setError(SIGN_IN_ERROR[result]);
  };
  return (
    <form className="grid gap-2" onSubmit={submit} aria-label="Sign in">
      <input
        className={input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        aria-label="Your name"
        autoComplete="username"
        maxLength={16}
      />
      <input
        type="password"
        className={input}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        aria-label="Password"
        autoComplete="current-password"
      />
      {error && (
        <p role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !cleanName(name) || !password}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}

function ago(ms: number | null): string {
  if (ms === null) return 'saved';
  const s = Math.round((Date.now() - ms) / 1000);
  return s < 60 ? 'saved just now' : `saved ${Math.round(s / 60)} min ago`;
}

export function TrainerSection({
  name,
  onRename,
}: {
  name: string | undefined;
  onRename: (name: string) => void;
}) {
  const account = useAccount();
  const [mode, setMode] = useState<'view' | 'protect' | 'signIn' | 'delete'>('view');
  const [draft, setDraft] = useState(name ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (account.name) {
    return (
      <div className="grid gap-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">🔒 {account.name}</p>
            <p className="text-[13px] text-muted">Protected · {ago(account.syncedAt)}</p>
          </div>
          <Button
            variant="secondary"
            className="h-9 shrink-0 px-3"
            onClick={() => void account.signOut()}
          >
            Sign out
          </Button>
        </div>
        {mode === 'delete' ? (
          <form
            className="grid gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const ok = await account.deleteAccount(password);
              setBusy(false);
              if (!ok) setError('Wrong password, or no connection.');
            }}
          >
            <p className="text-[13px] text-muted">
              Deletes the saved copy. Your progress stays on this device.
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                className={`${input} flex-1`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                aria-label="Password"
                autoComplete="current-password"
              />
              <Button
                type="submit"
                variant="danger"
                className="h-10 shrink-0 px-3"
                disabled={busy || !password}
              >
                Delete
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-[13px] text-bad">
                {error}
              </p>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setMode('delete')}
            className="justify-self-start text-[13px] font-semibold text-muted hover:text-bad"
          >
            Delete account
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-2 py-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-[15px] font-medium">Your name</span>
        <input
          className={`${input} w-44 font-semibold`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const clean = cleanName(draft);
            if (clean && clean !== name) {
              onRename(clean);
              saveName(clean);
            } else setDraft(name ?? '');
          }}
          maxLength={16}
          autoComplete="nickname"
        />
      </label>
      {mode === 'protect' && name ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const result = await account.protect(name, password);
            setBusy(false);
            if (result === 'taken') setError('Someone already protected that name. Pick another?');
            else if (result === 'offline') setError(SIGN_IN_ERROR.offline);
          }}
        >
          <input
            type="password"
            className={`${input} flex-1`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            aria-label="Password"
            autoComplete="new-password"
          />
          <Button
            type="submit"
            className="h-10 shrink-0 px-4"
            disabled={busy || password.length < PASSWORD_MIN}
          >
            Protect
          </Button>
        </form>
      ) : mode === 'signIn' ? (
        <SignInForm />
      ) : (
        <div className="flex gap-2">
          {name && (
            <Button variant="secondary" className="h-9 flex-1" onClick={() => setMode('protect')}>
              🔒 Protect with a password
            </Button>
          )}
          <Button
            variant="secondary"
            className="h-9 shrink-0 px-3"
            onClick={() => setMode('signIn')}
          >
            Sign in
          </Button>
        </div>
      )}
      {mode !== 'view' && mode !== 'signIn' && error && (
        <p role="alert" className="text-[13px] text-bad">
          {error}
        </p>
      )}
      {mode === 'view' && (
        <p className="text-[12px] text-muted">
          Protect your name to keep your stars and streaks on any device.
        </p>
      )}
    </div>
  );
}

/** Settings' row for the player's name; it opens the Trainer page in place. */
export function TrainerRow({ name, onOpen }: { name: string | undefined; onOpen: () => void }) {
  const account = useAccount();
  const shown = account.name ?? name;
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-12 w-full items-center justify-between gap-4 py-1 text-left"
      >
        <span className="text-[15px] font-medium">Trainer</span>
        <span className="flex min-w-0 items-center gap-1 text-[15px] text-muted">
          <span className="truncate">
            {account.name ? '🔒 ' : ''}
            {shown ?? 'Sign in'}
          </span>
          <ChevronIcon className="size-4 shrink-0" aria-hidden />
        </span>
      </button>
    </>
  );
}
