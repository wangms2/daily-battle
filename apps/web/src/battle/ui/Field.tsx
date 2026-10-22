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
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { HAZARD_FX, WEATHER_FX } from '../../lib/fx';
import { getSprite } from '../../lib/sprites';
import type { Frame, MonView, SideConds, TeamMark, View, Who } from '../frames';
import { boostLabels, STATUS_COLOR, STATUS_LABEL } from './labels';

export interface Anim {
  kind: string;
  who?: Who;
  key: number;
}

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

function TeamMarks({ marks }: { marks: TeamMark[] }) {
  return (
    <span className="flex items-center gap-px" aria-hidden>
      {marks.map((m, i) => (
        <img
          key={i}
          src={m.species ? getSprite(m.species, 'icon') : HAZARD_FX.pokeball}
          alt=""
          className={clsx(
            'pixelated object-contain',
            m.species ? 'h-[15px] w-5' : 'mx-[3px] size-[13px]',
            m.fainted && 'opacity-35 grayscale',
          )}
        />
      ))}
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
}: {
  mon: MonView;
  who: Who;
  marks: TeamMark[];
  animate: boolean;
  style: CSSProperties;
  onInfo: (who: Who | null, how: 'tap' | 'hover') => void;
}) {
  const boosts = boostLabels(mon.boosts);
  const left = marks.filter((m) => !m.fainted).length;
  return (
    <button
      type="button"
      data-statbar
      onClick={(e) => {
        e.stopPropagation();
        onInfo(who, 'tap');
      }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && onInfo(who, 'hover')}
      onPointerLeave={(e) => e.pointerType === 'mouse' && onInfo(null, 'hover')}
      aria-label={`${who === 'foe' ? 'Foe' : 'Your'} ${mon.species}, ${mon.hp}% HP${mon.status ? `, ${STATUS_LABEL[mon.status]}` : ''}, ${left} of 6 left. Details`}
      className="statbar absolute z-10 w-[9.75rem] text-left"
      style={style}
    >
      <span className="flex items-center gap-1">
        <span className="truncate text-[13px] leading-4 font-bold">{mon.species}</span>
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
        <span className="statbar-hp h-[7px] flex-1 overflow-hidden rounded-[3px]">
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
      {/* Only the foe's team shows here; yours is on the bench row below the moves. */}
      {(who === 'foe' || boosts.length > 0) && (
        <span className="mt-0.5 flex items-center justify-between gap-1">
          {who === 'foe' && <TeamMarks marks={marks} />}
          {boosts.length > 0 && (
            <span className="truncate text-[10px] leading-3 font-semibold">{boosts.join(' ')}</span>
          )}
        </span>
      )}
    </button>
  );
}

/** Stealth Rock, Spikes, and Toxic Spikes on one side's ground; screens as tinted glass. */
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
}: {
  mon: MonView | null;
  who: Who;
  anim: Anim | null;
  animate: boolean;
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
            : anim.kind === 'move'
              ? who === 'you'
                ? 'anim-lunge-right'
                : 'anim-lunge-left'
              : ''
      : '';
  const spot = SPOT[who];
  // Near-side (back) sprites are drawn a little larger, as in the games.
  const scale = who === 'you' ? 1.2 : 1;
  return (
    <div
      className="absolute flex -translate-x-1/2 items-end justify-center"
      style={{ left: X(spot.x), bottom: `calc(100cqh - ${Y(spot.feet)})` }}
    >
      <img
        key={`${mon.species}-${mine ? anim.key : 0}`}
        src={getSprite(mon.species, who === 'you' ? 'back' : 'front')}
        alt=""
        draggable={false}
        onLoad={(e) =>
          setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
        }
        style={
          natural
            ? {
                width: `calc(var(--s) * ${natural.w * scale})`,
                height: `calc(var(--s) * ${natural.h * scale})`,
              }
            : { visibility: 'hidden' }
        }
        className={clsx(
          'pixelated max-w-none',
          cls,
          mon.fainted && 'opacity-0',
          mon.substitute && 'opacity-60',
        )}
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
  popover,
  className,
}: {
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
  /** The details card for `info`. */
  popover: ReactNode;
}) {
  const weather = view?.weather ?? '';
  const [hovered, setHovered] = useState(false);

  // A tap anywhere outside the stat bars closes the details card.
  useEffect(() => {
    if (!info || hovered) return;
    const close = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('[data-statbar]')) onInfo(null);
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
      className={clsx(
        'battle-field relative min-h-0 overflow-hidden rounded-card border border-line',
        className,
      )}
      onClick={onTap}
      role="presentation"
    >
      <div
        className="battle-bg absolute inset-0"
        style={{ backgroundImage: `url(${background})` }}
        aria-hidden
      />
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

      {view && <SideEffects side={view.foeSide} who="foe" />}
      <FieldSprite mon={view?.foe ?? null} who="foe" anim={anim} animate={animate} />
      {view && <SideEffects side={view.yourSide} who="you" />}
      <FieldSprite mon={view?.you ?? null} who="you" anim={anim} animate={animate} />

      {view?.foe && (
        <StatBar
          mon={view.foe}
          who="foe"
          marks={view.foeTeam}
          animate={animate}
          onInfo={handleInfo}
          style={{
            left: `min(calc(${X(SPOT.foe.x)} - 4.875rem), calc(100cqw - 10.5rem))`,
            top: FOE_BAR_TOP,
          }}
        />
      )}
      {view?.you && (
        <StatBar
          mon={view.you}
          who="you"
          marks={view.yourTeam}
          animate={animate}
          onInfo={handleInfo}
          style={{
            left: `max(8px, calc(${X(SPOT.you.x)} - 4.875rem))`,
            // Without team marks, your bar is shorter, so it sits a little lower.
            top: `calc(${Y(262)} - 42px)`,
          }}
        />
      )}

      {weather && (
        <span className="absolute top-1.5 left-1.5 rounded-badge bg-black/45 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {WEATHER_LABEL[weather] ?? weather}
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
          style={info === 'foe' ? { top: `calc(${FOE_BAR_TOP} + 3.5rem)` } : { bottom: '0.375rem' }}
        >
          {popover}
        </div>
      )}
    </div>
  );
}
