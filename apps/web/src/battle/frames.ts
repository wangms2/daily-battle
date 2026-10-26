// What the battle worker sends the UI: plain data describing only what the
// player's side can see. No simulator types cross this boundary.
import type { Difficulty } from '@daily-battle/ai/version';
import type { CoachNote, Heeded, Review, Verdict } from '@daily-battle/tutorial';
import type { FoeScript, Position } from '@daily-battle/tutorial/lessons';

export type Who = 'you' | 'foe';

export interface MonView {
  /** The species as it looks now: a Mega forme once it has Mega Evolved. */
  species: string;
  /** The team species (Charizard) when `species` is its Mega forme (Charizard-Mega-X). */
  base?: string;
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
  /** Sticky Web (Gen 6 on). */
  web?: boolean;
}

/** One of a side's six team marks under its HP bar. */
export interface TeamMark {
  /** Unset for foe Pokémon not yet revealed. */
  species?: string;
  fainted: boolean;
  status: string;
  /** HP %, once it has been seen. */
  hp?: number;
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
  /** 'Electric Terrain' | 'Grassy Terrain' | 'Misty Terrain' (Gen 6 on), or unset. */
  terrain?: string;
  /** Revealed info for each foe Pokémon seen so far, by team species (Charizard, not its Mega). */
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
  | 'mega'
  | 'end';

export interface Frame {
  /** Showdown-style battle text for this line ('' for silent lines). `**x**` marks bold. */
  text: string;
  event?: {
    kind: EventKind;
    who?: Who;
    /** A move event: the move's name, who it was aimed at, and `[still]` (no animation). */
    move?: string;
    target?: Who;
    still?: boolean;
    /** A special move (picks the quick animation at Fast speed). */
    special?: boolean;
    /** A status event: the status that was inflicted ('brn', 'tox', …). */
    status?: string;
  };
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
  /** Its Mega forme, once it has Mega Evolved. */
  forme?: string;
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
  /** The only legal choice, if there is exactly one. You still make it yourself (a locked move, your last Pokémon). */
  only: string | null;
  /** The active Pokémon can Mega Evolve this turn: each move also has a `move N mega` choice. */
  canMega?: boolean;
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
  /** Hard: the AI's new choices, to save (they replace any saved from index `from`). */
  aiChoices?: AiChoices;
  /**
   * Coach on: this turn's tip (with controls). Warnings aren't in the package:
   * the judge decides them when a choice is picked (`BattleBackend.coachCheck`),
   * and a tip that needs the judge comes late (`BattleBackend.onCoachTip`).
   */
  coach?: { tip?: CoachNote };
  /** Coach on: the memo on the choice just made, to save with it (`Attempt.coachLog`). */
  coachMemo?: CoachMemo;
  /** Coach on: the post-battle review (with `end`). */
  review?: Review;
}

/**
 * The coach's memo on one of your choices, saved with the attempt so a resume
 * neither judges it again nor repeats a warning you overrode.
 */
export interface CoachMemo {
  /** The judge's verdict on the choice. */
  verdict?: Verdict;
  /** The warning you saw and overrode. */
  ignored?: string;
  /** A warning you listened to (you picked again): your first pick and the warning. */
  heeded?: Heeded;
}

/** A past decision replayed (the coach's review): frozen at the decision, then the turn as played. */
export interface TurnReplay {
  before: TurnPackage;
  turn: TurnPackage;
}

/** A lesson turn (a demo, or a practice answer played out), with the choice it plays and its spotlight keys resolved. */
export interface LessonTurn extends TurnReplay {
  choice: string;
  spots: string[];
}

export interface AiChoices {
  from: number;
  choices: string[];
}

/** Two batches of AI choices as one, the later winning where they overlap. */
export function mergeAiChoices(a: AiChoices | undefined, b: AiChoices | undefined) {
  if (!a || !b) return a ?? b;
  if (b.from <= a.from) return b;
  return { from: a.from, choices: [...a.choices.slice(0, b.from - a.from), ...b.choices] };
}

/** Saved AI choices with a batch applied. */
export const applyAiChoices = (saved: string[] = [], { from, choices }: AiChoices) => [
  ...saved.slice(0, from),
  ...choices,
];

export interface EngineStart {
  /** The sim format, e.g. `gen5ou`; Gen 4 OU if left out (attempts saved before Gen 5). */
  format?: string;
  /** Your team, lead first, as PokemonSet-like objects. */
  playerTeam: unknown[];
  opponentTeam: unknown[];
  style: 'offense' | 'balance' | 'stall';
  battleSeed: string;
  aiSeed: string;
  /** Your recorded choices, for resume. */
  choices: string[];
  /** Normal when left out. */
  difficulty?: Difficulty;
  /** The week's pool species: Hard's prior for your unseen Pokémon, and the coach's for the foe's. */
  pool?: string[];
  /** Hard: the AI's saved choices, replayed on resume instead of searched again. */
  aiChoices?: string[];
  /**
   * A lesson battle (Learn mode): the teams are lesson `Mon`s, the foe follows
   * its script (then plays as Easy), and luck can be removed.
   */
  tutorial?: {
    noLuck: boolean;
    foeScript?: FoeScript;
    /** The redesigned course: the lesson reached, so the coach only talks about what's been taught. */
    taught?: number;
  };
  /** The coach (DESIGN.md §22): tips and blunder warnings each turn, and a review at the end. */
  coach?: 'simple';
  /** Coach on: a memo per recorded choice (null where there's none), for resume. */
  coachLog?: (CoachMemo | null)[];
}

/** A quiz position, shown frozen at the player's decision. */
export interface PositionPackage {
  pkg: TurnPackage;
  /** Each quiz answer's step as a choice (`move 3`), or null if it isn't legal. */
  choices: (string | null)[];
}

export type ToWorker =
  | { type: 'start'; start: EngineStart }
  | { type: 'choose'; choice: string }
  | { type: 'forfeit' }
  | { type: 'check'; choice: string; waitMs: number }
  | { type: 'replay'; decision: number }
  /** Review a battle played without the coach. */
  | { type: 'review' }
  | { type: 'position'; format: string; position: Position; steps: string[] }
  | {
      type: 'turn';
      format: string;
      position: Position;
      turn: { p1?: string; p2?: string };
      spots: string[];
      whole?: boolean;
    };

export type FromWorker =
  | { type: 'package'; pkg: TurnPackage }
  | { type: 'position'; position: PositionPackage }
  | { type: 'turn'; turn: LessonTurn }
  | { type: 'check'; note: CoachNote | null }
  | { type: 'replay'; replay: TurnReplay | null }
  | { type: 'review'; review: Review }
  /** How far a review has got (sent unasked, between answers). */
  | { type: 'reviewProgress'; done: number; total: number }
  /** A coach tip that waited for the judge (sent unasked, between answers). */
  | { type: 'tip'; note: CoachNote }
  | { type: 'error'; message: string };
