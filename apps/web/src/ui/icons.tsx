import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
});

export const GearIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

export const ProfileIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);

export const FlameIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 22c4 0 7-2.7 7-7 0-3.5-2.5-6.5-4-8-.5 2-1.5 3.5-3 4 0-3-1.5-6-4-9 0 4-5 6.5-5 12 0 4.3 3 8 9 8z" />
  </svg>
);

export const InfoIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </svg>
);

export const CloseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m5 12 5 5L20 7" />
  </svg>
);

export const StarIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ fill: 'currentColor', stroke: 'none', ...p })}>
    <path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
  </svg>
);

export const ChevronIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
);

export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ strokeWidth: 3, ...p })}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);

export const ExpandIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);

export const DiceIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="8.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);

/** A tiny ball for a difficulty: Poké (Easy), Great (Normal), Ultra (Hard), Master (Master). */
export const BallIcon = ({
  kind,
  ...p
}: SVGProps<SVGSVGElement> & { kind: 'poke' | 'great' | 'ultra' | 'master' }) => {
  const ring = '#2b2d36';
  const top = {
    ultra: '#26252b',
    poke: '#d1434b',
    great: '#3a72d6',
    master: '#7a3ea6',
  }[kind];
  return (
    <svg width={14} height={14} viewBox="0 0 20 20" aria-hidden {...p}>
      <clipPath id={`ball-${kind}`}>
        <circle cx="10" cy="10" r="9" />
      </clipPath>
      <g clipPath={`url(#ball-${kind})`}>
        <rect width="20" height="20" fill="#f4f3f1" />
        <rect width="20" height="10" fill={top} />
        {kind === 'great' && (
          <>
            <path d="M1 4.2l4.6-2.4 1 3.4L1.6 7.4z" fill="#e0453f" />
            <path d="M19 4.2l-4.6-2.4-1 3.4 5 2.2z" fill="#e0453f" />
          </>
        )}
        {kind === 'ultra' && (
          <>
            <rect x="1" y="3.5" width="4.5" height="3.5" fill="#f2c230" />
            <rect x="14.5" y="3.5" width="4.5" height="3.5" fill="#f2c230" />
          </>
        )}
        {kind === 'master' && (
          <>
            <circle cx="3.6" cy="5.6" r="2" fill="#e05a9c" />
            <circle cx="16.4" cy="5.6" r="2" fill="#e05a9c" />
            <path
              d="M7.4 7.4V3.4L10 5.8l2.6-2.4v4"
              fill="none"
              stroke="#f4f3f1"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </>
        )}
        <rect y="9" width="20" height="2" fill={ring} />
      </g>
      <circle cx="10" cy="10" r="9" fill="none" stroke={ring} strokeWidth="2" />
      <circle cx="10" cy="10" r="3" fill="#f4f3f1" stroke={ring} strokeWidth="1.6" />
    </svg>
  );
};

/** Two linked rings: a Pokémon that pairs with one on your team (a core). */
export const LinkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11.5 4.43" />
    <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07l1.33-1.33" />
  </svg>
);
