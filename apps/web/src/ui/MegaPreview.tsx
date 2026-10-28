// A Mega set's Mega form (Gen 6): what its stone turns it into in battle, with
// the Mega's sprite, typing, ability, and final stats. Shown under the set's
// base form wherever a set is picked or detailed.
import type { SetEntry } from '@daily-battle/data';
import { abilityInfo, megaFor, speciesInfo } from '../lib/data';
import { getSprite } from '../lib/sprites';
import { TypeBadge } from './bits';
import { Term } from './DetailCard';
import { FinalStatsRow } from './StatLines';

export function MegaPreview({ species, set }: { species: string; set: SetEntry }) {
  const mega = megaFor(species, set);
  if (!mega) return null;
  // Only what changes: the Mega's types when they differ from the base form's.
  const base = speciesInfo(species).types;
  const newTypes = mega.types.join('/') !== base.join('/');
  return (
    // Compact (one line, then the stats) so a Mega set still fits with its Add button.
    <section className="mt-2.5" aria-label={`Mega Evolves into ${mega.name}`}>
      <p className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <img
          src={getSprite(mega.forme)}
          alt=""
          className="pixelated -my-1 size-8 shrink-0 object-contain"
        />
        <span className="mega-badge shrink-0 rounded-[3px] px-1 text-[10px] leading-[15px] font-bold">
          Mega
        </span>
        <span className="truncate font-semibold">{mega.name}</span>
        {newTypes && mega.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
        <span className="ml-auto shrink-0 text-[12.5px] text-muted">
          <Term name={mega.ability} desc={abilityInfo(mega.ability)} kind="Ability" />
        </span>
      </p>
      <FinalStatsRow
        species={mega.forme}
        set={set}
        label={`${mega.name} final stats at level 100`}
      />
    </section>
  );
}

/** The Mega as a row of a set's Item/Ability/Nature list (the wide panel; its stats are a column). */
export function MegaLine({ species, set }: { species: string; set: SetEntry }) {
  const mega = megaFor(species, set);
  if (!mega) return null;
  const newTypes = mega.types.join('/') !== speciesInfo(species).types.join('/');
  return (
    <>
      <dt className="text-muted">Mega</dt>
      {/* The Item row names the stone, so just what changes: new types, and its ability. */}
      <dd className="flex min-w-0 items-center gap-1 font-medium">
        <span className="sr-only">{mega.name}:</span>
        {newTypes && mega.types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
        <Term name={mega.ability} desc={abilityInfo(mega.ability)} kind="Ability" />
      </dd>
    </>
  );
}
