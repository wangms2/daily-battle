// A live battle between two players (or a player and the AI), run on the
// server so neither side ever receives the other's sets or request (DESIGN.md
// §7, §18). It's rebuilt from the match's seed, teams, and recorded choices
// whenever the room wakes.
import { BattleSession, legalChoices, type SideView } from '@daily-battle/sim-bridge';
import { SIDES, type Match, type Side, type WireUpdate } from '@daily-battle/versus';
import type { PRNGSeed } from '@pkmn/sim';

/** A fresh battle seed, never shown to players. */
export function randomSeed(): string {
  return [...crypto.getRandomValues(new Uint16Array(4))].join(',');
}

export type ChoiceOutcome = 'ok' | 'blocked' | 'illegal';

export class LiveBattle {
  private readonly session: BattleSession;

  constructor(match: Match) {
    // The teams are stored lead first.
    this.session = new BattleSession({
      format: match.format,
      seed: match.seed as PRNGSeed,
      p1: { team: match.teams.p1, name: match.names.p1 },
      p2: { team: match.teams.p2, name: match.names.p2 },
    });
    // Team Preview (Gen 5): both teams come in lead first, so each keeps its order.
    // It's the same on every rebuild, so it isn't a recorded choice.
    for (const side of SIDES) {
      if (this.session.request(side)?.requestType === 'team') {
        this.session.choose(side, `team ${match.teams[side].map((_, i) => i + 1).join('')}`);
      }
    }
    // Resume: replay what each side chose, each when the battle asked it to.
    const next: Record<Side, number> = { p1: 0, p2: 0 };
    for (let acted = true; acted && !this.session.ended;) {
      acted = false;
      for (const side of SIDES) {
        if (this.session.ended || !this.session.request(side)) continue;
        const choice = match.choices[side][next[side]];
        if (choice === undefined) continue;
        this.session.choose(side, choice);
        next[side]++;
        acted = true;
      }
    }
    if (next.p1 !== match.choices.p1.length || next.p2 !== match.choices.p2.length) {
      throw new Error(`Battle ${match.id} didn't replay: recorded choices were left over`);
    }
  }

  get ended(): boolean {
    return this.session.ended;
  }

  get winner(): Side | null {
    return this.session.winner;
  }

  /** What the side sees when it has a choice to make (the AI's input); null otherwise. */
  view(side: Side): SideView | null {
    return this.session.view(side);
  }

  /** Whether the side has a choice to make (its clock runs). */
  waitingOn(side: Side): boolean {
    return !!this.session.request(side);
  }

  /**
   * Makes a side's choice, if it's legal for its request. A move hidden
   * information blocks (the foe's Imprison) comes back `blocked`: the side gets
   * a new request and chooses again, and it isn't recorded.
   */
  choose(side: Side, choice: string): ChoiceOutcome {
    const request = this.session.request(side);
    if (!request || !legalChoices(request).includes(choice)) return 'illegal';
    return this.session.choose(side, choice) ? 'ok' : 'blocked';
  }

  forfeit(side: Side): void {
    this.session.forfeit(side);
  }

  logLength(side: Side): number {
    return this.session.log(side).length;
  }

  /** The side's lines from `from` on, its pending request, and the end. */
  update(side: Side, from: number, blocked = false): WireUpdate {
    return {
      lines: this.session.log(side).slice(from),
      request: this.session.request(side),
      ended: this.session.ended,
      winner: this.session.winner,
      ...(blocked && { blocked: true }),
    };
  }
}
