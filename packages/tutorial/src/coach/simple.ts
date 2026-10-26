// The Simple coach (DESIGN.md §22): blunder warnings and one-turn tips from
// what the player can see this turn. It never mentions predictions, reads, or
// plans over several turns.
import { turnFacts, type Facts, type MoveFact, type NoEffect } from '@daily-battle/ai';
import type { SetsFile } from '@daily-battle/data';
import type { SideView } from '@daily-battle/sim-bridge';
import { buildReview, decision, type Decision, type Review } from './review';

export type CoachRule =
  | 'noEffect'
  | 'canKo'
  | 'staysKo'
  | 'switchKo'
  | 'koThreat'
  | 'foeAsleep'
  | 'locked'
  | 'spikes'
  | 'walled'
  | 'setupWindow';

export interface CoachNote {
  rule: CoachRule;
  text: string;
  /** The lesson that explains it, if any. */
  lesson?: string;
}

export interface CoachTurn {
  /** At most one tip a turn. */
  tip?: CoachNote;
  /** A warning for each choice the coach would stop, by choice (`move 2`, `switch 4`). */
  warnings: Record<string, CoachNote>;
}

/** Likely enough to call a knockout. */
const SURE_KO = 0.85;
/** Sure enough to say who moves first. */
const SURE_FIRST = 0.95;
/** A hit this small (fraction of max HP) is one a switch-in takes well. */
const SAFE_HIT = 0.4;

const SETUP = new Set(['dragondance', 'calmmind', 'swordsdance', 'bulkup', 'curse', 'agility']);
const PROTECT = new Set(['protect', 'detect', 'endure']);
/** Moves that knock out the user too: never the move to recommend. */
const SELF_KO = new Set(['explosion', 'selfdestruct', 'memento', 'healingwish', 'lunardance']);

type LessonKey = CoachRule | 'status' | 'hazard';

/** The lesson behind each rule, per game. */
const LESSONS: Record<string, Partial<Record<LessonKey, string>>> = {
  gen3ou: {
    noEffect: 'gen3-types',
    status: 'gen3-status',
    hazard: 'gen3-spikes',
    canKo: 'gen3-winning',
    staysKo: 'gen3-switching',
    switchKo: 'gen3-switching',
    koThreat: 'gen3-speed',
    foeAsleep: 'gen3-status',
    locked: 'gen3-items',
    spikes: 'gen3-spikes',
    walled: 'gen3-switching',
    setupWindow: 'gen3-setup',
  },
};

const STATUS_WORD: Record<string, string> = {
  tox: 'poisoned',
  psn: 'poisoned',
  brn: 'burned',
  par: 'paralyzed',
  slp: 'put to sleep',
};

const CHOICE_ITEMS: Record<string, string> = {
  choiceband: 'Choice Band',
  choicespecs: 'Choice Specs',
  choicescarf: 'Choice Scarf',
};

/** Why a move does nothing, in one sentence. */
export function noEffectText(foe: string, move: string, why: NoEffect): string {
  switch (why.kind) {
    case 'type':
      return `${foe} is immune to ${why.type} moves, so ${move} will do nothing.`;
    case 'ability':
      return why.type
        ? `${foe}’s ${why.ability} blocks ${why.type} moves, so ${move} will do nothing.`
        : `${foe}’s ${why.ability} protects it from that status, so ${move} will fail.`;
    case 'statused':
      return `${foe} already has a status, so ${move} will fail.`;
    case 'statusImmune':
      return `${why.type} types can’t be ${STATUS_WORD[why.status] ?? 'statused'}, so ${move} will fail on ${foe}.`;
    case 'sleepClause':
      return `Sleep Clause: one of their Pokémon is already asleep from your move, so ${move} will fail.`;
    case 'substitute':
      return `${foe}’s Substitute blocks ${move}.`;
    case 'hazardMax':
      return why.hazard === 'Spikes'
        ? `Spikes are already at the maximum of three layers, so ${move} will fail.`
        : `${why.hazard} is already up, so ${move} will fail.`;
  }
}

/**
 * Turns between tips, so the coach doesn't talk every turn (a tip on turn 4
 * means none on turns 5 and 6). A tip held back can still show later. Urgent
 * tips (a knockout either way) need only one quiet turn. Warnings aren't paced:
 * they only appear when the player picks the blunder.
 */
export const TIP_GAP = 3;
const URGENT_GAP = 2;
const URGENT = new Set<CoachRule>(['koThreat', 'canKo']);
export const tipGap = (rule: CoachRule) => (URGENT.has(rule) ? URGENT_GAP : TIP_GAP);

/** The coach for one battle. It remembers which one-time tips it has shown. */
export class Coach {
  private readonly lessons: Partial<Record<LessonKey, string>>;
  private readonly seen = new Set<string>();
  /** Warnings the player chose to ignore: they don't ask again this battle. */
  private readonly overridden = new Set<string>();
  private lastTip = -Infinity;
  private spikesSeen = 0;
  private last?: {
    request: SideView['request'];
    facts: Facts;
    warnings: Record<string, CoachNote>;
  };
  private readonly decisions: Decision[] = [];
  private recorded = false;
  /** The tip given for a request, so asking again about it gives the same answer. */
  private tipFor?: { request: SideView['request']; tip?: CoachNote };

  constructor(
    private readonly data: SetsFile,
    format: string = data.meta.format,
  ) {
    this.lessons = LESSONS[format] ?? {};
  }

  private note(rule: CoachRule, text: string, key: LessonKey = rule): CoachNote {
    const lesson = this.lessons[key];
    return lesson ? { rule, text, lesson } : { rule, text };
  }

  /** Tips and warnings for the player's current request. */
  turn(view: SideView): CoachTurn {
    if (view.request.requestType === 'wait') return { warnings: {} };
    const facts = this.factsFor(view);
    const warnings = this.warnings(facts);
    for (const [choice, note] of Object.entries(warnings))
      if (this.overridden.has(note.text)) delete warnings[choice];
    this.last = { request: view.request, facts, warnings };
    const turn = facts.state.turn;
    if (this.last.request === this.tipFor?.request) {
      const tip = this.tipFor.tip;
      return tip ? { tip, warnings } : { warnings };
    }
    const quiet = turn - this.lastTip;
    const tip =
      quiet >= URGENT_GAP ? this.pickTip(view, facts, (r) => quiet >= tipGap(r)) : undefined;
    if (tip) this.lastTip = turn;
    this.tipFor = { request: view.request, tip };
    return tip ? { tip, warnings } : { warnings };
  }

  /**
   * Remembers the player's choice for the post-battle review. Call it before
   * the choice is played, while the view still shows the decision. `shown` is
   * the warning the player saw and overrode, if any (the judge decides which
   * warnings show); without it, any rule warning on the choice counts.
   */
  record(view: SideView, choice: string, shown?: CoachNote | null): void {
    this.recorded = false;
    if (view.request.requestType === 'wait') return;
    const facts = this.factsFor(view);
    const warning =
      shown !== undefined
        ? (shown ?? undefined)
        : this.last?.request === view.request
          ? this.last.warnings[choice]
          : undefined;
    if (warning) this.overridden.add(warning.text);
    const d = decision(view, facts, this.data, choice, warning);
    if (d) this.decisions.push(d);
    this.recorded = !!d;
  }

  /** Drops the last recorded choice (the sim turned it down, so the player chooses again). */
  forget(): void {
    if (this.recorded) this.decisions.pop();
    this.recorded = false;
  }

  review(): Review {
    return buildReview(this.decisions, {
      switching: this.lessons.switchKo,
      attacking: this.lessons.canKo,
    });
  }

  private factsFor(view: SideView): Facts {
    return this.last?.request === view.request ? this.last.facts : turnFacts(view, this.data);
  }

  /** A move that very likely knocks the foe out before it can stop it. */
  private koMove(f: Facts): MoveFact | undefined {
    const lands = (m: MoveFact) => m.first >= SURE_FIRST || (f.threat?.ko ?? 0) <= 0.1;
    return f.moves
      .filter((m) => !m.noEffect && !SELF_KO.has(m.id) && m.ko >= SURE_KO && lands(m))
      .sort((a, b) => b.ko - a.ko)[0];
  }

  /** A teammate that takes the foe's best hit well. */
  private safeSwitch(f: Facts) {
    return f.switches
      .filter(
        (s) =>
          s.taken.ko < 0.05 &&
          s.taken.frac + s.entry <= SAFE_HIT &&
          s.taken.frac + s.entry <= (f.threat?.frac ?? 0) / 2,
      )
      .sort((a, b) => a.taken.frac - b.taken.frac)[0];
  }

  private warnings(f: Facts): Record<string, CoachNote> {
    const out: Record<string, CoachNote> = {};
    const { foe, me, threat } = f;
    if (!foe || !me || f.forced) return out;
    const ko = this.koMove(f);
    const myHp = f.state.ownActive?.hpFrac ?? 0;
    const safe = this.safeSwitch(f);

    for (const m of f.moves) {
      if (m.noEffect) {
        const key: LessonKey =
          m.noEffect.kind === 'hazardMax'
            ? 'hazard'
            : m.category === 'Status' && m.noEffect.kind !== 'type'
              ? 'status'
              : 'noEffect';
        out[m.choice] = this.note('noEffect', noEffectText(foe, m.name, m.noEffect), key);
      } else if (ko && ko !== m && m.ko < 0.5) {
        out[m.choice] = this.note(
          'canKo',
          `${ko.name} can knock out ${foe} this turn. ${m.name} won’t.`,
        );
      } else if (
        threat &&
        safe &&
        threat.ko >= 0.9 &&
        m.first <= 1 - SURE_FIRST &&
        myHp >= 0.5 &&
        !PROTECT.has(m.id)
      ) {
        out[m.choice] = this.note(
          'staysKo',
          `${foe} is faster and can knock out ${me} with ${threat.move} this turn. ${safe.species} takes that hit much better.`,
        );
      }
    }
    for (const s of f.switches) {
      if (ko) {
        out[s.choice] = this.note('canKo', `${ko.name} can knock out ${foe} this turn.`);
      } else if (s.taken.ko >= SURE_KO) {
        out[s.choice] = this.note(
          'switchKo',
          `${foe}’s ${s.taken.move} can knock out ${s.species} as it switches in.`,
        );
      } else if (s.taken.effectiveness >= 4 && s.taken.frac >= 0.5) {
        out[s.choice] = this.note(
          'switchKo',
          `${s.species} takes 4× damage from ${s.taken.type} moves like ${foe}’s ${s.taken.move}.`,
        );
      }
    }
    return out;
  }

  private once(key: string): boolean {
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    return true;
  }

  private pickTip(
    view: SideView,
    f: Facts,
    ok: (rule: CoachRule) => boolean,
  ): CoachNote | undefined {
    const { state } = f;
    // Spikes: once per new layer, and again if they come back after a spin.
    const layers = state.ownSide.spikes;
    if (layers < this.spikesSeen) this.spikesSeen = layers;
    if (layers > this.spikesSeen && ok('spikes')) {
      this.spikesSeen = layers;
      const spinner = state.own.find((m) => !m.fainted && hasMove(view, m.slot, 'rapidspin'));
      return this.note(
        'spikes',
        'Spikes are on your side: each Pokémon you switch in loses HP, except Flying types and Pokémon with Levitate.' +
          (spinner ? ` ${spinner.species}’s Rapid Spin clears them.` : ''),
      );
    }
    const { foe, me, threat } = f;
    if (!foe || !me || f.forced) return undefined;

    if (
      threat &&
      threat.ko >= 0.9 &&
      f.foeFirst >= SURE_FIRST &&
      ok('koThreat') &&
      this.once(`threat:${me}:${foe}`)
    ) {
      return this.note('koThreat', `${foe} is faster than ${me} and can knock it out this turn.`);
    }
    const ko = this.koMove(f);
    if (ko && ok('canKo') && this.once(`ko:${me}:${foe}:${ko.id}`))
      return this.note('canKo', `${ko.name} can knock out ${foe} this turn.`);

    if (
      state.foeActive?.status === 'slp' &&
      (f.foeMoves.sleeptalk ?? 0) < 0.2 &&
      ok('foeAsleep') &&
      this.once(`slp:${foe}:${sleepStart(view, foe)}`)
    ) {
      return this.note('foeAsleep', `${foe} is asleep and can’t attack while it sleeps.`);
    }

    const item = CHOICE_ITEMS[activeItem(view)];
    if (
      f.lockedInto &&
      item &&
      ok('locked') &&
      this.once(`lock:${me}:${f.lockedInto}:${switchedIn(view)}`)
    ) {
      return this.note('locked', `${item} locks ${me} into ${f.lockedInto} until it switches out.`);
    }

    const attacks = f.moves.filter((m) => m.category !== 'Status');
    const useful = f.moves.filter((m) => m.category === 'Status' && !m.noEffect);
    const best = Math.max(0, ...attacks.map((m) => m.damage));
    if (attacks.length && !useful.length && best < 0.2) {
      const better = f.switches
        .filter((s) => s.best >= Math.max(0.3, 2.5 * best) && s.taken.ko < 0.05)
        .sort((a, b) => b.best - a.best)[0];
      if (better && ok('walled') && this.once(`walled:${me}:${foe}`)) {
        return this.note(
          'walled',
          `${me}’s attacks do little damage to ${foe}. ${better.species} hits it much harder.`,
        );
      }
    }

    const setup = f.moves.find((m) => SETUP.has(m.id));
    const boosted = Object.values(state.ownActive?.boosts ?? {}).reduce(
      (a: number, b) => a + Math.max(0, b ?? 0),
      0,
    );
    if (
      setup &&
      threat &&
      threat.frac <= 0.2 &&
      threat.ko === 0 &&
      (state.ownActive?.hpFrac ?? 0) >= 0.6 &&
      boosted < 2 &&
      ok('setupWindow') &&
      this.once(`setup:${me}:${foe}`)
    ) {
      return this.note(
        'setupWindow',
        `${foe} can barely hurt ${me}: a good chance to use ${setup.name}.`,
      );
    }
    return undefined;
  }
}

function hasMove(view: SideView, slot: number, id: string): boolean {
  if (view.request.requestType === 'wait') return false;
  return (
    (view.request.side.pokemon[slot - 1]?.moves as readonly string[] | undefined)?.includes(id) ??
    false
  );
}

function activeItem(view: SideView): string {
  if (view.request.requestType === 'wait') return '';
  return view.request.side.pokemon.find((p) => p.active)?.item ?? '';
}

/** The log index where the foe's active last fell asleep, so a new sleep gets a new tip. */
function sleepStart(view: SideView, foe: string): number {
  const side = view.side === 'p1' ? 'p2' : 'p1';
  for (let i = view.log.length - 1; i >= 0; i--)
    if (view.log[i]!.startsWith(`|-status|${side}a: ${foe}|slp`)) return i;
  return -1;
}

/** The log index where our active last came in, so each new lock gets its own tip. */
function switchedIn(view: SideView): number {
  for (let i = view.log.length - 1; i >= 0; i--) {
    const line = view.log[i]!;
    if (line.startsWith(`|switch|${view.side}a:`) || line.startsWith(`|drag|${view.side}a:`))
      return i;
  }
  return -1;
}
