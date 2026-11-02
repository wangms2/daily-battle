import type { Core } from '@daily-battle/data';
import { joinNames } from '../lib/data';
import { LinkIcon } from './icons';

/** The cores a Pokémon is in this week: who it pairs with, and why. */
export function CoreNotes({ species, cores }: { species: string; cores: Core[] }) {
  const mine = cores.filter((c) => c.members.includes(species));
  if (!mine.length) return null;
  return (
    <div className="mt-3">
      <h3 className="flex items-center gap-1 text-[13px] font-semibold text-muted">
        <LinkIcon width={13} height={13} />
        Pairs with
      </h3>
      <ul className="mt-1.5 space-y-1.5">
        {mine.map((c) => (
          <li key={c.id} className="text-[13px] leading-snug">
            <span className="font-semibold">
              {joinNames(c.members.filter((m) => m !== species))}
            </span>
            <span className="text-muted"> · {c.why}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
