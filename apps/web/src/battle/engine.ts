// The battle engine that runs inside the worker: a BattleSession, the
// opponent AI, and a presenter that turns the player's side into frames.
import {
  aiFor,
  HardPolicy,
  UtilityPolicy,
  type DecisionJob,
  type WorldClaim,
} from '@daily-battle/ai';
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import {
  BattleSession,
  deriveSeed,
  legalChoices,
  makeRng,
  resolveStep,
  type Policy,
  type Rng,
  type SideView,
} from '@daily-battle/sim-bridge';
import {
  behind,
  choiceKey,
  Coach,
  guideKey,
  guideNote,
  guideSwitch,
  Judge,
  LESSON_TIE,
  knownSets,
  setStartHp,
  soundPick,
  startPosition,
  teamOf,
  withLessonSets,
  type CoachNote,
  type FoeRead,
  type Mon,
  type Review,
  type Position,
  type Verdict,
} from '@daily-battle/tutorial';
import type { PokemonSet, PRNGSeed } from '@pkmn/sim';
import type { CoachMemo, EngineStart, TurnPackage, TurnReplay } from './frames';
import { SidePresenter } from './presenter';

export { cleanText, effectiveness, moveDesc } from './presenter';

/** Shown when the move you picked turns out to be blocked (by Imprison, say). */
const BLOCKED = 'That move can’t be used right now. Choose another.';

export class BattleEngine {
  private readonly session: BattleSession;
  private readonly ai: Policy;
  private readonly aiRng: Rng;
  private readonly presenter: SidePresenter;
  private readonly sets: PokemonSet[];
  private readonly hard: boolean;
  /** Hard: every AI choice so far; those past `reported` are new since the last package. */
  private readonly aiLog: string[] = [];
  private reported: number;
  /** Hard: saved AI choices still to replay (cleared if one stops fitting). */
  private replay: string[];
  private readonly coach?: Coach;
  /** The request the coach last spoke on, so it isn't asked twice about one turn. */
  private coached?: unknown;
  /**
   * The coach's judge (DESIGN.md §22): the search, from your view, decides which
   * warnings and action tips show. Without it (no engine), the coach gives only
   * fact tips: no warnings, no action tips, no review.
   */
  private readonly judge?: Judge;
  /** This decision's warnings shown so far, by choice. */
  private readonly shown = new Map<string, CoachNote>();
  /** A tip waits for the judge's top choice. */
  private tipPending = false;
  /** Your choices so far (resumed ones too): the index of the next one's memo. */
  private decisions = 0;
  /** The coach's memo on the choice just made, for the next package. */
  private memo?: CoachMemo;
  /** Every choice you've made (resumed ones too, blocked ones included), for replays. */
  private readonly made: string[] = [];
  /**
   * The opponent's choice for this turn, made before yours, and its view: the
   * coach checks its advice against it (DESIGN.md §22). Never sent or saved.
   */
  private pending?: { view: SideView; choice: string; read?: FoeRead };
  /**
   * Hard: the opponent's decision on this turn, searched a slice at a time while
   * you choose (`ponder`, DESIGN.md §7). It's finished and made before your
   * choice goes in, so the turn plays exactly as if it were searched at once.
   */
  private thinking?: DecisionJob;

  /**
   * Hard needs `engine`, poke-engine for the format's gen; `budget` is for tests.
   * The coach's judge needs `coachEngine`, the same module.
   */
  constructor(
    readonly start: EngineStart,
    private readonly engine?: Engine,
    private readonly budget?: { iterations: number; worlds: number },
    coachEngine?: Engine,
  ) {
    const format = start.format ?? DEFAULT_FORMAT;
    const { tutorial } = start;
    // Lesson teams are written as `Mon`s; daily teams are already full sets.
    const team = (t: unknown[]) => (tutorial ? teamOf(format, t as Mon[]) : (t as PokemonSet[]));
    this.sets = team(start.playerTeam);
    this.session = new BattleSession({
      format,
      // A lesson's seed is a label; its battle and foe seeds come from it as in the content tests.
      seed: tutorial ? deriveSeed(start.battleSeed, 0) : (start.battleSeed as PRNGSeed),
      ...(tutorial?.noLuck && { noLuck: true }),
      p1: { team: this.sets, name: 'You' },
      p2: { team: team(start.opponentTeam), name: 'The opponent' },
    });
    if (tutorial?.hp) setStartHp(this.session, tutorial.hp);
    const difficulty = start.difficulty ?? 'normal';
    const ai = aiFor({
      difficulty,
      style: start.style,
      data: setsFor(format),
      ...(engine ? { engine } : {}),
      ...(start.pool ? { pool: start.pool } : {}),
      ...(budget ? { hard: budget } : {}),
      ...(start.aiVersion ? { aiVersion: start.aiVersion } : {}),
    });
    this.ai = ai;
    this.aiRng = makeRng(tutorial ? deriveSeed(start.battleSeed, 2) : (start.aiSeed as PRNGSeed));
    this.hard = difficulty === 'hard';
    this.replay = this.hard ? [...(start.aiChoices ?? [])] : [];
    this.reported = this.replay.length;
    this.presenter = new SidePresenter('p1', this.sets, format);
    if (start.coach) {
      // A lesson's foe is fixed content, so the coach knows its sets; a daily
      // foe's are hidden, as for the AI.
      const lessonFoe = tutorial ? (start.opponentTeam as Mon[]) : undefined;
      const data = lessonFoe ? withLessonSets(format, lessonFoe) : setsFor(format);
      // Lesson foes count as Easy: some warning reasons are quiet against some opponents.
      this.coach = new Coach(
        data,
        format,
        tutorial ? 'easy' : difficulty,
        tutorial?.taught ?? Infinity,
      );
      if (coachEngine)
        this.judge = new Judge(coachEngine, data, {
          ...(start.pool ? { pool: start.pool } : {}),
          // Lessons leave near-ties out of the judge's agreement (daily battles don't, yet).
          ...(lessonFoe ? { knownSets: knownSets(format, lessonFoe), tie: LESSON_TIE } : {}),
        });
      // Warnings you overrode before a reload aren't asked again.
      this.coach.ignore((start.coachLog ?? []).flatMap((m) => (m?.ignored ? [m.ignored] : [])));
    }
  }

  /** Starts (or resumes, replaying recorded choices) and returns the first package. */
  begin(): TurnPackage {
    this.advanceAi();
    // Team Preview (Gen 5 on): the lead was picked on the brief, and your team
    // comes in lead first, so keep that order. It's the same on every resume,
    // so it isn't one of the recorded choices.
    if (this.session.request('p1')?.requestType === 'team') {
      this.settleAi();
      this.session.choose('p1', `team ${this.sets.map((_, i) => i + 1).join('')}`);
      this.advanceAi();
    }
    for (const choice of this.start.choices) {
      if (this.session.ended) break;
      // The coach sees each replayed turn too (with the judge's saved verdict),
      // so its review and one-time tips survive a resume.
      this.coachSees(choice, this.start.coachLog?.[this.decisions] ?? undefined);
      this.made.push(choice);
      this.settleAi();
      this.session.choose('p1', choice);
      this.advanceAi();
    }
    return this.package(this.start.choices.length > 0);
  }

  choose(choice: string): TurnPackage {
    this.settleAi();
    this.coachSees(choice);
    this.made.push(choice);
    // A move hidden information blocks (the foe's Imprison) comes back as
    // unavailable: the controls update to show it disabled, and you choose again.
    if (!this.session.choose('p1', choice)) {
      this.coach?.forget();
      return this.package(false, BLOCKED);
    }
    this.advanceAi();
    return this.package(false);
  }

  /**
   * Records the player's choice for the review, while the view still shows the
   * decision, and keeps a memo of it to save with the attempt: the judge's
   * verdict, and the warning you overrode. A resumed choice uses its saved memo.
   */
  private coachSees(choice: string, saved?: CoachMemo) {
    const index = this.decisions++;
    const view = this.coach && this.session.view('p1');
    this.memo = undefined;
    if (!view) return;
    if (this.coached !== view.request) this.coach!.turn(view);
    if (index < this.start.choices.length) {
      this.coach!.record(view, choice, null, saved?.verdict, saved?.heeded);
      return;
    }
    const verdict = this.readVerdict(this.judge?.verdict(choice));
    const shown = this.shown.get(choice);
    // A warning you listened to: the last one shown on another pick.
    const other = [...this.shown].filter(([c]) => c !== choice).at(-1);
    const heeded = other && { choice: other[0], note: other[1] };
    this.coach!.record(view, choice, shown ?? null, verdict, heeded);
    if (verdict || shown || heeded)
      this.memo = {
        ...(verdict ? { verdict } : {}),
        ...(shown ? { ignored: shown.text } : {}),
        ...(heeded ? { heeded } : {}),
      };
  }

  /**
   * The coach's warning on `choice`, if it has one: the judge finds it clearly
   * worse and a true reason explains why. Gives the judge up to `waitMs`.
   */
  coachCheck(choice: string, waitMs: number): CoachNote | null {
    const view = this.session.view('p1');
    if (!this.coach || !this.judge || !view) return null;
    const verdict = this.readVerdict(this.judge.settle(choice, waitMs));
    const note = verdict && this.coach.warn(view, verdict);
    if (!note) return null;
    this.shown.set(choice, note);
    return note;
  }

  /** What the opponent is doing this turn, by the judge's reply keys; undefined without one. */
  private foeRead(): FoeRead | undefined {
    const p = this.pending;
    if (!p || !(this.ai instanceof UtilityPolicy)) return undefined;
    if (!p.read) {
      const likely: Record<string, number> = {};
      for (const { choice, p: odds } of this.ai.likely(p.view)) {
        const key = choiceKey(p.view.request, choice);
        if (key) likely[key] = (likely[key] ?? 0) + odds;
      }
      const actual = choiceKey(p.view.request, p.choice);
      p.read = { likely, ...(actual ? { actual } : {}) };
    }
    return p.read;
  }

  /**
   * A verdict that the pick is clearly worse also needs the judge's top to beat
   * it against what the opponent is really doing (judge.ts `behind`), so a
   * warning never argues against the pick that works this turn.
   */
  private readVerdict(verdict: Verdict | undefined): Verdict | undefined {
    const read = verdict?.worse && this.foeRead();
    if (!verdict || !read) return verdict;
    const values = this.judge?.against(read, [verdict.choice, verdict.top]);
    return values && !behind(verdict.choice, verdict.top, values)
      ? { ...verdict, worse: false }
      : verdict;
  }

  /** Works on the judge for up to `ms`; true while there's more to do. */
  coachWork(ms: number): boolean {
    const judge = this.judge;
    if (!judge?.busy) return false;
    const end = performance.now() + ms;
    while (judge.step() && performance.now() < end && !(this.tipPending && this.tipReady()));
    return judge.busy;
  }

  /**
   * A waiting tip can show: the judge's top choice is known and, when the
   * coach checks it against the opponent's pick, every choice has been searched.
   */
  private tipReady(): boolean {
    if (!this.judge?.best) return false;
    return !!this.start.tutorial?.guide || !this.foeRead() || !this.judge.busy;
  }

  /**
   * A tip that waited for the judge, once its top choice is known (DESIGN.md
   * §22): it shows late, after the controls. At most once a decision. A tip
   * recommending a choice also needs it to be sound against what the opponent
   * is doing (judge.ts `soundPick`).
   */
  coachTip(): CoachNote | undefined {
    const top = this.judge?.best;
    const view = this.session.view('p1');
    if (!this.tipPending || !top || !view || !this.coach || !this.tipReady()) return undefined;
    this.tipPending = false;
    if (this.start.tutorial?.guide) return guideNote(view, top);
    const read = this.foeRead();
    const values = read && this.judge!.against(read);
    return this.coach.confirm(view, top, values ? (c) => soundPick(c, values) : undefined);
  }

  /**
   * One of your past decisions, for the coach's review (DESIGN.md §22): the
   * battle rebuilt to it (`before`, frozen at the decision) and that turn played
   * with the choice you made (`turn`). Null if there's no such decision.
   */
  replayTurn(decision: number): { before: TurnPackage; turn: TurnPackage } | null {
    const choice = this.made[decision];
    if (choice === undefined) return null;
    const { coach: _coach, coachLog: _log, ...start } = this.start;
    const e = new BattleEngine(
      {
        ...start,
        choices: this.made.slice(0, decision),
        // Hard's choices as made, so the replay needs no search.
        ...(this.hard ? { aiChoices: [...this.aiLog] } : {}),
      },
      this.engine,
      this.budget,
    );
    return { before: e.begin(), turn: e.choose(choice) };
  }

  /**
   * The coach's review of this battle when it was played without the coach
   * (DESIGN.md §22): a job that replays it with the judge on, a slice at a time.
   */
  reviewJob(judge: Engine): ReviewJob {
    return new ReviewJob(
      this.start,
      [...this.made],
      this.hard ? [...this.aiLog] : [],
      judge,
      this.engine,
    );
  }

  /** The judge's verdict on `choice` for this decision, given up to `ms`: true once it's ready (or can't be). */
  coachSettle(choice: string, ms: number): boolean {
    if (!this.judge) return true;
    return !!this.judge.settle(choice, ms) || !this.judge.busy;
  }

  /** The coach's review so far. */
  coachReview(): Review | undefined {
    return this.coach?.review();
  }

  forfeit(): TurnPackage {
    this.thinking = undefined;
    this.session.forfeit('p1');
    return this.package(false);
  }

  /** Hard: searches a slice (one world) of the opponent's decision; true while there's more. */
  ponder(): boolean {
    return !!this.thinking?.step();
  }

  /** Hard: a world of the opponent's decision for another worker to search, if one's left. */
  claimWorld(): WorldClaim | undefined {
    return this.thinking?.claim();
  }

  /** You have a decision to make (not just waiting on the opponent). */
  private youChoose(): boolean {
    const type = this.session.request('p1')?.requestType;
    return type === 'move' || type === 'switch';
  }

  /** Hard: finishes the opponent's decision, if it's still being searched, and makes it. */
  private settleAi() {
    const job = this.thinking;
    if (!job) return;
    this.thinking = undefined;
    const choice = job.result();
    this.aiLog.push(choice);
    this.session.choose('p2', choice);
  }

  /** The opponent answers every request it has; on Hard, one made while you choose waits for `ponder`. */
  private advanceAi() {
    this.pending = undefined;
    for (
      let view = this.session.view('p2');
      view && !this.session.ended;
      view = this.session.view('p2')
    ) {
      if (!this.hard) {
        const choice = this.ai.choose(view, this.aiRng);
        if (this.coach && view.request.requestType === 'move') this.pending = { view, choice };
        this.session.choose('p2', choice);
        continue;
      }
      // Hard: a saved choice skips the search (a resume would otherwise redo every
      // one). Each decision gets its own rng, so skipping one doesn't shift the rest.
      const saved = this.replay.shift();
      let choice: string;
      if (saved !== undefined && legalChoices(view.request).includes(saved)) choice = saved;
      else {
        // Searched from here on; the saved tail (if any) is replaced from this point.
        if (saved !== undefined) this.reported = Math.min(this.reported, this.aiLog.length);
        this.replay = [];
        const rng = makeRng(deriveSeed(this.start.aiSeed, this.aiLog.length));
        const job =
          this.ai instanceof HardPolicy
            ? this.ai.think(view, rng)
            : {
                step: () => false,
                claim: () => undefined,
                result: () => this.ai.choose(view, rng),
              };
        // While you choose, the search runs in the worker's spare time (`ponder`).
        if (this.youChoose()) {
          this.thinking = job;
          return;
        }
        choice = job.result();
      }
      this.aiLog.push(choice);
      this.session.choose('p2', choice);
    }
  }

  private package(resumed: boolean, note?: string): TurnPackage {
    const pkg = this.presenter.present(
      {
        lines: this.session.drain('p1'),
        request: this.session.request('p1'),
        ended: this.session.ended,
        winner: this.session.winner,
      },
      resumed,
      note,
    );
    if (this.aiLog.length > this.reported) {
      pkg.aiChoices = { from: this.reported, choices: this.aiLog.slice(this.reported) };
      this.reported = this.aiLog.length;
    }
    if (this.coach) {
      if (this.memo) pkg.coachMemo = this.memo;
      this.memo = undefined;
      const view = this.session.view('p1');
      this.tipPending = false;
      if (view && pkg.controls) {
        const turn = this.coach.turn(view);
        pkg.coach = turn.tip ? { tip: turn.tip } : {};
        this.coached = view.request;
        this.shown.clear();
        // Seeded by the decision (guideKey), so a resumed battle judges it the
        // same way, and the guided replay is the line the content tests win with.
        this.judge?.begin(
          view,
          guideKey(String(this.start.battleSeed), this.session.choices('p1').length),
        );
        this.tipPending = !!turn.pending && !!this.judge;
        if (this.start.tutorial?.guide) {
          // The guide's tip replaces the coach's: the judge's top move, or the
          // teammate to send in when one of yours has fainted.
          const lessonFoe = this.start.opponentTeam as Mon[];
          const pick =
            view.request.requestType === 'move'
              ? undefined
              : guideSwitch(this.start.format ?? DEFAULT_FORMAT, lessonFoe, view);
          pkg.coach = pick ? { tip: guideNote(view, pick) } : {};
          this.tipPending = !pick && !!this.judge;
        }
      }
      if (pkg.end) pkg.review = this.coach.review();
    }
    return pkg;
  }
}

/**
 * Replays a finished battle with the coach and its judge on, judging each of
 * your choices against the judge's top one, for a review on request.
 */
export class ReviewJob {
  private readonly replay: BattleEngine;
  private next = 0;

  constructor(
    start: EngineStart,
    private readonly made: string[],
    aiChoices: string[],
    judge: Engine,
    hard?: Engine,
  ) {
    const { coachLog: _log, ...rest } = start;
    this.replay = new BattleEngine(
      { ...rest, choices: [], coach: 'simple', ...(aiChoices.length ? { aiChoices } : {}) },
      hard,
      undefined,
      judge,
    );
    this.replay.begin();
  }

  /** Choices judged so far, of `total`. */
  get done(): number {
    return this.next;
  }
  get total(): number {
    return this.made.length;
  }

  /** Works for up to `ms`; the review once every choice is judged, else undefined. */
  step(ms: number): Review | undefined {
    const end = performance.now() + ms;
    while (this.next < this.made.length) {
      const choice = this.made[this.next]!;
      if (!this.replay.coachSettle(choice, end - performance.now())) return undefined;
      this.replay.choose(choice);
      this.next++;
      if (performance.now() >= end) break;
    }
    return this.next < this.made.length
      ? undefined
      : (this.replay.coachReview() ?? { key: [], good: [] });
  }
}

/**
 * A lesson demo or a practice answer (Learn mode): the position frozen at the
 * player's decision, then the turn played with `turn`'s steps. `spots` are
 * spotlight keys, with steps (`move Surf`) resolved to choices (`move 1`).
 */
export function presentTurn(
  format: string,
  position: Position,
  turn: { p1?: string; p2?: string },
  spots: string[] = [],
  /** A demo shows only your move; practice shows the whole turn (the foe's reply is the point). */
  whole = false,
): TurnReplay & { choice: string; spots: string[] } {
  const session = startPosition(format, position);
  const request = session.request('p1')!;
  const presenter = new SidePresenter('p1', teamOf(format, position.p1), format);
  const before = presenter.present(
    { lines: session.drain('p1'), request, ended: false, winner: null },
    true,
  );
  const resolve = (s: string) => (/^(move|switch) /.test(s) ? (resolveStep(s, request) ?? s) : s);
  // A look: the position only, no turn.
  if (!turn.p1) return { before, turn: before, choice: '', spots: spots.map(resolve) };
  const choice = resolveStep(turn.p1, request) ?? '';
  session.choose('p1', choice);
  const foe = session.request('p2');
  if (foe && turn.p2) session.choose('p2', resolveStep(turn.p2, foe) ?? '');
  // A foe knocked out sends in its next Pokémon, as in a battle.
  const next = !session.ended && session.request('p2');
  if (next && next.requestType === 'switch') session.choose('p2', legalChoices(next)[0]!);
  const lines = session.drain('p1');
  // A demo shows your move: the turn stops before the foe's (it moves second).
  const foeMoves = whole ? -1 : lines.findIndex((l) => l.startsWith('|move|p2a:'));
  const after = presenter.present(
    {
      lines: foeMoves < 0 ? lines : lines.slice(0, foeMoves),
      request: session.request('p1'),
      ended: session.ended,
      winner: session.winner,
    },
    false,
  );
  return { before, turn: after, choice, spots: spots.map(resolve) };
}
