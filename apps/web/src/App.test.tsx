import { sets } from '@daily-battle/data';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import scheduleJson from '../public/schedule/2026-10-19.json';
import { App } from './App';
import { ENGINE_VERSION } from './lib/seed';
import { initialState, type State } from './state/schema';
import { createStorage, STORAGE_KEY } from './state/storage';
import { StoreProvider } from './state/store';

const WEEK = '2026-10-19';
const schedule = scheduleJson as ScheduleFile;
const NOW = new Date(2026, 9, 21, 10, 0); // Wed Oct 21, local time

function memoryBackend(seed?: State, broken = false): globalThis.Storage {
  const data = new Map<string, string>();
  if (seed) data.set(STORAGE_KEY, JSON.stringify(seed));
  const guard = <T,>(f: () => T) => {
    if (broken) throw new Error('blocked');
    return f();
  };
  return {
    get length() {
      return data.size;
    },
    clear: () => guard(() => data.clear()),
    getItem: (k) => guard(() => data.get(k) ?? null),
    key: (i) => guard(() => [...data.keys()][i] ?? null),
    removeItem: (k) => guard(() => void data.delete(k)),
    setItem: (k, v) => guard(() => void data.set(k, v)),
  };
}

/** State after the welcome sheet, optionally with hints off and a team locked. */
function seeded({ hints = true, team }: { hints?: boolean; team?: { week: string } } = {}): State {
  const state = initialState();
  state.settings.shownExplainers = ['welcome'];
  state.settings.beginnerHints = hints;
  if (team) {
    state.weeks[team.week] = {
      team: schedule.suggestedTeams[0]!.team,
      poolId: `${team.week}:c0`,
    };
  }
  return state;
}

function renderApp(seed?: State, { broken = false } = {}) {
  const storage = createStorage(memoryBackend(seed, broken));
  return render(
    <StoreProvider storage={storage} now={() => NOW}>
      <App />
    </StoreProvider>,
  );
}

beforeEach(() => {
  window.location.hash = '';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(schedule), { status: 200 })),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe('first run', () => {
  it('shows the welcome sheet, then the team builder', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Let’s go' }));
    expect(await screen.findByRole('button', { name: /Pick 6 more/ })).toBeDisabled();
  });
});

describe('team builder', () => {
  it('adds with the most common set, removes on a second tap, and caps at 6', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    const pool = schedule.pool.species;
    await user.click(await screen.findByRole('button', { name: `Add ${pool[0]} to team` }));
    const top = [...sets.species[pool[0]!]!.sets].sort((a, b) => b.weight - a.weight)[0]!;
    expect(
      screen.getByRole('button', { name: `${pool[0]}, ${top.label}. Change set` }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Remove ${pool[0]} from team` }));
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();

    for (const s of pool.slice(0, 7)) {
      const add = screen.queryByRole('button', { name: `Add ${s} to team` });
      if (add) await user.click(add);
    }
    expect(screen.getByRole('button', { name: 'Lock in team' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /^Remove .* from team$/ })).toHaveLength(6);
  });

  it('applies a suggested team, offers undo, and stays editable', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    const suggestion = schedule.suggestedTeams[0]!;
    await user.click(await screen.findByRole('button', { name: suggestion.archetype }));
    expect(screen.getByRole('button', { name: 'Lock in team' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: suggestion.archetype }));
    await user.click(
      screen.getByRole('button', { name: `Remove ${suggestion.team[0]!.species} from team` }),
    );
    expect(screen.getByRole('button', { name: /Pick 1 more/ })).toBeInTheDocument();
  });

  it('shows the team checklist only with Beginner hints on', async () => {
    const user = userEvent.setup();
    renderApp(seeded({ hints: true }));
    expect(await screen.findByRole('button', { name: /Team checklist/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('switch', { name: /Beginner hints/ }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Team checklist/ })).not.toBeInTheDocument();
  });

  it('locks the team and goes to the daily brief', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(
      await screen.findByRole('button', { name: schedule.suggestedTeams[0]!.archetype }),
    );
    await user.click(screen.getByRole('button', { name: 'Lock in team' }));
    await user.click(screen.getByRole('button', { name: /^Lock in$/ }));
    expect(await screen.findByRole('button', { name: /^Start · / })).toBeInTheDocument();
  });
});

describe('daily brief', () => {
  const today = () => schedule.days.find((d) => d.day === '2026-10-21')!;

  it('shows the opponent’s species but none of their sets', async () => {
    renderApp(seeded({ team: { week: WEEK } }));
    await screen.findByRole('button', { name: /^Start · / });
    const ours = new Set(
      schedule.suggestedTeams[0]!.team.flatMap((s) => {
        const set = sets.species[s.species]!.sets.find((x) => x.id === s.setId)!;
        return [set.label, ...set.moves, set.item];
      }),
    );
    for (const slot of today().team) {
      expect(screen.getByRole('button', { name: `About ${slot.species}` })).toBeInTheDocument();
      const set = sets.species[slot.species]!.sets.find((x) => x.id === slot.setId)!;
      for (const secret of [set.label, ...set.moves, set.item].filter((t) => !ours.has(t))) {
        expect(document.body.textContent).not.toContain(secret);
      }
    }
  });

  it('sets the lead and allows one change per day', async () => {
    const user = userEvent.setup();
    renderApp(seeded({ team: { week: WEEK } }));
    const team = schedule.suggestedTeams[0]!.team;
    await user.click(await screen.findByRole('button', { name: `Lead with ${team[2]!.species}` }));
    expect(
      screen.getByRole('button', { name: `Start · ${team[2]!.species} leads` }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '1 change left' }));
    await user.click(screen.getAllByRole('button', { name: 'Swap' })[0]!);
    const bench = schedule.pool.species.find((s) => !team.some((t) => t.species === s))!;
    await user.click(screen.getByRole('button', { name: `Bring in ${bench}` }));
    await user.click(
      within(await screen.findByRole('dialog')).getAllByRole('button', { name: 'Bring in' })[0]!,
    );
    await user.click(await screen.findByRole('button', { name: 'Make change' }));
    expect(await screen.findByText('Change used')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 change left' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Lead with ${bench}` })).toBeInTheDocument();
  });
  it('resumes a battle in progress and locks the change until it ends', async () => {
    const state = seeded({ team: { week: WEEK } });
    const team = schedule.suggestedTeams[0]!.team;
    state.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [
        {
          result: 'inProgress',
          remaining: 6,
          ts: 1,
          lead: team[0]!.species,
          team,
          battleSeed: '1,2,3,4',
          aiSeed: '5,6,7,8',
          choices: ['move 1'],
          engine: ENGINE_VERSION,
        },
      ],
    };
    renderApp(state);
    expect(await screen.findByRole('button', { name: 'Resume battle' })).toBeInTheDocument();
    expect(screen.getByText('Battle in progress')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 change left' })).not.toBeInTheDocument();
  });

  it('records an unfinished battle from another engine version as a forfeit', async () => {
    const state = seeded({ team: { week: WEEK } });
    const team = schedule.suggestedTeams[0]!.team;
    state.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [
        {
          result: 'inProgress',
          remaining: 6,
          ts: 1,
          lead: team[0]!.species,
          team,
          battleSeed: '1,2,3,4',
          aiSeed: '5,6,7,8',
          choices: [],
          engine: 'sim 0.0.0 ai 0',
        },
      ],
    };
    renderApp(state);
    // The expired battle counts as a lost try.
    await screen.findByRole('button', { name: /^Try again · / });
    expect(screen.queryByRole('button', { name: 'Resume battle' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Today’s result' })).toHaveTextContent(
      'Not cleared yet · 1 of 3 tries',
    );
  });
});

describe('results and streak', () => {
  const finished = (result: 'win' | 'loss', remaining: number, ts: number) => ({
    result,
    remaining,
    ts,
    lead: schedule.suggestedTeams[0]!.team[0]!.species,
    team: schedule.suggestedTeams[0]!.team,
    battleSeed: '1,2,3,4',
    aiSeed: '5,6,7,8',
    choices: [],
    engine: ENGINE_VERSION,
  });

  it('shows today’s result, the streak, and Share after a first-try win', async () => {
    const state = seeded({ team: { week: WEEK } });
    state.days['2026-10-20'] = {
      swapUsed: false,
      attempts: [finished('loss', 0, 1), finished('win', 2, 2)],
    };
    state.days['2026-10-21'] = { swapUsed: false, attempts: [finished('win', 4, 3)] };
    renderApp(state);
    const strip = await screen.findByRole('region', { name: 'Today’s result' });
    expect(strip).toHaveTextContent('⭐ First try! · 4/6 left');
    expect(strip).toHaveTextContent('🔥 2-day streak');
    expect(strip).toHaveTextContent(/Next in \d+:\d\d:\d\d/);
    expect(within(strip).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again · practice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stats. Streak 2' })).toBeInTheDocument();
  });

  it('resets the streak on the 3rd loss and says so', async () => {
    const state = seeded({ team: { week: WEEK } });
    state.days['2026-10-20'] = { swapUsed: false, attempts: [finished('win', 2, 1)] };
    state.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [finished('loss', 0, 2), finished('loss', 1, 3), finished('loss', 0, 4)],
    };
    renderApp(state);
    const strip = await screen.findByRole('region', { name: 'Today’s result' });
    expect(strip).toHaveTextContent('❌ Not cleared in 3 tries');
    expect(strip).toHaveTextContent('Streak reset');
    expect(screen.getByRole('button', { name: 'Stats. Streak 0' })).toBeInTheDocument();
  });

  it('offers a practice change once the counted tries are done, leaving the weekly team alone', async () => {
    const user = userEvent.setup();
    const state = seeded({ team: { week: WEEK } });
    state.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [finished('loss', 0, 1), finished('loss', 0, 2), finished('loss', 0, 3)],
    };
    renderApp(state);
    expect(await screen.findByRole('button', { name: 'Practice change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 change left' })).not.toBeInTheDocument();

    const team = schedule.suggestedTeams[0]!.team;
    const bench = schedule.pool.species.find((s) => !team.some((t) => t.species === s))!;
    await user.click(screen.getByRole('button', { name: 'Practice change' }));
    await user.click(screen.getAllByRole('button', { name: 'Swap' })[1]!);
    await user.click(screen.getByRole('button', { name: `Bring in ${bench}` }));
    await user.click(
      within(await screen.findByRole('dialog')).getAllByRole('button', { name: 'Bring in' })[0]!,
    );
    expect(
      await screen.findByRole('dialog', { name: 'Change for this practice run?' }),
    ).toHaveTextContent('Just for your next practice run');
    await user.click(screen.getByRole('button', { name: 'Make change' }));
    expect(await screen.findByRole('button', { name: `Lead with ${bench}` })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Undo practice change' }));
    expect(screen.queryByRole('button', { name: `Lead with ${bench}` })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Lead with ${team[1]!.species}` }),
    ).toBeInTheDocument();
  });

  it('has no result strip before the first try', async () => {
    renderApp(seeded({ team: { week: WEEK } }));
    await screen.findByRole('button', { name: /^Start · / });
    expect(screen.queryByRole('region', { name: 'Today’s result' })).not.toBeInTheDocument();
  });
});

describe('edge cases', () => {
  it('asks for a new team in a new week', async () => {
    renderApp(seeded({ team: { week: '2026-10-12' } }));
    expect(await screen.findByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();
  });

  it('tells the player when progress can’t be saved', async () => {
    const user = userEvent.setup();
    renderApp(undefined, { broken: true });
    // Nothing can remember the welcome was seen, so it shows; dismiss it first.
    await user.click(await screen.findByRole('button', { name: 'Let’s go' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Progress won’t be saved');
  });

  it('offers a retry when no schedule can be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.doMock('@daily-battle/gen', () => {
      throw new Error('offline');
    });
    renderApp(seeded());
    await act(async () => {});
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
    vi.doUnmock('@daily-battle/gen');
  });
});
