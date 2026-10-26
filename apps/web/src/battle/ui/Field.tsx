// The battlefield, Showdown-style on a Gen 4 background: the foe on the far
// platform, you on the near one, each with a floating name, HP bar, and six
// team marks. Hazards are drawn on the ground, weather drifts over the scene,
// and result labels float up and fade.
//
// Everything is placed in the background image's own coordinates (753×500,
// with the scene at x 150–590, y 90–385) via X() and Y(), which scale by --s:
// the factor that makes the scene cover the field (see .battle-field in
// styles.css). So sprites stay on their platforms at any size.
import clsx from 'clsx';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from 'react';
import { HAZARD_FX, TERRAIN_FX, WEATHER_FX } from '../../lib/fx';
import { activeFormat, speciesInfo } from '../../lib/data';
import { getSprite } from '../../lib/sprites';
import { genOf } from '@daily-battle/data';
import type { SceneInit } from '../anim/scene';
import type { Frame, MonView, SideConds, TeamMark, View, Who } from '../frames';
import { TypeBadge } from '../../ui/bits';
import { boostLabels, STATUS_COLOR, STATUS_LABEL } from './labels';

export interface Anim {
  kind: string;
  who?: Who;
  key: number;
}

/** What the move animations need from the field: its layers and the two sprites. */
export type Stage = () => Omit<SceneInit, 'accel'> | null;

/** A label or pop-up floating over the field until its animation ends. */
export interface Float {
  id: number;
  label?: Frame['label'];
  popup?: Frame['popup'];
}

const X = (x: number) => `calc(50cqw + var(--s) * ${x - 370})`;
const Y = (y: number) => `calc(100cqh - var(--s) * ${385 - y})`;
/** Top of the foe's stat bar; its details card opens just below it. */
const FOE_BAR_TOP = `max(6px, calc(${Y(150)} - 58px))`;
/** The stat bar's height with its types and team marks, and its width (w-[9.75rem]). */
const FOE_BAR_H = '70px';
const BAR_W = '9.75rem';

/**
 * Where the foe's stat bar goes: over its platform, unless the sprite there
 * would reach up into it (a tall sprite like Aerodactyl, or any sizeable one
 * on a short phone field), and then beside the sprite on the left. CSS can't
 * branch, so the shift is clamp(0, overlap × 1000, full shift): zero while
 * the sprite stays clear, all the way over as soon as it doesn't.
 */
function foeBarLeft(size: { w: number; h: number } | null): string {
  const over = `min(calc(${X(SPOT.foe.x)} - 4.875rem), calc(100cqw - 10.5rem))`;
  if (!size) return over;
  const spriteTop = Y(SPOT.foe.feet - size.h);
  const overlap = `(${FOE_BAR_TOP} + ${FOE_BAR_H} + 2px - ${spriteTop})`;
  const beside = `max(6px, calc(${X(SPOT.foe.x)} - var(--s) * ${size.w / 2} - ${BAR_W} - 6px))`;
  return `calc(${over} - clamp(0px, ${overlap} * 1000, calc(${over} - ${beside})))`;
}
/** Your stat bar's usual top, just above your sprite's platform, and its height. */
const YOU_BAR_TOP = `calc(${Y(262)} - 55px)`;
const YOU_BAR_H = '49px';
/** Your back sprite is drawn this much larger (as in the games). */
const BACK_SCALE = 1.4;
/**
 * Gen 3's Emerald sprites sit small in a 64px box, so they're drawn larger to
 * stand on the platforms like the other gens' sprites.
 */
const GEN3_ZOOM = 1.5;

/**
 * Where your stat bar goes: above your platform's left side, unless your
 * sprite reaches up into it (Staraptor, Moltres, ...); then the empty bottom
 * right of the field, beside the sprite, where the games put your HP box.
 * The same clamp(0, overlap × 1000, shift) switch as foeBarLeft.
 */
function youBarPos(size: { w: number; h: number } | null): { left: string; top: string } {
  const left = `max(8px, calc(${X(SPOT.you.x)} - 4.875rem))`;
  if (!size) return { left, top: YOU_BAR_TOP };
  const spriteTop = Y(SPOT.you.feet - size.h * BACK_SCALE);
  const overlap = `(${YOU_BAR_TOP} + ${YOU_BAR_H} + 2px - ${spriteTop})`;
  const asideLeft = `min(calc(100cqw - ${BAR_W} - 8px), calc(${X(SPOT.you.x)} + var(--s) * ${(size.w * BACK_SCALE) / 2} + 8px))`;
  const asideTop = `calc(100cqh - ${YOU_BAR_H} - 8px)`;
  const shift = (from: string, to: string) =>
    `calc(${from} + clamp(0px, ${overlap} * 1000, calc(${to} - ${from})))`;
  return { left: shift(left, asideLeft), top: shift(YOU_BAR_TOP, asideTop) };
}

/** Where things sit for each side, in image coordinates. */
const SPOT = {
  foe: { x: 480, feet: 255, label: 190, popup: 165 },
  you: { x: 250, feet: 382, label: 300, popup: 275 },
};

const WEATHER_LABEL: Record<string, string> = {
  Sandstorm: 'Sandstorm',
  RainDance: 'Rain',
  SunnyDay: 'Harsh sun',
  Hail: 'Hail',
};

function hpColor(hp: number) {
  return hp > 50 ? 'var(--good)' : hp > 20 ? '#c9a227' : 'var(--bad)';
}

export function HpBar({
  hp,
  animate,
  className,
}: {
  hp: number;
  animate: boolean;
  className?: string;
}) {
  return (
    <div className={clsx('h-2 overflow-hidden rounded-full bg-surface-2', className)} aria-hidden>
      <div
        className="h-full rounded-full"
        style={{
          width: `${hp}%`,
          background: hpColor(hp),
          transition: animate ? 'width 420ms ease-out, background-color 420ms' : 'none',
        }}
      />
    </div>
  );
}

/**
 * The foe's team: a Pokémon it has shown, by its icon (tap for its card), and
 * one not seen yet as a ball.
 */
function TeamMarks({ marks, onPick }: { marks: TeamMark[]; onPick?: (species: string) => void }) {
  return (
    <span className="flex items-center gap-0.5">
      {marks.map((m, i) => {
        const img = (
          <img
            src={m.species ? getSprite(m.species, 'icon') : HAZARD_FX.pokeball}
            alt=""
            className={clsx(
              'pixelated object-contain',
              m.species ? 'h-[19px] w-[25px]' : 'mx-[5px] size-[15px]',
              m.fainted && 'opacity-35 grayscale',
            )}
          />
        );
        const species = m.species;
        return species && onPick ? (
          <button
            key={i}
            type="button"
            data-mon
            className="-my-1 rounded-[3px] py-1"
            aria-label={`Foe's ${species}${m.fainted ? ', fainted' : m.hp !== undefined ? `, ${m.hp}% HP` : ''}. Details`}
            onClick={(e) => {
              e.stopPropagation();
              onPick(species);
            }}
          >
            {img}
          </button>
        ) : (
          <span key={i} aria-hidden>
            {img}
          </span>
        );
      })}
    </span>
  );
}

function StatBar({
  mon,
  who,
  marks,
  animate,
  style,
  onInfo,
  onPick,
}: {
  mon: MonView;
  who: Who;
  marks: TeamMark[];
  animate: boolean;
  style: CSSProperties;
  onInfo: (who: Who | null, how: 'tap' | 'hover') => void;
  /** A foe team icon tapped: that Pokémon's card. */
  onPick?: (species: string) => void;
}) {
  const boosts = boostLabels(mon.boosts);
  const left = marks.filter((m) => !m.fainted).length;
  return (
    <div
      className="statbar absolute z-10 w-[9.75rem] text-left"
      style={style}
      // Lesson demos point at parts of the screen by these (Spotlight.tsx).
      data-spot={`${who}-plate`}
    >
      <button
        type="button"
        data-mon
        onClick={(e) => {
          e.stopPropagation();
          onInfo(who, 'tap');
        }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && onInfo(who, 'hover')}
        onPointerLeave={(e) => e.pointerType === 'mouse' && onInfo(null, 'hover')}
        aria-label={`${who === 'foe' ? 'Foe' : 'Your'} ${mon.base ? `Mega ${mon.base}` : mon.species}, ${mon.hp}% HP${mon.status ? `, ${STATUS_LABEL[mon.status]}` : ''}, ${left} of ${marks.length} left. Details`}
        className="statbar-btn block w-full text-left"
      >
        <span className="flex items-center gap-1">
          <span className="truncate text-[13px] leading-4 font-bold">
            {mon.base ?? mon.species}
          </span>
          {mon.base && (
            <span
              className="mega-badge shrink-0 rounded-[3px] px-1 text-[9.5px] leading-[14px] font-bold"
              title={mon.species}
            >
              Mega
            </span>
          )}
          {/* Every Pokémon here is level 100, as on Showdown's ladder. */}
          <span className="shrink-0 text-[10px] leading-4 font-semibold text-muted">L100</span>
          {mon.status && (
            <span
              className="rounded-[3px] px-1 text-[9.5px] leading-[14px] font-bold text-white"
              style={{ background: STATUS_COLOR[mon.status] }}
            >
              {STATUS_LABEL[mon.status]}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex items-center gap-1">
          <span
            data-spot={`${who}-hp`}
            className="statbar-hp h-[7px] flex-1 overflow-hidden rounded-[3px]"
          >
            <span
              className="block h-full"
              style={{
                width: `${mon.hp}%`,
                background: hpColor(mon.hp),
                transition: animate ? 'width 420ms ease-out, background-color 420ms' : 'none',
              }}
            />
          </span>
          <span className="statbar-pill rounded-[3px] px-1 text-[10px] leading-[13px] font-semibold tabular-nums">
            {mon.hp}%
          </span>
        </span>
        {/* Its types (as it looks now, so a Mega shows its Mega typing) and any stat changes. */}
        <span className="mt-0.5 flex items-center gap-1">
          <span data-spot={`${who}-types`} className="flex items-center gap-1">
            {speciesInfo(mon.species).types.map((t) => (
              <TypeBadge key={t} type={t} size="sm" />
            ))}
          </span>
          {boosts.length > 0 && (
            <span className="min-w-0 truncate text-[10px] leading-3 font-semibold">
              {boosts.join(' ')}
            </span>
          )}
        </span>
      </button>
      {/* Only the foe's team shows here; yours is on the bench row below the moves. */}
      {who === 'foe' && (
        <span data-spot="foe-team" className="mt-0.5 flex items-center">
          <TeamMarks marks={marks} {...(onPick && { onPick })} />
        </span>
      )}
    </div>
  );
}

/** Stealth Rock, Spikes, Toxic Spikes, and Sticky Web on one side's ground; screens as tinted glass. */
function SideEffects({ side, who }: { side: SideConds; who: Who }) {
  const foe = who === 'foe';
  const rocks = foe
    ? [
        [432, 262],
        [458, 250],
        [508, 262],
        [534, 251],
      ]
    : [
        [178, 382],
        [214, 372],
        [292, 382],
        [326, 372],
      ];
  const spikes = foe
    ? [
        [446, 270],
        [482, 274],
        [518, 270],
      ]
    : [
        [196, 386],
        [252, 390],
        [308, 386],
      ];
  const tspikes = foe
    ? [
        [456, 240],
        [506, 240],
      ]
    : [
        [214, 364],
        [290, 364],
      ];
  const sprite = (src: string, [x, y]: number[], size: number, key: string) => (
    <img
      key={key}
      src={src}
      alt=""
      className="pixelated absolute -translate-x-1/2 -translate-y-full"
      style={{ left: X(x!), top: Y(y!), width: `calc(var(--s) * ${size})` }}
    />
  );
  const names = [
    side.sr && 'Stealth Rock',
    side.spikes && `Spikes ×${side.spikes}`,
    side.tspikes && `Toxic Spikes ×${side.tspikes}`,
    side.web && 'Sticky Web',
    side.reflect && 'Reflect',
    side.lightScreen && 'Light Screen',
  ].filter(Boolean);
  const screen = foe ? { l: 400, r: 560, t: 150, b: 258 } : { l: 160, r: 340, t: 250, b: 395 };
  return (
    <div
      className="pointer-events-none absolute inset-0"
      role="img"
      aria-label={names.length ? `${foe ? 'Foe' : 'Your'} side: ${names.join(', ')}` : undefined}
      aria-hidden={!names.length}
    >
      {side.reflect && (
        <span
          className="screen-reflect absolute"
          style={{
            left: X(screen.l),
            right: `calc(100cqw - ${X(screen.r)})`,
            top: Y(screen.t),
            bottom: `calc(100cqh - ${Y(screen.b)})`,
          }}
        />
      )}
      {side.lightScreen && (
        <span
          className="screen-light absolute"
          style={{
            left: X(screen.l + 6),
            right: `calc(100cqw - ${X(screen.r - 6)})`,
            top: Y(screen.t + 6),
            bottom: `calc(100cqh - ${Y(screen.b)})`,
          }}
        />
      )}
      {side.web &&
        // Where Showdown lays it: a faint web just behind the platform's center.
        sprite(HAZARD_FX.web, foe ? [495, 255] : [265, 380], foe ? 90 : 120, 'web')}
      {side.sr && rocks.map((p, i) => sprite(HAZARD_FX.rocks[i % 2]!, p, foe ? 20 : 26, `r${i}`))}
      {spikes
        .slice(0, side.spikes)
        .map((p, i) => sprite(HAZARD_FX.spikes, p, foe ? 20 : 26, `s${i}`))}
      {tspikes
        .slice(0, side.tspikes)
        .map((p, i) => sprite(HAZARD_FX.toxicSpikes, p, foe ? 20 : 26, `t${i}`))}
    </div>
  );
}

function FieldSprite({
  mon,
  who,
  anim,
  animate,
  ported,
  imgRef,
  onTap,
  onHover,
  onSize,
}: {
  mon: MonView | null;
  who: Who;
  anim: Anim | null;
  animate: boolean;
  /** Showdown's move animations drive this sprite, so no lunge of our own. */
  ported: boolean;
  imgRef: RefObject<HTMLImageElement | null>;
  /** Tapping the Pokémon itself: details (the stat bar is the accessible control). */
  onTap: () => void;
  /** A mouse over the Pokémon: its card shows while it's there (desktop). */
  onHover?: (on: boolean) => void;
  /** The sprite's natural size once it loads. */
  onSize?: (size: { w: number; h: number }) => void;
}) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  if (!mon) return null;
  const mine = anim && anim.who === who;
  const cls =
    animate && mine
      ? anim.kind === 'damage' || anim.kind === 'crit'
        ? 'anim-hit'
        : anim.kind === 'switch'
          ? who === 'you'
            ? 'anim-in-left'
            : 'anim-in-right'
          : anim.kind === 'faint'
            ? 'anim-faint'
            : anim.kind === 'mega'
              ? 'anim-mega'
              : anim.kind === 'move' && !ported
                ? who === 'you'
                  ? 'anim-lunge-right'
                  : 'anim-lunge-left'
                : ''
      : '';
  const spot = SPOT[who];
  // Near-side (back) sprites are drawn a little larger, as in the games.
  const scale = who === 'you' ? BACK_SCALE : 1;
  return (
    <div
      data-mon
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onHover?.(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onHover?.(false)}
      className="absolute flex -translate-x-1/2 cursor-pointer items-end justify-center"
      style={{ left: X(spot.x), bottom: `calc(100cqh - ${Y(spot.feet)})` }}
    >
      <img
        ref={imgRef}
        // A new key restarts the CSS animation; the ported ones must keep this element.
        key={`${mon.species}-${mine && !(ported && (anim.kind === 'move' || anim.kind === 'status')) ? anim.key : 0}`}
        // Behind a substitute, Showdown's doll stands in for the Pokémon.
        src={getSprite(
          mon.substitute ? 'Substitute' : mon.species,
          who === 'you' ? 'back' : 'front',
        )}
        data-substitute={mon.substitute || undefined}
        alt=""
        draggable={false}
        onLoad={(e) => {
          const zoom = genOf(activeFormat()) === 3 && !mon.substitute ? GEN3_ZOOM : 1;
          const size = {
            w: e.currentTarget.naturalWidth * zoom,
            h: e.currentTarget.naturalHeight * zoom,
          };
          setNatural(size);
          onSize?.(size);
        }}
        style={
          natural
            ? {
                width: `calc(var(--s) * ${natural.w * scale})`,
                height: `calc(var(--s) * ${natural.h * scale})`,
              }
            : { visibility: 'hidden' }
        }
        className={clsx('pixelated max-w-none', cls, mon.fainted && 'opacity-0')}
      />
    </div>
  );
}

export function Field({
  view,
  anim,
  animate,
  background,
  floats,
  onFloatDone,
  onTap,
  info,
  onInfo,
  onPick,
  popover,
  className,
  busy = false,
  stageRef,
  ported = false,
}: {
  /** Set to a function that hands the move animations this field's layers and sprites. */
  stageRef?: RefObject<Stage | null>;
  /** The move animations are loaded and drive the sprites. */
  ported?: boolean;
  /** A turn is playing: tapping a Pokémon skips instead of opening details. */
  busy?: boolean;
  /** Sizing from the layout (fixed shape on phones, fill on wide screens). */
  className?: string;
  view: View | null;
  anim: Anim | null;
  animate: boolean;
  /** The day's background image URL. */
  background: string;
  floats: Float[];
  onFloatDone: (id: number) => void;
  /** Tapping the field (outside the stat bars) skips playback. */
  onTap: () => void;
  /** Whose details card is open. */
  info: Who | null;
  onInfo: (who: Who | null) => void;
  /** A foe team icon tapped: open that Pokémon's card (as `info` 'foe'). */
  onPick?: (species: string) => void;
  /** The details card for `info`. */
  popover: ReactNode;
}) {
  const weather = view?.weather ?? '';
  const terrain = view?.terrain ?? '';
  const fieldEl = useRef<HTMLDivElement>(null);
  const fxEl = useRef<HTMLDivElement>(null);
  const bgFxEl = useRef<HTMLDivElement>(null);
  const bgEl = useRef<HTMLDivElement>(null);
  const youImg = useRef<HTMLImageElement>(null);
  const foeImg = useRef<HTMLImageElement>(null);
  const [hovered, setHovered] = useState(false);
  const [foeSize, setFoeSize] = useState<{ species: string; w: number; h: number } | null>(null);
  const foeSpecies = view?.foe?.species;
  const foeLeft = foeBarLeft(foeSize?.species === foeSpecies ? foeSize : null);
  const [youSize, setYouSize] = useState<{ species: string; w: number; h: number } | null>(null);
  const youSpecies = view?.you?.species;
  const youBar = youBarPos(youSize?.species === youSpecies ? youSize : null);

  // Hand the move animations the field, its two layers, and both sprites as they are now.
  useLayoutEffect(() => {
    if (!stageRef) return;
    stageRef.current = () => {
      const field = fieldEl.current;
      const layer = fxEl.current;
      const bgLayer = bgFxEl.current;
      const bg = bgEl.current;
      const you = youImg.current;
      const foe = foeImg.current;
      if (!field || !layer || !bgLayer || !bg || !you || !foe) return null;
      if (!youSize || !foeSize) return null;
      if (youSize.species !== youSpecies || foeSize.species !== foeSpecies) return null;
      return {
        field,
        bg,
        layer,
        bgLayer,
        you: { el: you, w: youSize.w, h: youSize.h, url: you.src },
        foe: { el: foe, w: foeSize.w, h: foeSize.h, url: foe.src },
      };
    };
    return () => {
      stageRef.current = null;
    };
  });

  // A tap anywhere outside the stat bars closes the details card.
  useEffect(() => {
    if (!info || hovered) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-mon]')) onInfo(null);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [info, hovered, onInfo]);

  const handleInfo = (who: Who | null, how: 'tap' | 'hover') => {
    if (how === 'hover') {
      setHovered(!!who);
      onInfo(who);
    } else {
      setHovered(false);
      onInfo(info === who && !hovered ? null : who);
    }
  };

  return (
    <div
      ref={fieldEl}
      className={clsx(
        'battle-field relative min-h-0 overflow-hidden rounded-card border border-line',
        className,
      )}
      onClick={onTap}
      role="presentation"
    >
      <div
        ref={bgEl}
        className="battle-bg absolute inset-0"
        style={{ backgroundImage: `url(${background})` }}
        aria-hidden
      />
      <div ref={bgFxEl} className="pointer-events-none absolute inset-0" aria-hidden />
      {weather && WEATHER_FX[weather] && (
        <div
          className={clsx(
            'weather-fx absolute inset-0',
            `weather-fx-${weather.toLowerCase()}`,
            animate && 'weather-fx-animate',
          )}
          style={{ backgroundImage: `url(${WEATHER_FX[weather]})` }}
          aria-hidden
        />
      )}
      {terrain && TERRAIN_FX[terrain] && (
        <div
          className="terrain-fx absolute inset-0"
          style={{ backgroundImage: `url(${TERRAIN_FX[terrain]})` }}
          aria-hidden
        />
      )}

      {view && <SideEffects side={view.foeSide} who="foe" />}
      <FieldSprite
        mon={view?.foe ?? null}
        who="foe"
        anim={anim}
        animate={animate}
        ported={ported}
        imgRef={foeImg}
        onTap={() => (busy ? onTap() : handleInfo('foe', 'tap'))}
        onHover={(on) => handleInfo(on ? 'foe' : null, 'hover')}
        onSize={(size) => foeSpecies && setFoeSize({ species: foeSpecies, ...size })}
      />
      {view && <SideEffects side={view.yourSide} who="you" />}
      <FieldSprite
        mon={view?.you ?? null}
        who="you"
        anim={anim}
        animate={animate}
        ported={ported}
        imgRef={youImg}
        onTap={() => (busy ? onTap() : handleInfo('you', 'tap'))}
        onHover={(on) => handleInfo(on ? 'you' : null, 'hover')}
        onSize={(size) => youSpecies && setYouSize({ species: youSpecies, ...size })}
      />

      <div ref={fxEl} className="pointer-events-none absolute inset-0 z-[5]" aria-hidden />

      {view?.foe && (
        <StatBar
          mon={view.foe}
          who="foe"
          marks={view.foeTeam}
          animate={animate}
          onInfo={handleInfo}
          {...(onPick && { onPick })}
          style={{ left: foeLeft, top: FOE_BAR_TOP }}
        />
      )}
      {/* Between a faint and the next switch-in (both sides choosing after a double
          faint), the foe's team still shows, so you can see what they have left. */}
      {view && !view.foe && (
        <span
          className="statbar absolute z-10 rounded-[4px] px-1 py-0.5"
          style={{ left: foeBarLeft(null), top: FOE_BAR_TOP }}
          role="group"
          aria-label={`Foe has ${view.foeTeam.filter((m) => !m.fainted).length} of ${view.foeTeam.length} left`}
        >
          <TeamMarks marks={view.foeTeam} {...(onPick && { onPick })} />
        </span>
      )}
      {view?.you && (
        <StatBar
          mon={view.you}
          who="you"
          marks={view.yourTeam}
          animate={animate}
          onInfo={handleInfo}
          style={youBar}
        />
      )}

      {(weather || terrain) && (
        <span className="absolute top-1.5 left-1.5 flex gap-1">
          {[weather && (WEATHER_LABEL[weather] ?? weather), terrain].filter(Boolean).map((name) => (
            <span
              key={name}
              className="rounded-badge bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            >
              {name}
            </span>
          ))}
        </span>
      )}

      {floats.map((f) => {
        const item = f.label ?? f.popup;
        if (!item) return null;
        const spot = SPOT[item.who];
        return (
          <span
            key={f.id}
            aria-hidden
            onAnimationEnd={() => onFloatDone(f.id)}
            className={clsx(
              'pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap',
              f.label ? `float-label float-${f.label.tone}` : 'float-popup',
            )}
            style={{
              left: `clamp(3.5rem, ${X(spot.x)}, calc(100cqw - 3.5rem))`,
              top: Y(f.label ? spot.label : spot.popup),
            }}
          >
            {item.text}
          </span>
        );
      })}

      {info && popover && (
        <div
          // Never under the pointer: it must not steal hover from the stat bar.
          className="pointer-events-none absolute right-1.5 z-30"
          style={info === 'foe' ? { top: '0.375rem', bottom: '0.375rem' } : { bottom: '0.375rem' }}
        >
          {info === 'foe' ? (
            // Just under the foe's stat bar, unless the card is too tall for the field:
            // the spacer above it gives way, and the card rides up over the bar.
            <div className="flex h-full flex-col">
              <div
                className="shrink"
                style={{ flexBasis: `calc(${FOE_BAR_TOP} + 4.6rem - 0.375rem)` }}
              />
              <div className="shrink-0">{popover}</div>
            </div>
          ) : (
            popover
          )}
        </div>
      )}
    </div>
  );
}
