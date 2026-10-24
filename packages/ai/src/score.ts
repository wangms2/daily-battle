// Utility of each legal action (DESIGN.md §8.3). Scores are in "fraction of a
// Pokémon's HP" units: damage dealt is good, damage taken is bad, and status
// moves are worth what they're likely to set up.
import type { SetsFile } from '@daily-battle/data';
import { legalChoices, type Rng, type SideView } from '@daily-battle/sim-bridge';
import type { Field, Pokemon } from '@smogon/calc';
import { candidates, type KnownSets } from './belief';
import {
  effectiveness,
  genFor,
  hit,
  makeField,
  makeMon,
  moveInfo,
  speed,
  typesOf,
  type Gen,
  type Hit,
} from './calc';
import type { Params } from './presets';
import { isMegaForme, megaInfo, moveId, type AIState, type FoeMon, type OwnMon } from './state';

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
  /** For damage: in Mega form if it has Mega Evolved or is assumed able to. */
  mon: Pokemon;
  /** For Speed: its current form, since it moves at its old Speed the turn it Mega Evolves (Gen 6). */
  spe: Pokemon;
  weight: number;
  moves: string[];
  physical: boolean;
  ability: string;
}

interface Ctx {
  gen: Gen;
  format: string;
  state: AIState;
  params: Params;
  cache: Map<string, Hit>;
  toFoe: Field;
  toOwn: Field;
}

const HAZARDS: Record<
  string,
  { key: 'sr' | 'spikes' | 'tspikes' | 'web'; max: number; value?: number }
> = {
  stealthrock: { key: 'sr', max: 1 },
  spikes: { key: 'spikes', max: 3 },
  toxicspikes: { key: 'tspikes', max: 2 },
  // Gen 6: slows instead of damaging, so worth a bit less.
  stickyweb: { key: 'web', max: 1, value: 0.6 },
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
/** Gen 6 changes: Electric types can't be paralyzed, Grass types ignore powder moves. */
const STATUS_GEN6: Record<string, string[]> = {
  ...STATUS,
  stunspore: ['Grass', 'Electric'],
  glare: ['Electric'],
};
/** Sleep moves, scored from Gen 6 with Sleep Clause; `true` marks powder moves. */
const SLEEP: Record<string, boolean> = {
  spore: true,
  sleeppowder: true,
  hypnosis: false,
  sing: false,
  lovelykiss: false,
  darkvoid: false,
  grasswhistle: false,
};
const POWDER = new Set(['spore', 'sleeppowder', 'stunspore', 'poisonpowder', 'ragepowder']);
const SELF_KO = new Set(['explosion', 'selfdestruct', 'memento']);

/**
 * One of ours for the calc, in Mega form if `mega` (it has Mega Evolved, or
 * will, Gen 6 on), else as it battles now.
 */
function ownCalc(gen: Gen, format: string, m: OwnMon, mega = isMegaForme(m.forme)): Pokemon {
  const info = mega ? megaInfo(format, m.species, m.set.item) : undefined;
  return makeMon(gen, {
    species: info?.forme ?? m.forme,
    item: m.set.item,
    ability: info?.ability ?? m.set.ability,
    nature: m.set.nature,
    evs: m.set.evs,
    ivs: m.set.ivs,
    boosts: m.boosts,
    status: m.status,
    hpFrac: m.hpFrac,
  });
}

/**
 * Top candidate sets for a foe Pokémon as calc Pokémon, weights renormalized.
 * A stone set counts in Mega form unless a teammate has already Mega Evolved.
 */
export function foeCands(
  foe: FoeMon,
  data: SetsFile,
  known?: KnownSets,
  foeMegaUsed = false,
): FoeCand[] {
  const top = candidates(foe, data, known, foeMegaUsed)
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4);
  const total = top.reduce((a, c) => a + c.weight, 0);
  const format = data.meta.format;
  const gen = genFor(format);
  return top.map(({ set, weight }) => {
    const mega = megaInfo(format, foe.species, set.item);
    const asMega = !!mega && (isMegaForme(foe.forme) || !foeMegaUsed);
    const spec = (species: string, ability: string) =>
      makeMon(gen, {
        species,
        item: set.item,
        ability,
        nature: set.nature,
        evs: set.evs,
        ivs: set.ivs,
        boosts: foe.boosts,
        status: foe.status,
        hpFrac: foe.hpFrac,
      });
    const mon = asMega ? spec(mega.forme, mega.ability) : spec(foe.forme, set.ability);
    return {
      mon,
      spe: asMega && !isMegaForme(foe.forme) ? spec(foe.forme, set.ability) : mon,
      weight: weight / total,
      moves: set.moves,
      physical: set.evs.atk >= 200,
      ability: asMega ? mega.ability : set.ability,
    };
  });
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

/** Cache key for one of ours: its slot, plus its forme once that's a Mega. */
const calcKey = (mon: OwnMon, calc: Pokemon) =>
  isMegaForme(calc.name) ? `${mon.slot}|${calc.name}` : `${mon.slot}`;

function bestOwnHit(ctx: Ctx, mon: OwnMon, calc: Pokemon, foes: FoeCand[]): Hit {
  let best: Hit = { frac: 0, ko: 0 };
  for (const move of mon.set.moves) {
    const h = ourHit(ctx, calc, calcKey(mon, calc), move, foes);
    if (h.frac > best.frac) best = h;
  }
  return best;
}

function probFirst(me: Pokemon, foes: FoeCand[], weather: string): number {
  const mine = speed(me, weather);
  return foes.reduce((p, f) => {
    const theirs = speed(f.spe, weather);
    return p + f.weight * (mine > theirs ? 1 : mine === theirs ? 0.5 : 0);
  }, 0);
}

/** Entry hazard damage (fraction of max HP) for one of ours switching in. */
function hazardCost(gen: Gen, state: AIState, mon: OwnMon): number {
  const s = state.ownSide;
  let cost = s.sr ? 0.125 * effectiveness(gen, 'Rock', mon.species) : 0;
  const grounded = !typesOf(gen, mon.species).includes('Flying') && mon.set.ability !== 'Levitate';
  if (grounded) cost += [0, 1 / 8, 1 / 6, 1 / 4][Math.min(3, s.spikes)]!;
  // Sticky Web (Gen 6): a Speed drop rather than damage.
  if (grounded && s.web) cost += 0.04;
  return cost;
}

/**
 * How good it is to have `mon` facing the foe's active: damage it can land
 * (weighted by the chance it moves before being knocked out), a bonus for
 * outspeeding and KOing, minus damage taken.
 */
function matchup(
  ctx: Ctx,
  mon: OwnMon,
  calc: Pokemon,
  foes: FoeCand[],
  /** Its Speed this turn, if not `calc`'s (a Mega Evolves at its old Speed). */
  spe: Pokemon = calc,
): number {
  const dealt = bestOwnHit(ctx, mon, calc, foes);
  const taken = theirHit(ctx, calc, calcKey(mon, calc), foes);
  const first = probFirst(spe, foes, ctx.state.weather);
  const lands = first + (1 - first) * (1 - taken.ko);
  return (
    ctx.params.damage * dealt.frac * lands +
    ctx.params.ko * dealt.ko * first -
    ctx.params.risk * taken.frac
  );
}

function resists(gen: Gen, mon: OwnMon, foes: FoeCand[]): boolean {
  const stab = new Set(foes.flatMap((f) => typesOf(gen, f.mon.name)));
  return [...stab].every((t) => effectiveness(gen, t, mon.species) < 1);
}

const hazardSeverity = (s: AIState['ownSide']) =>
  (s.sr ? 0.5 : 0) + 0.25 * s.spikes + 0.15 * s.tspikes + (s.web ? 0.2 : 0);

function makeCtx(state: AIState, params: Params, data: SetsFile): Ctx {
  const format = data.meta.format;
  return {
    gen: genFor(format),
    format,
    state,
    params,
    cache: new Map(),
    toFoe: makeField(state.weather, state.ownSide, state.foeSide, state.terrain),
    toOwn: makeField(state.weather, state.foeSide, state.ownSide, state.terrain),
  };
}

/** A move's priority for its user: Gale Wings and Prankster add one from Gen 6 here. */
function priority(ctx: Ctx, user: Pokemon, info: ReturnType<typeof moveInfo>): number {
  if (ctx.gen.num < 6) return info.priority;
  const galeWings = user.hasAbility('Gale Wings') && info.type === 'Flying';
  const prankster = user.hasAbility('Prankster') && info.category === 'Status';
  return info.priority + (galeWings || prankster ? 1 : 0);
}

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
  const ctx = makeCtx(state, params, data);
  const { gen } = ctx;
  const format = data.meta.format;
  const foe = state.foeActive;
  const foes = foe ? foeCands(foe, data, known, state.foeMegaUsed) : [];
  const ownBySlot = new Map(state.own.map((m) => [m.slot, m]));
  const calcs = new Map<string, Pokemon>();
  const calcFor = (m: OwnMon, mega = isMegaForme(m.forme)) => {
    const key = `${m.slot}|${mega}`;
    if (!calcs.has(key)) calcs.set(key, ownCalc(gen, format, m, mega));
    return calcs.get(key)!;
  };
  // A benched stone holder is rated in Mega form while our Mega is unused,
  // moving at its old Speed on the turn it Mega Evolves.
  const benchMatchup = (mon: OwnMon) =>
    mon.megaForme && !state.ownMegaUsed
      ? matchup(ctx, mon, calcFor(mon, true), foes, calcFor(mon))
      : matchup(ctx, mon, calcFor(mon), foes);

  const scoreSwitch = (slot: number, forced: boolean): number => {
    const mon = ownBySlot.get(slot);
    if (!mon || !foes.length) return 0;
    const calc = calcFor(mon);
    const entry = hazardCost(gen, state, mon);
    if (forced) return benchMatchup(mon) - entry;
    const active = state.ownActive!;
    const gain = benchMatchup(mon) - benchMatchup(active);
    // Regenerator (Gen 5) heals a third of max HP on the way out.
    const regen =
      active.set.ability === 'Regenerator'
        ? params.recover * Math.min(1 / 3, 1 - active.hpFrac)
        : 0;
    const freeHit = theirHit(ctx, calc, calcKey(mon, calc), foes).frac;
    return (
      params.position * gain -
      params.risk * freeHit -
      entry -
      params.switchPenalty +
      regen +
      (resists(gen, mon, foes) ? params.resistBias : 0)
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
  const meMega = state.canMega && me.megaForme ? calcFor(me, true) : undefined;
  const takenBy = (calc: Pokemon) =>
    foes.length ? theirHit(ctx, calc, calcKey(me, calc), foes) : { frac: 0, ko: 0 };
  const takenNow = takenBy(meCalc);
  // Mega Evolving, it still moves at its old Speed this turn (Gen 6).
  const first = foes.length ? probFirst(meCalc, foes, state.weather) : 0.5;
  const foesLeft = Math.max(1, state.foeTotal - state.foe.filter((f) => f.fainted).length);

  // Switch prediction (§8.4): sometimes aim at the foe's likely switch-in instead.
  let targets = foes;
  if (foe && rng() < params.predictionRate && bestOwnHit(ctx, me, meCalc, foes).frac >= 0.5) {
    const bench = state.foe.filter((f) => !f.active && !f.fainted);
    let safest: { cands: FoeCand[]; dmg: number } | undefined;
    for (const b of bench) {
      const cands = foeCands(b, data, known, state.foeMegaUsed);
      const dmg = bestOwnHit(ctx, me, meCalc, cands).frac;
      if (!safest || dmg < safest.dmg) safest = { cands, dmg };
    }
    if (safest) targets = safest.cands;
  }

  const request = view.request.requestType === 'move' ? view.request : null;
  const scored = legal.map((choice): ScoredAction => {
    const [kind, n, extra] = choice.split(' ');
    if (kind === 'switch') {
      return { choice, kind: 'switch', damage: 0, score: scoreSwitch(Number(n), false) };
    }
    // `move N mega` (Gen 6): the move from Mega form, which it keeps all battle.
    const mega = extra === 'mega' && meMega ? meMega : undefined;
    const calc = mega ?? meCalc;
    const taken = mega ? takenBy(mega) : takenNow;
    const slot = request?.active[0]?.moves[Number(n) - 1];
    const name = slot?.name ?? me.set.moves[Number(n) - 1] ?? '';
    const id = moveId(name);
    const info = moveInfo(gen, name);
    const dmg = foes.length
      ? ourHit(ctx, calc, calcKey(me, calc), name, targets)
      : { frac: 0, ko: 0 };
    const goesFirst = priority(ctx, calc, info) > 0 ? 1 : priority(ctx, calc, info) < 0 ? 0 : first;
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
    if (mega) score += params.mega;
    return { choice, kind: 'move', move: id, damage: dmg.frac, score };
  });

  // Average players click their strongest attack a lot (§8.4).
  const strongest = scored
    .filter((s) => s.kind === 'move' && s.damage > 0)
    .sort((a, b) => b.damage - a.damage)[0];
  if (strongest) strongest.score += params.maxDamageBias;
  return scored;
}

/**
 * Team Preview (Gen 5 on): how good each of ours is as the lead, one score per
 * own Pokémon in request order. It's the average matchup against the foe's six
 * (all healthy, sets by prior), plus half a hazard's early value for a setter,
 * which may not get the chance to set it.
 */
export function scoreLeads(
  state: AIState,
  params: Params,
  data: SetsFile,
  known?: KnownSets,
): number[] {
  const ctx = makeCtx(state, params, data);
  const { gen, format } = ctx;
  const foes = state.foe.map((f) => foeCands(f, data, known));
  const leadHazard = 0.5 * params.hazard * (1 + params.earlyHazardBonus);
  return state.own.map((mon) => {
    // A Mega set leads as its Mega (Gen 6), at its old Speed on the first turn.
    const base = ownCalc(gen, format, mon, false);
    const calc = mon.megaForme ? ownCalc(gen, format, mon, true) : base;
    const vs = foes.reduce((a, cands) => a + matchup(ctx, mon, calc, cands, base), 0);
    const setter = mon.set.moves.some((m) => moveId(m) in HAZARDS);
    return (foes.length ? vs / foes.length : 0) + (setter ? leadHazard : 0);
  });
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
  // Magic Bounce (Gen 5) sends hazards and status moves back at the user: worth
  // as much against us as they'd have been for us.
  const bounce = foes.reduce((a, f) => a + f.weight * (f.ability === 'Magic Bounce' ? 1 : 0), 0);
  const hazard = HAZARDS[id];
  if (hazard) {
    const current = state.foeSide[hazard.key];
    if ((typeof current === 'boolean' ? (current ? 1 : 0) : current) >= hazard.max) return -0.05;
    const early = state.turn <= 3 ? 1 + params.earlyHazardBonus : 1;
    const layerDecay = typeof current === 'number' ? 1 / (1 + current) : 1;
    const value = hazard.value ?? 1;
    return params.hazard * value * (foesLeft / 6) * early * layerDecay * (1 - 2 * bounce);
  }
  const gen6 = ctx.gen.num >= 6;
  // From Gen 6, Defog clears hazards on both sides: ours is the gain, theirs the cost.
  if (gen6 && id === 'defog') {
    const foeScreens = (state.foeSide.reflect ? 0.1 : 0) + (state.foeSide.lightScreen ? 0.1 : 0);
    return (
      params.spin * hazardSeverity(state.ownSide) -
      0.5 * params.spin * hazardSeverity(state.foeSide) +
      foeScreens -
      0.05
    );
  }
  if (gen6 && id in SLEEP) {
    if (!foe || foe.status || foe.substitute) return -0.05;
    // Sleep Clause: only one of the foe's team asleep at a time.
    if (state.foe.some((f) => !f.fainted && f.status === 'slp')) return -0.2;
    const types = typesOf(ctx.gen, foe.forme);
    const blocked = foes.reduce(
      (a, f) =>
        a +
        f.weight *
          (SLEEP[id] &&
          (types.includes('Grass') || f.ability === 'Overcoat' || f.mon.hasItem('Safety Goggles'))
            ? 1
            : 0),
      0,
    );
    return params.status * 1.3 * (1 - blocked) * (1 - 2 * bounce) - 0.2 * blocked;
  }
  if (SETUP.has(id)) {
    const boosted = Object.values(me.boosts).reduce((a, b) => a + Math.max(0, b), 0);
    return params.setup * Math.max(0, 1 - 2 * taken.frac) * (boosted < 4 ? 1 : 0.2);
  }
  if (id in STATUS) {
    if (!foe || foe.status || foe.substitute || foe.hpFrac < 0.4) return -0.05;
    const types = typesOf(ctx.gen, foe.forme);
    if ((gen6 ? STATUS_GEN6 : STATUS)[id]!.some((t) => types.includes(t))) return -0.2;
    if (gen6 && POWDER.has(id) && foes.every((f) => f.ability === 'Overcoat')) return -0.2;
    const physical = foes.reduce((a, f) => a + f.weight * (f.physical ? 1 : 0), 0);
    return params.status * (id === 'willowisp' ? 0.6 + 0.6 * physical : 1) * (1 - 2 * bounce);
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
