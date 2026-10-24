// A Mega set's Mega form (Gen 6): what its stone turns it into in battle, with
// the Mega's sprite, typing, ability, and final stats. Shown under the set's
// base form wherever a set is picked or detailed.
import type { SetEntry } from '@daily-battle/data';
import { abilityInfo, megaFor } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { TypeBadge } from './bits';
import { Term } from './DetailCard';
import { FinalStatsRow } from './StatLines';

export function MegaPreview({ species, set }: { species: string; set: SetEntry }) {
  const mega = megaFor(species, set);
  if (!mega) return null;
  return (
    <section
      className="mt-2 rounded-chip border border-line px-2.5 py-2"
      aria-label={`Mega Evolves into ${mega.name}`}
    >
      <div className="flex items-center gap-2">
        <img
          src={getSprite(mega.forme)}
          alt=""
          className="pixelated size-12 shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1 text-[13px]">
            <span className="mega-badge rounded-[3px] px-1 text-[10px] leading-[15px] font-bold">
              Mega
            </span>
            <span className="font-semibold">{mega.name}</span>
            {mega.types.map((t) => (
              <TypeBadge key={t} type={t} />
            ))}
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted">
            In battle · <Term name={mega.ability} desc={abilityInfo(mega.ability)} kind="Ability" />
          </p>
        </div>
      </div>
      <FinalStatsRow
        species={mega.forme}
        set={set}
        label={`${mega.name} final stats at level 100`}
      />
    </section>
  );
}
