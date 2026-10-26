// Warnings from the judge (DESIGN.md §22): the judge decides that a pick is
// clearly worse than its top choice; this file says why, in plain words. A
// warning needs a reason that is true in the position and relevant to the
// gap (the top choice avoids the risk named). With no such reason the coach
// stays quiet, rather than guess at why the search prefers something.
//
// A warning is one risk sentence about the pick, then, when one is true, one
// sentence about the top choice. No odds from the search.
import type { Facts, MoveFact, NoEffect, SwitchFact } from '@daily-battle/ai';
import type { SideView } from '@daily-battle/sim-bridge';
import { NO_EFFECT_LESSON, REASON_LESSON } from './course';
import type { Verdict } from './judge';
import { noEffectText } from './simple';

export type WarningReason =
  | 'noEffect'
  | 'switchKo'
  | 'bigHit'
  | 'staysKo'
  | 'missedKo'
  | 'noTime'
  | 'noSpikes'
  | 'weaker'
  | 'selfKo'
  | 'explosion'
  | 'fails'
  | 'slower'
  | 'noHeal';

/**
 * Reasons the coach keeps quiet about against each opponent, because they
 * didn't pass the offline check there (docs/plan-tutorial-coach.md, step 4:
 * the gain's 95% CI above zero, at most 5% of cases clearly worse).
 *   - Easy: warning against an Explosion pick (+2.6, CI −0.2 to +5.3; Easy
 *     rarely answers Explosion, so it works anyway).
 *   - Normal: recommending Explosion (10 cases; quiet until a bigger run).
 *   - Hard: not checked yet (step 5); the coach isn't offered there.
 */
export const QUIET_REASONS: Record<'easy' | 'normal' | 'hard', readonly WarningReason[]> = {
  easy: ['selfKo'],
  normal: ['explosion'],
  hard: ['explosion', 'selfKo'],
};

/**
 * Reasons not yet checked offline against the daily opponents (coach-eval):
 * lessons use them, dailies stay quiet until they pass.
 */
export const UNCHECKED_REASONS: readonly WarningReason[] = ['slower', 'noHeal'];

export interface Explanation {
  reason: WarningReason;
  text: string;
  /** For `noEffect`: why the move does nothing. */
  noEffect?: NoEffect['kind'];
}

/** What the coach may say: reasons quiet against this opponent, and (in a lesson) the lessons taught so far. */
export interface Scope {
  quiet?: readonly WarningReason[];
  /** In a lesson: the last lesson the player has reached; ideas taught later stay quiet. */
  taught?: number;
}

/** Whether an explanation's idea has been taught by lesson `taught` (always, outside lessons). */
export function inScope(e: Explanation, taught = Infinity): boolean {
  if (taught === Infinity) return true;
  const lesson = e.noEffect ? NO_EFFECT_LESSON[e.noEffect] : REASON_LESSON[e.reason];
  return lesson !== null && lesson <= taught;
}

/** Likely enough to call a knockout. */
const SURE_KO = 0.85;
/** Sure enough to say who moves first. */
const SURE_FIRST = 0.95;
/** A switch-in hit (with Spikes) this big is a big hit. */
const BIG_HIT = 0.4;
/** A hit this small is one a switch-in takes well. */
const SAFE_HIT = 0.25;
/** Worn down enough that a free turn is worth spending on healing. */
const HEAL_BELOW = 0.6;
/** An attack this much stronger (fraction of the foe's HP) is worth naming. */
const STRONGER = 0.2;
/** Leading by this many Pokémon's worth of HP: the player is winning anyway. */
export const WINNING_LEAD = 2;

const SELF_KO = new Set(['explosion', 'selfdestruct']);
const PROTECT = new Set(['protect', 'detect', 'endure']);
/** Healing moves that fail at full HP. */
const HEAL = new Set([
  'rest',
  'recover',
  'softboiled',
  'milkdrink',
  'slackoff',
  'moonlight',
  'morningsun',
  'synthesis',
]);
/** Below this much HP, saving our active isn't worth a switch: no "staysKo" warning. */
const WORTH_SAVING = 0.3;

/** "about 45%", to the nearest 5, and never "about 100%" (that would be a knockout). */
const about = (frac: number) => `about ${Math.min(95, Math.max(5, Math.round(frac * 20) * 5))}%`;

/**
 * The player leads by at least `WINNING_LEAD` Pokémon's worth of HP (the
 * foe's unseen Pokémon count as full), so a warning wouldn't change the result.
 */
export function winningAnyway(f: Facts): boolean {
  const { own, foe, foeTotal } = f.state;
  const hp = (mons: { fainted: boolean; hpFrac: number }[]) =>
    mons.reduce((t, m) => t + (m.fainted ? 0 : m.hpFrac), 0);
  const unseen = Math.max(0, foeTotal - foe.length);
  return hp(own) - (hp(foe) + unseen) >= WINNING_LEAD;
}

/** Our active is seeded (Rapid Spin clears Leech Seed too). */
function seeded(view: SideView): boolean {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const line = view.log[i]!;
    if (line.startsWith(`|switch|${view.side}a:`) || line.startsWith(`|drag|${view.side}a:`))
      return false;
    if (line.startsWith(`|-start|${view.side}a:`) && line.includes('Leech Seed')) return true;
  }
  return false;
}

/** Whether a move knocks the foe out before it can act (or the foe can't knock us out first). */
function lands(f: Facts, m: MoveFact): boolean {
  return m.first >= SURE_FIRST || (f.threat?.ko ?? 0) <= 0.1;
}

/** Our Pokémon's name, as "Your Regice" when the foe's active is one too. */
const mine = (species: string, foe: string) => (species === foe ? `Your ${species}` : species);

const isAttack = (m?: MoveFact) => !!m && m.category !== 'Status' && !m.noEffect;

/**
 * Why `verdict.choice` is clearly worse than `verdict.top`, or undefined when no
 * reason is both true and relevant (then the coach stays quiet).
 */
export function explainWarning(
  view: SideView,
  f: Facts,
  verdict: Verdict,
  /** What the coach may say (`QUIET_REASONS` for the opponent, and the lessons taught). */
  scope: Scope = {},
): Explanation | undefined {
  const e = explain(view, f, verdict, scope.quiet ?? []);
  return e && inScope(e, scope.taught) ? e : undefined;
}

function explain(
  view: SideView,
  f: Facts,
  verdict: Verdict,
  quiet: readonly WarningReason[],
): Explanation | undefined {
  if (!verdict.worse || !f.foe || !f.me || f.forced) return undefined;
  if (winningAnyway(f)) return undefined;
  const foe = f.foe;
  const me = f.me;
  const move = (c: string) => f.moves.find((m) => m.choice === c);
  const sw = (c: string) => f.switches.find((s) => s.choice === c);
  const pm = move(verdict.choice);
  const ps = sw(verdict.choice);
  const tm = move(verdict.top);
  const ts = sw(verdict.top);
  const threat = f.threat;
  /** How hard the foe hits the pick's Pokémon this turn. */
  const pickHit = ps ? ps.taken.frac + ps.entry : (threat?.frac ?? 0);
  const topHit = ts ? ts.taken.frac + ts.entry : (threat?.frac ?? 0);

  /** The second sentence: what the top choice does, when it's true and worth saying. */
  const better = (): string => {
    if (tm) {
      if (SELF_KO.has(tm.id) || !isAttack(tm)) return '';
      if (tm.ko >= SURE_KO) return ` ${tm.name} can knock out ${foe}.`;
      if (tm.damage >= (isAttack(pm) ? pm!.damage : 0) + STRONGER)
        return ` ${tm.name} does ${about(tm.damage)} to ${foe}.`;
      return '';
    }
    if (ts && ts.taken.ko < 0.05 && topHit <= SAFE_HIT && topHit <= pickHit / 2)
      return ` ${mine(ts.species, foe)} takes ${foe}’s hits much better.`;
    return '';
  };
  const out = (reason: WarningReason, text: string) =>
    quiet.includes(reason) ? undefined : { reason, text };

  // The top choice is Explosion: say what it costs.
  if (
    !quiet.includes('explosion') &&
    tm &&
    SELF_KO.has(tm.id) &&
    tm.ko >= SURE_KO &&
    lands(f, tm) &&
    (pm?.ko ?? 0) < 0.5
  )
    return out(
      'explosion',
      `${tm.name} can knock out ${foe}, though it knocks out ${me} too. ` +
        (pm ? `${pm.name} won’t knock ${foe} out.` : `Switching won’t knock ${foe} out.`),
    );

  if (pm?.noEffect) {
    const e = out('noEffect', noEffectText(foe, pm.name, pm.noEffect) + better());
    return e && { ...e, noEffect: pm.noEffect.kind };
  }

  // The foe is faster and knocks you out before your move lands.
  if (
    !quiet.includes('slower') &&
    pm &&
    threat &&
    threat.ko >= SURE_KO &&
    pm.first <= 1 - SURE_FIRST &&
    !PROTECT.has(pm.id) &&
    !SELF_KO.has(pm.id)
  ) {
    const rest =
      tm && !SELF_KO.has(tm.id) && tm.first >= SURE_FIRST && tm.ko >= SURE_KO
        ? ` ${tm.name} goes first and knocks ${foe} out.`
        : ts &&
            ts.taken.ko < 0.05 &&
            (f.state.ownActive?.hpFrac ?? 0) >= WORTH_SAVING &&
            topHit <= Math.max(SAFE_HIT, threat.frac / 2)
          ? ` ${mine(ts.species, foe)} takes ${foe}’s hits much better.`
          : '';
    if (rest)
      return out(
        'slower',
        `${foe} is faster and can knock ${me} out before ${pm.name} lands.${rest}`,
      );
  }

  // A KO the pick passes up.
  if (
    tm &&
    !SELF_KO.has(tm.id) &&
    tm.ko >= SURE_KO &&
    lands(f, tm) &&
    (pm ? pm.ko < 0.5 && !SELF_KO.has(pm.id) : true)
  )
    return out(
      'missedKo',
      `${tm.name} can knock out ${foe} this turn.` + (isAttack(pm) ? ` ${pm!.name} won’t.` : ''),
    );

  if (ps) return explainSwitch(f, ps, ts, topHit, better);

  if (!pm) return undefined;
  // Explosion picked where it likely won't take the foe down.
  if (SELF_KO.has(pm.id) && pm.ko < 0.3)
    return out(
      'selfKo',
      `${pm.name} knocks out ${me}, but it won’t knock out ${foe}.` +
        (tm && isAttack(tm) ? better() : ''),
    );
  if (SELF_KO.has(pm.id)) return undefined;

  // Healing at full HP fails.
  // Moves that fail here.
  if (HEAL.has(pm.id) && (f.state.ownActive?.hpFrac ?? 0) >= 1)
    return out('fails', `${me} is at full HP, so ${pm.name} will do nothing.` + better());
  if (pm.id === 'sleeptalk' && f.state.ownActive?.status !== 'slp')
    return out('fails', `${me} isn’t asleep, so Sleep Talk will fail.` + better());

  // Staying in to be knocked out, when a switch takes the hit.
  if (
    threat &&
    ts &&
    threat.ko >= 0.5 &&
    (f.state.ownActive?.hpFrac ?? 0) >= WORTH_SAVING &&
    !PROTECT.has(pm.id) &&
    !(pm.ko >= SURE_KO && pm.first >= SURE_FIRST) &&
    ts.taken.ko < 0.05 &&
    topHit <= Math.max(SAFE_HIT, threat.frac / 2)
  )
    return out(
      'staysKo',
      `Risky: ${foe} can knock out ${me} this turn. ${mine(ts.species, foe)} takes the hit much better.`,
    );

  // A free turn to heal: the foe can barely hurt you, you're worn down, and the better pick heals.
  if (
    tm &&
    HEAL.has(tm.id) &&
    isAttack(pm) &&
    (f.state.ownActive?.hpFrac ?? 1) <= HEAL_BELOW &&
    (!threat || threat.frac <= SAFE_HIT)
  )
    return out('noHeal', `${foe} can barely hurt ${me}: a free turn to heal with ${tm.name}.`);

  // Rapid Spin with nothing to clear.
  if (pm.id === 'rapidspin' && f.state.ownSide.spikes === 0 && !seeded(view)) {
    return out(
      'noSpikes',
      `There are no Spikes on your side to clear, so Rapid Spin only does a little damage.` +
        better(),
    );
  }

  // A status or setup move while the foe hits hard.
  if (
    pm.category === 'Status' &&
    !PROTECT.has(pm.id) &&
    pm.id !== 'batonpass' &&
    pm.id !== 'sleeptalk' &&
    threat &&
    threat.frac >= 0.35 &&
    (isAttack(tm) || (ts && topHit <= threat.frac / 2))
  ) {
    const rest = better();
    if (rest)
      return out('noTime', `No time for ${pm.name}: ${foe} can hit ${me} hard this turn.` + rest);
  }

  // A much weaker attack.
  if (isAttack(pm) && isAttack(tm) && !SELF_KO.has(tm!.id) && tm!.damage >= pm.damage + STRONGER)
    return out(
      'weaker',
      (tm!.ko >= SURE_KO
        ? `${tm!.name} can knock out ${foe}.`
        : `${tm!.name} does ${about(tm!.damage)} to ${foe}.`) +
        ` ${pm.name} does ${about(pm.damage)}.`,
    );
  return undefined;
}

function explainSwitch(
  f: Facts,
  ps: SwitchFact,
  ts: SwitchFact | undefined,
  topHit: number,
  better: () => string,
): Explanation | undefined {
  const foe = f.foe!;
  const hit = ps.taken.frac + ps.entry;
  // The top choice must avoid the risk: not a switch-in that takes as much.
  if (ts && ts.taken.ko >= 0.5) return undefined;
  if (ps.taken.ko >= 0.5)
    return {
      reason: 'switchKo',
      text:
        `Risky: if ${foe} uses ${ps.taken.move}, ${ps.species === foe ? `your ${foe}` : ps.species} is knocked out as it comes in.` +
        better(),
    };
  if (hit >= BIG_HIT && topHit <= hit - 0.2)
    return {
      reason: 'bigHit',
      text:
        `Risky: ${mine(ps.species, foe)} takes a big hit coming in, ${about(hit)} from ${ps.taken.move}.` +
        better(),
    };
  return undefined;
}
