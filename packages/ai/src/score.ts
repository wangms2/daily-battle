// Utility of each legal action (DESIGN.md §8.3). Scores are in "fraction of a
// Pokémon's HP" units: damage dealt is good, damage taken is bad, and status
// moves are worth what they're likely to set up.
import type { SetsFile } from '@daily-battle/data';
import { legalChoices, type Rng, type SideView } from '@daily-battle/sim-bridge';
import type { Field, Pokemon } from '@smogon/calc';
import { candidates, type KnownSets } from './belief';
import { effectiveness, hit, makeField, makeMon, moveInfo, speed, typesOf, type Hit } from './calc';
import type { Params } from './presets';
import { moveId, type AIState, type FoeMon, type OwnMon } from './state';

export interface ScoredAction {
  choice: string;
  score: number;
  kind: 'move' | 'switch';
  /** Move id, for moves. */
  move?: string;
  /** Expected damage dealt to the foe's active (fraction of its max HP), for moves. */
  damage: number;
}

interface FoeCand {
  mon: Pokemon;
  weight: number;
  moves: string[];
  physical: boolean;
}

interface Ctx {
  state: AIState;
  params: Params;
  cache: Map<string, Hit>;
  toFoe: Field;
  toOwn: Field;
}

const HAZARDS: Record<string, { key: 'sr' | 'spikes' | 'tspikes'; max: number }> = {
  stealthrock: { key: 'sr', max: 1 },
  spikes: { key: 'spikes', max: 3 },
  toxicspikes: { key: 'tspikes', max: 2 },
};
const SETUP = new Set([
  'swordsdance',
  'dragondance',
  'nastyplot',
  'calmmind',
  'bulkup',
  'agility',
  'rockpolish',
  'curse',
  'bellydrum',
  'tailglow',
  'irondefense',
  'amnesia',
  'cosmicpower',
]);
const RECOVER = new Set([
  'recover',
  'roost',
  'softboiled',
  'slackoff',
  'synthesis',
  'moonlight',
  'morningsun',
  'milkdrink',
  'healorder',
]);
const STATUS: Record<string, string[]> = {
  toxic: ['Poison', 'Steel'],
  willowisp: ['Fire'],
  thunderwave: ['Ground', 'Electric'],
  stunspore: ['Grass'],
  glare: [],
};
const SELF_KO = new Set(['explosion', 'selfdestruct', 'memento']);

function ownCalc(m: OwnMon): Pokemon {
  return makeMon({
    species: m.species,
    item: m.set.item,
    ability: m.set.ability,
    nature: m.set.nature,
    evs: m.set.evs,
    ivs: m.set.ivs,
    boosts: m.boosts,
    status: m.status,
    hpFrac: m.hpFrac,
  });
}

/** Top candidate sets for a foe Pokémon as calc Pokémon, weights renormalized. */
export function foeCands(foe: FoeMon, data: SetsFile, known?: KnownSets): FoeCand[] {
  const top = candidates(foe, data, known)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const total = top.reduce((a, c) => a + c.weight, 0);
  return top.map(({ set, weight }) => ({
    mon: makeMon({
      species: foe.species,
      item: set.item,
      ability: set.ability,
      nature: set.nature,
      evs: set.evs,
      ivs: set.ivs,
      boosts: foe.boosts,
      status: foe.status,
      hpFrac: foe.hpFrac,
    }),
    weight: weight / total,
    moves: set.moves,
    physical: set.evs.atk >= 200,
  }));
}

/** Our expected hit on a foe, averaged over its candidate sets. */
function ourHit(ctx: Ctx, me: Pokemon, meKey: string, move: string, foes: FoeCand[]): Hit {
  let frac = 0;
  let ko = 0;
  foes.forEach((f, i) => {
    const h = hit(me, f.mon, move, ctx.toFoe, ctx.cache, `o|${meKey}|${i}|${f.mon.name}|${move}`);
    frac += f.weight * h.frac;
    ko += f.weight * h.ko;
  });
  return { frac, ko };
}

/** The foe's best hit on one of ours, averaged over its candidate sets. */
function theirHit(ctx: Ctx, target: Pokemon, targetKey: string, foes: FoeCand[]): Hit {
  let frac = 0;
  let ko = 0;
  foes.forEach((f, i) => {
    let best: Hit = { frac: 0, ko: 0 };
    for (const move of f.moves) {
      const h = hit(
        f.mon,
        target,
        move,
        ctx.toOwn,
        ctx.cache,
        `t|${f.mon.name}|${i}|${targetKey}|${move}`,
      );
      if (h.frac > best.frac) best = h;
    }
    frac += f.weight * best.frac;
    ko += f.weight * best.ko;
  });
  return { frac, ko };
}

function bestOwnHit(ctx: Ctx, mon: OwnMon, calc: Pokemon, foes: FoeCand[]): Hit {
  let best: Hit = { frac: 0, ko: 0 };
  for (const move of mon.set.moves) {
    const h = ourHit(ctx, calc, `${mon.slot}`, move, foes);
    if (h.frac > best.frac) best = h;
  }
  return best;
}

function probFirst(me: Pokemon, foes: FoeCand[], weather: string): number {
  const mine = speed(me, weather);
  return foes.reduce((p, f) => {
    const theirs = speed(f.mon, weather);
    return p + f.weight * (mine > theirs ? 1 : mine === theirs ? 0.5 : 0);
  }, 0);
}

/** Entry hazard damage (fraction of max HP) for one of ours switching in. */
function hazardCost(state: AIState, mon: OwnMon): number {
  const s = state.ownSide;
  let cost = s.sr ? 0.125 * effectiveness('Rock', mon.species) : 0;
  const grounded = !typesOf(mon.species).includes('Flying') && mon.set.ability !== 'Levitate';
  if (grounded) cost += [0, 1 / 8, 1 / 6, 1 / 4][Math.min(3, s.spikes)]!;
  return cost;
}

/**
 * How good it is to have `mon` facing the foe's active: damage it can land
 * (weighted by the chance it moves before being knocked out), a bonus for
 * outspeeding and KOing, minus damage taken.
 */
function matchup(ctx: Ctx, mon: OwnMon, calc: Pokemon, foes: FoeCand[]): number {
  const dealt = bestOwnHit(ctx, mon, calc, foes);
  const taken = theirHit(ctx, calc, `${mon.slot}`, foes);
  const first = probFirst(calc, foes, ctx.state.weather);
  const lands = first + (1 - first) * (1 - taken.ko);
  return (
    ctx.params.damage * dealt.frac * lands +
    ctx.params.ko * dealt.ko * first -
    ctx.params.risk * taken.frac
  );
}

function resists(mon: OwnMon, foes: FoeCand[]): boolean {
  const stab = new Set(foes.flatMap((f) => typesOf(f.mon.name)));
  return [...stab].every((t) => effectiveness(t, mon.species) < 1);
}

const hazardSeverity = (s: AIState['ownSide']) =>
  (s.sr ? 0.5 : 0) + 0.25 * s.spikes + 0.15 * s.tspikes;

/**
 * Scores every legal action for the current request. `rng` is only used for
 * the switch-prediction roll, so scoring stays deterministic given the seed.
 */
export function scoreActions(
  view: SideView,
  state: AIState,
  params: Params,
  rng: Rng,
  data: SetsFile,
  known?: KnownSets,
): ScoredAction[] {
  const legal = legalChoices(view.request);
  const ctx: Ctx = {
    state,
    params,
    cache: new Map(),
    toFoe: makeField(state.weather, state.ownSide, state.foeSide),
    toOwn: makeField(state.weather, state.foeSide, state.ownSide),
  };
  const foe = state.foeActive;
  const foes = foe ? foeCands(foe, data, known) : [];
  const ownBySlot = new Map(state.own.map((m) => [m.slot, m]));
  const calcs = new Map<number, Pokemon>();
  const calcFor = (m: OwnMon) => {
    if (!calcs.has(m.slot)) calcs.set(m.slot, ownCalc(m));
    return calcs.get(m.slot)!;
  };

  const scoreSwitch = (slot: number, forced: boolean): number => {
    const mon = ownBySlot.get(slot);
    if (!mon || !foes.length) return 0;
    const calc = calcFor(mon);
    const entry = hazardCost(state, mon);
    if (forced) return matchup(ctx, mon, calc, foes) - entry;
    const active = state.ownActive!;
    const gain = matchup(ctx, mon, calc, foes) - matchup(ctx, active, calcFor(active), foes);
    const freeHit = theirHit(ctx, calc, `${slot}`, foes).frac;
    return (
      params.position * gain -
      params.risk * freeHit -
      entry -
      params.switchPenalty +
      (resists(mon, foes) ? params.resistBias : 0)
    );
  };

  if (view.request.requestType === 'switch' || !state.ownActive) {
    return legal.map((choice) => ({
      choice,
      kind: 'switch',
      damage: 0,
      score: scoreSwitch(Number(choice.split(' ')[1]), true),
    }));
  }

  const me = state.ownActive;
  const meCalc = calcFor(me);
  const taken = foes.length ? theirHit(ctx, meCalc, `${me.slot}`, foes) : { frac: 0, ko: 0 };
  const first = foes.length ? probFirst(meCalc, foes, state.weather) : 0.5;
  const foesLeft = Math.max(1, state.foeTotal - state.foe.filter((f) => f.fainted).length);

  // Switch prediction (§8.4): sometimes aim at the foe's likely switch-in instead.
  let targets = foes;
  if (foe && rng() < params.predictionRate && bestOwnHit(ctx, me, meCalc, foes).frac >= 0.5) {
    const bench = state.foe.filter((f) => !f.active && !f.fainted);
    let safest: { cands: FoeCand[]; dmg: number } | undefined;
    for (const b of bench) {
      const cands = foeCands(b, data, known);
      const dmg = bestOwnHit(ctx, me, meCalc, cands).frac;
      if (!safest || dmg < safest.dmg) safest = { cands, dmg };
    }
    if (safest) targets = safest.cands;
  }

  const request = view.request.requestType === 'move' ? view.request : null;
  const scored = legal.map((choice): ScoredAction => {
    const [kind, n] = choice.split(' ');
    if (kind === 'switch') {
      return { choice, kind: 'switch', damage: 0, score: scoreSwitch(Number(n), false) };
    }
    const slot = request?.active[0]?.moves[Number(n) - 1];
    const name = slot?.name ?? me.set.moves[Number(n) - 1] ?? '';
    const id = moveId(name);
    const info = moveInfo(name);
    const dmg = foes.length ? ourHit(ctx, meCalc, `${me.slot}`, name, targets) : { frac: 0, ko: 0 };
    const goesFirst = info.priority > 0 ? 1 : info.priority < 0 ? 0 : first;
    const survive = 1 - taken.ko;
    const stayCost = params.risk * taken.frac;

    // Damage only counts if we get to move: first, or slower but surviving.
    const lands = goesFirst + (1 - goesFirst) * survive;
    let score: number;
    if (dmg.frac > 0) {
      score =
        params.damage * dmg.frac * lands +
        params.ko * dmg.ko * lands -
        stayCost * (1 - dmg.ko * goesFirst);
      if (id === 'rapidspin') score += params.spin * hazardSeverity(state.ownSide);
      if (SELF_KO.has(id)) score -= 0.8 * me.hpFrac;
    } else {
      score = -stayCost + statusValue(id, ctx, me, foe, foes, taken, foesLeft);
    }
    return { choice, kind: 'move', move: id, damage: dmg.frac, score };
  });

  // Average players click their strongest attack a lot (§8.4).
  const strongest = scored
    .filter((s) => s.kind === 'move' && s.damage > 0)
    .sort((a, b) => b.damage - a.damage)[0];
  if (strongest) strongest.score += params.maxDamageBias;
  return scored;
}

function statusValue(
  id: string,
  ctx: Ctx,
  me: OwnMon,
  foe: FoeMon | undefined,
  foes: FoeCand[],
  taken: Hit,
  foesLeft: number,
): number {
  const { params, state } = ctx;
  const hazard = HAZARDS[id];
  if (hazard) {
    const current = state.foeSide[hazard.key];
    if ((typeof current === 'boolean' ? (current ? 1 : 0) : current) >= hazard.max) return -0.05;
    const early = state.turn <= 3 ? 1 + params.earlyHazardBonus : 1;
    const layerDecay = typeof current === 'number' ? 1 / (1 + current) : 1;
    return params.hazard * (foesLeft / 6) * early * layerDecay;
  }
  if (SETUP.has(id)) {
    const boosted = Object.values(me.boosts).reduce((a, b) => a + Math.max(0, b), 0);
    return params.setup * Math.max(0, 1 - 2 * taken.frac) * (boosted < 4 ? 1 : 0.2);
  }
  if (id in STATUS) {
    if (!foe || foe.status || foe.substitute || foe.hpFrac < 0.4) return -0.05;
    const types = typesOf(foe.species);
    if (STATUS[id]!.some((t) => types.includes(t))) return -0.2;
    const physical = foes.reduce((a, f) => a + f.weight * (f.physical ? 1 : 0), 0);
    return params.status * (id === 'willowisp' ? 0.6 + 0.6 * physical : 1);
  }
  const missing = 1 - me.hpFrac;
  if (RECOVER.has(id)) return me.hpFrac < 0.75 ? params.recover * missing : -0.05;
  if (id === 'wish') return me.hpFrac < 0.8 ? 0.7 * params.recover * missing : 0.02;
  if (id === 'rest') return me.hpFrac < 0.45 ? params.recover * missing * 0.9 : -0.1;
  if (id === 'painsplit') return params.recover * Math.max(0, ((foe?.hpFrac ?? 0) - me.hpFrac) / 2);
  if (id === 'substitute') {
    return me.hpFrac > 0.3 ? params.substitute * Math.max(0, 1 - 2 * taken.frac) : -0.2;
  }
  if (id === 'protect' || id === 'detect') return params.other + 0.5 * params.risk * taken.frac;
  if (id === 'roar' || id === 'whirlwind') {
    const boosts = foe ? Object.values(foe.boosts).reduce((a, b) => a + Math.max(0, b), 0) : 0;
    return params.other + 0.15 * boosts + 0.3 * hazardSeverity(state.foeSide);
  }
  if (id === 'healbell' || id === 'aromatherapy') {
    return 0.3 * params.recover * state.own.filter((m) => !m.fainted && m.status).length;
  }
  return params.other;
}
