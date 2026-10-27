// The first time someone plays, the game asks their name, the way the main games'
// professor does: part of the game, not a sign-up. The name is the player's
// everywhere (versus too). It stays on this device until they protect it with a
// password after a win (DESIGN.md §10).
import { cleanName } from '@daily-battle/versus';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { randomName } from '../lib/names';
import { SignInForm } from '../sheets/Trainer';
import { getSprite } from '../lib/sprites';
import { Button } from '../ui/bits';
import { DiceIcon } from '../ui/icons';

/** How long "Nice to meet you" shows before the game carries on (a tap skips it). */
const GREETING_MS = 1800;

export function NameScreen({
  initial,
  onDone,
  onSignedIn,
}: {
  /** A name to start from (say, the one used in versus); a random one otherwise. */
  initial?: string;
  onDone: (name: string) => void;
  /** Signed in to a name protected on another device: its progress is here now. */
  onSignedIn: () => void;
}) {
  const [name, setName] = useState(() => initial || randomName());
  const [met, setMet] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const clean = cleanName(name);
  // The greeting carries on once: when it times out, or at a tap.
  const [tapped, setTapped] = useState(false);
  const sent = useRef(false);
  useEffect(() => {
    if (!met) return;
    const finish = () => {
      if (sent.current) return;
      sent.current = true;
      onDone(met);
    };
    if (tapped) return finish();
    const t = setTimeout(finish, GREETING_MS);
    return () => clearTimeout(t);
  }, [met, tapped, onDone]);

  return (
    <div className="flex h-full flex-col bg-bg" data-gen="3">
      <main className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center gap-5 px-4 pb-6 pt-[max(16px,env(safe-area-inset-top))]">
        <div className="relative mx-auto grid h-40 w-48 place-items-end justify-center">
          <span aria-hidden className="name-ground" />
          <img
            src={getSprite('Pikachu', 'front', undefined, 5)}
            alt=""
            className="pixelated relative mb-3 size-28 object-contain object-bottom"
          />
        </div>

        <div
          className="battle-textbox min-h-[96px] justify-center px-4 py-3"
          role="status"
          onClick={met ? () => setTapped(true) : undefined}
        >
          {signingIn ? (
            <p>Welcome back! Sign in to pick up where you left off.</p>
          ) : met ? (
            <p>
              Nice to meet you, <strong>{met}</strong>! Your adventure starts now!
            </p>
          ) : (
            <p>Hi there! Welcome to Pokémon Daily. First, what’s your name?</p>
          )}
        </div>

        {signingIn && (
          <div className="grid gap-2">
            <SignInForm onDone={onSignedIn} />
            <button
              type="button"
              onClick={() => setSigningIn(false)}
              className="mx-auto h-10 px-3 text-[14px] font-semibold text-muted hover:text-ink"
            >
              Back
            </button>
          </div>
        )}
        {/* Hidden, not removed, after the name: the screen doesn't jump. */}
        {!signingIn && (
          <form
            className={clsx('grid gap-3', met && 'invisible')}
            inert={!!met}
            onSubmit={(e) => {
              e.preventDefault();
              if (clean) setMet(clean);
            }}
          >
            <div className="flex gap-2">
              <input
                className="h-12 min-w-0 flex-1 rounded-btn border border-line bg-surface px-3 text-[18px] font-semibold text-ink"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                autoComplete="nickname"
                maxLength={16}
                aria-label="Your name"
                aria-invalid={!clean || undefined}
              />
              <button
                type="button"
                onClick={() => setName(randomName())}
                aria-label="A random name"
                className="grid size-12 shrink-0 place-items-center rounded-btn border border-line bg-surface text-ink hover:bg-surface-2"
              >
                <DiceIcon width={24} height={24} />
              </button>
            </div>
            <Button type="submit" className="h-12 w-full text-[17px]" disabled={!clean}>
              That’s me!
            </Button>
            <button
              type="button"
              onClick={() => setSigningIn(true)}
              className="mx-auto h-10 px-3 text-[14px] text-muted hover:text-ink"
            >
              Played on another device? <span className="font-semibold text-accent">Sign in</span>
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
