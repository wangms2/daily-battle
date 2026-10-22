// What the battle worker sends the UI: plain data describing only what the
// player's side can see. No simulator types cross this boundary.

export type Who = 'you' | 'foe';

export interface MonView {
  species: string;
  /** HP as a percentage, 0–100. */
  hp: number;
  /** Exact HP, only for your own Pokémon. */
  hpExact?: { hp: number; max: number };
  /** '' | 'brn' | 'par' | 'psn' | 'tox' | 'slp' | 'frz' */
  status: string;
  boosts: Record<string, number>;
  substitute: boolean;
  fainted: boolean;
}

export interface SideConds {
  sr: boolean;
  spikes: number;
  tspikes: number;
  reflect: boolean;
  lightScreen: boolean;
}

/** One of a side's six team marks under its HP bar. */
export interface TeamMark {
  /** Unset for foe Pokémon not yet revealed. */
  species?: string;
  fainted: boolean;
  status: string;
}

/** What the player knows about a foe Pokémon from what it has done so far. */
export interface Revealed {
  moves: string[];
  item: string;
  ability: string;
}

export interface View {
  turn: number;
  you: MonView | null;
  foe: MonView | null;
  yourSide: SideConds;
  foeSide: SideConds;
  /** 'Sandstorm' | 'RainDance' | 'SunnyDay' | 'Hail' | '' */
  weather: string;
  /** Revealed info for each foe Pokémon seen so far, by species. */
  revealed: Record<string, Revealed>;
  /** Six marks per side: your team in order, then the foe's revealed Pokémon and unrevealed balls. */
  yourTeam: TeamMark[];
  foeTeam: TeamMark[];
}

export type EventKind =
  | 'move'
  | 'damage'
  | 'heal'
  | 'faint'
  | 'switch'
  | 'status'
  | 'boost'
  | 'unboost'
  | 'hazard'
  | 'weather'
  | 'crit'
  | 'miss'
  | 'turn'
  | 'end';

export interface Frame {
  /** Showdown-style battle text for this line ('' for silent lines). `**x**` marks bold. */
  text: string;
  event?: { kind: EventKind; who?: Who };
  /** Text that floats up over a Pokémon and fades: "−24%", "Paralyzed", "Atk +2". */
  label?: { who: Who; text: string; tone: 'damage' | 'heal' | 'info' };
  /** An ability or item revealing itself, shown as a banner by its holder. */
  popup?: { who: Who; text: string };
  /** The battle as it looks after this line. */
  view: View;
}

export interface MoveOption {
  choice: string;
  name: string;
  type: string;
  category: 'Physical' | 'Special' | 'Status';
  power: number;
  accuracy: number | true;
  /** -7 to +5; nonzero moves go before or after others regardless of Speed. */
  priority: number;
  /** Makes contact (Rough Skin, Static, Flame Body, …). */
  contact: boolean;
  /** What it does, with its mechanics: the full text when it's short enough to read in battle. */
  desc: string;
  pp: number;
  maxpp: number;
  disabled: boolean;
  /** Damage multiplier against the foe's active by typing; null for status moves. */
  effectiveness: number | null;
}

export interface TeamMember {
  slot: number;
  species: string;
  hp: number;
  hpExact: { hp: number; max: number };
  status: string;
  fainted: boolean;
  active: boolean;
  /** Your own set (for the info sheet). */
  item: string;
  ability: string;
  moves: string[];
  stats: Record<string, number>;
}

export interface Controls {
  kind: 'move' | 'switch';
  moves: MoveOption[];
  /** Legal switch choices (`switch N`), by team slot. */
  switches: { choice: string; slot: number }[];
  /** The only legal choice, if there is exactly one: submitted automatically unless it's a switch. */
  only: string | null;
}

export interface TurnPackage {
  frames: Frame[];
  /** Your team as of the end of these frames. */
  team: TeamMember[];
  /** Null while waiting for the foe or after the battle ends. */
  controls: Controls | null;
  /** Mechanics that appeared in these frames, for first-time explainers. */
  explainers: string[];
  end: { winner: Who | null; youLeft: number; foeLeft: number } | null;
  /** True when this package rebuilds a resumed battle (show it without playback). */
  resumed: boolean;
}

export interface EngineStart {
  /** Your team, lead first, as PokemonSet-like objects. */
  playerTeam: unknown[];
  opponentTeam: unknown[];
  style: 'offense' | 'balance' | 'stall';
  battleSeed: string;
  aiSeed: string;
  /** Your recorded choices, for resume. */
  choices: string[];
}

export type ToWorker =
  { type: 'start'; start: EngineStart } | { type: 'choose'; choice: string } | { type: 'forfeit' };

export type FromWorker = { type: 'package'; pkg: TurnPackage } | { type: 'error'; message: string };
