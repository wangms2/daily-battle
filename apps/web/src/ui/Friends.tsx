// A few Pokémon hanging out together: the home screens' nod to playing with friends.
// On the landing the group grows with the screen (a bigger crowd on a big monitor);
// elsewhere it is the small four.
import { useEffect, useState } from 'react';
import { getSprite } from '../lib/sprites';

/** Who joins, nearest the middle first. The big ones stand taller. */
const CAST: { name: string; big?: boolean }[] = [
  { name: 'Snorlax', big: true },
  { name: 'Gengar' },
  { name: 'Lucario' },
  { name: 'Blissey' },
  { name: 'Tyranitar', big: true },
  { name: 'Togekiss' },
  { name: 'Charizard' },
  { name: 'Gardevoir' },
  { name: 'Dragonite', big: true },
  { name: 'Scizor' },
  { name: 'Starmie' },
  { name: 'Garchomp' },
  { name: 'Infernape' },
  { name: 'Mamoswine' },
  { name: 'Latias' },
];

/** Alternates right and left of the first, so the biggest stands in the middle. */
function arrange<T>(cast: T[]): T[] {
  const [middle, ...rest] = cast;
  const right = rest.filter((_, i) => i % 2 === 0);
  const left = rest.filter((_, i) => i % 2 === 1);
  return middle === undefined ? [] : [...left.reverse(), middle, ...right];
}

const SMALL = { small: 56, big: 72 };

/** The sprite heights on the landing follow the screen's height (see .home-friend in styles.css). */
const LANDING_MIN = 82;
const LANDING_MAX = 170;
const LANDING_SHARE = 0.135;

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const on = () => setSize(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return size;
}

export function Friends({
  size = 'lg',
  className = '',
}: {
  size?: 'lg' | 'sm';
  className?: string;
}) {
  const { w, h } = useViewport();
  const spriteH = Math.min(LANDING_MAX, Math.max(LANDING_MIN, h * LANDING_SHARE));
  // How many fit in the middle of the screen at this size; four on a phone.
  const count =
    size === 'sm'
      ? 4
      : Math.min(CAST.length, Math.max(4, Math.floor((w * 0.84) / (spriteH * 0.9))));
  return (
    <div aria-hidden className={`pointer-events-none flex items-end justify-center ${className}`}>
      {arrange(CAST.slice(0, count)).map((c) => (
        <span key={c.name} className="relative -mx-0.5 flex shrink-0 items-end">
          {/* A soft shadow is all the ground they need. */}
          <span className="absolute inset-x-[10%] -bottom-1 h-2.5 rounded-[50%] bg-black/20 blur-[3px]" />
          <img
            alt=""
            src={getSprite(c.name, 'front', undefined, 4)}
            style={size === 'sm' ? { height: c.big ? SMALL.big : SMALL.small } : undefined}
            className={`relative max-w-none ${size === 'sm' ? '' : `home-friend ${c.big ? 'is-big' : ''}`}`}
          />
        </span>
      ))}
    </div>
  );
}
