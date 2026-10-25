// A few Pokémon hanging out together: the home screens' nod to playing with friends.
// On the landing the group grows with the screen (a bigger crowd on a big monitor)
// but only as many as fit across it, so none is cut off; elsewhere it is the small four.
import { useEffect, useState } from 'react';
import { FRIENDS } from '../lib/friends';
import { getSprite } from '../lib/sprites';

/** Alternates right and left of the first, so the first stands in the middle. */
function arrange<T>(cast: T[]): T[] {
  const [middle, ...rest] = cast;
  const right = rest.filter((_, i) => i % 2 === 0);
  const left = rest.filter((_, i) => i % 2 === 1);
  return middle === undefined ? [] : [...left.reverse(), middle, ...right];
}

const SMALL = 56;

/** The sprite heights on the landing follow the screen's height (see .home-friend in styles.css). */
const LANDING_MIN = 60;
const LANDING_MAX = 128;
const LANDING_SHARE = 0.095;
/** Room kept at each side of the screen, in px. */
const EDGE = 12;

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
  // As many as fit across the screen at this size (a sprite is about as wide as it
  // is tall); each may still shrink a little, so the row never runs off the edge.
  const count =
    size === 'sm' ? 4 : Math.min(FRIENDS.length, Math.max(3, Math.floor((w - 2 * EDGE) / spriteH)));
  return (
    <div
      aria-hidden
      className={`pointer-events-none flex items-end justify-center px-3 ${className}`}
    >
      {arrange(FRIENDS.slice(0, count)).map((name) => (
        <span key={name} className="relative flex min-w-0 shrink items-end justify-center">
          {/* A soft shadow is all the ground they need. */}
          <span className="absolute inset-x-[10%] -bottom-1 h-2.5 rounded-[50%] bg-black/20 blur-[3px]" />
          <img
            alt=""
            src={getSprite(name, 'front', undefined, 4)}
            style={size === 'sm' ? { height: SMALL } : undefined}
            className={`relative max-w-full object-contain object-bottom ${size === 'sm' ? '' : 'home-friend'}`}
          />
        </span>
      ))}
    </div>
  );
}
