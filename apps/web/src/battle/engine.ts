// The battle engine that runs inside the worker: a BattleSession, the
// opponent AI, and a presenter that turns the player's side into frames.
import { aiFor } from '@daily-battle/ai';
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import type { Engine } from '@daily-battle/engine-wasm';
import {
  BattleSession,
  deriveSeed,
  legalChoices,
  makeRng,
  resolveStep,
  ScriptedPolicy,
  type Policy,
  type Rng,
} from '@daily-battle/sim-bridge';
import {
  Coach,
  Judge,
  startPosition,
  teamOf,
  type CoachNote,
  type Mon,
  type Review,
  type Position,
} from '@daily-battle/tutorial';
import type { PokemonSet, PRNGSeed } from '@pkmn/sim';
import type { CoachMemo, EngineStart, PositionPackage, TurnPackage, TurnReplay } from './frames';
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
    const difficulty = start.difficulty ?? 'normal';
    const ai = aiFor({
      difficulty,
      style: start.style,
      data: setsFor(format),
      ...(engine ? { engine } : {}),
      ...(start.pool ? { pool: start.pool } : {}),
      ...(budget ? { hard: budget } : {}),
    });
    this.ai = tutorial?.foeScript
      ? new ScriptedPolicy({ ...tutorial.foeScript, fallback: ai })
      : ai;
    this.aiRng = makeRng(tutorial ? deriveSeed(start.battleSeed, 2) : (start.aiSeed as PRNGSeed));
    this.hard = difficulty === 'hard';
    this.replay = this.hard ? [...(start.aiChoices ?? [])] : [];
    this.reported = this.replay.length;
    this.presenter = new SidePresenter('p1', this.sets, format);
    if (start.coach) {
      // Lesson foes count as Easy: some warning reasons are quiet against some opponents.
      this.coach = new Coach(setsFor(format), format, tutorial ? 'easy' : difficulty);
      if (coachEngine)
        this.judge = new Judge(coachEngine, setsFor(format), {
          ...(start.pool ? { pool: start.pool } : {}),
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
      this.session.choose('p1', `team ${this.sets.map((_, i) => i + 1).join('')}`);
      this.advanceAi();
    }
    for (const choice of this.start.choices) {
      if (this.session.ended) break;
      // The coach sees each replayed turn too (with the judge's saved verdict),
      // so its review and one-time tips survive a resume.
      this.coachSees(choice, this.start.coachLog?.[this.decisions] ?? undefined);
      this.made.push(choice);
      this.session.choose('p1', choice);
      this.advanceAi();
    }
    return this.package(this.start.choices.length > 0);
  }

  choose(choice: string): TurnPackage {
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
    const verdict = this.judge?.verdict(choice);
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
    const verdict = this.judge.settle(choice, waitMs);
    const note = verdict && this.coach.warn(view, verdict);
    if (!note) return null;
    this.shown.set(choice, note);
    return note;
  }

  /** Works on the judge for up to `ms`; true while there's more to do. */
  coachWork(ms: number): boolean {
    const judge = this.judge;
    if (!judge?.busy) return false;
    const end = performance.now() + ms;
    while (judge.step() && performance.now() < end && !(this.tipPending && judge.best));
    return judge.busy;
  }

  /**
   * A tip that waited for the judge, once its top choice is known (DESIGN.md
   * §22): it shows late, after the controls. At most once a decision.
   */
  coachTip(): CoachNote | undefined {
    const top = this.judge?.best;
    const view = this.session.view('p1');
    if (!this.tipPending || !top || !view || !this.coach) return undefined;
    this.tipPending = false;
    return this.coach.confirm(view, top);
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
      if (!this.hard) {
        this.session.choose('p2', this.ai.choose(view, this.aiRng));
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
        choice = this.ai.choose(view, rng);
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
        // Seeded by the decision, so a resumed battle judges it the same way.
        this.judge?.begin(view, `${this.start.battleSeed}:${this.session.choices('p1').length}`);
        this.tipPending = !!turn.pending && !!this.judge;
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
  const choice = resolveStep(turn.p1 ?? '', request) ?? '';
  session.choose('p1', choice);
  const foe = session.request('p2');
  if (foe && turn.p2) session.choose('p2', resolveStep(turn.p2, foe) ?? '');
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

/** A quiz position (Learn mode), frozen at the player's decision, with each answer's step resolved. */
export function presentPosition(
  format: string,
  position: Position,
  steps: string[],
): PositionPackage {
  const session = startPosition(format, position);
  const request = session.request('p1')!;
  const presenter = new SidePresenter('p1', teamOf(format, position.p1), format);
  const pkg = presenter.present(
    { lines: session.drain('p1'), request, ended: false, winner: null },
    true,
  );
  return { pkg, choices: steps.map((s) => resolveStep(s, request) ?? null) };
}
