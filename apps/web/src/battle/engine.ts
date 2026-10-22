// The battle engine that runs inside the worker: a BattleSession, the
// opponent AI, and a presenter that turns the player's protocol lines into
// frames (text, animation event, and a snapshot of what the player can see).
import { aiForStyle } from '@daily-battle/ai';
import {
  BattleSession,
  legalChoices,
  makeRng,
  type Policy,
  type Rng,
} from '@daily-battle/sim-bridge';
import { Battle as ClientBattle } from '@pkmn/client';
import { Generations } from '@pkmn/data';
import { Protocol } from '@pkmn/protocol';
import { Dex, type PokemonSet, type PRNGSeed } from '@pkmn/sim';
import { LogFormatter } from '@pkmn/view';
import type {
  Controls,
  EngineStart,
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

const dex = Dex.forGen(4);
const gens = new Generations(Dex as unknown as ConstructorParameters<typeof Generations>[0]);

type ClientPokemon = ClientBattle['p1']['team'][number];
type ClientSide = ClientBattle['p1'];

const whoOf = (ident: unknown): Who | undefined =>
  typeof ident === 'string'
    ? ident.startsWith('p1')
      ? 'you'
      : ident.startsWith('p2')
        ? 'foe'
        : undefined
    : undefined;

/** Animation event for a protocol line. */
function eventOf(args: readonly string[]): Frame['event'] {
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
    return { kind, who: typeof a === 'string' && a.startsWith('p1') ? 'you' : 'foe' };
  return { kind, who: whoOf(a) };
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
  args: readonly string[],
  kwArgs: Record<string, unknown>,
  before: View,
  after: View,
): Frame['label'] {
  const [cmd, a, b, c] = args;
  const who = whoOf(a);
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
  if (cmd === '-miss') return { who: whoOf(b) ?? who, text: 'Missed!', tone: 'info' };
  if (cmd === '-enditem' && String(kwArgs.from ?? '').includes('Knock Off')) {
    return { who, text: 'Item knocked off', tone: 'info' };
  }
  return undefined;
}

/** An ability or item revealing itself on this line, and whose it is. */
function popupOf(args: readonly string[], kwArgs: Record<string, unknown>): Frame['popup'] {
  const [cmd, a, b] = args;
  const from = typeof kwArgs.from === 'string' ? kwArgs.from : '';
  const holder = whoOf(kwArgs.of) ?? whoOf(a);
  if (!holder) return undefined;
  if ((cmd === '-ability' || cmd === '-item') && b) return { who: whoOf(a)!, text: b };
  if (cmd === '-enditem' && b && !from.includes('Knock Off')) return { who: whoOf(a)!, text: b };
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
function itemName(id: string): string {
  const item = dex.items.get(id);
  return item.exists ? item.name : dex.items.get(id.replace(/^item/, '')).name;
}

function revealedOf(side: ClientSide): Record<string, Revealed> {
  const out: Record<string, Revealed> = {};
  for (const p of side.team) {
    out[p.speciesForme] = {
      moves: p.moveSlots.map((m) => dex.moves.get(m.id).name),
      item: p.item ? itemName(p.item) : '',
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
  while (marks.length < Math.max(6, side.totalPokemon || 0)) marks.push(mark(undefined));
  return marks.slice(0, 6);
}

function viewOf(b: ClientBattle, yourOrder: string[]): View {
  return {
    turn: b.turn,
    you: monView(b.p1.active[0] ?? undefined, true),
    foe: monView(b.p2.active[0] ?? undefined, false),
    yourSide: sideConds(b.p1),
    foeSide: sideConds(b.p2),
    weather: WEATHER[b.field.weatherState.id] ?? '',
    revealed: revealedOf(b.p2),
    yourTeam: teamMarks(b.p1, yourOrder),
    foeTeam: teamMarks(b.p2),
  };
}

/** Damage multiplier of a move's type against a species by typing; null for status moves. */
export function effectiveness(moveName: string, species: string | undefined): number | null {
  const move = dex.moves.get(moveName);
  if (!move.exists || move.category === 'Status' || !species) return null;
  const types = dex.species.get(species).types;
  if (!dex.getImmunity(move.type, types)) return 0;
  return 2 ** dex.getEffectiveness(move.type, types);
}

/**
 * Showdown marks some numbers with `||exact||shown||` (e.g. your own HP lost as
 * `||−270/304||88.8%||`); keep the shown part.
 */
export function cleanText(text: string): string {
  return text.replace(/\|\|[^|]*\|\|([^|]*)\|\|/g, '$1').trim();
}

export class BattleEngine {
  private readonly session: BattleSession;
  private readonly ai: Policy;
  private readonly aiRng: Rng;
  private readonly presenter = new ClientBattle(gens);
  private readonly formatter: LogFormatter;
  private readonly sets: PokemonSet[];

  constructor(readonly start: EngineStart) {
    this.sets = start.playerTeam as PokemonSet[];
    this.session = new BattleSession({
      seed: start.battleSeed as PRNGSeed,
      p1: { team: start.playerTeam as PokemonSet[], name: 'You' },
      p2: { team: start.opponentTeam as PokemonSet[], name: 'The opponent' },
    });
    this.ai = aiForStyle(start.style);
    this.aiRng = makeRng(start.aiSeed as PRNGSeed);
    this.formatter = new LogFormatter('p1', this.presenter);
  }

  /** Starts (or resumes, replaying recorded choices) and returns the first package. */
  begin(): TurnPackage {
    this.advanceAi();
    for (const choice of this.start.choices) {
      if (this.session.ended) break;
      this.session.choose('p1', choice);
      this.advanceAi();
    }
    return this.package(this.start.choices.length > 0);
  }

  choose(choice: string): TurnPackage {
    this.session.choose('p1', choice);
    this.advanceAi();
    return this.package(false);
  }

  forfeit(): TurnPackage {
    this.session.forfeit('p1');
    return this.package(false);
  }

  /** The opponent answers every request it has. */
  private advanceAi() {
    for (
      let view = this.session.view('p2');
      view && !this.session.ended;
      view = this.session.view('p2')
    ) {
      this.session.choose('p2', this.ai.choose(view, this.aiRng));
    }
  }

  private package(resumed: boolean): TurnPackage {
    const frames: Frame[] = [];
    const explainers = new Set<string>();
    const order = this.sets.map((s) => s.species);
    let before = viewOf(this.presenter, order);
    for (const line of this.session.drain('p1')) {
      for (const { args, kwArgs } of Protocol.parse(line)) {
        const text = cleanText(this.formatter.formatText(args, kwArgs));
        this.presenter.add(args, kwArgs);
        const a = args as readonly string[];
        const kw = kwArgs as Record<string, unknown>;
        for (const e of explainersOf(a)) if (e) explainers.add(e);
        const event = eventOf(a);
        const popup = popupOf(a, kw);
        if (!text && !event && !popup) continue;
        if (text.startsWith('Battle started between')) continue;
        const view = viewOf(this.presenter, order);
        const label = labelOf(a, kw, before, view);
        frames.push({ text, event, view, ...(label && { label }), ...(popup && { popup }) });
        before = view;
      }
    }
    const team = this.team();
    const controls = this.controls();
    if (controls?.kind === 'move') {
      const active = team.find((m) => m.active);
      const enabled = controls.moves.filter((m) => !m.disabled);
      if (active?.item.startsWith('Choice') && enabled.length === 1 && controls.moves.length > 1) {
        explainers.add('choicelock');
      }
    }
    const ended = this.session.ended;
    const winner = this.session.winner;
    return {
      frames,
      team,
      controls: ended ? null : controls,
      explainers: [...explainers],
      end: ended
        ? {
            winner: winner === 'p1' ? 'you' : winner === 'p2' ? 'foe' : null,
            youLeft: this.sets.length - this.presenter.p1.team.filter((p) => p.fainted).length,
            foeLeft: 6 - this.presenter.p2.team.filter((p) => p.fainted).length,
          }
        : null,
      resumed,
    };
  }

  /** Your team in current switch order, merging live HP with your known sets. */
  private team(): TeamMember[] {
    const client = this.session.client('p1');
    const request = client.request;
    const order = request && request.requestType !== 'wait' ? request.side.pokemon : [];
    const live = client.p1.team;
    const species = order.length
      ? order.map((p) => p.speciesForme)
      : live.map((p) => p.speciesForme);
    return species.map((name, i) => {
      const p = live.find((x) => x.speciesForme === name);
      const set = this.sets.find((s) => s.species === name);
      const req = order[i];
      // Your request has exact HP for every team member; the client only tracks those seen.
      // After the last request (e.g. the final faint), the client is more current.
      const hp = p?.fainted ? 0 : req ? req.hp : (p?.hp ?? 0);
      const max = req ? req.maxhp : (p?.maxhp ?? 1);
      return {
        slot: i + 1,
        species: name,
        hp: hp > 0 ? Math.max(1, Math.round((100 * hp) / max)) : 0,
        hpExact: { hp, max },
        status: (req ? req.status : p?.status) ?? '',
        fainted: !!p?.fainted || (req ? !!req.fainted || hp <= 0 : hp <= 0),
        active: !!req?.active || (!req && client.p1.active[0]?.speciesForme === name),
        item: set?.item ?? '',
        ability: set?.ability ?? '',
        moves: set?.moves ?? [],
        stats: { ...(req?.stats ?? {}) },
      };
    });
  }

  private controls(): Controls | null {
    const request = this.session.request('p1');
    if (!request || request.requestType === 'team' || request.requestType === 'wait') return null;
    const legal = legalChoices(request);
    const switches = legal
      .filter((c) => c.startsWith('switch'))
      .map((choice) => ({ choice, slot: Number(choice.split(' ')[1]) }));
    const foe = this.presenter.p2.active[0]?.speciesForme;
    let moves: MoveOption[] = [];
    if (request.requestType === 'move') {
      moves = (request.active[0]?.moves ?? []).map((m, i) => {
        const move = dex.moves.get(m.name);
        const choice = `move ${i + 1}`;
        return {
          choice,
          name: m.name,
          type: move.exists ? move.type : 'Normal',
          category: (move.exists ? move.category : 'Physical') as MoveOption['category'],
          power: move.exists ? move.basePower : 0,
          accuracy: move.exists ? move.accuracy : true,
          desc: move.exists ? move.shortDesc || move.desc : '',
          pp: 'pp' in m ? m.pp : 0,
          maxpp: 'maxpp' in m ? m.maxpp : 0,
          disabled: !legal.includes(choice),
          effectiveness: effectiveness(m.name, foe),
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
