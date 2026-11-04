// The Master network playing on its own, without search: a few sampled
// worlds (the foe's hidden sets filled in, as for Hard), each observed the way
// the self-play env does (features.rs `observe`) and scored by the network,
// with the move probabilities averaged across worlds. Team Preview and
// anything the engine can't model fall back to the strongest utility AI.
import { sets as defaultSets, type SetsFile } from '@daily-battle/data';
import {
  NET_OBS,
  type Engine,
  type NetEvent,
  type NetKnown,
  type NetSearchParams,
  type NetSearchResult,
  type NetWorld,
} from '@daily-battle/engine-wasm';
import { legalChoices, type Policy, type Rng, type SideView } from '@daily-battle/sim-bridge';
import type { KnownSets } from '../belief';
import { genFor, moveInfo, type Gen } from '../calc';
import { toChoice } from '../hard/choices';
import { settled, type DecisionJob, type NetClaim } from '../hard/policy';
import { engineId, engineMove } from '../hard/names';
import { translate, type WorldFoe } from '../hard/translate';
import { sampleWorlds } from '../hard/worlds';
import { UtilityPolicy } from '../policy';
import { STRONG } from '../presets';
import { baseSpecies, extractState, moveId, toId } from '../state';
import { speciesKey, SPEED_ODDITIES, Tracker, type TrackedEvent, type TurnStart } from './track';

type Request = Exclude<SideView['request'], { requestType: 'wait' }>;

export interface NetPolicyOptions {
  /** poke-engine built for this format's generation, with the network loaded (or `net` given). */
  engine: Engine;
  /** The network (.dbnet bytes), loaded into the engine if it hasn't been. */
  net?: Uint8Array;
  data?: SetsFile;
  /** The week's public pool, the prior for foes not yet seen. */
  pool?: readonly string[];
  /** Worlds sampled per decision. */
  worlds?: number;
  /** Draw from the averaged policy instead of taking its best (without search only). */
  sample?: boolean;
  /** Light search (engine `netSearch`) on top of the network; off when absent. */
  search?: NetSearchParams;
  /** With search, weight of log(prior) next to the searched win chances. */
  priorWeight?: number;
  /** Called with each decision's network inputs (for offline evaluation). */
  record?: (r: NetRecord) => void;
  /** The foe's real sets, by species: lesson content only, never in play. */
  knownSets?: KnownSets;
}

/** One decision's network inputs: per sampled world, the slot→choice map and the world. */
export interface NetRecord {
  legal: string[];
  slots: (string | undefined)[][];
  weights: number[];
  worlds: NetWorld[];
}

/** A decision's network inputs, with each world's foes in the order its state has them. */
export interface NetPrepared extends NetRecord {
  foes: WorldFoe[][];
}

export interface NetStats {
  decisions: number;
  /** Decisions the network made (the rest fell back). */
  net: number;
  /** The network's own win chance, summed over its decisions. */
  value: number;
  /** Positions the search had the network judge, summed. */
  positions: number;
  errors: string[];
}

const loaded = new WeakMap<Engine, Uint8Array>();

/**
 * Master's settings (DESIGN.md §4.6): 4 worlds and a light search, picking by
 * win chance with a little of the prior. Gated at 57.6% against Hard at 150k.
 */
export const MASTER_DEFAULTS = {
  worlds: 4,
  search: { robust: 0 },
  priorWeight: 0.02,
} as const satisfies Pick<NetPolicyOptions, 'worlds' | 'search' | 'priorWeight'>;

/** Engine slot of a root option (env `slot_of`): moves 0–3, Mega moves 4–7, switches 8–13. */
function slotOf(key: string): number | undefined {
  const [kind, index] = key.split(':');
  const i = Number(index);
  if (!Number.isInteger(i)) return undefined;
  return kind === 'move' ? i : kind === 'mega' ? 4 + i : kind === 'switch' ? 8 + i : undefined;
}

/**
 * Our side of a state in `perm` order (slot k holds the request's Pokémon
 * perm[k]), as the env keeps a team in fixed slots where Showdown's request
 * brings the active one to the front.
 */
export function permuteOwn(state: string, perm: readonly number[]): string {
  const sides = state.split('/');
  const f = sides[0]!.split('=');
  const inv = (i: number) => perm.indexOf(i);
  const mons = perm.map((i) => f[i]!);
  f.splice(0, 6, ...mons);
  f[6] = String(inv(Number(f[6])));
  const last = f.length - 2;
  const m = /^switch:(\d+)$/.exec(f[last]!);
  if (m) f[last] = `switch:${inv(Number(m[1]))}`;
  sides[0] = f.join('=');
  return sides.join('/');
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * The light search's pick: each choice's win chance averaged over the worlds
 * by weight, plus `priorWeight` × log of the network's averaged prior. Where a
 * world didn't search a choice it counts as that world's worst searched one,
 * so an unexamined choice can't win by omission.
 */
export function pickSearched(
  legal: readonly string[],
  slots: readonly (readonly (string | undefined)[])[],
  weights: readonly number[],
  results: readonly NetSearchResult[],
  priorWeight = 0.02,
): string | undefined {
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const score = new Map<string, number>();
  const prior = new Map<string, number>();
  const searched = new Set<string>();
  results.forEach((r, k) => {
    const w = weights[k]! / total;
    const finite = r.score.filter(Number.isFinite);
    const floor = finite.length ? Math.min(...finite) : r.value;
    const seen = new Set<string>();
    slots[k]!.forEach((c, i) => {
      if (!c || seen.has(c)) return;
      seen.add(c);
      const s = r.score[i]!;
      if (Number.isFinite(s)) searched.add(c);
      score.set(c, (score.get(c) ?? 0) + w * (Number.isFinite(s) ? s : floor));
      prior.set(c, (prior.get(c) ?? 0) + w * r.prior[i]!);
    });
  });
  let best: string | undefined;
  let bestS = -Infinity;
  // Legal order breaks ties, so the pick doesn't depend on map order.
  for (const c of legal) {
    const s = score.get(c);
    if (s === undefined || (searched.size && !searched.has(c))) continue;
    const v = s + priorWeight * Math.log(Math.max(prior.get(c) ?? 0, 1e-6));
    if (v > bestS) [best, bestS] = [c, v];
  }
  return best;
}

export class NetPolicy implements Policy {
  readonly stats: NetStats = { decisions: 0, net: 0, value: 0, positions: 0, errors: [] };
  private readonly engine: Engine;
  private readonly data: SetsFile;
  private readonly gen: Gen;
  private readonly fallback: UtilityPolicy;
  private readonly trackers = new WeakMap<readonly string[], Tracker>();
  private ids?: { species: (name: string) => number; moves: (name: string) => number };

  constructor(private readonly options: NetPolicyOptions) {
    this.engine = options.engine;
    this.data = options.data ?? defaultSets;
    this.gen = genFor(this.data.meta.format);
    this.fallback = new UtilityPolicy(STRONG, { data: this.data });
    if (options.net && loaded.get(this.engine) !== options.net) {
      this.engine.netLoad(options.net);
      loaded.set(this.engine, options.net);
    }
  }

  /**
   * Sees a decision without making it: a replayed choice on resume. The
   * network's inputs (Speed evidence, team order) come from every decision, so
   * a resumed battle must show it each one it skipped, in order.
   */
  watch(view: SideView): void {
    this.observe(view);
  }

  private observe(view: SideView): Tracker {
    const tracker = this.tracker(view);
    tracker.sync(view.log);
    const request = view.request;
    if (request.requestType === 'move' || request.requestType === 'switch') {
      tracker.ownOrder ??= request.side.pokemon.map((p) => p.ident);
      if (request.requestType === 'move') {
        const start = this.turnStart(view, request);
        if (start) tracker.start(start);
      }
    }
    return tracker;
  }

  choose(view: SideView, rng: Rng): string {
    return this.think(view, rng).result();
  }

  /**
   * The decision as a job, a world at a time (as Hard's, `DecisionJob`): the
   * worlds are sampled now, and each world's search is independent, so some
   * can be handed to other workers (`claim`). Run to the end it gives exactly
   * what `choose` does. `rng` should be this decision's own.
   */
  think(view: SideView, rng: Rng): DecisionJob<NetClaim> {
    const tracker = this.observe(view);
    const request = view.request;
    const legal = legalChoices(request);
    if (legal.length <= 1) return settled(legal[0] ?? 'default');
    this.stats.decisions++;
    if (request.requestType === 'team' || request.requestType === 'wait')
      return settled(this.fallback.choose(view, rng));
    const fallback = (message: string) => {
      this.note(message);
      return this.fallback.choose(view, rng);
    };
    const noOption = `no legal network option (legal: ${legal.join(', ')})`;
    const params = this.options.search;
    let prepared: NetPrepared | undefined;
    try {
      if (!params) {
        const pick = this.unsearched(request, tracker, legal, view, rng);
        if (pick) this.stats.net++;
        return settled(pick ?? fallback(noOption));
      }
      prepared = this.build(view, request, tracker, legal, rng);
    } catch (err) {
      return settled(fallback(String((err as Error)?.message ?? err)));
    }
    if (!prepared) return settled(fallback(noOption));
    const { slots, weights, worlds } = prepared;
    this.options.record?.({ legal, slots, weights, worlds });

    // By world index: a result, or null for a world the engine panicked on (dropped).
    const results: (NetSearchResult | null | undefined)[] = [];
    const claimed = new Set<number>();
    let failure: unknown;
    let pick: string | undefined;
    const finish = () => {
      const keep = worlds.flatMap((_, k) => (results[k] ? [k] : []));
      if (!keep.length) {
        pick = fallback(String((failure as Error)?.message ?? failure));
        return;
      }
      const kept = keep.map((k) => results[k]!);
      const keptWeights = keep.map((k) => weights[k]!);
      const total = keptWeights.reduce((a, b) => a + b, 0) || 1;
      kept.forEach((r, j) => {
        this.stats.value += (keptWeights[j]! / total) * r.value;
        this.stats.positions += r.positions;
      });
      const best = pickSearched(
        legal,
        keep.map((k) => slots[k]!),
        keptWeights,
        kept,
        this.options.priorWeight,
      );
      if (best) this.stats.net++;
      pick = best ?? fallback(noOption);
    };
    // Searches a world here; with `all`, ones handed out too (never given back).
    const search = (all: boolean): boolean => {
      if (pick !== undefined) return false;
      const k = worlds.findIndex((_, k) => results[k] === undefined && (all || !claimed.has(k)));
      if (k >= 0) {
        try {
          results[k] = this.engine.netSearch(params, [worlds[k]!])[0]!;
        } catch (err) {
          this.note(String((err as Error)?.message ?? err));
          failure ??= err;
          results[k] = null;
        }
      }
      if (worlds.some((_, k) => results[k] === undefined)) return k >= 0;
      finish();
      return false;
    };
    return {
      step: () => search(false),
      claim: () => {
        if (pick !== undefined) return undefined;
        const k = worlds.findIndex((_, k) => results[k] === undefined && !claimed.has(k));
        if (k < 0) return undefined;
        claimed.add(k);
        return {
          net: { params, world: worlds[k]! },
          give: (result) => {
            if (pick === undefined && results[k] === undefined) results[k] = result;
          },
        };
      },
      result: () => {
        while (search(true));
        return pick!;
      },
    };
  }

  private tracker(view: SideView): Tracker {
    let t = this.trackers.get(view.log);
    if (!t) {
      t = new Tracker(view.side, {
        baseSpe: (forme) => this.base(forme)[5],
        priority: (move) => {
          try {
            return moveInfo(this.gen, move).priority;
          } catch {
            return 0;
          }
        },
      });
      this.trackers.set(view.log, t);
    }
    return t;
  }

  private base(forme: string): NetKnown['base'] {
    const s = this.gen.species.get(toId(forme) as never)?.baseStats;
    return s ? [s.hp, s.atk, s.def, s.spa, s.spd, s.spe] : [80, 80, 80, 80, 80, 80];
  }

  /** What this turn's order could say about the foe's Speed, from the board as it starts. */
  private turnStart(view: SideView, request: Request): TurnStart | undefined {
    const own = view.battle[view.side];
    const foe = view.battle[view.side === 'p1' ? 'p2' : 'p1'];
    const mon = own.active[0];
    const foeMon = foe.active[0];
    const req = request.side.pokemon.find((p) => p.active);
    if (!mon || !foeMon || !req) return undefined;
    const odd = (...names: (string | undefined)[]) =>
      names.some((n) => !!n && SPEED_ODDITIES.has(toId(n)));
    const calm = (side: typeof own, m: typeof mon) =>
      !m.boosts.spe && m.status !== 'par' && !side.sideConditions.tailwind;
    const field = view.battle.field;
    const scarf = toId(req.item) === 'choicescarf';
    return {
      turn: view.battle.turn,
      ok:
        !field.weatherState.id &&
        !field.pseudoWeather.trickroom &&
        calm(own, mon) &&
        calm(foe, foeMon) &&
        !odd(req.item, req.ability || req.baseAbility) &&
        !odd(foeMon.item, foeMon.ability),
      ownSpeed: scarf ? Math.floor((req.stats.spe * 3) / 2) : req.stats.spe,
      foeKey: speciesKey(foeMon.speciesForme),
      foeForme: foeMon.speciesForme,
      foeOddity: () => odd(foeMon.item, foeMon.ability),
    };
  }

  /**
   * A decision's network inputs without deciding (the coach's judge): the
   * view is seen as `choose` sees it. Undefined when there's no choice to make
   * or the engine can't model it.
   */
  prepare(view: SideView, rng: Rng): NetPrepared | undefined {
    const tracker = this.observe(view);
    const request = view.request;
    if (request.requestType !== 'move' && request.requestType !== 'switch') return undefined;
    const legal = legalChoices(request);
    if (legal.length < 2) return undefined;
    return this.build(view, request, tracker, legal, rng);
  }

  /** The network's pick without search: its move probabilities averaged over the worlds. */
  private unsearched(
    request: Request,
    tracker: Tracker,
    legal: string[],
    view: SideView,
    rng: Rng,
  ): string | undefined {
    const prepared = this.build(view, request, tracker, legal, rng);
    if (!prepared) return undefined;
    const { slots, weights, worlds: worldsIn } = prepared;
    this.options.record?.({ legal, slots, weights, worlds: worldsIn });

    const outs = this.engine.netForward(
      worldsIn.map((w) => ({
        ...this.engine.observe(w.state, w.turn, w.known, w.events),
        mask: [...w.legal],
      })),
    );
    const prob = new Map<string, number>();
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    outs.forEach((out, k) => {
      const w = weights[k]! / total;
      this.stats.value += w * sigmoid(out.value);
      const legalSlots = slots[k]!.flatMap((c, i) => (c ? [i] : []));
      const max = Math.max(...legalSlots.map((i) => out.policy[i]!));
      const exp = legalSlots.map((i) => Math.exp(out.policy[i]! - max));
      const sum = exp.reduce((a, b) => a + b, 0);
      legalSlots.forEach((i, j) => {
        const c = slots[k]![i]!;
        prob.set(c, (prob.get(c) ?? 0) + (w * exp[j]!) / sum);
      });
    });
    if (this.options.sample) {
      let r = rng() * [...prob.values()].reduce((a, b) => a + b, 0);
      for (const c of legal) {
        r -= prob.get(c) ?? 0;
        if (r < 0) return c;
      }
    }
    let best: string | undefined;
    let bestP = -1;
    // Legal order breaks ties, so the pick doesn't depend on map order.
    for (const c of legal) {
      const p = prob.get(c);
      if (p !== undefined && p > bestP) [best, bestP] = [c, p];
    }
    return best;
  }

  /** Samples the worlds and turns each into the network's inputs (the env's slots and order). */
  private build(
    view: SideView,
    request: Request,
    tracker: Tracker,
    legal: string[],
    rng: Rng,
  ): NetPrepared | undefined {
    const data = this.data;
    const state = extractState(view, data);
    const worlds = sampleWorlds(view, state, data, rng, {
      count: this.options.worlds ?? 4,
      ...(this.options.pool ? { pool: this.options.pool } : {}),
      ...(this.options.knownSets ? { known: this.options.knownSets } : {}),
    });
    const ownSets = state.own.map((m) => m.set);
    const reqMons = request.side.pokemon;
    const order = (tracker.ownOrder ?? []).map((id) => reqMons.findIndex((p) => p.ident === id));
    const perm =
      order.length === reqMons.length && !order.includes(-1) ? order : reqMons.map((_, i) => i);
    while (perm.length < 6) perm.push(perm.length);
    const turn =
      request.requestType === 'move' ? Math.max(0, view.battle.turn - 1) : view.battle.turn;
    const legalSet = new Set(legal);

    const worldsIn: NetWorld[] = [];
    const slots: (string | undefined)[][] = [];
    const weights: number[] = [];
    const foeLists: WorldFoe[][] = [];
    for (const world of worlds) {
      // Foes in order of appearance, as the env's are in team order with the lead first.
      const rank = (f: WorldFoe) => {
        const i = tracker.foeAppeared.indexOf(speciesKey(f.species));
        return i < 0 ? Infinity : i;
      };
      const foes = world.foes
        .map((f, i) => ({ f, i }))
        .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
        .map((x) => x.f);
      const st = permuteOwn(translate(view, foes, data, ownSets), perm);
      const choice: (string | undefined)[] = Array(NET_OBS.actions).fill(undefined);
      for (const key of this.engine.options(st).s1) {
        const slot = slotOf(key);
        if (slot === undefined) continue;
        const c = key.startsWith('switch:')
          ? perm[slot - 8]! < reqMons.length
            ? `switch ${perm[slot - 8]! + 1}`
            : undefined
          : toChoice(key, request);
        if (c && legalSet.has(c)) choice[slot] = c;
      }
      if (!choice.some(Boolean)) continue;
      const known = foes.map((f) => this.known(f, tracker));
      const events = tracker.events.slice(-16).map((e) => this.event(e, request, foes));
      worldsIn.push({ state: st, turn, known, events, legal: choice.map(Boolean) });
      slots.push(choice);
      weights.push(world.weight);
      foeLists.push(foes);
    }
    if (!slots.length) return undefined;
    return { legal, slots, weights, worlds: worldsIn, foes: foeLists };
  }

  /** What we know of a foe in a world, as features.rs `Known`. */
  private known(f: WorldFoe, tracker: Tracker): NetKnown {
    const c = f.seen;
    const forme = c?.speciesForme ?? f.species;
    const key = speciesKey(f.species);
    const has = (m: string | undefined) => {
      if (!m || !c) return false;
      const id = moveId(m);
      const hp = id.startsWith('hiddenpower');
      return c.moveSlots.some((s) =>
        hp ? moveId(s.id).startsWith('hiddenpower') : moveId(s.id) === id,
      );
    };
    return {
      // Team Preview (Gen 5 on) lists every foe species up front, as in the env.
      seen: tracker.foeAppeared.includes(key) || (this.gen.num >= 5 && !!c),
      item: !!(c?.item || c?.lastItem),
      ability: !!c?.ability,
      moves: [has(f.set.moves[0]), has(f.set.moves[1]), has(f.set.moves[2]), has(f.set.moves[3])],
      base: this.base(forme),
      speed: tracker.speedOf(key, forme),
    };
  }

  private event(e: TrackedEvent, request: Request, foes: WorldFoe[]): NetEvent {
    const ids = (this.ids ??= (() => {
      const names = this.engine.featuresMeta().names;
      // Names to ids; a name the table lacks gets its last id, `unknown`.
      const index = (list: string[]) => {
        const m = new Map<string, number>();
        list.forEach((n, i) => n && !m.has(n) && m.set(n, i));
        return (n: string) => m.get(n) ?? list.length - 1;
      };
      return { species: index(names.species), moves: index(names.moves) };
    })());
    const species = ids.species(engineId(e.forme));
    let move = 0;
    if (e.kind === 1) {
      let name = e.move;
      // The log doesn't say Hidden Power's type: take it from the set (ours, or the world's guess).
      if (toId(name) === 'hiddenpower') {
        const base = baseSpecies(e.forme);
        const moves = e.mine
          ? request.side.pokemon.find((p) => baseSpecies(p.speciesForme) === base)?.moves
          : foes.find((f) => speciesKey(f.species) === speciesKey(base))?.set.moves;
        name = moves?.find((m) => moveId(m).startsWith('hiddenpower')) ?? name;
      }
      move = ids.moves(engineMove(name, this.gen.num));
    }
    return {
      kind: e.kind,
      mine: e.mine,
      turn: e.turn,
      species,
      move,
      mega: e.mega,
      hpOwn: e.hpOwn,
      hpFoe: e.hpFoe,
    };
  }

  private note(message: string) {
    this.stats.errors.push(message.slice(0, 300));
    if (this.stats.errors.length > 20) this.stats.errors.shift();
  }
}
