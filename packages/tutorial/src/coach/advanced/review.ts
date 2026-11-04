// The advanced coach's deeper review (plan: concept 6): each advanced tip in
// the past tense, for the post-battle review. "Followed" praises a player who
// made the tip's play; "missed" explains the tip's play to one who made the
// play it was weighed against (or, for win conditions, any other play).
import type { PreserveTip } from './preserve';
import type { ReadTip } from './reads';
import type { RiskTip } from './risk';
import type { SlowTip } from './slow';
import type { WinconTip } from './wincon';

export type AdvancedTip =
  | ({ concept: 'risk' } & RiskTip)
  | ({ concept: 'slow' } & SlowTip)
  | ({ concept: 'reads' } & ReadTip)
  | ({ concept: 'wincon' } & WinconTip)
  | ({ concept: 'preserve' } & PreserveTip);

export interface AdvancedReview {
  /** The tip's play. */
  choice: string;
  /** "Missed" applies only to this play (undefined: any other play). */
  against?: string;
  followed: string;
  missed: string;
}

/** Names for the review: a play as a phrase ("Surf", "switching to Starmie") and a species' name. */
export interface ReviewNames {
  play: (choice: string) => string;
  species: (id: string) => string;
}

const cap = (t: string) =>
  t.replace(/(^|\. )([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase());

/** An advanced tip's past-tense review texts. */
export function advancedReview(tip: AdvancedTip, n: ReviewNames): AdvancedReview {
  const out = (choice: string, against: string | undefined, followed: string, missed: string) => ({
    choice,
    ...(against ? { against } : {}),
    followed: cap(followed),
    missed: cap(missed),
  });
  switch (tip.concept) {
    case 'risk': {
      const [safe, risky] = [n.play(tip.safe), n.play(tip.risky)];
      return out(
        tip.safe,
        tip.risky,
        `Good call: ${safe} was the safer pick, since a miss from ${risky} would have been costly.`,
        `${safe} was the safer pick there: ${risky} could miss, and a miss would have been costly.`,
      );
    }
    case 'slow': {
      const [move, contrast] = [n.play(tip.choice), n.play(tip.contrast)];
      if (tip.kind === 'hazard') {
        const hit = tip.targets?.length ?? 0;
        const who = hit ? ` ${hit} of their Pokémon would take damage on every switch-in.` : '';
        return out(
          tip.choice,
          undefined,
          `Good timing on ${move}.${who}`,
          `That was a good time for ${move}.${who}`,
        );
      }
      return out(
        tip.choice,
        tip.contrast,
        `Good patience: ${move} was worth more than attacking with ${contrast}.`,
        `There was no rush there: ${move} was worth more than attacking with ${contrast}.`,
      );
    }
    case 'reads': {
      const [play, greedy] = [n.play(tip.choice), n.play(tip.contrast)];
      const [foe, target] = [n.species(tip.foe), n.species(tip.target)];
      const only =
        tip.greedyFor === 'stay' ? `if ${foe} stayed in` : `if ${foe} switched to ${target}`;
      return out(
        tip.choice,
        tip.contrast,
        `Nice: ${play} held up whether ${foe} stayed in or switched to ${target}.`,
        `${play} would have held up whether ${foe} stayed in or switched to ${target}. ${greedy} only paid off ${only}.`,
      );
    }
    case 'wincon': {
      const blocker = n.species(tip.blocker);
      const key = tip.key ? n.species(tip.key) : undefined;
      const why = key
        ? `once ${blocker} was down, ${key} was set to win`
        : `once ${blocker} was down, you were in great shape`;
      return out(
        tip.choice,
        undefined,
        `Good focus: ${why}, and ${n.play(tip.choice)} played toward that.`,
        `${n.play(tip.choice)} was the better play there: ${why}.`,
      );
    }
    case 'preserve': {
      const [mon, play] = [n.species(tip.mon), n.play(tip.choice)];
      return tip.kind === 'preserve'
        ? out(
            tip.choice,
            tip.contrast,
            `Good call keeping ${mon} safe: you needed it later.`,
            `${mon} was worth keeping there: ${play} would have saved it for later.`,
          )
        : out(
            tip.choice,
            tip.contrast,
            `Good call: ${mon} wasn’t needed later, so getting damage in with ${play} was right.`,
            `It was fine to let ${mon} go there: it wasn’t needed later, and ${play} would have got more done.`,
          );
    }
  }
}
