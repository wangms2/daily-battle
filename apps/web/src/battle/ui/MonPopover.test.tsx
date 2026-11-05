import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { speciesInfo } from '../../lib/data';
import type { MonView } from '../frames';
import { hpPercent, MonPopover } from './MonPopover';
import type { SpeedCheck } from '../../lib/speed';

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
    const line = screen.getByText(/^Ability:/);
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

  const card = (speed: SpeedCheck) => {
    render(<MonPopover foe mon={foe('Zapdos')} hints={false} speed={speed} />);
    return screen.getByRole('tooltip').textContent!;
  };

  it('shows its Speed against yours, without its HP (the plate has it)', () => {
    const text = card({ lo: 257, hi: 257, mine: { species: 'Heracross', speed: 227 } });
    expect(text).toContain('Speed 257');
    expect(text).toContain('Faster than Heracross (227)');
    expect(text).not.toContain('100%');
  });

  it('says when a range could go either way', () => {
    const text = card({ lo: 236, hi: 328, mine: { species: 'Snorlax', speed: 240 } });
    expect(text).toContain('Speed 236–328');
    expect(text).toContain('Possibly faster than Snorlax (240)');
  });

  it('shows Showdown’s range, and the sets’ range with Beginner hints', () => {
    const mine = { species: 'Snorlax', speed: 240 };
    const showdown: SpeedCheck['showdown'] = [184, 236, 299, 328];
    const plain = card({ lo: 184, hi: 328, showdown, mine });
    expect(plain).toContain('Speed 184–236–299–328');
    expect(plain).toContain('before boosts, items and abilities');
    expect(plain).not.toContain('Its sets');
    cleanup();
    const hinted = card({ lo: 236, hi: 328, showdown, fromSets: true, mine });
    expect(hinted).toContain('Speed 184–236–299–328');
    expect(hinted).toContain('Its sets 236–328');
  });

  it('lists the moves it likely has, when given', () => {
    render(<MonPopover foe mon={foe('Tyranitar')} hints likely={['Earthquake', 'Dragon Dance']} />);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Likely: Earthquake · Dragon Dance');
  });

  it('adds the Choice Scarf line only when a Scarf would make it faster', () => {
    expect(
      card({ lo: 200, hi: 230, scarf: 345, mine: { species: 'Snorlax', speed: 240 } }),
    ).toContain('With a Choice Scarf: 345, faster');
    cleanup();
    expect(
      card({ lo: 200, hi: 230, scarf: 345, mine: { species: 'Jolteon', speed: 360 } }),
    ).not.toContain('Scarf');
  });
});

describe('MonPopover (yours)', () => {
  it('shows HP as a percentage too, so you can tell what hazards would do', () => {
    render(
      <MonPopover
        foe={false}
        member={{
          slot: 0,
          species: 'Tyranitar',
          hp: 12,
          hpExact: { hp: 50, max: 404 },
          status: '',
          fainted: false,
          active: false,
          item: '',
          ability: '',
          moves: [],
          stats: {},
        }}
      />,
    );
    // Just under 12.5%: one Stealth Rock on a neutral Pokémon would take it out.
    expect(screen.getByRole('tooltip')).toHaveTextContent('12.4% (50/404)');
    expect(hpPercent(1, 2000)).toBe('0.1%');
    expect(hpPercent(404, 404)).toBe('100%');
  });

  const gengar = () => (
    <MonPopover
      foe={false}
      member={{
        slot: 0,
        species: 'Gengar',
        hp: 100,
        hpExact: { hp: 261, max: 261 },
        status: '',
        fainted: false,
        active: true,
        item: 'Life Orb',
        ability: 'Levitate',
        moves: [],
        stats: {},
      }}
    />
  );
  const desktop = (on: boolean) =>
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: on && query.includes('pointer: fine'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows its matchups on desktop, by its own ability (Levitate: immune to Ground)', () => {
    desktop(true);
    render(gengar());
    const rows = screen.getByLabelText('Type matchups');
    const types = (label: string) =>
      [
        ...[...rows.children]
          .find((r) => r.textContent?.startsWith(label))!
          .querySelectorAll('[title]'),
      ].map((b) => b.getAttribute('title'));
    expect(types('Weak to')).toEqual(expect.arrayContaining(['Psychic', 'Ghost', 'Dark']));
    expect(types('Weak to')).not.toContain('Ground');
    expect(types('Resists')).toEqual(expect.arrayContaining(['Grass', 'Poison', 'Bug']));
    expect(types('Immune')).toEqual(expect.arrayContaining(['Normal', 'Fighting', 'Ground']));
  });

  it('leaves matchups off on touch screens', () => {
    desktop(false);
    render(gengar());
    expect(screen.queryByLabelText('Type matchups')).toBeNull();
  });
});
