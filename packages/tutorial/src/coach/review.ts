// Post-battle review (DESIGN.md §22): the judge's verdict on each player
// decision, turned into a few key turns. A key turn is one the judge found
// clearly worse and the coach can explain (the same text a warning would have
// shown), so the review never contradicts what the coach said in battle.
import type { Facts } from '@daily-battle/ai';
import type { Verdict } from './judge';
import type { CoachNote } from './simple';

export interface Decision {
  /** Its index among the player's choices (for replaying the turn). */
  index: number;
  turn: number;
  me: string;
  foe: string;
  choice: string;
  /** Readable name for each choice: the move's name or the switch-in's species. */
  labels: Record<string, string>;
  /** Expected damage and knockout chance for each move choice. */
  hits: Record<string, { damage: number; ko: number }>;
  /** The foe's best hit on the active, and on each switch-in, as a fraction of max HP. */
  taken: Record<string, number>;
  threat: number;
  /** The judge's verdict on the choice. */
  verdict: Verdict;
  /** The warning the coach has for the choice (shown or not), if the judge found it clearly worse. */
  warning?: CoachNote;
  /** A warning the player listened to: their first pick, and what the coach said about it. */
  heeded?: Heeded;
}

/** A warning the player listened to (they picked again). */
export interface Heeded {
  choice: string;
  note: CoachNote;
}

export interface ReviewTurn {
  /** The decision's index among the player's choices: replay the battle to it to show the turn. */
  decision: number;
  turn: number;
  /** "Turn 4: Metagross vs Skarmory" style heading parts. */
  me: string;
  foe: string;
  /** The choice made (`move 2`), and its name in a sentence. */
  choice: string;
  chose: string;
  /** The judge's top choice, when it was better than the one made, and its name. */
  top?: string;
  better?: string;
  /** A warning the player listened to: their first pick, and its name. */
  first?: string;
  firstChose?: string;
  text: string;
  lesson?: string;
}

export interface Review {
  key: ReviewTurn[];
  good: ReviewTurn[];
}

/** One judged decision to remember, or undefined when there was no real choice or no verdict. */
export function decision(
  index: number,
  facts: Facts,
  choice: string,
  verdict: Verdict | undefined,
  warning?: CoachNote,
  heeded?: Heeded,
): Decision | undefined {
  if (!verdict || facts.forced || !facts.foe || !facts.me) return undefined;
  const labels: Record<string, string> = {};
  const hits: Record<string, { damage: number; ko: number }> = {};
  const taken: Record<string, number> = {};
  for (const m of facts.moves) {
    labels[m.choice] = m.name;
    hits[m.choice] = { damage: m.noEffect ? 0 : m.damage, ko: m.noEffect ? 0 : m.ko };
  }
  for (const s of facts.switches) {
    labels[s.choice] = s.species;
    taken[s.choice] = s.taken.frac + s.entry;
  }
  return {
    index,
    turn: facts.state.turn,
    me: facts.me,
    foe: facts.foe,
    choice,
    labels,
    hits,
    taken,
    threat: facts.threat?.frac ?? 0,
    verdict,
    ...(warning ? { warning } : {}),
    ...(heeded ? { heeded } : {}),
  };
}

const SELF_KO = new Set(['Explosion', 'Self-Destruct']);

/** A choice in a sentence: "Ice Beam", or "a switch to Swampert". */
const named = (d: Decision, choice: string) => {
  const label = d.labels[choice] ?? choice;
  return choice.startsWith('switch') ? `a switch to ${label}` : label;
};

/** What made the player's choice (the judge's top) good, or undefined if the facts don't show it. */
function praise(d: Decision): string | undefined {
  const c = d.labels[d.choice] ?? d.choice;
  if (d.choice.startsWith('switch')) {
    const cost = d.taken[d.choice] ?? 1;
    return d.threat >= 0.3 && cost <= d.threat / 2
      ? `Good switch: ${c} takes ${d.foe}’s attacks much better than ${d.me} would.`
      : undefined;
  }
  const hit = d.hits[d.choice] ?? { damage: 0, ko: 0 };
  // Explosion's cost is always said.
  if (hit.ko >= 0.5 && SELF_KO.has(c))
    return `Good choice: ${c} could knock out ${d.foe}, though it knocks out ${d.me} too.`;
  if (hit.ko >= 0.5) return `Good choice: ${c} could knock out ${d.foe}.`;
  const others = Object.entries(d.hits).filter(([choice]) => choice !== d.choice);
  const next = Math.max(0, ...others.map(([, h]) => h.damage));
  return hit.damage >= 0.3 && hit.damage >= next + 0.15
    ? `Good choice: ${c} was your strongest attack against ${d.foe}.`
    : undefined;
}

/**
 * Up to `max` key turns (the judge's biggest gaps first, shown in turn order)
 * and 1–2 turns done well: warnings the player listened to, then the judge's
 * top choice with a reason the facts show.
 */
export function buildReview(decisions: Decision[], max = 3): Review {
  const key: (ReviewTurn & { gap: number })[] = [];
  const good: (ReviewTurn & { gap: number })[] = [];
  for (const d of decisions) {
    const v = d.verdict;
    const base = {
      decision: d.index,
      turn: d.turn,
      me: d.me,
      foe: d.foe,
      choice: d.choice,
      chose: named(d, d.choice),
    };
    // A good catch: the player listened to a warning, and the pick they made
    // instead isn't clearly worse too. These come first among the turns done well.
    if (d.heeded && !v.worse) {
      good.push({
        ...base,
        first: d.heeded.choice,
        firstChose: named(d, d.heeded.choice),
        text: `Good catch: you changed your pick after the coach’s warning. ${d.heeded.note.text}`,
        ...(d.heeded.note.lesson ? { lesson: d.heeded.note.lesson } : {}),
        gap: 1,
      });
      continue;
    }
    if (v.top === d.choice) {
      const text = praise(d);
      if (text && !good.some((g) => g.text === text)) good.push({ ...base, text, gap: 0 });
      continue;
    }
    if (!v.worse || !d.warning) continue;
    key.push({
      ...base,
      top: v.top,
      better: named(d, v.top),
      text: d.warning.text,
      ...(d.warning.lesson ? { lesson: d.warning.lesson } : {}),
      gap: v.gap,
    });
  }
  const top = (xs: typeof key, n: number) =>
    xs
      .sort((a, b) => b.gap - a.gap)
      .slice(0, n)
      .sort((a, b) => a.turn - b.turn)
      .map(({ gap: _gap, ...t }) => t);
  return { key: top(key, max), good: top(good, 2) };
}
