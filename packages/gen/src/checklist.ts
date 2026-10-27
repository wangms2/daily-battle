// The team builder's beginner checklist (DESIGN.md §12.2a), shared with the
// pipeline so the recommended team always covers it. No heavy imports: the web
// client loads it.
import type { SetEntry } from '@daily-battle/data';

const HAZARDS = ['Stealth Rock', 'Spikes', 'Toxic Spikes', 'Sticky Web'];
const REMOVAL = ['Rapid Spin', 'Defog'];

/** The same test as `isBulky` in traits.ts, kept here so this file stays light. */
const bulky = (s: SetEntry) => s.evs.hp >= 200 && Math.max(s.evs.def, s.evs.spd) >= 160;

export interface Checklist {
  hazards: boolean;
  removal: boolean;
  physical: boolean;
  special: boolean;
  defensive: boolean;
}

/** What each set brings to the checklist. */
export function setChecks(s: SetEntry): Checklist {
  return {
    hazards: s.moves.some((m) => HAZARDS.includes(m)),
    removal: s.moves.some((m) => REMOVAL.includes(m)),
    physical: !bulky(s) && s.evs.atk >= 200,
    special: !bulky(s) && s.evs.spa >= 200,
    defensive: bulky(s),
  };
}

/** The checklist for the chosen sets: each item is covered by at least one set. */
export function checklist(team: SetEntry[]): Checklist {
  const all = team.map(setChecks);
  const any = (k: keyof Checklist) => all.some((c) => c[k]);
  return {
    hazards: any('hazards'),
    removal: any('removal'),
    physical: any('physical'),
    special: any('special'),
    defensive: any('defensive'),
  };
}
