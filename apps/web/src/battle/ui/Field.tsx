// The battlefield: foe top-right, you bottom-left (back sprite), each with an
// HP card on the opposite side so nothing overlaps.
import clsx from 'clsx';
import { useState } from 'react';
import { getSprite } from '../../lib/sprites';
import { useWide } from '../../ui/useWide';
import type { MonView, SideConds, View, Who } from '../frames';
import { boostLabels, STATUS_COLOR, STATUS_LABEL } from './labels';

export interface Anim {
  kind: string;
  who?: Who;
  key: number;
}

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

function HpCard({
  mon,
  who,
  animate,
  onTap,
}: {
  mon: MonView;
  who: Who;
  animate: boolean;
  onTap: () => void;
}) {
  const boosts = boostLabels(mon.boosts);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${who === 'foe' ? 'Foe' : 'Your'} ${mon.species}, ${mon.hp}% HP${mon.status ? `, ${STATUS_LABEL[mon.status]}` : ''}. Details`}
      className="card w-[11.5rem] max-w-full px-2.5 py-1.5 text-left"
    >
      <div className="flex items-center justify-between gap-1.5">
        <span className="truncate text-[13px] font-semibold">{mon.species}</span>
        {mon.status && (
          <span
            className="rounded-badge px-1 text-[10px] leading-4 font-bold text-white"
            style={{ background: STATUS_COLOR[mon.status] }}
          >
            {STATUS_LABEL[mon.status]}
          </span>
        )}
      </div>
      <HpBar hp={mon.hp} animate={animate} className="mt-1" />
      <div className="mt-0.5 flex items-center justify-between text-[11px] text-muted tabular-nums">
        <span className="truncate">{boosts.join(' ')}</span>
        <span className="font-semibold text-ink">
          {mon.hpExact ? `${mon.hpExact.hp}/${mon.hpExact.max}` : `${mon.hp}%`}
        </span>
      </div>
    </button>
  );
}

function Hazards({ side }: { side: SideConds }) {
  const chips = [
    side.sr && 'Stealth Rock',
    side.spikes && `Spikes${side.spikes > 1 ? ` ×${side.spikes}` : ''}`,
    side.tspikes && `Toxic Spikes${side.tspikes > 1 ? ` ×${side.tspikes}` : ''}`,
    side.reflect && 'Reflect',
    side.lightScreen && 'Light Screen',
  ].filter(Boolean) as string[];
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c}
          className="rounded-badge bg-surface/85 px-1.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line"
        >
          {c}
        </span>
      ))}
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
  // Sprites scale by whole-ish steps to stay crisp; wide screens have room for 2×.
  const scale = useWide() ? 2 : 1.5;
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
  return (
    <img
      key={`${mon.species}-${mine ? anim.key : 0}`}
      src={getSprite(mon.species, who === 'you' ? 'back' : 'front')}
      alt=""
      draggable={false}
      onLoad={(e) =>
        setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })
      }
      style={natural ? { width: natural.w * scale, height: natural.h * scale } : undefined}
      className={clsx(
        'pixelated max-h-full max-w-full object-contain',
        cls,
        mon.fainted && 'opacity-0',
        mon.substitute && 'opacity-60',
      )}
    />
  );
}

export function Field({
  view,
  anim,
  animate,
  onTap,
  onInfo,
}: {
  view: View | null;
  anim: Anim | null;
  animate: boolean;
  /** Tapping the field (outside the cards) skips playback. */
  onTap: () => void;
  onInfo: (who: Who) => void;
}) {
  const weather = view?.weather ? WEATHER_LABEL[view.weather] : '';
  return (
    <div
      className={clsx(
        'battle-field relative min-h-0 flex-1 overflow-hidden rounded-card border border-line',
        view?.weather && `weather-${view.weather.toLowerCase()}`,
      )}
      onClick={onTap}
      role="presentation"
    >
      {/* Platforms */}
      <div className="platform absolute top-[46%] right-[6%] h-[13%] w-[42%]" aria-hidden />
      <div className="platform absolute bottom-[5%] left-[4%] h-[14%] w-[46%]" aria-hidden />

      {/* Foe: card top-left, sprite top-right */}
      <div
        className="absolute top-2 left-2 flex max-w-[52%] flex-col gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {view?.foe && (
          <HpCard mon={view.foe} who="foe" animate={animate} onTap={() => onInfo('foe')} />
        )}
        {view && <Hazards side={view.foeSide} />}
      </div>
      <div className="absolute top-[4%] right-[8%] flex h-[50%] w-[40%] items-end justify-center">
        <FieldSprite mon={view?.foe ?? null} who="foe" anim={anim} animate={animate} />
      </div>

      {/* You: sprite bottom-left, card bottom-right */}
      <div className="absolute bottom-[7%] left-[6%] flex h-[52%] w-[44%] items-end justify-center">
        <FieldSprite mon={view?.you ?? null} who="you" anim={anim} animate={animate} />
      </div>
      <div
        className="absolute right-2 bottom-2 flex max-w-[52%] flex-col items-end gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        {view && <Hazards side={view.yourSide} />}
        {view?.you && (
          <HpCard mon={view.you} who="you" animate={animate} onTap={() => onInfo('you')} />
        )}
      </div>

      {weather && (
        <span className="absolute top-2 right-2 rounded-badge bg-surface/85 px-1.5 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line">
          {weather}
        </span>
      )}
    </div>
  );
}
