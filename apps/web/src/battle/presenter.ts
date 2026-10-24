// Turns one side's protocol lines into frames (text, animation event, and a
// snapshot of what that side can see), plus its team and controls. It reads
// only what the side itself receives, so it works the same on a battle run in
// the worker against the AI and on one run elsewhere against another player.
import { DEFAULT_FORMAT, genOf } from '@daily-battle/data';
import { legalChoices, type SideID } from '@daily-battle/sim-bridge';
import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Protocol } from '@pkmn/protocol';
import { Dex, type PokemonSet } from '@pkmn/sim';
import { LogFormatter } from '@pkmn/view';
import type {
  Controls,
  EventKind,
  Frame,
  MonView,
  MoveOption,
  Revealed,
  SideConds,
  TeamMark,
  TeamMember,
  TurnPackage,
  View,
  Who,
} from './frames';

type ModdedDex = ReturnType<typeof Dex.forGen>;
const gens = new Generations(Dex as unknown as ConstructorParameters<typeof Generations>[0]);

type ClientPokemon = ClientBattle['p1']['team'][number];
type ClientSide = ClientBattle['p1'];

const otherSide = (side: SideID): SideID => (side === 'p1' ? 'p2' : 'p1');

/** Whose a protocol ident (`p1a: Garchomp`) is, seen from side `me`. */
const whoOf = (me: SideID, ident: unknown): Who | undefined =>
  typeof ident === 'string'
    ? ident.startsWith(me)
      ? 'you'
      : ident.startsWith(otherSide(me))
        ? 'foe'
        : undefined
    : undefined;

/** Animation event for a protocol line. */
function eventOf(
  me: SideID,
  args: readonly string[],
  kw: Record<string, unknown>,
  dex: ModdedDex,
): Frame['event'] {
  const [cmd, a] = args;
  const map: Record<string, EventKind> = {
    move: 'move',
    '-damage': 'damage',
    '-heal': 'heal',
    faint: 'faint',
    switch: 'switch',
    drag: 'switch',
    '-status': 'status',
    '-boost': 'boost',
    '-unboost': 'unboost',
    '-sidestart': 'hazard',
    '-weather': 'weather',
    '-crit': 'crit',
    '-miss': 'miss',
    turn: 'turn',
    win: 'end',
    tie: 'end',
  };
  const kind = map[cmd ?? ''];
  if (!kind) return undefined;
  if (kind === 'hazard')
    return { kind, who: typeof a === 'string' && a.startsWith(me) ? 'you' : 'foe' };
  if (kind === 'move')
    return {
      kind,
      who: whoOf(me, a),
      move: args[2],
      target: whoOf(me, args[3]),
      ...(kw.still ? { still: true } : {}),
      ...(dex.moves.get(args[2] ?? '').category === 'Special' && { special: true }),
    };
  if (kind === 'status') return { kind, who: whoOf(me, a), status: args[2] };
  return { kind, who: whoOf(me, a) };
}

const STATUS_NAME: Record<string, string> = {
  brn: 'Burned',
  par: 'Paralyzed',
  psn: 'Poisoned',
  tox: 'Badly poisoned',
  slp: 'Asleep',
  frz: 'Frozen',
};
const STAT_NAME: Record<string, string> = {
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
  accuracy: 'Accuracy',
  evasion: 'Evasion',
};

/** Floating text for a line, given the views before and after it. */
function labelOf(
  me: SideID,
  args: readonly string[],
  kwArgs: Record<string, unknown>,
  before: View,
  after: View,
): Frame['label'] {
  const [cmd, a, b, c] = args;
  const who = whoOf(me, a);
  if (!who) return undefined;
  if (cmd === '-damage' || cmd === '-heal') {
    const prev = before[who];
    const next = after[who];
    if (!prev || !next || prev.species !== next.species) return undefined;
    const d = next.hp - prev.hp;
    if (!d) return undefined;
    return { who, text: `${d < 0 ? '−' : '+'}${Math.abs(d)}%`, tone: d < 0 ? 'damage' : 'heal' };
  }
  if (cmd === '-status' && b && STATUS_NAME[b]) return { who, text: STATUS_NAME[b], tone: 'info' };
  if ((cmd === '-boost' || cmd === '-unboost') && b) {
    const n = Number(c) || 0;
    if (!n) return undefined;
    return { who, text: `${STAT_NAME[b] ?? b} ${cmd === '-boost' ? '+' : '−'}${n}`, tone: 'info' };
  }
  if (cmd === '-crit') return { who, text: 'Critical hit!', tone: 'damage' };
  if (cmd === '-miss') return { who: whoOf(me, b) ?? who, text: 'Missed!', tone: 'info' };
  if (cmd === '-enditem' && String(kwArgs.from ?? '').includes('Knock Off')) {
    return { who, text: 'Item knocked off', tone: 'info' };
  }
  return undefined;
}

/** An ability or item revealing itself on this line, and whose it is. */
function popupOf(
  me: SideID,
  args: readonly string[],
  kwArgs: Record<string, unknown>,
): Frame['popup'] {
  const [cmd, a, b] = args;
  const from = typeof kwArgs.from === 'string' ? kwArgs.from : '';
  const holder = whoOf(me, kwArgs.of) ?? whoOf(me, a);
  if (!holder) return undefined;
  if ((cmd === '-ability' || cmd === '-item') && b) return { who: whoOf(me, a)!, text: b };
  if (cmd === '-enditem' && b && !from.includes('Knock Off'))
    return { who: whoOf(me, a)!, text: b };
  const m = /^(?:ability|item): (.+)$/.exec(from);
  return m ? { who: holder, text: m[1]! } : undefined;
}

/** First-time explainer ids for a line, if it introduces a mechanic. */
function explainersOf(args: readonly string[]): string[] {
  const [cmd, a, b] = args;
  const id = (s: unknown) =>
    typeof s === 'string'
      ? s
          .replace(/^move: /, '')
          .toLowerCase()
          .replace(/[^a-z]/g, '')
      : '';
  if (cmd === '-sidestart') return [id(b)];
  if (cmd === '-weather' && a && a !== 'none') return [id(a)];
  if (cmd === '-status') return [id(b)];
  if (cmd === '-start' && id(b) === 'substitute') return ['substitute'];
  return [];
}

function sideConds(side: ClientSide): SideConds {
  const c = side.sideConditions as Record<string, { level?: number } | undefined>;
  const level = (k: string) => (c[k] ? (c[k]!.level ?? 1) : 0);
  return {
    sr: level('stealthrock') > 0,
    spikes: level('spikes'),
    tspikes: level('toxicspikes'),
    reflect: level('reflect') > 0,
    lightScreen: level('lightscreen') > 0,
  };
}

function monView(p: ClientPokemon | undefined, own: boolean): MonView | null {
  if (!p) return null;
  const pct = p.maxhp ? Math.round((100 * p.hp) / p.maxhp) : 0;
  return {
    species: p.speciesForme,
    hp: p.hp > 0 ? Math.max(1, pct) : 0,
    hpExact: own ? { hp: p.hp, max: p.maxhp } : undefined,
    status: p.status ?? '',
    boosts: { ...p.boosts },
    substitute: 'substitute' in p.volatiles,
    fainted: p.fainted,
  };
}

/** A revealed item's name. The client can hold ids like `itemleftovers` from `[from] item: Leftovers`. */
function itemName(dex: ModdedDex, id: string): string {
  const item = dex.items.get(id);
  return item.exists ? item.name : dex.items.get(id.replace(/^item/, '')).name;
}

function revealedOf(dex: ModdedDex, side: ClientSide): Record<string, Revealed> {
  const out: Record<string, Revealed> = {};
  for (const p of side.team) {
    out[p.speciesForme] = {
      moves: p.moveSlots.map((m) => dex.moves.get(m.id).name),
      item: p.item ? itemName(dex, p.item) : '',
      ability: p.ability || p.baseAbility ? dex.abilities.get(p.ability || p.baseAbility).name : '',
    };
  }
  return out;
}

/** @pkmn/client's weather ids, to the condition names the UI uses. */
const WEATHER: Record<string, string> = {
  sand: 'Sandstorm',
  rain: 'RainDance',
  sun: 'SunnyDay',
  hail: 'Hail',
};

/** Your marks follow your team order; the foe's show revealed Pokémon, then balls. */
function teamMarks(side: ClientSide, order?: string[]): TeamMark[] {
  const mark = (p: ClientPokemon | undefined, species?: string): TeamMark => ({
    species: species ?? p?.speciesForme,
    fainted: !!p?.fainted,
    status: p?.status ?? '',
  });
  const marks = order
    ? order.map((s) =>
        mark(
          side.team.find((p) => p.speciesForme === s),
          s,
        ),
      )
    : side.team.map((p) => mark(p));
  // A versus team can be smaller than six; the sim says how many in `|teamsize|`.
  while (marks.length < (side.totalPokemon || 6)) marks.push(mark(undefined));
  return marks.slice(0, 6);
}

function viewOf(
  dex: ModdedDex,
  b: ClientBattle,
  me: SideID,
  yourOrder: string[],
  spectator = false,
): View {
  const you = b[me];
  const foe = b[otherSide(me)];
  return {
    turn: b.turn,
    you: monView(you.active[0] ?? undefined, !spectator),
    foe: monView(foe.active[0] ?? undefined, false),
    yourSide: sideConds(you),
    foeSide: sideConds(foe),
    weather: WEATHER[b.field.weatherState.id] ?? '',
    revealed: revealedOf(dex, foe),
    // A spectator knows no team order: the bottom side's marks go as revealed, like the top's.
    yourTeam: teamMarks(you, spectator ? undefined : yourOrder),
    foeTeam: teamMarks(foe),
  };
}

/** Damage multiplier of a move's type against a species by typing; null for status moves. */
export function effectiveness(
  dex: ModdedDex,
  moveName: string,
  species: string | undefined,
): number | null {
  const move = dex.moves.get(moveName);
  if (!move.exists || move.category === 'Status' || !species) return null;
  const types = dex.species.get(species).types;
  if (!dex.getImmunity(move.type, types)) return 0;
  return 2 ** dex.getEffectiveness(move.type, types);
}

/** Full descriptions run up to ~900 characters (Substitute); past this, the short one. */
const DESC_MAX = 280;

/** A move's description for its details card; Hidden Power's typed forms have none of their own. */
export function moveDesc(dex: ModdedDex, move: ReturnType<ModdedDex['moves']['get']>): string {
  const m =
    move.exists && !move.desc && move.id.startsWith('hiddenpower')
      ? dex.moves.get('hiddenpower')
      : move;
  if (!m.exists) return '';
  return m.desc && m.desc.length <= DESC_MAX ? m.desc : m.shortDesc || m.desc;
}

/**
 * Showdown marks some numbers with `||exact||shown||` (e.g. your own HP lost as
 * `||−270/304||88.8%||`); keep the shown part.
 */
export function cleanText(text: string): string {
  return text.replace(/\|\|[^|]*\|\|([^|]*)\|\|/g, '$1').trim();
}

/**
 * What one side gets from the battle after a choice: its new protocol lines,
 * its pending request, and whether the battle is over. Plain data, so it can
 * come from the worker or over the network.
 */
export interface SideUpdate {
  lines: string[];
  /** The side's pending request; null while it waits on the foe or once the battle is over. */
  request: Protocol.Request | null;
  ended: boolean;
  winner: SideID | null;
}

type ChoiceRequest = Exclude<Protocol.Request, { requestType: 'wait' }>;

export class SidePresenter {
  private readonly client = new ClientBattle(gens);
  private readonly formatter: LogFormatter;
  private readonly dex: ModdedDex;
  private readonly foe: SideID;
  /** The last request, for the team when there's no pending one (waiting, or the end). */
  private lastRequest: ChoiceRequest | null = null;

  constructor(
    readonly me: SideID,
    /** Your team as sent into battle, lead first. */
    readonly sets: PokemonSet[],
    format: string = DEFAULT_FORMAT,
    /**
     * Watching someone else's battle from its public log: `me` is the side
     * drawn at the bottom, there are no sets, and HP is percentages only.
     */
    readonly spectator = false,
  ) {
    this.dex = Dex.forGen(genOf(format));
    this.foe = otherSide(me);
    this.formatter = new LogFormatter(me, this.client);
  }

  present(update: SideUpdate, resumed: boolean, note?: string): TurnPackage {
    const me = this.me;
    const request =
      update.request && update.request.requestType !== 'wait' && !update.ended
        ? update.request
        : null;
    const frames: Frame[] = [];
    const explainers = new Set<string>();
    const order = this.sets.map((s) => s.species);
    let before = viewOf(this.dex, this.client, me, order, this.spectator);
    for (const line of update.lines) {
      for (const { args, kwArgs } of Protocol.parse(line)) {
        const text = cleanText(this.formatter.formatText(args, kwArgs));
        this.client.add(args, kwArgs);
        const a = args as readonly string[];
        const kw = kwArgs as Record<string, unknown>;
        for (const e of explainersOf(a)) if (e) explainers.add(e);
        const event = eventOf(me, a, kw, this.dex);
        const popup = popupOf(me, a, kw);
        if (!text && !event && !popup) continue;
        if (text.startsWith('Battle started between')) continue;
        const view = viewOf(this.dex, this.client, me, order, this.spectator);
        const label = labelOf(me, a, kw, before, view);
        frames.push({ text, event, view, ...(label && { label }), ...(popup && { popup }) });
        before = view;
      }
    }
    if (note) frames.push({ text: note, view: before });
    const team = this.team(request);
    if (request) this.lastRequest = request;
    const controls = this.controls(request);
    if (controls?.kind === 'move') {
      const active = team.find((m) => m.active);
      const enabled = controls.moves.filter((m) => !m.disabled);
      if (active?.item.startsWith('Choice') && enabled.length === 1 && controls.moves.length > 1) {
        explainers.add('choicelock');
      }
    }
    const { ended, winner } = update;
    const you = this.client[me];
    const foe = this.client[this.foe];
    return {
      frames,
      team,
      controls: ended ? null : controls,
      explainers: [...explainers],
      end: ended
        ? {
            winner: winner === me ? 'you' : winner ? 'foe' : null,
            youLeft:
              (this.sets.length || you.totalPokemon || 6) -
              you.team.filter((p) => p.fainted).length,
            foeLeft: (foe.totalPokemon || 6) - foe.team.filter((p) => p.fainted).length,
          }
        : null,
      resumed,
    };
  }

  /** Your team in current switch order, merging live HP with your known sets. */
  private team(request: ChoiceRequest | null): TeamMember[] {
    const fresh = request?.side.pokemon;
    const known = fresh ?? this.lastRequest?.side.pokemon ?? [];
    const you = this.client[this.me];
    const live = you.team;
    const species = known.length
      ? known.map((p) => p.speciesForme)
      : live.map((p) => p.speciesForme);
    return species.map((name, i) => {
      const p = live.find((x) => x.speciesForme === name);
      const set = this.sets.find((s) => s.species === name);
      // A pending request has exact HP for every team member. Without one
      // (waiting, or the end), the log is more current for those it has shown,
      // and the last request for the rest, which haven't been out since.
      const req = fresh?.[i];
      const old = known[i];
      const hp = p?.fainted ? 0 : req ? req.hp : p ? p.hp : (old?.hp ?? 0);
      const max = req ? req.maxhp : p ? p.maxhp : (old?.maxhp ?? 1);
      return {
        slot: i + 1,
        species: name,
        hp: hp > 0 ? Math.max(1, Math.round((100 * hp) / max)) : 0,
        hpExact: { hp, max },
        status: (req ? req.status : p ? p.status : old?.status) ?? '',
        fainted: !!p?.fainted || !!req?.fainted || hp <= 0,
        active: req ? !!req.active : you.active[0]?.speciesForme === name,
        item: set?.item ?? '',
        ability: set?.ability ?? '',
        moves: set?.moves ?? [],
        stats: { ...((req ?? old)?.stats ?? {}) },
      };
    });
  }

  private controls(request: ChoiceRequest | null): Controls | null {
    if (!request || request.requestType === 'team') return null;
    const legal = legalChoices(request);
    const switches = legal
      .filter((c) => c.startsWith('switch'))
      .map((choice) => ({ choice, slot: Number(choice.split(' ')[1]) }));
    const foe = this.client[this.foe].active[0]?.speciesForme;
    let moves: MoveOption[] = [];
    if (request.requestType === 'move') {
      moves = (request.active[0]?.moves ?? []).map((m, i) => {
        // Requests tack the power onto some moves ("Return 102", id return102).
        const move = this.dex.moves.get(m.id.replace(/\d+$/, ''));
        const choice = `move ${i + 1}`;
        return {
          choice,
          name: move.exists ? move.name : m.name,
          type: move.exists ? move.type : 'Normal',
          category: (move.exists ? move.category : 'Physical') as MoveOption['category'],
          power: move.exists ? move.basePower : 0,
          accuracy: move.exists ? move.accuracy : true,
          priority: move.exists ? move.priority : 0,
          contact: move.exists && !!move.flags.contact,
          desc: moveDesc(this.dex, move),
          pp: 'pp' in m ? m.pp : 0,
          maxpp: 'maxpp' in m ? m.maxpp : 0,
          disabled: !legal.includes(choice),
          effectiveness: effectiveness(this.dex, move.name, foe),
        };
      });
    }
    return {
      kind: request.requestType === 'switch' ? 'switch' : 'move',
      moves,
      switches,
      only: legal.length === 1 ? legal[0]! : null,
    };
  }
}
