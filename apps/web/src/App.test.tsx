import { sets } from '@daily-battle/data';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import scheduleJson from '../public/schedule/2026-10-19.json';
import gen5Schedule from '../public/schedule/gen5ou/2026-10-26.json';
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
  state.settings.format = 'gen4ou';
  if (team) {
    state.games.gen4ou.weeks[team.week] = {
      team: schedule.suggestedTeams[0]!.team,
      poolId: `${team.week}:g${schedule.generatorVersion}:c${schedule.pool.candidate}`,
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
  // Most tests play today's game; the landing screen is tested on its own.
  window.location.hash = '#play';
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
    await user.click(await screen.findByRole('button', { name: 'Let’s play' }));
    expect(await screen.findByRole('button', { name: /Pick 6 more/ })).toBeDisabled();
  });

  it('links to the disclaimer and credits from the welcome sheet', async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'About and credits' }));
    const about = await screen.findByRole('dialog', { name: 'About Daily Battle' });
    expect(about).toHaveTextContent('not affiliated with or endorsed by Nintendo');
    expect(about).toHaveTextContent('Smogon, used with permission');
    expect(about).toHaveTextContent('No accounts and no tracking');
  });
});

describe('settings', () => {
  it('copies a playtest report and opens About', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async (_text: string) => {});
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    renderApp(seeded({ team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Copy playtest report' }));
    expect(writeText.mock.calls[0]![0]).toMatch(/^#daily-battle-report v1\n\{"v":1,/);
    await user.click(screen.getByRole('button', { name: 'About and credits' }));
    expect(await screen.findByRole('dialog', { name: 'About Daily Battle' })).toBeInTheDocument();
  });
});

describe('team builder', () => {
  it('asks everyone to build again when the week was regenerated, keeping finished tries', async () => {
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.weeks[WEEK]!.poolId = `${WEEK}:c0`; // locked against an earlier version
    const tried = (result: 'loss' | 'inProgress', ts: number) => ({
      result,
      remaining: 0,
      ts,
      lead: 'Heatran',
      team: schedule.suggestedTeams[0]!.team,
      battleSeed: '1',
      aiSeed: '2',
      choices: [],
      engine: ENGINE_VERSION,
    });
    state.games.gen4ou.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [tried('loss', 1), tried('inProgress', 2)],
    };
    const user = userEvent.setup();
    renderApp(state);
    expect(await screen.findByRole('status')).toHaveTextContent('Pick your team again');
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/Pick your team again/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: schedule.suggestedTeams[0]!.archetype }));
    await user.click(screen.getByRole('button', { name: 'Lock in team' }));
    const confirm = screen.queryByRole('dialog', { name: /Lock/ });
    if (confirm) await user.click(within(confirm).getByRole('button', { name: /Lock/ }));
    // The finished try still counts; the unfinished one (for the old team) is gone.
    expect(await screen.findByRole('region', { name: 'Today’s result' })).toHaveTextContent(
      '1 try',
    );
  });

  it('prompts for a set with the most used one ready, and caps the team at 6', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    const pool = schedule.pool.species;
    const multi = pool.find((p) => sets.species[p]!.sets.length > 1)!;
    const byWeight = [...sets.species[multi]!.sets].sort((a, b) => b.weight - a.weight);

    // Closing the prompt adds nothing.
    await user.click(await screen.findByRole('button', { name: `Add ${multi} to team` }));
    let picker = await screen.findByRole('dialog', { name: `${multi} · pick a set` });
    expect(within(picker).getByRole('tab', { selected: true })).toHaveAccessibleName(
      byWeight[0]!.label,
    );
    expect(picker).toHaveTextContent('Most used');
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();

    // Pick another set and add it.
    await user.click(screen.getByRole('button', { name: `Add ${multi} to team` }));
    picker = await screen.findByRole('dialog', { name: `${multi} · pick a set` });
    await user.click(within(picker).getByRole('tab', { name: byWeight[1]!.label }));
    expect(picker).toHaveTextContent(byWeight[1]!.moves[0]!);
    await user.click(within(picker).getByRole('button', { name: `Add ${multi}` }));
    expect(
      screen.getByRole('button', { name: `${multi}, ${byWeight[1]!.label}. Change set` }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: `Remove ${multi} from team` }));
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();

    for (const s of pool.slice(0, 7)) {
      const add = screen.queryByRole('button', { name: `Add ${s} to team` });
      if (!add) continue;
      await user.click(add);
      // One tap on the preselected set confirms it.
      const confirm = screen.queryByRole('button', { name: `Add ${s}` });
      if (confirm) await user.click(confirm);
    }
    expect(screen.getByRole('button', { name: 'Lock in team' })).toBeEnabled();
    expect(screen.getAllByRole('button', { name: /^Remove .* from team$/ })).toHaveLength(6);
  }, 20_000);

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
    state.games.gen4ou.days['2026-10-21'] = {
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
    state.games.gen4ou.days['2026-10-21'] = {
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
      'Not cleared yet · 1 try',
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
    state.games.gen4ou.days['2026-10-20'] = { swapUsed: false, attempts: [finished('win', 2, 1)] };
    state.games.gen4ou.days['2026-10-21'] = { swapUsed: false, attempts: [finished('win', 4, 3)] };
    renderApp(state);
    const strip = await screen.findByRole('region', { name: 'Today’s result' });
    expect(strip).toHaveTextContent('⭐ First try! · 4/6 left');
    expect(strip).toHaveTextContent('🔥 2-day streak');
    expect(strip).toHaveTextContent(/Next in \d+:\d\d:\d\d/);
    expect(within(strip).getByRole('button', { name: 'Share' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play again · practice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stats. Streak 2' })).toBeInTheDocument();
  });

  it('resets the streak when today isn’t won on the first try, and says so', async () => {
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-20'] = { swapUsed: false, attempts: [finished('win', 2, 1)] };
    state.games.gen4ou.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [finished('loss', 0, 2), finished('win', 1, 3)],
    };
    renderApp(state);
    const strip = await screen.findByRole('region', { name: 'Today’s result' });
    expect(strip).toHaveTextContent('✅ Won on try 2');
    expect(strip).toHaveTextContent('Streak reset');
    expect(screen.getByRole('button', { name: 'Stats. Streak 0' })).toBeInTheDocument();
  });

  it('offers a practice change once the day is won, leaving the weekly team alone', async () => {
    const user = userEvent.setup();
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-21'] = {
      swapUsed: false,
      // Practice starts once the day is won (here, on the second try).
      attempts: [finished('loss', 0, 1), finished('win', 3, 2)],
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
    await user.click(await screen.findByRole('button', { name: 'Let’s play' }));
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

describe('Species Clause', () => {
  it('allows only one form of a Pokémon on a team (Rotom-Wash or Rotom-Frost)', async () => {
    // This week's pool has both Rotom forms.
    expect(schedule.pool.species).toEqual(expect.arrayContaining(['Rotom-Wash', 'Rotom-Frost']));
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Add Rotom-Wash to team' }));
    await user.click(await screen.findByRole('button', { name: 'Add Rotom-Wash' }));
    const frost = screen.getByRole('button', { name: 'Rotom-Frost: one per team with Rotom-Wash' });
    await user.click(frost);
    expect(await screen.findByRole('status')).toHaveTextContent(
      'One per team: Rotom-Wash is a form of the same Pokémon',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // Taking Rotom-Wash off frees Rotom-Frost.
    await user.click(screen.getByRole('button', { name: 'Remove Rotom-Wash from team' }));
    expect(screen.getByRole('button', { name: 'Add Rotom-Frost to team' })).toBeEnabled();
  });
});

describe('home', () => {
  beforeEach(() => {
    window.location.hash = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        // Gen 4 and 5 need a pool of their own; Gen 6 is never opened here.
        String(url).includes('gen5ou/')
          ? new Response(JSON.stringify(gen5Schedule), { status: 200 })
          : new Response(JSON.stringify(schedule), { status: 200 }),
      ),
    );
  });

  it('lands on Daily Battle or Versus, with no sheet over them', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: /^Daily Battle/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Versus with friends/ })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a versus room from Versus with friends', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: /^Versus with friends/ }));
    expect(window.location.hash).toBe('#versus');
  });

  it('shows every game with its status and streak, and a pick plays that game', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: /^Daily Battle/ }));
    for (const gen of ['Gen 4 OU', 'Gen 5 OU', 'Gen 6 OU'])
      expect(screen.getByRole('button', { name: new RegExp(gen) })).toBeInTheDocument();
    expect(window.location.hash).toBe('#daily');
    await user.click(screen.getByRole('button', { name: /Gen 5 OU/ }));
    expect(await screen.findByRole('button', { name: /^Gen 5 · Week of/ })).toBeInTheDocument();
    expect(window.location.hash).toBe('#play');
  });

  it('opens the game picker from a shared link', async () => {
    window.location.hash = '#daily';
    renderApp();
    expect(await screen.findByText('Choose a game')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('still opens the game of an older #gen5 link', async () => {
    window.location.hash = '#gen5';
    renderApp(seeded());
    expect(await screen.findByRole('button', { name: /^Gen 5 · Week of/ })).toBeInTheDocument();
  });

  it('returns from the picker to the first screen, and from a game to the picker', async () => {
    const user = userEvent.setup();
    window.location.hash = '#daily';
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: /^Daily Battle/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Daily Battle/ }));
    await user.click(await screen.findByRole('button', { name: /Gen 4 OU/ }));
    await user.click(await screen.findByRole('button', { name: /^Gen 4 · Week of/ }));
    expect(await screen.findByText('Choose a game')).toBeInTheDocument();
  });
});

describe('playtest feedback', () => {
  const foe = () => schedule.days.find((d) => d.day === '2026-10-21')!.team[0]!.species;

  it('lists an opponent’s possible sets with Beginner hints on, and not with them off', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp(seeded({ team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: `About ${foe()}` }));
    const info = await screen.findByRole('dialog', { name: foe() });
    const tabs = within(info).getAllByRole('tab');
    expect(tabs.length).toBe(sets.species[foe()]!.sets.length);
    unmount();

    renderApp(seeded({ hints: false, team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: `About ${foe()}` }));
    const plain = await screen.findByRole('dialog', { name: foe() });
    expect(within(plain).queryByRole('tab')).not.toBeInTheDocument();
    expect(plain).not.toHaveTextContent('Possible sets');
  });

  it('puts Cancel on the change chip, next to the team, and nowhere else', async () => {
    const user = userEvent.setup();
    renderApp(seeded({ team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: '1 change left' }));
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: '1 change left' })).toBeInTheDocument();
  });

  it('reopens the rules from Settings as How to play', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    const how = await screen.findByRole('dialog', { name: 'How to play' });
    expect(how).toHaveTextContent('Win on your first try');
    expect(within(how).queryByRole('radio')).not.toBeInTheDocument();
    await user.click(within(how).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument();
  });

  it('changes a picked Pokémon’s set from the pencil on its tile', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    const multi = schedule.pool.species.find((p) => sets.species[p]!.sets.length > 1)!;
    await user.click(await screen.findByRole('button', { name: `Add ${multi} to team` }));
    await user.click(await screen.findByRole('button', { name: `Add ${multi}` }));
    await user.click(screen.getByRole('button', { name: /Change set$/ }));
    expect(await screen.findByRole('dialog', { name: new RegExp(multi) })).toBeInTheDocument();
  });
});
