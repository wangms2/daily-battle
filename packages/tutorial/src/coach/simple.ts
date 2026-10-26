// The Simple coach (DESIGN.md §22): blunder warnings and one-turn tips from
// what the player can see this turn. It never mentions predictions, reads, or
// plans over several turns. The judge (judge.ts) decides: a warning needs it to
// find the pick clearly worse (explain.ts says why), and a tip that recommends
// an action needs that action to be its top choice.
import { turnFacts, type Facts, type MoveFact, type NoEffect } from '@daily-battle/ai';
import type { SetsFile } from '@daily-battle/data';
import type { SideView } from '@daily-battle/sim-bridge';
import {
  explainWarning,
  QUIET_REASONS,
  UNCHECKED_REASONS,
  type Explanation,
  type WarningReason,
} from './explain';
import type { Verdict } from './judge';
import { TIP_LESSON } from './course';
import { buildReview, decision, type Decision, type Heeded, type Review } from './review';

/** The kinds of tip. Warnings have their own reasons (`WarningReason`, explain.ts). */
export type CoachRule =
  'canKo' | 'koThreat' | 'foeAsleep' | 'locked' | 'spikes' | 'walled' | 'setupWindow';

export interface CoachNote {
  rule: CoachRule | WarningReason;
  text: string;
  /** The lesson that explains it, if any. */
  lesson?: string;
}

export interface CoachTurn {
  /** At most one tip a turn. */
  tip?: CoachNote;
  /**
   * A tip waits for the judge: it shows late, once the judge's top choice is
   * known (see `Coach.confirm`).
   */
  pending?: boolean;
}

/** A tip candidate. One that recommends `choice` needs the judge's top choice to be it. */
interface Candidate {
  note: CoachNote;
  /** Its one-time key, marked when it shows. */
  key?: string;
  choice?: string;
}

/** Likely enough to call a knockout. */
const SURE_KO = 0.85;
/** Sure enough to say who moves first. */
const SURE_FIRST = 0.95;

const SETUP = new Set(['dragondance', 'calmmind', 'swordsdance', 'bulkup', 'curse', 'agility']);
/** Moves that knock out the user too: never the move to recommend. */
const SELF_KO = new Set(['explosion', 'selfdestruct', 'memento', 'healingwish', 'lunardance']);

type LessonKey = CoachRule | WarningReason | 'status' | 'hazard';

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
    slower: 'gen3-speed',
    foeAsleep: 'gen3-status',
    locked: 'gen3-items',
    spikes: 'gen3-spikes',
    walled: 'gen3-switching',
    setupWindow: 'gen3-setup',
    bigHit: 'gen3-switching',
    missedKo: 'gen3-winning',
    weaker: 'gen3-winning',
    noTime: 'gen3-setup',
    noSpikes: 'gen3-spikes',
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
const URGENT = new Set<CoachNote['rule']>(['koThreat', 'canKo']);
export const tipGap = (rule: CoachNote['rule']) => (URGENT.has(rule) ? URGENT_GAP : TIP_GAP);

/** The coach for one battle. It remembers which one-time tips it has shown. */
export class Coach {
  private readonly lessons: Partial<Record<LessonKey, string>>;
  private readonly seen = new Set<string>();
  /** Warnings the player chose to ignore: they don't ask again this battle. */
  private readonly overridden = new Set<string>();
  private lastTip = -Infinity;
  private spikesSeen = 0;
  private last?: { request: SideView['request']; facts: Facts };
  private readonly decisions: Decision[] = [];
  /** Choices recorded so far (each `record` call), so a decision knows its index. */
  private choices = 0;
  private recorded = false;
  /** The tip given for a request, so asking again about it gives the same answer. */
  private tipFor?: {
    request: SideView['request'];
    tip?: CoachNote;
    /** Candidates waiting for the judge's top choice, in order. */
    pending?: Candidate[];
  };

  /** Warning reasons the coach keeps quiet about against this opponent. */
  private readonly quiet: readonly WarningReason[];

  constructor(
    private readonly data: SetsFile,
    format: string = data.meta.format,
    /** The opponent's difficulty (lesson foes count as Easy): some reasons are quiet against some. */
    difficulty: keyof typeof QUIET_REASONS = 'normal',
    /**
     * In a lesson: the last lesson the player has reached. The coach then only
     * talks about ideas taught by then (course.ts).
     */
    private readonly taught = Infinity,
  ) {
    this.lessons = LESSONS[format] ?? {};
    // Reasons not checked against the daily opponents yet are for lessons only.
    this.quiet = [...QUIET_REASONS[difficulty], ...(taught === Infinity ? UNCHECKED_REASONS : [])];
  }

  private note(rule: CoachRule, text: string, key: LessonKey = rule): CoachNote {
    const lesson = this.lessons[key];
    return lesson ? { rule, text, lesson } : { rule, text };
  }

  /** The tip for the player's current request, or word that one waits for the judge. */
  turn(view: SideView): CoachTurn {
    if (view.request.requestType === 'wait') return {};
    const facts = this.factsFor(view);
    this.last = { request: view.request, facts };
    if (view.request === this.tipFor?.request) return this.answer();
    this.tipFor = { request: view.request };
    const quiet = facts.state.turn - this.lastTip;
    if (quiet < URGENT_GAP) return {};
    const candidates = this.tipCandidates(view, facts, (r) => quiet >= tipGap(r));
    // A fact tip before any that needs the judge shows now; otherwise they wait.
    const first = candidates.findIndex((c) => !c.choice);
    if (first === 0) this.show(candidates[0]!, facts);
    else if (candidates.length)
      this.tipFor.pending = first < 0 ? candidates : candidates.slice(0, first + 1);
    return this.answer();
  }

  private answer(): CoachTurn {
    const t = this.tipFor;
    return t?.tip ? { tip: t.tip } : t?.pending ? { pending: true } : {};
  }

  private show(c: Candidate, facts: Facts) {
    if (c.key) this.seen.add(c.key);
    this.lastTip = facts.state.turn;
    this.tipFor!.tip = c.note;
  }

  /**
   * The judge's top choice for the current request is known: the first waiting
   * tip that's a fact or recommends `top`, if any. Call it at most once a request.
   */
  confirm(view: SideView, top: string): CoachNote | undefined {
    const t = this.tipFor;
    if (!t?.pending || t.request !== view.request) return undefined;
    const hit = t.pending.find((c) => !c.choice || c.choice === top);
    delete t.pending;
    if (!hit) return undefined;
    this.show(hit, this.factsFor(view));
    return hit.note;
  }

  /**
   * The warning on `verdict.choice`, if the judge finds it clearly worse and a
   * true reason explains why (explain.ts). A warning the player overrode isn't
   * repeated this battle.
   */
  warn(view: SideView, verdict: Verdict): CoachNote | undefined {
    if (view.request.requestType === 'wait') return undefined;
    const facts = this.factsFor(view);
    const e = explainWarning(view, facts, verdict, { quiet: this.quiet, taught: this.taught });
    if (!e || this.overridden.has(e.text)) return undefined;
    return this.warnNote(e, facts, verdict.choice);
  }

  private warnNote(e: Explanation, f: Facts, choice: string): CoachNote {
    const key: LessonKey = e.reason === 'noEffect' ? noEffectLesson(f, choice) : e.reason;
    const lesson = this.lessons[key];
    return lesson ? { rule: e.reason, text: e.text, lesson } : { rule: e.reason, text: e.text };
  }

  /**
   * Remembers the player's choice for the post-battle review. Call it before
   * the choice is played, while the view still shows the decision. `shown` is
   * the warning the player saw and overrode, if any; `verdict` is the judge's
   * on the choice (the review only uses judged decisions); `heeded`, a warning
   * on an earlier pick that the player listened to.
   */
  record(
    view: SideView,
    choice: string,
    shown?: CoachNote | null,
    verdict?: Verdict,
    heeded?: Heeded,
  ): void {
    const index = this.choices++;
    this.recorded = false;
    if (view.request.requestType === 'wait') return;
    const facts = this.factsFor(view);
    if (shown) this.overridden.add(shown.text);
    const e =
      verdict && explainWarning(view, facts, verdict, { quiet: this.quiet, taught: this.taught });
    const d = decision(
      index,
      facts,
      choice,
      verdict,
      e ? this.warnNote(e, facts, choice) : undefined,
      heeded,
    );
    if (d) this.decisions.push(d);
    this.recorded = !!d;
  }

  /** The warnings the player overrode this battle (saved with the attempt, so a reload doesn't ask again). */
  get ignored(): string[] {
    return [...this.overridden];
  }

  /** Restores the warnings the player overrode before a reload. */
  ignore(texts: readonly string[]): void {
    for (const t of texts) this.overridden.add(t);
  }

  /** Drops the last recorded choice (the sim turned it down, so the player chooses again). */
  forget(): void {
    if (this.recorded) this.decisions.pop();
    this.recorded = false;
  }

  review(): Review {
    return buildReview(this.decisions);
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

  /**
   * This turn's tip candidates, in order of importance. A one-time tip already
   * given is left out; its key is marked when a candidate shows.
   */
  private tipCandidates(view: SideView, f: Facts, ok: (rule: CoachRule) => boolean): Candidate[] {
    const out: Candidate[] = [];
    const add = (rule: CoachRule, text: string, key?: string, choice?: string) => {
      if (!ok(rule) || (key && this.seen.has(key))) return;
      // In a lesson, nothing the player hasn't learned yet.
      const lesson = TIP_LESSON[rule];
      if (this.taught !== Infinity && (lesson === null || lesson > this.taught)) return;
      out.push({
        note: this.note(rule, text),
        ...(key ? { key } : {}),
        ...(choice ? { choice } : {}),
      });
    };
    const { state } = f;
    // Spikes: once per new layer, and again if they come back after a spin.
    const layers = state.ownSide.spikes;
    if (layers < this.spikesSeen) this.spikesSeen = layers;
    if (layers > this.spikesSeen && ok('spikes')) {
      this.spikesSeen = layers;
      const spinner = state.own.find((m) => !m.fainted && hasMove(view, m.slot, 'rapidspin'));
      add(
        'spikes',
        'Spikes are on your side: each Pokémon you switch in loses HP, except Flying types and Pokémon with Levitate.' +
          (spinner ? ` ${spinner.species}’s Rapid Spin clears them.` : ''),
      );
    }
    const { foe, me, threat } = f;
    if (!foe || !me || f.forced) return out;

    if (threat && threat.ko >= 0.9 && f.foeFirst >= SURE_FIRST)
      add(
        'koThreat',
        `${foe} is faster than ${me} and can knock it out this turn.`,
        `threat:${me}:${foe}`,
      );
    const ko = this.koMove(f);
    if (ko)
      add(
        'canKo',
        `${ko.name} can knock out ${foe} this turn.`,
        `ko:${me}:${foe}:${ko.id}`,
        ko.choice,
      );

    if (state.foeActive?.status === 'slp' && (f.foeMoves.sleeptalk ?? 0) < 0.2)
      add(
        'foeAsleep',
        `${foe} is asleep and can’t attack while it sleeps.`,
        `slp:${foe}:${sleepStart(view, foe)}`,
      );

    const item = CHOICE_ITEMS[activeItem(view)];
    if (f.lockedInto && item)
      add(
        'locked',
        `${item} locks ${me} into ${f.lockedInto} until it switches out.`,
        `lock:${me}:${f.lockedInto}:${switchedIn(view)}`,
      );

    const attacks = f.moves.filter((m) => m.category !== 'Status');
    const useful = f.moves.filter((m) => m.category === 'Status' && !m.noEffect);
    const best = Math.max(0, ...attacks.map((m) => m.damage));
    if (attacks.length && !useful.length && best < 0.2) {
      const better = f.switches
        .filter((s) => s.best >= Math.max(0.3, 2.5 * best) && s.taken.ko < 0.05)
        .sort((a, b) => b.best - a.best)[0];
      if (better)
        add(
          'walled',
          `${me}’s attacks do little damage to ${foe}. ${better.species} hits it much harder.`,
          `walled:${me}:${foe}`,
          better.choice,
        );
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
      boosted < 2
    )
      add(
        'setupWindow',
        `${foe} can barely hurt ${me}: a good chance to use ${setup.name}.`,
        `setup:${me}:${foe}`,
        setup.choice,
      );
    return out;
  }
}

/** The lesson for a move that does nothing: types, status, or hazards. */
function noEffectLesson(f: Facts, choice: string): LessonKey {
  const m = f.moves.find((x) => x.choice === choice);
  if (m?.noEffect?.kind === 'hazardMax') return 'hazard';
  return m?.category === 'Status' && m.noEffect?.kind !== 'type' ? 'status' : 'noEffect';
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
