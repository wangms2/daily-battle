// The battle engine that runs inside the worker: a BattleSession, the
// opponent AI, and a presenter that turns the player's side into frames.
import { aiForStyle } from '@daily-battle/ai';
import { DEFAULT_FORMAT, setsFor } from '@daily-battle/data';
import { BattleSession, makeRng, type Policy, type Rng } from '@daily-battle/sim-bridge';
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

  constructor(readonly start: EngineStart) {
    const format = start.format ?? DEFAULT_FORMAT;
    this.sets = start.playerTeam as PokemonSet[];
    this.session = new BattleSession({
      format,
      seed: start.battleSeed as PRNGSeed,
      p1: { team: start.playerTeam as PokemonSet[], name: 'You' },
      p2: { team: start.opponentTeam as PokemonSet[], name: 'The opponent' },
    });
    this.ai = aiForStyle(start.style, { data: setsFor(format) });
    this.aiRng = makeRng(start.aiSeed as PRNGSeed);
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
      this.session.choose('p2', this.ai.choose(view, this.aiRng));
    }
  }

  private package(resumed: boolean, note?: string): TurnPackage {
    return this.presenter.present(
      {
        lines: this.session.drain('p1'),
        request: this.session.request('p1'),
        ended: this.session.ended,
        winner: this.session.winner,
      },
      resumed,
      note,
    );
  }
}
