import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { speciesInfo } from '../../lib/data';
import type { MonView } from '../frames';
import { MonPopover } from './MonPopover';

const foe = (species: string): MonView => ({
  species,
  hp: 100,
  status: '',
  boosts: {},
  substitute: false,
  fainted: false,
});

/** A species with two abilities in every generation (Gen 4 OU's Alakazam). */
const ambiguous = () => ({
  species: 'Alakazam',
  abilities: speciesInfo('Alakazam').abilities,
});

describe('MonPopover (a foe)', () => {
  it('lists the abilities the species can have until one is shown', () => {
    const { species, abilities } = ambiguous();
    render(
      <MonPopover
        foe
        mon={foe(species)}
        revealed={{ moves: [], item: '', ability: '' }}
        hints={false}
      />,
    );
    const line = screen.getByText(/^Possible abilities:/);
    for (const a of abilities) expect(line.textContent).toContain(a);
  });

  it('keeps only the ability the battle has shown', () => {
    const { species, abilities } = ambiguous();
    render(
      <MonPopover
        foe
        mon={foe(species)}
        revealed={{ moves: [], item: '', ability: abilities[0]! }}
        hints={false}
      />,
    );
    expect(screen.queryByText(/Possible abilit/)).toBeNull();
    expect(screen.getByRole('tooltip').textContent).toContain(abilities[0]!);
    for (const other of abilities.slice(1)) {
      expect(screen.getByRole('tooltip').textContent).not.toContain(other);
    }
  });
});
