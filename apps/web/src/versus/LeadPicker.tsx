// Before a versus battle: your team with its sets, the foe's species, and
// a lead to pick before time runs out (DESIGN.md §18).
import { formatInfo } from '@daily-battle/data/formats';
import { setActiveFormat } from '../lib/data';
import { SectionLabel } from '../ui/bits';
import { StarIcon } from '../ui/icons';
import { PokemonTile } from '../ui/PokemonTile';
import { Countdown } from './Countdown';
import { Page } from './Page';
import type { LocalMatch } from './useRoom';

export function LeadPicker({
  match,
  onLead,
  onBack,
}: {
  match: LocalMatch;
  onLead: (species: string) => void;
  onBack: () => void;
}) {
  // Tiles read the room's game, which may not be the daily game shown elsewhere.
  setActiveFormat(match.format);
  const foe = match.opponent.name;
  const status = match.lead
    ? match.foeReady
      ? 'Starting…'
      : `Waiting for ${foe} to pick a lead`
    : 'Pick your lead';

  return (
    <Page title={`vs ${foe}`} back="Room" onBack={onBack}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[15px] font-semibold" role="status">
          {status}
        </p>
        <Countdown match={match} />
      </div>
      <p className="-mt-2 text-[13px] text-muted">
        {formatInfo(match.format).name} OU. You can change your mind until both leads are in; if
        time runs out, your first Pokémon leads.
      </p>

      <section className="space-y-2">
        <SectionLabel>Your team</SectionLabel>
        <div className="grid grid-cols-2 gap-2 wide:grid-cols-3">
          {match.team.map((set) => {
            const isLead = match.lead === set.species;
            return (
              <PokemonTile
                key={set.species}
                species={set.species}
                selected={isLead}
                label={isLead ? `${set.species}, leading` : `Lead with ${set.species}`}
                onTap={() => onLead(set.species)}
                badge={
                  isLead ? (
                    <span className="flex items-center gap-0.5 rounded-badge bg-gold px-1.5 py-0.5 text-[11px] font-bold text-on-gold">
                      <StarIcon width={11} height={11} /> Lead
                    </span>
                  ) : undefined
                }
                footer={
                  <p className="px-2 pb-2 text-[11px] leading-snug text-muted">
                    {[set.item, set.ability].filter(Boolean).join(' · ')}
                    <br />
                    {set.moves.join(', ')}
                  </p>
                }
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-2 pb-2">
        <SectionLabel>{foe}’s team</SectionLabel>
        <div className="grid grid-cols-3 gap-2 wide:grid-cols-6">
          {match.foeSpecies.map((species) => (
            <PokemonTile key={species} species={species} label={species} />
          ))}
        </div>
      </section>
    </Page>
  );
}
