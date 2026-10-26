import type { CoachNote, Review } from '@daily-battle/tutorial';
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
    { species: 'Tyranitar', fainted: false, status: '', hp: 62 },
    ...Array.from({ length: 4 }, () => ({ fainted: false, status: '' })),
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
  priority: 0,
  contact: false,
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

function fakeBackend(
  turns: TurnPackage[],
  start = OPENING,
  /** Coach on: the judge's warnings by choice, and how long it takes to answer. */
  coach?: { warnings: Record<string, CoachNote>; ms?: number },
) {
  const calls: string[] = [];
  const backend: BattleBackend = {
    ...(coach && {
      coachCheck: vi.fn(async (choice: string) => {
        if (coach.ms) await new Promise((r) => setTimeout(r, coach.ms));
        return coach.warnings[choice] ?? null;
      }),
    }),
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
    tour = false,
    start = START,
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
    start?: EngineStart;
    result?: DayResult;
    /** The first-battle tour not seen yet. */
    tour?: boolean;
  } = {},
) {
  const settings: Settings = {
    ...initialState().settings,
    battleSpeed: speed,
    beginnerHints: hints,
    shownExplainers: tour ? [] : ['tour'],
  };
  const props = {
    onSetting: vi.fn(),
    onExplainerSeen: vi.fn(),
    onChoice: vi.fn(),
    onEnd: vi.fn(),
    onExit: vi.fn(),
    onRunItBack: vi.fn(),
    onChangeTeam: vi.fn(),
  };
  render(
    <BattleBackendContext.Provider value={() => backend}>
      <Battle
        start={start}
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

// The first test in a run pays for loading the battle screen; under a full parallel
// test run that can take longer than findBy's default second.
const thunderbolt = () =>
  screen.findByRole('button', { name: /^Thunderbolt, / }, { timeout: 5000 });

describe('the foe team row', () => {
  it('opens the card of a foe Pokémon not in battle, with its HP', async () => {
    renderBattle(fakeBackend([]).backend);
    await thunderbolt();
    await userEvent.click(screen.getByRole('button', { name: /^Foe's Tyranitar, 62% HP/ }));
    const card = screen.getByRole('tooltip');
    expect(card).toHaveTextContent('Tyranitar');
    expect(card).toHaveTextContent('62%');
    // A second tap closes it.
    await userEvent.click(screen.getByRole('button', { name: /^Foe's Tyranitar/ }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('first-battle tour', () => {
  it('walks through the moves, your team, and the foe card once, then says it was seen', async () => {
    const props = renderBattle(fakeBackend([]).backend, { tour: true });
    const tour = await screen.findByRole('note', { name: 'Tour' });
    expect(tour.textContent).toMatch(/1\/3.*Tap a move/);
    await userEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(tour.textContent).toMatch(/2\/3.*Your team/);
    await userEvent.click(within(tour).getByRole('button', { name: 'Next' }));
    expect(tour.textContent).toMatch(/3\/3.*Tap the foe/);
    await userEvent.click(within(tour).getByRole('button', { name: 'Got it' }));
    expect(screen.queryByRole('note', { name: 'Tour' })).toBeNull();
    expect(props.onExplainerSeen).toHaveBeenCalledWith('tour');
  });
});

describe('battle screen', () => {
  it('keeps the controls off while a turn plays, and a tap skips to the end', async () => {
    const { backend } = fakeBackend([]);
    renderBattle(backend, { speed: 'normal' });
    // The text is on the field and, for screen readers, in the log.
    await screen.findAllByText('Heatran', { selector: 'strong' });
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
    // The text is on the field and, for screen readers, in the log.
    await screen.findAllByText('Heatran', { selector: 'strong' });
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

  it('waits for you to pick a locked move, even as the only choice', async () => {
    const only = pkg({ ...TURN_1, controls: { ...MOVES, only: 'move 1' } });
    const { backend, calls } = fakeBackend([only, TURN_1]);
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    await new Promise((r) => setTimeout(r, 700));
    expect(calls).toEqual(['move 1']);
    await userEvent.click(await thunderbolt());
    expect(calls).toEqual(['move 1', 'move 1']);
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

  /** A touch press held for `ms`, then lifted (pointerup, the lift's leave, click). */
  const press = (el: HTMLElement, ms: number) => {
    fireEvent.pointerDown(el, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(ms));
    fireEvent.pointerUp(el, { pointerType: 'touch' });
    fireEvent.pointerLeave(el, { pointerType: 'touch' });
    fireEvent.click(el);
  };

  it('shows move details on a hold, keeps them open, and doesn’t choose the move', async () => {
    const { backend, calls } = fakeBackend([]);
    renderBattle(backend, { hints: true });
    const button = await thunderbolt();
    vi.useFakeTimers();
    try {
      fireEvent.pointerDown(button, { pointerType: 'touch' });
      act(() => vi.advanceTimersByTime(350));
      // Not yet a hold: nothing shows, so a lift now would still choose the move.
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
      act(() => vi.advanceTimersByTime(60));
      const card = screen.getByRole('tooltip');
      expect(card).toHaveTextContent('10% chance to paralyze the target.');
      expect(card).toHaveTextContent('Power95');
      expect(card).toHaveTextContent('Super effective ×4');
      fireEvent.pointerUp(button, { pointerType: 'touch' });
      fireEvent.pointerLeave(button, { pointerType: 'touch' });
      fireEvent.click(button);
      expect(screen.getByRole('tooltip')).toBeInTheDocument(); // stays after the lift
      expect(calls).toEqual([]);
      fireEvent.pointerDown(document.body); // the next tap anywhere closes it
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
    expect(calls).toEqual([]);
  });

  it('chooses the move on a tap short of a hold, without its details flashing up', async () => {
    const { backend, calls } = fakeBackend([TURN_1]);
    renderBattle(backend);
    const button = await thunderbolt();
    vi.useFakeTimers();
    try {
      press(button, 350);
    } finally {
      vi.useRealTimers();
    }
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(calls).toEqual(['move 1']);
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
    // Even with a share sheet, the text goes straight to the clipboard.
    const share = vi.fn(async () => {});
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share, clipboard: { writeText } });
    try {
      const { backend } = fakeBackend([TURN_1]);
      const props = renderBattle(backend, {
        tryNumber: 2,
        result: dayResult([tried('loss', 0, 1), tried('win', 3, 2)], 0),
      });
      const card = await winBattle();
      const result = dayResult([tried('loss', 0, 1), tried('win', 3, 2)], 0);
      expect(card).toHaveTextContent('You won');
      expect(card).toHaveTextContent('Try 2');
      expect(card).not.toHaveTextContent('First try');
      expect(within(card).getByLabelText('Try 1: lost, 0 of 6 left')).toBeInTheDocument();
      expect(within(card).getByLabelText('Try 2: won, 3 of 6 left')).toBeInTheDocument();
      expect(card).toHaveTextContent('Streak reset'); // won, but not on the first try
      expect(props.onEnd).toHaveBeenCalledWith({ result: 'win', remaining: 3 });
      await shareText(card, 'Copy text');
      expect(writeText).toHaveBeenCalledWith(formatShareText(result.share));
      expect(share).not.toHaveBeenCalled();
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

  it('offers another try while the day is open, and copies when there’s no share sheet', async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share: undefined, clipboard: { writeText } });
    try {
      const { backend } = fakeBackend([TURN_1]);
      renderBattle(backend, { result: dayResult([tried('loss', 1, 1)], 0) });
      const card = await winBattle();
      expect(card).toHaveTextContent('Try 1');
      expect(card).toHaveTextContent('Streak reset');
      expect(within(card).getByRole('button', { name: 'Try again' })).toBeInTheDocument();
      await shareText(card, 'Copy text');
      expect(writeText).toHaveBeenCalledWith(
        formatShareText(dayResult([tried('loss', 1, 1)], 0).share),
      );
      expect(await screen.findByRole('status')).toHaveTextContent('Text copied');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('coach', () => {
  const swampert: CoachNote = {
    rule: 'noEffect',
    text: 'Earthquake has no effect on Gyarados.',
    lesson: 'gen3-types',
  };
  const coached = (over: Partial<TurnPackage> = {}) =>
    pkg({
      ...OPENING,
      coach: { tip: { rule: 'canKo', text: 'Thunderbolt can knock out Gyarados.' } },
      ...over,
    });

  it('shows the turn tip, which you can dismiss', async () => {
    const { backend } = fakeBackend([], coached());
    renderBattle(backend);
    const tip = await screen.findByRole('note', { name: 'Coach tip' });
    expect(tip).toHaveTextContent('Thunderbolt can knock out Gyarados.');
    await userEvent.click(within(tip).getByRole('button', { name: 'Dismiss tip' }));
    expect(screen.queryByRole('note', { name: 'Coach tip' })).not.toBeInTheDocument();
  });

  it('asks before a flagged choice: pick again, or do it anyway and silence the rule', async () => {
    const { backend, calls } = fakeBackend([coached({ frames: TURN_1.frames })], coached(), {
      warnings: { 'move 2': swampert },
    });
    renderBattle(backend);
    await userEvent.click(await screen.findByRole('button', { name: /^Earthquake, / }));
    expect(await screen.findByText('Earthquake has no effect on Gyarados.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Pick again' }));
    expect(calls).toEqual([]);

    await userEvent.click(await screen.findByRole('button', { name: /^Earthquake, / }));
    await userEvent.click(await screen.findByRole('checkbox', { name: /Don’t warn/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Do it anyway' }));
    await within(screen.getByRole('banner')).findByText('Turn 2');
    expect(calls).toEqual(['move 2']);

    // Silenced for the rest of the battle.
    await userEvent.click(await screen.findByRole('button', { name: /^Earthquake, / }));
    await waitFor(() => expect(calls).toEqual(['move 2', 'move 2']));
    expect(screen.queryByText('Earthquake has no effect on Gyarados.')).not.toBeInTheDocument();
  });

  it('sends unflagged choices straight away', async () => {
    const { backend, calls } = fakeBackend([TURN_1], coached(), { warnings: {} });
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    await waitFor(() => expect(calls).toEqual(['move 1']));
  });

  it('says so while the coach is still checking a pick, then sends it', async () => {
    const { backend, calls } = fakeBackend([TURN_1], coached(), { warnings: {}, ms: 400 });
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    expect(await screen.findByText('Coach is checking…')).toBeInTheDocument();
    await waitFor(() => expect(calls).toEqual(['move 1']));
    expect(screen.queryByText('Coach is checking…')).not.toBeInTheDocument();
  });

  it('sends choices without asking when the coach can’t judge them', async () => {
    // A backend without a judge (no engine): tips only, never warnings.
    const { backend, calls } = fakeBackend([TURN_1], coached());
    renderBattle(backend);
    await userEvent.click(await screen.findByRole('button', { name: /^Earthquake, / }));
    await waitFor(() => expect(calls).toEqual(['move 2']));
  });

  it('reviews the battle on the end card', async () => {
    const review: Review = {
      key: [
        {
          decision: 2,
          choice: 'move 2',
          top: 'move 1',
          turn: 3,
          me: 'Heatran',
          foe: 'Gyarados',
          chose: 'Earthquake',
          better: 'Thunderbolt',
          text: 'Thunderbolt did 4× damage.',
        },
      ],
      good: [
        {
          decision: 0,
          choice: 'move 1',
          turn: 1,
          me: 'Heatran',
          foe: 'Gyarados',
          chose: 'Thunderbolt',
          text: 'A KO.',
        },
      ],
    };
    const { backend } = fakeBackend([{ ...WON, review }], coached());
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    const section = await screen.findByRole('region', { name: 'Coach review' });
    expect(section).toHaveTextContent('Turn 3: Heatran vs Gyarados');
    expect(section).toHaveTextContent('You chose Earthquake; Thunderbolt was better.');
    expect(section).toHaveTextContent('✓ Turn 1: Thunderbolt');
  });

  it('shows a tip that waited for the judge when it comes', async () => {
    let send: ((note: CoachNote) => void) | undefined;
    const { backend } = fakeBackend([], coached({ coach: {} }), { warnings: {} });
    backend.onCoachTip = (onTip) => {
      send = onTip;
      return () => (send = undefined);
    };
    renderBattle(backend);
    await thunderbolt();
    expect(screen.queryByRole('note', { name: 'Coach tip' })).not.toBeInTheDocument();
    act(() => send!({ rule: 'walled', text: 'Scizor hits it much harder.' }));
    expect(await screen.findByRole('note', { name: 'Coach tip' })).toHaveTextContent(
      'Scizor hits it much harder.',
    );
  });

  it('saves the coach’s memo with the choice', async () => {
    const memo = { ignored: 'Earthquake will do nothing.' };
    const { backend } = fakeBackend([{ ...TURN_1, coachMemo: memo }], coached());
    const props = renderBattle(backend);
    await userEvent.click(await thunderbolt());
    await waitFor(() => expect(props.onChoice).toHaveBeenCalledWith('move 1', undefined, memo));
  });

  const REVIEW: Review = {
    key: [
      {
        decision: 0,
        choice: 'move 2',
        top: 'move 1',
        turn: 1,
        me: 'Heatran',
        foe: 'Gyarados',
        chose: 'Earthquake',
        better: 'Thunderbolt',
        text: 'Gyarados is immune to Ground moves, so Earthquake will do nothing.',
      },
    ],
    good: [
      {
        decision: 0,
        choice: 'move 1',
        first: 'move 2',
        firstChose: 'Earthquake',
        turn: 1,
        me: 'Heatran',
        foe: 'Gyarados',
        chose: 'Thunderbolt',
        text: 'Good catch: you changed your pick after the coach’s warning.',
      },
    ],
  };

  it('replays a review turn on the battle screen, marking your pick and the better one', async () => {
    const { backend } = fakeBackend([{ ...WON, review: REVIEW }], coached());
    backend.replay = vi.fn(async () => ({ before: OPENING, turn: TURN_1 }));
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    const section = await screen.findByRole('region', { name: 'Coach review' });
    await userEvent.click(within(section).getAllByRole('button', { name: 'Show turn' })[0]!);
    const turn = await screen.findByRole('dialog', { name: 'Review: turn 1' });
    expect(backend.replay).toHaveBeenCalledWith(0);
    expect(
      await within(turn).findByRole('button', { name: /^Earthquake, .*, You$/ }),
    ).toBeInTheDocument();
    expect(
      within(turn).getByRole('button', { name: /^Thunderbolt, .*, Better$/ }),
    ).toBeInTheDocument();
    expect(within(turn).getByRole('note', { name: 'Coach review' })).toHaveTextContent(
      'Thunderbolt was better. Gyarados is immune to Ground moves',
    );
    await userEvent.click(within(turn).getByRole('button', { name: '▶ Play' }));
    expect(await within(turn).findByRole('button', { name: 'Again' })).toBeInTheDocument();
    expect(within(turn).getAllByText(/super effective/).length).toBeGreaterThan(0);
    // The next turn in the review: a warning listened to.
    await userEvent.click(within(turn).getByRole('button', { name: 'Next turn' }));
    const next = await screen.findByRole('dialog', { name: 'Review: turn 1' });
    expect(
      await within(next).findByRole('button', { name: /^Earthquake, .*, Warned$/ }),
    ).toBeInTheDocument();
    expect(
      within(next).getByRole('button', { name: /^Thunderbolt, .*, You$/ }),
    ).toBeInTheDocument();
    await userEvent.click(within(next).getByRole('button', { name: 'Close review' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /^Review:/ })).not.toBeInTheDocument(),
    );
  });

  it('reviews a Gen 3 battle played without the coach, on request', async () => {
    const { backend } = fakeBackend([WON]);
    let finish: (r: Review) => void = () => {};
    backend.review = vi.fn(
      (onProgress: (done: number, total: number) => void) =>
        new Promise<Review>((resolve) => {
          onProgress(3, 20);
          finish = resolve;
        }),
    );
    renderBattle(backend, { start: { ...START, format: 'gen3ou' } });
    await userEvent.click(await thunderbolt());
    await userEvent.click(await screen.findByRole('button', { name: 'Review this battle' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'The coach is reviewing your choices… 3 of 20',
    );
    act(() => finish(REVIEW));
    expect(await screen.findByRole('region', { name: 'Coach review' })).toHaveTextContent(
      'Earthquake will do nothing',
    );
  });

  it('offers no review on Hard, where the coach’s warnings aren’t checked yet', async () => {
    const { backend } = fakeBackend([WON]);
    backend.review = vi.fn();
    renderBattle(backend, { start: { ...START, format: 'gen3ou', difficulty: 'hard' } });
    await userEvent.click(await thunderbolt());
    await screen.findByRole('dialog', { name: 'Battle over' });
    expect(screen.queryByRole('button', { name: 'Review this battle' })).not.toBeInTheDocument();
  });

  it('offers no review outside Gen 3', async () => {
    const { backend } = fakeBackend([WON]);
    backend.review = vi.fn();
    renderBattle(backend);
    await userEvent.click(await thunderbolt());
    await screen.findByRole('dialog', { name: 'Battle over' });
    expect(screen.queryByRole('button', { name: 'Review this battle' })).not.toBeInTheDocument();
  });
});
