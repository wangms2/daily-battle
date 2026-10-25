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
  type Policy,
  type Rng,
} from '@daily-battle/sim-bridge';
import type { PokemonSet, PRNGSeed } from '@pkmn/sim';
import type { EngineStart, TurnPackage } from './frames';
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

  /** Hard needs `engine`, poke-engine for the format's gen; `budget` is for tests. */
  constructor(
    readonly start: EngineStart,
    engine?: Engine,
    budget?: { iterations: number; worlds: number },
  ) {
    const format = start.format ?? DEFAULT_FORMAT;
    this.sets = start.playerTeam as PokemonSet[];
    this.session = new BattleSession({
      format,
      seed: start.battleSeed as PRNGSeed,
      p1: { team: start.playerTeam as PokemonSet[], name: 'You' },
      p2: { team: start.opponentTeam as PokemonSet[], name: 'The opponent' },
    });
    const difficulty = start.difficulty ?? 'normal';
    this.ai = aiFor({
      difficulty,
      style: start.style,
      data: setsFor(format),
      ...(engine ? { engine } : {}),
      ...(start.pool ? { pool: start.pool } : {}),
      ...(budget ? { hard: budget } : {}),
    });
    this.aiRng = makeRng(start.aiSeed as PRNGSeed);
    this.hard = difficulty === 'hard';
    this.replay = this.hard ? [...(start.aiChoices ?? [])] : [];
    this.reported = this.replay.length;
    this.presenter = new SidePresenter('p1', this.sets, format);
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
      this.session.choose('p1', choice);
      this.advanceAi();
    }
    return this.package(this.start.choices.length > 0);
  }

  choose(choice: string): TurnPackage {
    // A move hidden information blocks (the foe's Imprison) comes back as
    // unavailable: the controls update to show it disabled, and you choose again.
    if (!this.session.choose('p1', choice)) return this.package(false, BLOCKED);
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
    return pkg;
  }
}
