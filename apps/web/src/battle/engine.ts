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
  type Position,
} from '@daily-battle/tutorial';
import type { PokemonSet, PRNGSeed } from '@pkmn/sim';
import type { EngineStart, PositionPackage, TurnPackage } from './frames';
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
   * warnings show. Without it (no engine), the coach gives no warnings.
   */
  private readonly judge?: Judge;
  /** This decision's rule warnings (each needs the judge to agree), and those shown. */
  private warnings: Record<string, CoachNote> = {};
  private readonly shown = new Map<string, CoachNote>();

  /**
   * Hard needs `engine`, poke-engine for the format's gen; `budget` is for tests.
   * The coach's judge needs `coachEngine`, the same module.
   */
  constructor(
    readonly start: EngineStart,
    engine?: Engine,
    budget?: { iterations: number; worlds: number },
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
      this.coach = new Coach(setsFor(format), format);
      if (coachEngine)
        this.judge = new Judge(coachEngine, setsFor(format), {
          ...(start.pool ? { pool: start.pool } : {}),
        });
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
      // The coach sees each replayed turn too, so its review and one-time tips survive a resume.
      this.coachSees(choice);
      this.session.choose('p1', choice);
      this.advanceAi();
    }
    return this.package(this.start.choices.length > 0);
  }

  choose(choice: string): TurnPackage {
    this.coachSees(choice);
    // A move hidden information blocks (the foe's Imprison) comes back as
    // unavailable: the controls update to show it disabled, and you choose again.
    if (!this.session.choose('p1', choice)) {
      this.coach?.forget();
      return this.package(false, BLOCKED);
    }
    this.advanceAi();
    return this.package(false);
  }

  /** Records the player's choice for the review, while the view still shows the decision. */
  private coachSees(choice: string) {
    const view = this.coach && this.session.view('p1');
    if (!view) return;
    if (this.coached !== view.request) this.coach!.turn(view);
    // Only a warning you saw and overrode counts (none on a resumed turn).
    this.coach!.record(view, choice, this.shown.get(choice) ?? null);
  }

  /**
   * The coach's warning on `choice`, if it has one: a rule explains it and the
   * judge agrees it's clearly worse. Gives the judge up to `waitMs` to finish.
   */
  coachCheck(choice: string, waitMs: number): CoachNote | null {
    const note = this.warnings[choice];
    if (!note || !this.judge) return null;
    if (!this.judge.settle(choice, waitMs)?.worse) return null;
    this.shown.set(choice, note);
    return note;
  }

  /** Works on the judge for up to `ms`; true while there's more to do. */
  coachWork(ms: number): boolean {
    const judge = this.judge;
    if (!judge?.busy) return false;
    const end = performance.now() + ms;
    while (judge.step() && performance.now() < end);
    return judge.busy;
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
      const view = this.session.view('p1');
      if (view && pkg.controls) {
        const turn = this.coach.turn(view);
        pkg.coach = turn.tip ? { tip: turn.tip } : {};
        this.coached = view.request;
        this.warnings = turn.warnings;
        this.shown.clear();
        // Seeded by the decision, so a resumed battle judges it the same way.
        this.judge?.begin(
          view,
          `${this.start.battleSeed}:${this.session.choices('p1').length}`,
          Object.keys(turn.warnings),
        );
      }
      if (pkg.end) pkg.review = this.coach.review();
    }
    return pkg;
  }
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
