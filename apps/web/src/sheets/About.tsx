// About, credits, and privacy (DESIGN.md §16). The one sheet allowed to scroll
// on small phones: it's reading material.
import { ENGINE_VERSION } from '../lib/seed';
import { Sheet } from '../ui/Sheet';

const CREDITS: [string, string][] = [
  ['Sets and usage data', 'Smogon, used with permission.'],
  ['Battle simulator and text', '@pkmn (Pokémon Showdown’s simulator), MIT licensed.'],
  ['Sprites', 'PokeAPI/sprites; animated sprites by the Smogon sprite community.'],
  [
    'Backgrounds and effects',
    'Pokémon Showdown’s fx images, dedicated to the public domain (CC0).',
  ],
  ['Damage calculations', '@smogon/calc, MIT licensed.'],
];

export function AboutSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="About Daily Battle" scroll>
      <p className="text-[14px] leading-relaxed">
        A daily Gen 4 or Gen 5 OU battle: build a team each week, then beat a new opponent every
        day. Each game has its own team and streak.
      </p>

      <h3 className="mt-4 text-[13px] font-semibold tracking-wide text-muted uppercase">
        Disclaimer
      </h3>
      <p className="mt-1 text-[13.5px] leading-relaxed">
        Daily Battle is an unofficial, free, non-commercial fan project. It is not affiliated with
        or endorsed by Nintendo, Creatures Inc., GAME FREAK inc., The Pokémon Company, or Smogon.
        Pokémon, Pokémon character names, and sprites are © Nintendo, Creatures Inc., and GAME FREAK
        inc.
      </p>

      <h3 className="mt-4 text-[13px] font-semibold tracking-wide text-muted uppercase">Credits</h3>
      <dl className="mt-1 space-y-1.5 text-[13.5px] leading-snug">
        {CREDITS.map(([what, who]) => (
          <div key={what}>
            <dt className="font-semibold">{what}</dt>
            <dd className="text-muted">{who}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-4 text-[13px] font-semibold tracking-wide text-muted uppercase">Privacy</h3>
      <p className="mt-1 text-[13.5px] leading-relaxed">
        No accounts and no tracking. Your team and results stay in this browser. A playtest report
        contains only what you choose to copy and send.
      </p>

      <p className="mt-4 text-[12px] text-muted tabular-nums">Engine: {ENGINE_VERSION}</p>
    </Sheet>
  );
}
