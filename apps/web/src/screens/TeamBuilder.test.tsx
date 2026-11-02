import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { setActiveFormat, topSet } from '../lib/data';
import { TeamBuilder } from './TeamBuilder';

vi.mock('../lib/audio', () => ({ startBuilderMusic: () => {}, stopBuilderMusic: () => {} }));

// A Gen 4 pool with two seeded cores (Swampert + Skarmory, Dragonite + Magnezone) and
// others that complete by chance (Dragonite + Metagross, Scizor + Tyranitar).
const POOL = [
  'Swampert',
  'Skarmory',
  'Dragonite',
  'Magnezone',
  'Tyranitar',
  'Scizor',
  'Heatran',
  'Celebi',
  'Gengar',
  'Starmie',
  'Latias',
  'Metagross',
];
const schedule = (cores?: string[]): ScheduleFile => ({
  version: 1,
  generatorVersion: 6,
  dataBuiltAt: '',
  week: '2026-11-09',
  pool: { species: POOL, candidate: 0, ...(cores && { cores }) },
  suggestedTeams: [],
  days: [],
});
const SEEDED = ['swampert-skarmory', 'dragonite-magnezone'];

const renderBuilder = (cores: string[] | null = SEEDED) =>
  render(
    <TeamBuilder
      schedule={schedule(cores ?? undefined)}
      hints={false}
      onLock={() => {}}
      topBar={<div />}
    />,
  );
const chosen = () => screen.getAllByRole('button', { pressed: true }).map((b) => b.ariaLabel);

describe('TeamBuilder cores', () => {
  beforeAll(() => setActiveFormat('gen4ou'));
  afterEach(() => vi.useRealTimers());

  it('offers the week’s seeded cores on a Cores tab, and adds one with Undo', () => {
    renderBuilder();
    expect(screen.queryByRole('button', { name: /^Add Swampert \+ Skarmory/ })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'Cores' }));
    // Only the two seeded cores, not the ones that completed by chance.
    expect(screen.getAllByRole('button', { name: /^Add .* \+ /, hidden: false })).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: /^Add Swampert \+ Skarmory/ }));
    expect(chosen()).toEqual(['Remove Swampert from team', 'Remove Skarmory from team']);
    expect(screen.getByRole('status')).toHaveTextContent('Swampert + Skarmory added');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('gives the added members their most used sets', () => {
    renderBuilder();
    fireEvent.click(screen.getByRole('radio', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: /^Add Swampert \+ Skarmory/ }));
    // The pencil's label names the set.
    expect(
      screen.getByRole('button', { name: `Swampert, ${topSet('Swampert').label}. Change set` }),
    ).toBeInTheDocument();
  });

  it('rings the Pokémon that pair with the team, through every core they share', () => {
    renderBuilder();
    expect(screen.queryByText(/Pairs with/)).toBeNull();
    // Add Dragonite: its partners are Magnezone (seeded) and Metagross (by chance).
    fireEvent.click(screen.getByRole('button', { name: 'Add Dragonite to team' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Dragonite' }));
    expect(screen.getByRole('status')).toHaveTextContent('Pairs with Magnezone and Metagross');
    const magnezone = screen
      .getByRole('button', { name: 'Add Magnezone to team' })
      .closest('.card')!;
    const metagross = screen
      .getByRole('button', { name: 'Add Metagross to team' })
      .closest('.card')!;
    expect(magnezone).toHaveClass('is-partner');
    expect(metagross).toHaveClass('is-partner');
    expect(within(magnezone as HTMLElement).getByText('Pairs with Dragonite')).toBeInTheDocument();
    // Not Swampert, which pairs with no one on the team.
    expect(
      screen.getByRole('button', { name: 'Add Swampert to team' }).closest('.card'),
    ).not.toHaveClass('is-partner');
    // Removing Dragonite takes the rings away.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Dragonite from team' }));
    expect(magnezone).not.toHaveClass('is-partner');
  });

  it('shows no switch in a week built before cores, but still rings a core that completed', () => {
    renderBuilder(null);
    expect(screen.queryByRole('radio', { name: 'Cores' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add Dragonite to team' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Dragonite' }));
    expect(
      screen.getByRole('button', { name: 'Add Magnezone to team' }).closest('.card'),
    ).toHaveClass('is-partner');
  });

  it('says why a core can’t be added when the team has no room', () => {
    renderBuilder();
    // Fill five slots with Pokémon that aren't in the core, then try a two-Pokémon core.
    for (const species of ['Tyranitar', 'Scizor', 'Heatran', 'Celebi', 'Gengar']) {
      fireEvent.click(screen.getByRole('button', { name: `Add ${species} to team` }));
      fireEvent.click(screen.getByRole('button', { name: `Add ${species}` }));
    }
    fireEvent.click(screen.getByRole('radio', { name: 'Cores' }));
    fireEvent.click(screen.getByRole('button', { name: /^Add Swampert \+ Skarmory/ }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Remove 1 Pokémon to add Swampert + Skarmory',
    );
    expect(screen.queryByRole('button', { name: 'Remove Swampert from team' })).toBeNull();
  });
});
