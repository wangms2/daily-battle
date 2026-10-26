// The type chart, one type at a time (DESIGN.md §22): pick a type to see what
// it hits hard and what it's weak to, for the game being played (17 types
// through Gen 5, 18 with Fairy from Gen 6). Phone-first: no 17×17 grid.
import clsx from 'clsx';
import { useState } from 'react';
import { allTypes, typeChart } from '../lib/data';
import { TYPE_COLORS } from '../lib/types';
import { TypeBadge } from '../ui/bits';
import { Sheet } from '../ui/Sheet';

/** The games' own order of the types. */
const ORDER = [
  'Normal',
  'Fire',
  'Water',
  'Grass',
  'Electric',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
];
const ordered = () => [...allTypes()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));

/** The types an attacking type hits for `mult`, or that hit a defending type for `mult`. */
function matching(type: string, mult: number, as: 'attacking' | 'defending'): string[] {
  const chart = typeChart();
  return ordered().filter((other) =>
    as === 'attacking'
      ? (chart[type]?.[other] ?? 1) === mult
      : (chart[other]?.[type] ?? 1) === mult,
  );
}

function Row({ label, types }: { label: string; types: string[] }) {
  return (
    <div className="grid gap-1">
      <p className="text-[12.5px] font-semibold text-muted">{label}</p>
      <div className="flex min-h-6 flex-wrap gap-1">
        {types.length ? (
          types.map((t) => <TypeBadge key={t} type={t} />)
        ) : (
          <span className="text-[13px] text-muted">None</span>
        )}
      </div>
    </div>
  );
}

export function TypeChartSheet({
  open,
  onOpenChange,
  initial = 'Fire',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The type shown first. */
  initial?: string;
}) {
  const [type, setType] = useState(initial);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Type chart" scroll>
      <div className="grid gap-4">
        {/* Every type, as a picker. */}
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Type">
          {ordered().map((t) => {
            const c = TYPE_COLORS[t] ?? { bg: '#888', fg: '#fff' };
            const on = t === type;
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setType(t)}
                className={clsx(
                  'type-badge h-7 rounded-badge px-2 text-[12px] font-bold tracking-wide uppercase',
                  !on && 'opacity-45',
                  on && 'ring-2 ring-ink ring-offset-1 ring-offset-surface',
                )}
                style={{ background: c.bg, color: c.fg }}
              >
                {t}
              </button>
            );
          })}
        </div>
        <section className="grid gap-2 rounded-card bg-surface-2 p-3">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <TypeBadge type={type} /> moves hit…
          </h3>
          <Row label="Hard (×2)" types={matching(type, 2, 'attacking')} />
          <Row label="Weakly (×½)" types={matching(type, 0.5, 'attacking')} />
          <Row label="Not at all (×0)" types={matching(type, 0, 'attacking')} />
        </section>
        <section className="grid gap-2 rounded-card bg-surface-2 p-3">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold">
            <TypeBadge type={type} /> Pokémon take…
          </h3>
          <Row label="Double from (×2)" types={matching(type, 2, 'defending')} />
          <Row label="Half from (×½)" types={matching(type, 0.5, 'defending')} />
          <Row label="Nothing from (×0)" types={matching(type, 0, 'defending')} />
        </section>
      </div>
    </Sheet>
  );
}
