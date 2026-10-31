// What the Master network knows of the battle beyond the board: the history
// of events and the foe's Speed evidence, read from one side's protocol log
// with the self-play env's rules (tools/net/env/src/lib.rs `Game::advance`),
// so play-time observations match training.
import { baseSpecies, toId } from '../state';

type SideID = 'p1' | 'p2';

/** One event in the log, by name (ids are a world's business). */
export interface TrackedEvent {
  /** 1: a move was used; 2: a Pokémon switched in. */
  kind: 1 | 2;
  mine: boolean;
  /** The Showdown turn it happened in (0 for the leads). */
  turn: number;
  /** The acting or incoming Pokémon's forme. */
  forme: string;
  move: string;
  mega: boolean;
  /** Both active Pokémon's HP fractions at the end of that step. */
  hpOwn: number;
  hpFoe: number;
}

/**
 * The start of a turn, as our side saw it when choosing: whether this turn's
 * order can say anything about the foe's Speed (env `speed_evidence_ok`, less
 * what only the turn itself shows), and our Speed then.
 */
export interface TurnStart {
  turn: number;
  /** No weather, Trick Room, Speed boosts, paralysis, Tailwind or Speed oddities at the start. */
  ok: boolean;
  /** Our active's Speed stat (×1.5 with a Choice Scarf). */
  ownSpeed: number;
  /** The foe's active, by its species key and forme. */
  foeKey: string;
  foeForme: string;
  /** Whether the foe's active has shown a Speed oddity (checked once the turn is over). */
  foeOddity: () => boolean;
}

/** Items, abilities and priority changers that make turn order say nothing plain about Speed (env SPEED_ODDITIES). */
export const SPEED_ODDITIES = new Set([
  'ironball',
  'quickclaw',
  'laggingtail',
  'fullincense',
  'machobrace',
  'poweranklet',
  'powerband',
  'powerbelt',
  'powerbracer',
  'powerlens',
  'powerweight',
  'quickfeet',
  'unburden',
  'slowstart',
  'stall',
  'swiftswim',
  'chlorophyll',
  'sandrush',
  'slushrush',
  'surgesurfer',
  'custapberry',
  'prankster',
  'galewings',
  'triage',
  'quickdraw',
]);

/** features.rs `speed_range`: from a hindering nature and no investment up to a boosting one and full. */
export function speedRange(base: number): [number, number] {
  return [Math.floor(((2 * base + 5) * 9) / 10), Math.floor(((2 * base + 99) * 11) / 10)];
}

/** features.rs `Known::observe_speed`: it moved first (`faster`) or second against Speed `other`. */
export function observeSpeed(
  [lo, hi]: [number, number],
  faster: boolean,
  other: number,
): [number, number] {
  if (faster) {
    // Outspeeding its fastest possible stat means a Choice Scarf.
    if (other > hi) return [other, Math.min(65535, Math.max(other, Math.floor((hi * 3) / 2)))];
    return [Math.max(lo, other), hi];
  }
  if (other < lo) return [Math.floor(other / 2), other];
  return [lo, Math.min(hi, other)];
}

export const speciesKey = (forme: string) => toId(baseSpecies(forme));

export interface TrackerOptions {
  /** A forme's base Speed. */
  baseSpe: (forme: string) => number;
  /** A move's priority, by name. */
  priority: (move: string) => number;
}

interface TurnLog {
  /** Each side's first move this turn, unless it switched first (a switch choice). */
  first: Partial<Record<SideID, string>>;
  switchedFirst: Partial<Record<SideID, boolean>>;
  firstMover?: SideID;
  mega: boolean;
  foeItemChanged: boolean;
  done: boolean;
}

const newTurn = (): TurnLog => ({
  first: {},
  switchedFirst: {},
  mega: false,
  foeItemChanged: false,
  done: false,
});

function hpOf(arg: string | undefined): number | undefined {
  if (!arg) return undefined;
  const [hp = '', status] = arg.split(' ');
  if (status === 'fnt') return 0;
  const [a, b] = hp.split('/').map(Number);
  if (a === undefined || !Number.isFinite(a)) return undefined;
  return b ? Math.min(1, Math.max(0, a / b)) : 0;
}

/** Reads one side's log, a line at a time as it grows. */
export class Tracker {
  /** Finished events, oldest first (the last 32). */
  readonly events: TrackedEvent[] = [];
  /** The last `|turn|` number (0 before the first). */
  turn = 0;
  /** The foe's Pokémon that have been on the field, by species key, in order of appearance. */
  readonly foeAppeared: string[] = [];
  /** Our team's idents in the first request's order (the env's fixed slots). */
  ownOrder?: string[];
  private read = 0;
  private readonly pending: Omit<TrackedEvent, 'hpOwn' | 'hpFoe'>[] = [];
  private readonly hp: Record<SideID, number> = { p1: 1, p2: 1 };
  private readonly forme: Record<SideID, string> = { p1: '', p2: '' };
  private readonly megaNext: Record<SideID, boolean> = { p1: false, p2: false };
  private readonly speed = new Map<string, { forme: string; range: [number, number] }>();
  private readonly starts = new Map<number, TurnStart>();
  private now: TurnLog = newTurn();

  constructor(
    readonly side: SideID,
    private readonly options: TrackerOptions,
  ) {}

  private get foe(): SideID {
    return this.side === 'p1' ? 'p2' : 'p1';
  }

  /** The foe's Speed bounds for a forme: the prior, or the evidence since its last forme or item change. */
  speedOf(key: string, forme: string): [number, number] {
    const s = this.speed.get(key);
    if (s && s.forme === forme) return s.range;
    const range = speedRange(this.options.baseSpe(forme));
    this.speed.set(key, { forme, range });
    return range;
  }

  /** Records the start of a turn, before its lines arrive. */
  start(s: TurnStart) {
    this.starts.set(s.turn, s);
  }

  /** Reads lines added to `log` since the last call. */
  sync(log: readonly string[]) {
    for (; this.read < log.length; this.read++) this.line(log[this.read]!);
  }

  private line(line: string) {
    if (!line.startsWith('|')) return;
    const args = line.slice(1).split('|');
    const cmd = args[0];
    const who = (args[1] ?? '').slice(0, 2) as SideID;
    const mine = who === this.side;
    switch (cmd) {
      case 'switch':
      case 'drag': {
        const forme = (args[2] ?? '').split(',')[0]!;
        this.forme[who] = forme;
        this.hp[who] = hpOf(args[3]) ?? 1;
        if (!this.now.first[who]) this.now.switchedFirst[who] = true;
        if (!mine) {
          const key = speciesKey(forme);
          if (!this.foeAppeared.includes(key)) this.foeAppeared.push(key);
        }
        this.pending.push({ kind: 2, mine, turn: this.turn, forme, move: '', mega: false });
        break;
      }
      case 'detailschange':
      case '-formechange':
        this.forme[who] = (args[2] ?? '').split(',')[0]!;
        break;
      case '-mega':
        this.megaNext[who] = true;
        this.now.mega = true;
        break;
      case 'move': {
        // Moves called by another (Sleep Talk, Magic Bounce) aren't choices.
        if (args.slice(3).some((a) => a.startsWith('[from]'))) break;
        const move = args[2] ?? '';
        if (!this.now.first[who] && !this.now.switchedFirst[who]) {
          this.now.first[who] = move;
          this.now.firstMover ??= who;
        }
        this.pending.push({
          kind: 1,
          mine,
          turn: this.turn,
          forme: this.forme[who],
          move,
          mega: this.megaNext[who],
        });
        break;
      }
      case '-damage':
      case '-heal':
      case '-sethp': {
        const hp = hpOf(args[2]);
        if (hp !== undefined) this.hp[who] = hp;
        break;
      }
      case 'faint':
        this.hp[who] = 0;
        break;
      case '-item':
      case '-enditem': {
        // Frisk and the like only reveal an item; anything else changes it (env ChangeItem).
        const reveal =
          cmd === '-item' && args.some((a) => a === '[identify]' || a.includes('Frisk'));
        if (!mine && !reveal) {
          this.now.foeItemChanged = true;
          const s = this.speed.get(speciesKey(this.forme[who]));
          if (s) s.range = speedRange(this.options.baseSpe(s.forme));
        }
        break;
      }
      case 'upkeep':
        this.endTurn();
        this.flush();
        break;
      case 'turn':
        this.endTurn();
        this.flush();
        this.turn = Number(args[1]) || this.turn + 1;
        this.now = newTurn();
        this.megaNext.p1 = this.megaNext.p2 = false;
        break;
      case 'win':
      case 'tie':
        this.flush();
        break;
    }
  }

  private flush() {
    for (const e of this.pending.splice(0)) {
      this.events.push({ ...e, hpOwn: this.hp[this.side], hpFoe: this.hp[this.foe] });
    }
    if (this.events.length > 32) this.events.splice(0, this.events.length - 32);
  }

  /** Turn order's Speed evidence (env `advance`), once the turn's moves are in. */
  private endTurn() {
    const t = this.now;
    if (t.done) return;
    t.done = true;
    const s = this.starts.get(this.turn);
    this.starts.delete(this.turn);
    const own = t.first[this.side];
    const foe = t.first[this.foe];
    if (!s?.ok || t.mega || !own || !foe || !t.firstMover || t.foeItemChanged) return;
    if (this.options.priority(own) !== this.options.priority(foe) || s.foeOddity()) return;
    const range = this.speedOf(s.foeKey, s.foeForme);
    this.speed.get(s.foeKey)!.range = observeSpeed(range, t.firstMover === this.foe, s.ownSpeed);
  }
}
