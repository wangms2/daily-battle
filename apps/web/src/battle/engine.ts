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

function revealedOf(side: ClientSide): Record<string, Revealed> {
  const out: Record<string, Revealed> = {};
  for (const p of side.team) {
    out[p.speciesForme] = {
      moves: p.moveSlots.map((m) => dex.moves.get(m.id).name),
      item: p.item ? dex.items.get(p.item).name : '',
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

function viewOf(b: ClientBattle): View {
  return {
    turn: b.turn,
    you: monView(b.p1.active[0] ?? undefined, true),
    foe: monView(b.p2.active[0] ?? undefined, false),
    yourSide: sideConds(b.p1),
    foeSide: sideConds(b.p2),
    weather: WEATHER[b.field.weatherState.id] ?? '',
    revealed: revealedOf(b.p2),
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
    for (const line of this.session.drain('p1')) {
      for (const { args, kwArgs } of Protocol.parse(line)) {
        const text = cleanText(this.formatter.formatText(args, kwArgs));
        this.presenter.add(args, kwArgs);
        for (const e of explainersOf(args as readonly string[])) if (e) explainers.add(e);
        const event = eventOf(args as readonly string[]);
        if (!text && !event) continue;
        if (text.startsWith('Battle started between')) continue;
        frames.push({ text, event, view: viewOf(this.presenter) });
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
            youLeft: team.filter((m) => !m.fainted).length,
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
      const hp = req ? req.hp : (p?.hp ?? 0);
      const max = req ? req.maxhp : (p?.maxhp ?? 1);
      return {
        slot: i + 1,
        species: name,
        hp: hp > 0 ? Math.max(1, Math.round((100 * hp) / max)) : 0,
        hpExact: { hp, max },
        status: (req ? req.status : p?.status) ?? '',
        fainted: req ? !!req.fainted || hp <= 0 : (p?.fainted ?? hp <= 0),
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
