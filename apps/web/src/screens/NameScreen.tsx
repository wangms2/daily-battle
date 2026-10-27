// The first time the game opens, Pikachu pops up over the landing and asks the
// player's name, the way the main games' professor does: part of the game, not a
// sign-up, and over the landing so it's clear this is Pokémon Daily. The name is the player's
// everywhere (versus too). It stays on this device until they protect it with a
// password after a win (DESIGN.md §10).
import { cleanName } from '@daily-battle/versus';
import clsx from 'clsx';
import { useEffect, useRef, useState } from 'react';
import { randomName } from '../lib/names';
import { SignInForm } from '../sheets/Trainer';
import { useNameCheck } from '../state/useNameCheck';
import { getSprite } from '../lib/sprites';
import { DiceIcon } from '../ui/icons';

/** How long "Nice to meet you" shows before the card goes (a tap skips it). */
const GREETING_MS = 1800;
/** The card sliding away and the dim lifting (styles.css, .name-pop). */
const LEAVE_MS = 320;

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
  // A name someone has protected is theirs: pick another (or sign in to it).
  const taken = useNameCheck(clean) === 'taken';
  // The greeting carries on once: when it times out, or at a tap.
  // The greeting shows a moment (a tap skips it), then the card slides away.
  const [leaving, setLeaving] = useState(false);
  const sent = useRef(false);
  useEffect(() => {
    if (!met) return;
    const t = setTimeout(
      () => {
        if (!leaving) return setLeaving(true);
        if (sent.current) return;
        sent.current = true;
        onDone(met);
      },
      leaving ? LEAVE_MS : GREETING_MS,
    );
    return () => clearTimeout(t);
  }, [met, leaving, onDone]);

  return (
    <div
      className={clsx('name-pop fixed inset-0 z-40 flex items-end', leaving && 'is-leaving')}
      data-gen="3"
    >
      <div aria-hidden className="name-pop-dim absolute inset-0" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
        className="name-pop-card relative mx-auto grid w-full max-w-[440px] grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      >
        {/* Pikachu stands on the card's top edge, peeking up to say hello. */}
        <img
          src={getSprite('Pikachu', 'front', undefined, 5)}
          alt=""
          className="pixelated absolute -top-[104px] left-6 size-28 object-contain object-bottom"
        />

        <div
          className="name-bubble home-serif grid min-h-[92px] content-center px-4 py-3"
          role="status"
          onClick={met ? () => setLeaving(true) : undefined}
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
              if (clean && !taken) setMet(clean);
            }}
          >
            <div className="flex gap-2">
              <input
                className="field home-serif h-12 min-w-0 flex-1 px-3 text-[19px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={(e) => e.target.select()}
                autoComplete="nickname"
                maxLength={16}
                aria-label="Your name"
                aria-invalid={!clean || taken || undefined}
                aria-describedby={taken ? 'name-taken' : undefined}
              />
              <button
                type="button"
                onClick={() => setName(randomName())}
                aria-label="A random name"
                className="home-btn name-dice size-12 shrink-0"
              >
                <DiceIcon width={24} height={24} />
              </button>
            </div>
            {taken && (
              <p id="name-taken" role="alert" className="-mt-1 text-[14px] text-bad">
                Someone already protected that name. Try another!
              </p>
            )}
            <button
              type="submit"
              className="home-btn name-cta home-serif h-13 w-full text-[20px]"
              disabled={!clean || taken}
            >
              That’s me!
            </button>
            <button
              type="button"
              onClick={() => setSigningIn(true)}
              className="mx-auto h-10 px-3 text-[14px] text-muted hover:text-ink"
            >
              Played on another device? <span className="font-semibold text-accent">Sign in</span>
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
