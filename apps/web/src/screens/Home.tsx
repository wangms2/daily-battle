// The first screens, a Poké Ball split: the Pokémon Daily logo, a mascot for each
// generation, and Play in the (larger) top half, With friends below. Play opens the
// game picker (Gen 3 to 6), where each game keeps its own weekly team, tries, and
// streak; a mascot opens its generation directly. A shared link lands on the picker.
//
// The landing and the picker are one screen in two states, so tapping Play is a
// curtain: the clay top rises, the ball glides up the seam and shrinks, the
// landing art fades, and the cartridges rise in one by one (see styles.css).
import type { Difficulty } from '@daily-battle/ai/version';
import type { FormatId } from '@daily-battle/data/formats';
import { Fragment, type CSSProperties } from 'react';
import { getSprite } from '../lib/sprites';
import { CoachBadge, DifficultyBadge } from '../ui/Difficulty';
import { Friends } from '../ui/Friends';
import { CheckIcon, ChevronIcon, FlameIcon, GearIcon } from '../ui/icons';

export interface GameRow {
  id: FormatId;
  /** "Gen 5" */
  name: string;
  /** The games it covers: ["Black", "White"]. */
  blurb: string[];
  streak: number;
  /** Today's status, e.g. "First try!" or "Not played yet". */
  today: string;
  /** Today's battle is won (first try or later). */
  cleared: boolean;
  /** Easy or Hard when picked; the streak and today's status are that difficulty's. */
  difficulty?: Difficulty;
  /** The coach is on: the streak and today's status are the Coached ones. */
  coached?: boolean;
}

/** One Pokémon for each game, on its cartridge. Gen 3 shows the games' own Emerald sprite. */
const MASCOT: Record<FormatId, { species: string; gen: number }> = {
  gen3ou: { species: 'Swampert', gen: 3 },
  gen4ou: { species: 'Lucario', gen: 4 },
  gen5ou: { species: 'Volcarona', gen: 5 },
  gen6ou: { species: 'Sylveon', gen: 6 },
};

/** Each cartridge's label wears the colors of its games, muted to sit with the rest of the UI. */
const LABEL: Record<FormatId, string> = {
  gen3ou: 'linear-gradient(110deg, #b3666c 0 34%, #6f8cb8 34% 67%, #5f9a80 67% 100%)',
  gen4ou: 'linear-gradient(110deg, #8aa0c4 0 calc(50% - 0.5px), #d8bfca calc(50% + 0.5px) 100%)',
  gen5ou: 'linear-gradient(110deg, #5d606b 0 calc(50% - 0.5px), #e2e2e8 calc(50% + 0.5px) 100%)',
  gen6ou: 'linear-gradient(110deg, #7b9bc2 0 calc(50% - 0.5px), #c4868c calc(50% + 0.5px) 100%)',
};

/** The game with lessons (Learn mode); its cartridge gets a Learn row. */
const LEARN_GAME: FormatId = 'gen3ou';

export function Home({
  view,
  games,
  onPlay,
  onFriends,
  onLearn,
  onPick,
  onBack,
  onSettings,
}: {
  view: 'landing' | 'picker';
  games: GameRow[];
  onPlay: () => void;
  onFriends: () => void;
  /** Opens Learn mode (the Gen 3 tutorial). */
  onLearn: () => void;
  onPick: (id: FormatId) => void;
  onBack: () => void;
  onSettings: () => void;
}) {
  const landing = view === 'landing';
  return (
    <div className="home flex h-full flex-col" data-view={view}>
      <section className="home-top relative shrink-0 overflow-hidden">
        <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between px-3 pt-[env(safe-area-inset-top)] wide:px-6">
          <div className="home-fade min-w-0" inert={landing} aria-hidden={landing}>
            <button
              type="button"
              onClick={onBack}
              className="-ml-2 flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 font-semibold text-white hover:bg-white/10"
            >
              <ChevronIcon className="size-[18px] rotate-180" aria-hidden />
              Back
            </button>
          </div>
          <button
            type="button"
            onClick={onSettings}
            className="grid size-10 place-items-center rounded-full text-white/85 hover:bg-white/10"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
        </header>

        <div
          className="home-fade home-title absolute inset-x-0 top-12 z-10"
          inert={landing}
          aria-hidden={landing}
        >
          <h1 className="home-serif mx-auto w-full max-w-[520px] px-5 text-[26px] leading-[1.1]">
            Choose a generation
          </h1>
        </div>

        {/* The landing's top half: the logo, a mascot for each generation (a tap opens
            it, and a check says it's cleared today), and Play. It keeps its size while
            the top rises, so the curtain hides it and it never squashes. */}
        <div className="home-landing" inert={!landing} aria-hidden={!landing}>
          <div className="relative mx-auto flex h-full w-full max-w-[520px] flex-col items-center justify-between px-[22px] pb-[clamp(30px,5cqh,70px)] pt-[max(10px,env(safe-area-inset-top))]">
            <img
              src={`${import.meta.env.BASE_URL}logo.webp`}
              alt="Pokémon Daily"
              className="home-logo"
              draggable={false}
            />
            <div className="home-mascots" role="group" aria-label="Generations">
              {games.map((g, i) => {
                const mascot = MASCOT[g.id];
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onPick(g.id)}
                    aria-label={`Play ${g.name} OU${g.cleared ? ', cleared today' : ''}`}
                    className="home-mascot"
                    style={{ '--i': i } as CSSProperties}
                  >
                    <span aria-hidden className="home-mascot-ground" />
                    <img
                      alt=""
                      draggable={false}
                      src={getSprite(mascot.species, 'front', undefined, mascot.gen)}
                      className={mascot.gen === 3 ? '[image-rendering:pixelated]' : undefined}
                    />
                    {g.cleared && (
                      <span aria-hidden className="home-mascot-check">
                        <CheckIcon />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <button type="button" onClick={onPlay} className="home-btn home-play home-serif">
              Play
            </button>
          </div>
        </div>
      </section>

      <div className="home-seam">
        <span aria-hidden className="home-ball" />
      </div>

      <section className="relative min-h-0 flex-1 overflow-hidden bg-bg">
        <div className="home-friends" inert={!landing} aria-hidden={!landing}>
          <div className="relative mx-auto flex h-full w-full max-w-[520px] flex-col items-center gap-4 pt-[clamp(48px,7.5cqh,96px)]">
            <button
              type="button"
              onClick={onFriends}
              className="home-btn home-friends-btn home-serif after:absolute after:inset-0 after:content-['']"
            >
              With friends
            </button>
            {/* Above the With friends button's full-width tap area. */}
            <button
              type="button"
              onClick={onLearn}
              className="relative z-10 rounded-full px-4 py-2 text-[15px] font-semibold text-muted underline underline-offset-4 hover:text-ink"
            >
              🎓 New to battling? Learn to battle
            </button>
          </div>
          <Friends className="absolute inset-x-0 bottom-6" />
        </div>

        <main
          className="home-games mx-auto flex w-full max-w-[520px] flex-col gap-2.5 px-4 pb-5 pt-7"
          inert={landing}
          aria-hidden={landing}
        >
          {games.map((g, i) => {
            const mascot = MASCOT[g.id];
            return (
              <Fragment key={g.id}>
                <button
                  type="button"
                  onClick={() => onPick(g.id)}
                  style={{ '--i': i } as CSSProperties}
                  className="home-cart grid min-h-0 max-h-[124px] flex-1 grid-cols-[84px_1fr_auto] items-center gap-2 p-2 text-left"
                >
                  <span
                    className="relative grid h-[76px] max-h-full place-items-center overflow-hidden rounded-md border border-black/15"
                    style={{ background: LABEL[g.id] }}
                  >
                    <span
                      aria-hidden
                      className="absolute inset-0"
                      style={{
                        background:
                          'radial-gradient(circle at 50% 55%, rgb(255 255 255 / 0.45), transparent 62%)',
                      }}
                    />
                    <img
                      alt=""
                      src={getSprite(mascot.species, 'front', undefined, mascot.gen)}
                      className={`relative max-h-[66px] max-w-[72px] object-contain drop-shadow-[0_1px_1px_rgb(0_0_0/0.3)] ${mascot.gen === 3 ? '[image-rendering:pixelated]' : ''}`}
                    />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="text-[17px] font-semibold">{g.name}</span>
                      <DifficultyBadge difficulty={g.difficulty} />
                      {g.coached && <CoachBadge />}
                    </span>
                    <span className="flex flex-wrap items-center text-[12.5px] leading-snug text-muted">
                      {g.blurb.map((game, j) => (
                        <Fragment key={game}>
                          {j > 0 && (
                            <span aria-hidden className="mx-2 h-4 w-0.5 rounded-full bg-muted/45" />
                          )}
                          {game}
                        </Fragment>
                      ))}
                    </span>
                    <span className="block truncate text-[12.5px] text-muted">{g.today}</span>
                  </span>
                  <span
                    className="flex items-center gap-1 text-[15px] font-semibold tabular-nums"
                    aria-label={`Streak ${g.streak}`}
                  >
                    <FlameIcon className={g.streak > 0 ? 'text-gold' : 'text-muted'} />
                    {g.streak}
                  </span>
                </button>
                {g.id === LEARN_GAME && (
                  <button
                    type="button"
                    onClick={onLearn}
                    style={{ '--i': i + 0.5 } as CSSProperties}
                    className="home-learn flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-left text-[14px] font-semibold hover:bg-surface-2"
                  >
                    <span aria-hidden>🎓</span>
                    <span className="flex-1">Learn to battle: lessons for new players</span>
                    <ChevronIcon className="size-4 text-muted" aria-hidden />
                  </button>
                )}
              </Fragment>
            );
          })}
        </main>
      </section>
    </div>
  );
}
