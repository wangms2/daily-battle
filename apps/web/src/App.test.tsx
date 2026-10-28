import { sets } from '@daily-battle/data';
import type { ScheduleFile } from '@daily-battle/gen/schedule';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import scheduleJson from '../public/schedule/2026-10-19.json';
import gen3Schedule from '../public/schedule/gen3ou/2026-10-19.json';
import gen5Schedule from '../public/schedule/gen5ou/2026-10-26.json';
import { LESSONS } from '@daily-battle/tutorial/lessons';
import { App } from './App';
import { ENGINE_VERSION } from './lib/seed';
import { attemptEngine } from './state/reducer';
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
  state.settings.name = 'Ash';
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

/** The Settings button once the week has loaded (the loading screen has its own, which goes). */
async function settingsOnceLoaded() {
  await waitFor(() => expect(screen.queryByText('Loading this week…')).not.toBeInTheDocument());
  return screen.getByRole('button', { name: 'Settings' });
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
    const about = await screen.findByRole('dialog', { name: 'About Pokémon Daily' });
    expect(about).toHaveTextContent('not affiliated with or endorsed by Nintendo');
    expect(about).toHaveTextContent('Smogon, used with permission');
    expect(about).toHaveTextContent('No ads, no tracking, and no email');
    expect(about).toHaveTextContent('Every game uses the OU (OverUsed) tier.');
  });

  it('points beginners to the tutorial from the welcome sheet', async () => {
    const user = userEvent.setup();
    renderApp();
    const welcome = await screen.findByRole('dialog', { name: 'Welcome to Pokémon Daily' });
    const block = within(welcome).getByRole('region', { name: 'New to competitive Pokémon?' });
    expect(block).toHaveTextContent('Start with Gen 3. It has lessons and a coach.');
    await user.click(within(block).getByRole('button', { name: 'Start the tutorial' }));
    expect(window.location.hash).toBe(`#learn/${LESSONS.gen3ou![0]!.id}`);
    expect(
      screen.queryByRole('dialog', { name: 'Welcome to Pokémon Daily' }),
    ).not.toBeInTheDocument();
  });
});

describe('settings', () => {
  it('opens About', async () => {
    const user = userEvent.setup();
    renderApp(seeded({ team: { week: WEEK } }));
    await user.click(await settingsOnceLoaded());
    await user.click(screen.getByRole('button', { name: 'About' }));
    expect(await screen.findByRole('dialog', { name: 'About Pokémon Daily' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'Use recommended team' }));
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

  it('applies the recommended team, offers undo, and stays editable', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    const suggestion = schedule.suggestedTeams[0]!;
    await user.click(await screen.findByRole('button', { name: 'Use recommended team' }));
    expect(screen.getByRole('button', { name: 'Lock in team' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Use recommended team' }));
    await user.click(
      screen.getByRole('button', { name: `Remove ${suggestion.team[0]!.species} from team` }),
    );
    expect(screen.getByRole('button', { name: /Pick 1 more/ })).toBeInTheDocument();
  });

  it('rolls random teams again and again, and undo goes back to before the first', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Random team' }));
    expect(screen.getByRole('button', { name: 'Lock in team' })).toBeEnabled();
    const members = () =>
      screen.getAllByRole('button', { name: /^Remove .* from team$/ }).map((b) => b.ariaLabel);
    expect(members()).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Another random team' }));
    await user.click(screen.getByRole('button', { name: 'Another random team' }));
    expect(members()).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByRole('button', { name: /Pick 6 more/ })).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: 'Use recommended team' }));
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
    const bench = schedule.pool.species.find((s) => !team.some((t) => t.species === s))!;
    // Either order: the bench Pokémon first, then who it replaces.
    await user.click(screen.getByRole('button', { name: `Swap in ${bench}` }));
    expect(screen.getByRole('button', { name: `Tap who ${bench} replaces` })).toBeDisabled();
    // Nothing covers the opponent while you decide.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^About / })).toHaveLength(6);
    await user.click(screen.getByRole('button', { name: `Change ${team[0]!.species}` }));
    await user.click(screen.getByRole('button', { name: `Bring in ${bench}` }));
    await user.click(await screen.findByRole('button', { name: 'Make change' }));
    expect(await screen.findByText('Change used on Normal')).toBeInTheDocument();
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

  it('shares this game or every game played today', async () => {
    const user = userEvent.setup();
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-21'] = { swapUsed: false, attempts: [finished('win', 4, 3)] };
    state.games.gen6ou.days['2026-10-21'] = { swapUsed: false, attempts: [finished('loss', 0, 2)] };
    renderApp(state);
    const strip = await screen.findByRole('region', { name: 'Today’s result' });
    await user.click(within(strip).getByRole('button', { name: 'Share' }));
    const sheet = await screen.findByRole('dialog', { name: 'Share your result' });
    expect(within(sheet).getByRole('radio', { name: 'This game' })).toBeChecked();
    await user.click(within(sheet).getByRole('radio', { name: 'All games (2)' }));
    await user.click(within(sheet).getByRole('button', { name: 'Copy text' }));
    const text = await navigator.clipboard.readText();
    // The streak, then the game's stars: ⭐ first tries · ✓ clears.
    expect(text).toMatch(/^Pokémon Daily · Oct 21\nGen 4 OU · 🔥 1-day streak · ⭐ 1 · ✓ 1\n⭐ /);
    expect(text).toContain('Gen 6 OU · Streak reset\n❌ ');
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

  it('offers a practice team once the day is won, leaving the weekly team alone', async () => {
    const user = userEvent.setup();
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-21'] = {
      swapUsed: false,
      // Practice starts once the day is won (here, on the second try).
      attempts: [finished('loss', 0, 1), finished('win', 3, 2)],
    };
    renderApp(state);
    expect(await screen.findByRole('button', { name: 'Practice changes' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '1 change left' })).not.toBeInTheDocument();

    const team = schedule.suggestedTeams[0]!.team;
    const bench = schedule.pool.species.find((s) => !team.some((t) => t.species === s))!;
    await user.click(screen.getByRole('button', { name: 'Practice changes' }));
    await user.click(screen.getByRole('button', { name: `Change ${team[1]!.species}` }));
    await user.click(screen.getByRole('button', { name: `Swap in ${bench}` }));
    await user.click(screen.getByRole('button', { name: `Bring in ${bench}` }));
    // Free and for today only: no confirm.
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('button', { name: `Lead with ${bench}` })).toBeInTheDocument();
    expect(screen.getByText('Practice team')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to my team' }));
    expect(screen.queryByRole('button', { name: `Lead with ${bench}` })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `Lead with ${team[1]!.species}` }),
    ).toBeInTheDocument();
  });

  it('says which difficulty used the shared daily change', async () => {
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-21'] = { swapUsed: true, changeOn: 'hard', attempts: [] };
    renderApp(state);
    expect(await screen.findByText('Change used on Hard')).toBeInTheDocument();
  });
  it('has no result strip before the first try', async () => {
    renderApp(seeded({ team: { week: WEEK } }));
    await screen.findByRole('button', { name: /^Start · / });
    expect(screen.queryByRole('region', { name: 'Today’s result' })).not.toBeInTheDocument();
  });

  it('keeps each difficulty’s day apart, and remembers the pick', async () => {
    const user = userEvent.setup();
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-21'] = { swapUsed: false, attempts: [finished('win', 4, 3)] };
    renderApp(state);
    await screen.findByRole('region', { name: 'Today’s result' });
    const picker = screen.getByRole('radiogroup', { name: 'Difficulty' });
    expect(within(picker).getByRole('radio', { name: 'Normal' })).toBeChecked();

    await user.click(within(picker).getByRole('radio', { name: 'Easy' }));
    expect(within(picker).getByRole('radio', { name: 'Easy' })).toBeChecked();
    // Today's Normal win doesn't count at Easy.
    expect(screen.queryByRole('region', { name: 'Today’s result' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Start · / })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stats. Streak 0' })).toBeInTheDocument();

    await user.click(within(picker).getByRole('radio', { name: 'Normal' }));
    expect(await screen.findByRole('region', { name: 'Today’s result' })).toHaveTextContent(
      'First try!',
    );
  });

  it('holds the difficulty of a battle in progress', async () => {
    const state = seeded({ team: { week: WEEK } });
    state.games.gen4ou.days['2026-10-21'] = {
      swapUsed: false,
      attempts: [
        {
          ...finished('win', 6, 1),
          result: 'inProgress',
          difficulty: 'easy',
          engine: attemptEngine(ENGINE_VERSION, 'easy'),
        },
      ],
    };
    renderApp(state);
    expect(await screen.findByRole('button', { name: 'Resume battle' })).toBeInTheDocument();
    const picker = screen.getByRole('radiogroup', { name: 'Difficulty' });
    expect(within(picker).getByRole('radio', { name: 'Easy' })).toBeChecked();
    expect(within(picker).getByRole('radio', { name: 'Normal' })).toBeDisabled();
  });

  it('offers the coach once in Gen 3, warns about the streak, and counts coached days apart', async () => {
    const user = userEvent.setup();
    const gen3 = gen3Schedule as ScheduleFile;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(gen3), { status: 200 })),
    );
    const state = seeded();
    state.settings.format = 'gen3ou';
    state.games.gen3ou.weeks[WEEK] = {
      team: gen3.suggestedTeams[0]!.team,
      poolId: `${WEEK}:g${gen3.generatorVersion}:c${gen3.pool.candidate}`,
    };
    const won = { ...finished('win', 4, 1), lead: gen3.suggestedTeams[0]!.team[0]!.species };
    state.games.gen3ou.days['2026-10-20'] = { swapUsed: false, attempts: [won] };
    renderApp(state);
    const offer = await screen.findByRole('dialog', { name: 'Want a coach?' });
    expect(offer).toHaveTextContent('ends your 1-day streak');
    await user.click(within(offer).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const coach = screen.getByRole('button', { name: 'Coach off' });
    expect(coach).toHaveAttribute('aria-pressed', 'false');
    await user.click(coach);
    const ask = await screen.findByRole('dialog', { name: 'Turn on the coach?' });
    await user.click(within(ask).getByRole('button', { name: 'Turn on' }));
    expect(screen.getByRole('button', { name: 'Coach on' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The Coached streak starts from nothing; the header says so.
    expect(screen.getByRole('button', { name: 'Stats. Streak 0' })).toBeInTheDocument();
    expect(screen.getByTitle('Back')).toHaveTextContent('Gen 3 · Coached · ');

    // Off again before a battle: the regular streak is still there.
    await user.click(screen.getByRole('button', { name: 'Coach on' }));
    expect(screen.getByRole('button', { name: 'Stats. Streak 1' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('has no coach outside Gen 3', async () => {
    renderApp(seeded({ team: { week: WEEK } }));
    await screen.findByRole('radiogroup', { name: 'Difficulty' });
    expect(screen.queryByRole('button', { name: /^Coach/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
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
        // Gen 4 and 5 need a pool of their own; Gen 3 and 6 are never opened here.
        String(url).includes('gen5ou/')
          ? new Response(JSON.stringify(gen5Schedule), { status: 200 })
          : new Response(JSON.stringify(schedule), { status: 200 }),
      ),
    );
  });

  it('lands on Play or Versus, with no sheet over them', async () => {
    renderApp(seeded());
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'With friends' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('asks a first-time player’s name before the landing, and never again', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp();
    const field = await screen.findByRole('textbox', { name: 'Your name' });
    // Over the landing, so it's clear this is Pokémon Daily.
    expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Pokémon Daily' })).toBeInTheDocument();
    expect((field as HTMLInputElement).value).not.toBe('');
    await user.clear(field);
    await user.type(field, 'Misty');
    await user.click(screen.getByRole('button', { name: 'That’s me!' }));
    expect(await screen.findByText(/Nice to meet you/)).toHaveTextContent('Misty');
    await user.click(screen.getByRole('button', { name: 'Let’s go!' }));
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    unmount();
  });

  it('lets a link straight into a game skip the name screen', async () => {
    window.location.hash = '#daily';
    renderApp();
    expect(await screen.findByText('Choose a generation')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Your name' })).not.toBeInTheDocument();
  });

  it('opens a versus room from With friends', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'With friends' }));
    expect(window.location.hash).toBe('#versus');
  });

  it('opens Learn mode from Battle basics', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Battle basics' }));
    expect(window.location.hash).toBe('#learn');
  });

  it('opens Learn mode from the Gen 3 cartridge’s Battle basics', async () => {
    const user = userEvent.setup();
    window.location.hash = '#daily';
    renderApp(seeded());
    await screen.findByText('Choose a generation');
    const games = screen.getByRole('main');
    await user.click(within(games).getByRole('button', { name: 'Battle basics' }));
    expect(window.location.hash).toBe('#learn');
  });

  it('shares today from the picker: one game in full, more on one card', async () => {
    const user = userEvent.setup();
    window.location.hash = '#daily';
    const state = seeded();
    const win = {
      result: 'win' as const,
      remaining: 3,
      ts: 1,
      lead: 'Hippowdon',
      team: [],
      battleSeed: '1',
      aiSeed: '2',
      choices: [],
      engine: ENGINE_VERSION,
    };
    state.games.gen5ou.days['2026-10-21'] = { swapUsed: false, attempts: [win] };
    const { unmount } = renderApp(state);
    await screen.findByText('Choose a generation');
    expect(screen.queryByRole('button', { name: /^Share all/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Share today' }));
    const sheet = await screen.findByRole('dialog', { name: 'Share your result' });
    expect(within(sheet).queryByRole('radio')).not.toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Copy text' }));
    expect(await navigator.clipboard.readText()).toMatch(/^Pokémon Daily · Gen 5 OU · Oct 21\n/);
    unmount();

    state.games.gen3ou.days['2026-10-21'] = { swapUsed: false, attempts: [{ ...win, ts: 2 }] };
    renderApp(state);
    await user.click(await screen.findByRole('button', { name: 'Share all 2 games' }));
    await user.click(await screen.findByRole('button', { name: 'Copy text' }));
    expect(await navigator.clipboard.readText()).toMatch(
      /^Pokémon Daily · Oct 21\nGen 3 OU · 🔥 1-day streak · ⭐ 1 · ✓ 1\n⭐ .*\nGen 5 OU/,
    );
  });

  it('shows every game with its status and streak, and a pick plays that game', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    for (const gen of ['Gen 3', 'Gen 4', 'Gen 5', 'Gen 6'])
      expect(screen.getByRole('button', { name: new RegExp(gen) })).toBeInTheDocument();
    expect(window.location.hash).toBe('#daily');
    await user.click(screen.getByRole('button', { name: /^Gen 5/ }));
    expect(await screen.findByRole('button', { name: /^Gen 5 · Week of/ })).toBeInTheDocument();
    expect(window.location.hash).toBe('#play');
  });

  it('loads every game’s week on the picker, so a pick opens at once', async () => {
    const user = userEvent.setup();
    renderApp(seeded());
    await user.click(await screen.findByRole('button', { name: 'Play' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('gen5ou/')));
    await act(() => new Promise((r) => setTimeout(r, 20)));
    await user.click(screen.getByRole('button', { name: /^Gen 5/ }));
    expect(screen.queryByText('Loading this week…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Gen 5 · Week of/ })).toBeInTheDocument();
  });

  it('opens the game picker from a shared link', async () => {
    window.location.hash = '#daily';
    renderApp();
    expect(await screen.findByText('Choose a generation')).toBeInTheDocument();
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
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Play' }));
    await user.click(await screen.findByRole('button', { name: /^Gen 4/ }));
    await user.click(await screen.findByRole('button', { name: /^Gen 4 · Week of/ }));
    expect(await screen.findByText('Choose a generation')).toBeInTheDocument();
  });
});

describe('playtest feedback', () => {
  const foe = () => schedule.days.find((d) => d.day === '2026-10-21')!.team[0]!.species;

  it('shows an opponent’s likely moves with Beginner hints on, never its sets', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp(seeded({ team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: `About ${foe()}` }));
    const info = await screen.findByRole('dialog', { name: foe() });
    expect(info).toHaveTextContent('Likely moves');
    expect(
      within(info).getByRole('list', { name: 'Speed against your team' }).children,
    ).toHaveLength(6);
    expect(within(info).queryByRole('tab')).not.toBeInTheDocument();
    unmount();

    renderApp(seeded({ hints: false, team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: `About ${foe()}` }));
    const plain = await screen.findByRole('dialog', { name: foe() });
    expect(plain).not.toHaveTextContent('Likely moves');
    expect(plain).toHaveTextContent('before boosts, items and abilities');
  });

  it('shows an opponent in place of the change panel while editing, with no sheet', async () => {
    const user = userEvent.setup();
    renderApp(seeded({ team: { week: WEEK } }));
    await user.click(await screen.findByRole('button', { name: '1 change left' }));
    await user.click(screen.getByRole('button', { name: `About ${foe()}` }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: `About ${foe()}` })).toHaveTextContent('Speed');
    expect(screen.queryByRole('button', { name: /^Swap in / })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getAllByRole('button', { name: /^Swap in / }).length).toBeGreaterThan(0);
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
    await user.click(await settingsOnceLoaded());
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    const how = await screen.findByRole('dialog', { name: 'How to play' });
    expect(how).toHaveTextContent('Win on your first try');
    expect(within(how).queryByRole('radio')).not.toBeInTheDocument();
    await user.click(within(how).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('dialog', { name: 'How to play' })).not.toBeInTheDocument();
  });

  it('opens the next lesson from How to play', async () => {
    const user = userEvent.setup();
    const state = seeded();
    state.settings.tutorial = { gen3ou: { completed: [LESSONS.gen3ou![0]!.id] } };
    renderApp(state);
    await user.click(await settingsOnceLoaded());
    await user.click(screen.getByRole('button', { name: 'How to play' }));
    const how = await screen.findByRole('dialog', { name: 'How to play' });
    expect(how).not.toHaveTextContent('OverUsed');
    // The tutorial picks up at the first lesson not done yet.
    await user.click(within(how).getByRole('button', { name: 'Start the tutorial' }));
    expect(window.location.hash).toBe(`#learn/${LESSONS.gen3ou![1]!.id}`);
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
