import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BattleBackendContext, type BattleBackend } from '../battle/backend';
import type {
  Controls,
  EngineStart,
  Frame,
  MoveOption,
  TeamMember,
  TurnPackage,
  View,
} from '../battle/frames';
import { summarizeDay } from '../lib/results';
import { formatShareText, shareModel } from '../lib/share';
import { initialState, type Attempt, type Settings } from '../state/schema';
import { Battle, type DayResult } from './Battle';

const START: EngineStart = {
  playerTeam: [],
  opponentTeam: [],
  style: 'balance',
  battleSeed: '1,2,3,4',
  aiSeed: '5,6,7,8',
  choices: [],
};

const side = { sr: false, spikes: 0, tspikes: 0, reflect: false, lightScreen: false };
const mon = (species: string, hp = 100) => ({
  species,
  hp,
  status: '',
  boosts: {},
  substitute: false,
  fainted: hp === 0,
});
const view = (turn: number, foeHp = 100): View => ({
  turn,
  you: mon('Heatran'),
  foe: mon('Gyarados', foeHp),
  yourSide: side,
  foeSide: side,
  weather: '',
  revealed: { Gyarados: { moves: ['Waterfall'], item: '', ability: 'Intimidate' } },
  yourTeam: ['Heatran', 'Scizor', 'Celebi', 'Azelf', 'Jirachi', 'Lucario'].map((species, i) => ({
    species,
    fainted: i === 5,
    status: '',
  })),
  foeTeam: [
    { species: 'Gyarados', fainted: false, status: '' },
    ...Array.from({ length: 5 }, () => ({ fainted: false, status: '' })),
  ],
});
const frame = (text: string, v: View, kind?: NonNullable<Frame['event']>['kind']): Frame => ({
  text,
  view: v,
  event: kind ? { kind, who: 'foe' } : undefined,
});

const member = (slot: number, species: string, active = false): TeamMember => ({
  slot,
  species,
  hp: 100,
  hpExact: { hp: 300, max: 300 },
  status: '',
  fainted: false,
  active,
  item: 'Leftovers',
  ability: 'Flash Fire',
  moves: ['Fire Blast'],
  stats: { atk: 200, def: 250, spa: 300, spd: 250, spe: 230 },
});
const TEAM = [member(1, 'Heatran', true), member(2, 'Scizor'), member(3, 'Celebi')];

const move = (name: string, effectiveness: number | null, choice = 'move 1'): MoveOption => ({
  choice,
  name,
  type: 'Electric',
  category: 'Special',
  power: 95,
  accuracy: 100,
  desc: '10% chance to paralyze the target.',
  pp: 24,
  maxpp: 24,
  disabled: false,
  effectiveness,
});
const MOVES: Controls = {
  kind: 'move',
  moves: [move('Thunderbolt', 4), move('Earthquake', 0, 'move 2')],
  switches: [
    { choice: 'switch 2', slot: 2 },
    { choice: 'switch 3', slot: 3 },
  ],
  only: null,
};

const pkg = (over: Partial<TurnPackage>): TurnPackage => ({
  frames: [],
  team: TEAM,
  controls: MOVES,
  explainers: [],
  end: null,
  resumed: false,
  ...over,
});

const OPENING = pkg({
  frames: [
    frame('Go! **Heatran**!', view(0), 'switch'),
    frame('The opposing **Gyarados** appeared!', view(0), 'switch'),
    frame('== Turn 1 ==', view(1), 'turn'),
  ],
});
const TURN_1 = pkg({
  frames: [
    frame('**Heatran** used **Thunderbolt**!', view(1, 20), 'damage'),
    frame('It’s super effective!', view(1, 20)),
    frame('== Turn 2 ==', view(2, 20), 'turn'),
  ],
});
const WON = pkg({
  frames: [frame('The opposing **Gyarados** fainted!', view(2, 0), 'faint')],
  controls: null,
  end: { winner: 'you', youLeft: 3, foeLeft: 0 },
});

function fakeBackend(turns: TurnPackage[], start = OPENING) {
  const calls: string[] = [];
  const backend: BattleBackend = {
    start: vi.fn(async () => start),
    choose: vi.fn(async (c: string) => {
      calls.push(c);
      return turns.shift() ?? WON;
    }),
    forfeit: vi.fn(async () =>
      pkg({
        frames: [frame('You forfeited.', view(2))],
        controls: null,
        end: { winner: 'foe', youLeft: 3, foeLeft: 6 },
      }),
    ),
  };
  return { backend, calls };
}

function renderBattle(
  backend: BattleBackend,
  {
    speed = 'instant',
    hints = true,
    tryNumber = 1,
    result = {
      summary: summarizeDay(undefined, true),
      streak: 0,
      share: shareModel({ day: '2026-10-21', summary: summarizeDay(undefined, true), streak: 0 }),
      ts: 1,
    },
  }: {
    speed?: Settings['battleSpeed'];
    hints?: boolean;
    tryNumber?: number;
    result?: DayResult;
  } = {},
) {
  const settings: Settings = {
    ...initialState().settings,
    battleSpeed: speed,
    beginnerHints: hints,
  };
  const props = {
    onSetting: vi.fn(),
    onExplainerSeen: vi.fn(),
    onChoice: vi.fn(),
    onEnd: vi.fn(),
    onExit: vi.fn(),
    onRunItBack: vi.fn(),
  };
  render(
    <BattleBackendContext.Provider value={() => backend}>
      <Battle
        start={START}
        background="/fx/bg-gen4.png"
        tryNumber={tryNumber}
        settings={settings}
        result={result}
        {...props}
      />
    </BattleBackendContext.Provider>,
  );
  return props;
}

const thunderbolt = () => screen.findByRole('button', { name: /^Thunderbolt, / });

describe('battle screen', () => {
  it('keeps the controls off while a turn plays, and a tap skips to the end', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend, { speed: 'normal' });
    await screen.findByText('Heatran', { selector: 'strong' });
    expect(screen.queryByRole('button', { name: /^Thunderbolt, / })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('log', { name: 'Battle log' }));
    expect(await thunderbolt()).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Switch to Scizor/ })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    expect(within(screen.getByRole('banner')).getByText('Turn 1')).toBeInTheDocument();
    expect(screen.getByRole('log', { name: 'Battle log' })).toHaveTextContent('Gyarados appeared!');
  });

  it('skips playback from the keyboard too', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend, { speed: 'slow' });
    await screen.findByText('Heatran', { selector: 'strong' });
    expect(screen.queryByRole('button', { name: /^Thunderbolt, / })).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(await thunderbolt()).toBeEnabled();
  });

  it('sends a chosen move, saves it, and plays the answer', async () => {
    const { backend, calls } = fakeBackend([TURN_1]);
    const props = renderBattle(backend);
    await userEvent.click(await thunderbolt());
    await within(screen.getByRole('banner')).findByText('Turn 2');
    expect(calls).toEqual(['move 1']);
    expect(props.onChoice).toHaveBeenCalledWith('move 1');
    expect(screen.getByRole('log', { name: 'Battle log' })).toHaveTextContent(
      'It’s super effective!',
    );
  });

  it('submits the only legal choice by itself', async () => {
    const only = pkg({ ...TURN_1, controls: { ...MOVES, only: 'move 1' } });
    const { backend, calls } = fakeBackend([only, TURN_1]);
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    await waitFor(() => expect(calls).toEqual(['move 1', 'move 1']));
  });

  it('asks who comes in after a faint', async () => {
    const forced = pkg({
      controls: { kind: 'switch', moves: [], switches: MOVES.switches, only: null },
    });
    const { backend, calls } = fakeBackend([forced]);
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    expect(await screen.findByText('Who comes in?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Thunderbolt, / })).not.toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^Switch to Celebi/ }).at(-1)!);
    expect(calls).toEqual(['move 1', 'switch 3']);
  });

  it('waits for you to send in your last Pokémon, then takes one tap', async () => {
    const last = { choice: 'switch 3', slot: 3 };
    const forced = pkg({
      controls: { kind: 'switch', moves: [], switches: [last], only: last.choice },
    });
    const { backend, calls } = fakeBackend([forced]);
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    expect(await screen.findByText('Send in your last Pokémon')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 700));
    expect(calls).toEqual(['move 1']);
    const celebi = screen.getAllByRole('button', { name: /^Switch to Celebi/ }).at(-1)!;
    fireEvent.pointerDown(celebi, { pointerType: 'touch' });
    fireEvent.pointerUp(celebi, { pointerType: 'touch' });
    fireEvent.click(celebi);
    expect(calls).toEqual(['move 1', 'switch 3']);
  });

  it('shows move details on a long press without choosing the move', async () => {
    const { backend, calls } = fakeBackend([]);
    renderBattle(backend);
    const button = await thunderbolt();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole('tooltip')).toHaveTextContent('10% chance to paralyze the target.');
      fireEvent.pointerUp(button, { pointerType: 'touch' });
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toEqual([]);
  });

  it('labels type effectiveness only with Beginner hints on', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend, { hints: true });
    expect(await thunderbolt()).toHaveAccessibleName(/Super effective ×4/);
    expect(screen.getByRole('button', { name: /^Earthquake, / })).toHaveAccessibleName(/No effect/);
  });

  it('hides effectiveness with Beginner hints off', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend, { hints: false });
    expect(await thunderbolt()).not.toHaveAccessibleName(/effective/);
    expect(screen.queryByText(/Super effective/)).not.toBeInTheDocument();
  });

  it('asks what your Pokémon will do, with its HP', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend);
    await thunderbolt();
    expect(screen.getByText(/What will/)).toHaveTextContent('What will Heatran do?');
    expect(screen.getByText('HP 300/300')).toBeInTheDocument();
  });

  it('shows how many Pokémon each side has left', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend);
    await thunderbolt();
    expect(
      screen.getByRole('button', { name: /^Foe Gyarados, 100% HP, 6 of 6 left/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Your Heatran, 100% HP, 5 of 6 left/ }),
    ).toBeInTheDocument();
  });

  it('opens a compact details card from a stat bar, and closes it on a tap elsewhere', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend);
    await thunderbolt();
    await userEvent.click(screen.getByRole('button', { name: /^Foe Gyarados/ }));
    const card = screen.getByRole('tooltip');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(card).toHaveTextContent('Gyarados');
    expect(card).toHaveTextContent('Intimidate');
    expect(card).toHaveTextContent('Waterfall');
    // Only what's been revealed: no placeholder for the unknown item.
    expect(card).not.toHaveTextContent('Unknown');
    await userEvent.click(screen.getByText(/What will/));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^Your Heatran/ }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Leftovers · Flash Fire');
  });

  it('opens details from a tap on the Pokémon itself', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend);
    await thunderbolt();
    const sprites = document.querySelectorAll('[data-mon][role="presentation"]');
    fireEvent.click(sprites[0]!); // the foe's sprite comes first
    expect(screen.getByRole('tooltip')).toHaveTextContent('Gyarados');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('shows a benched Pokémon’s details on a tap while it can’t switch in', async () => {
    const { backend, calls } = fakeBackend([TURN_1]);
    renderBattle(backend, { speed: 'normal' });
    await userEvent.click(screen.getByRole('log', { name: 'Battle log' })); // skip the opening
    await userEvent.click(await thunderbolt());
    // The turn is playing: the bench can't switch, so a tap shows details instead.
    const scizor = screen.getByRole('button', { name: /^Switch to Scizor/ });
    expect(scizor).toHaveAttribute('aria-disabled', 'true');
    const tap = () => {
      fireEvent.pointerDown(scizor, { pointerType: 'touch' });
      fireEvent.pointerUp(scizor, { pointerType: 'touch' });
      fireEvent.click(scizor);
    };
    tap();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Scizor');
    tap();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(calls).toEqual(['move 1']);
  });

  it('opens a benched Pokémon’s details on a touch, switching only from its button', async () => {
    const { backend, calls } = fakeBackend([]);
    renderBattle(backend);
    await thunderbolt();
    const scizor = screen.getByRole('button', { name: /^Switch to Scizor/ });
    fireEvent.pointerDown(scizor, { pointerType: 'touch' });
    fireEvent.pointerUp(scizor, { pointerType: 'touch' });
    fireEvent.click(scizor);
    expect(calls).toEqual([]);
    const card = screen.getByRole('dialog', { name: 'Scizor' });
    expect(scizor).toHaveAttribute('aria-expanded', 'true');
    // A tap elsewhere closes it; tapping the Pokémon again reopens it.
    fireEvent.pointerDown(document.body);
    expect(card).not.toBeInTheDocument();
    fireEvent.pointerDown(scizor, { pointerType: 'touch' });
    fireEvent.click(scizor);
    await userEvent.click(
      within(screen.getByRole('dialog', { name: 'Scizor' })).getByRole('button', {
        name: 'Switch to Scizor',
      }),
    );
    expect(calls).toEqual(['switch 2']);
  });

  it('switches straight away on a mouse click', async () => {
    const { backend, calls } = fakeBackend([]);
    renderBattle(backend);
    await thunderbolt();
    const scizor = screen.getByRole('button', { name: /^Switch to Scizor/ });
    fireEvent.pointerDown(scizor, { pointerType: 'mouse' });
    fireEvent.click(scizor);
    expect(calls).toEqual(['switch 2']);
  });

  it('confirms before giving up, then records a forfeit', async () => {
    const { backend } = fakeBackend([]);
    const props = renderBattle(backend);
    await thunderbolt();
    await userEvent.click(screen.getByRole('button', { name: 'Battle menu' }));
    await userEvent.click(screen.getByRole('button', { name: 'Give up' }));
    const confirm = await screen.findByRole('dialog', { name: 'Give up this battle?' });
    expect(confirm).toHaveTextContent('first try');
    expect(backend.forfeit).not.toHaveBeenCalled();
    await userEvent.click(within(confirm).getByRole('button', { name: 'Give up' }));
    expect(await screen.findByRole('dialog', { name: 'Battle over' })).toHaveTextContent(
      'You gave up',
    );
    expect(props.onEnd).toHaveBeenCalledWith({ result: 'forfeit', remaining: 3 });
  });

  const tried = (result: Attempt['result'], remaining: number, ts: number): Attempt => ({
    result,
    remaining,
    ts,
    lead: 'Heatran',
    team: [],
    battleSeed: '1',
    aiSeed: '2',
    choices: [],
    engine: 'e',
  });
  const dayResult = (attempts: Attempt[], streak: number): DayResult => {
    const summary = summarizeDay({ swapUsed: false, attempts }, true);
    return {
      summary,
      streak,
      share: shareModel({ day: '2026-10-21', summary, streak }),
      ts: attempts.at(-1)!.ts,
    };
  };
  /** Share opens a choice of image or text; picks the text. */
  async function shareText(card: HTMLElement, label: string) {
    await userEvent.click(within(card).getByRole('button', { name: 'Share' }));
    const choice = await screen.findByRole('dialog', { name: 'Share your result' });
    expect(within(choice).getByRole('button', { name: /image$/ })).toBeInTheDocument();
    await userEvent.click(within(choice).getByRole('button', { name: label }));
  }
  async function winBattle() {
    await userEvent.click(await thunderbolt());
    await within(screen.getByRole('banner')).findByText('Turn 2');
    await userEvent.click(await thunderbolt());
    return screen.findByRole('dialog', { name: 'Battle over' });
  }

  it('ends on a result card with today’s tries, the streak, and Share', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    try {
      const { backend } = fakeBackend([TURN_1]);
      const props = renderBattle(backend, {
        tryNumber: 2,
        result: dayResult([tried('loss', 0, 1), tried('win', 3, 2)], 4),
      });
      const card = await winBattle();
      const result = dayResult([tried('loss', 0, 1), tried('win', 3, 2)], 4);
      expect(card).toHaveTextContent('You won');
      expect(card).toHaveTextContent('Try 2 of 3');
      expect(card).not.toHaveTextContent('First try');
      expect(within(card).getByLabelText('Try 1: lost, 0 of 6 left')).toBeInTheDocument();
      expect(within(card).getByLabelText('Try 2: won, 3 of 6 left')).toBeInTheDocument();
      expect(card).toHaveTextContent('🔥 4-day streak');
      expect(props.onEnd).toHaveBeenCalledWith({ result: 'win', remaining: 3 });
      await shareText(card, 'Share text');
      expect(share).toHaveBeenCalledWith({ text: formatShareText(result.share) });
      await userEvent.click(within(card).getByRole('button', { name: 'Play again' }));
      expect(props.onRunItBack).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('labels a run after the day is decided as practice, not a try', async () => {
    const { backend } = fakeBackend([TURN_1]);
    renderBattle(backend, {
      tryNumber: 2,
      result: dayResult([tried('win', 3, 1), tried('win', 5, 2)], 1),
    });
    const card = await winBattle();
    expect(card).not.toHaveTextContent('of 3');
    expect(card).not.toHaveTextContent('First try');
    expect(within(card).getByLabelText('Try 1: won, 3 of 6 left')).toBeInTheDocument();
    expect(within(card).getByLabelText('Practice: won, 5 of 6 left')).toBeInTheDocument();
    expect(within(card).queryByLabelText(/^Try 2/)).not.toBeInTheDocument();
  });

  it('marks a first-try win with a gold star', async () => {
    const { backend } = fakeBackend([TURN_1]);
    renderBattle(backend, { result: dayResult([tried('win', 3, 1)], 1) });
    const card = await winBattle();
    expect(card).toHaveTextContent('⭐ First try');
    expect(card).toHaveTextContent('🔥 1-day streak');
  });

  it('offers the tries left while they still count, and copies when there’s no share sheet', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    try {
      const { backend } = fakeBackend([TURN_1]);
      renderBattle(backend, { result: dayResult([tried('loss', 1, 1)], 2) });
      const card = await winBattle();
      expect(card).toHaveTextContent('Try 1 of 3');
      expect(card).toHaveTextContent('🔥 2-day streak · 2 tries left to keep it');
      expect(within(card).getByRole('button', { name: 'Try again · 2 left' })).toBeInTheDocument();
      await shareText(card, 'Copy text');
      expect(writeText).toHaveBeenCalledWith(
        formatShareText(dayResult([tried('loss', 1, 1)], 2).share),
      );
      expect(await screen.findByRole('status')).toHaveTextContent('Copied to clipboard');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
