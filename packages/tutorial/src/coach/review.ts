// Post-battle review (DESIGN.md §22): the utility AI's ranking of each player
// decision, from the player's view, turned into a few key turns.
import {
  extractState,
  scoreActions,
  STRONG,
  type Facts,
  type ScoredAction,
} from '@daily-battle/ai';
import type { SetsFile } from '@daily-battle/data';
import type { SideView } from '@daily-battle/sim-bridge';
import type { CoachNote } from './simple';

/** A score gap this big between the best choice and the player's is a key turn. */
export const KEY_GAP = 0.3;
/** The best choice by this margin over the next makes a "done well" turn. */
const WELL_GAP = 0.3;

export interface Decision {
  turn: number;
  me: string;
  foe: string;
  choice: string;
  scored: ScoredAction[];
  /** Readable name for each choice: the move's name or the switch-in's species. */
  labels: Record<string, string>;
  /** Expected damage and knockout chance for each move choice. */
  hits: Record<string, { damage: number; ko: number }>;
  /** The foe's best hit on the active, and on each switch-in, as a fraction of max HP. */
  taken: Record<string, number>;
  threat: number;
  /** The coach's warning on the chosen action, if it had one. */
  warning?: CoachNote;
}

export interface ReviewTurn {
  turn: number;
  /** "Turn 4: Metagross vs Skarmory" style heading parts. */
  me: string;
  foe: string;
  chose: string;
  better?: string;
  text: string;
  lesson?: string;
}

export interface Review {
  key: ReviewTurn[];
  good: ReviewTurn[];
}

const pct = (x: number) => `${Math.round(Math.min(1, x) * 100)}%`;

/** One decision to remember, or undefined when there was no real choice. */
export function decision(
  view: SideView,
  facts: Facts,
  data: SetsFile,
  choice: string,
  warning?: CoachNote,
): Decision | undefined {
  if (facts.forced || !facts.foe || !facts.me) return undefined;
  const state = extractState(view, data);
  const scored = scoreActions(view, state, STRONG, () => 0.5, data);
  if (scored.length < 2 || !scored.some((s) => s.choice === choice)) return undefined;
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
    turn: state.turn,
    me: facts.me,
    foe: facts.foe,
    choice,
    scored,
    labels,
    hits,
    taken,
    threat: facts.threat?.frac ?? 0,
    ...(warning ? { warning } : {}),
  };
}

/** What made the player's (best) choice good, or undefined if the facts don't show it. */
function praise(d: Decision, chosen: ScoredAction): string | undefined {
  const c = d.labels[chosen.choice] ?? chosen.choice;
  if (chosen.kind === 'switch') {
    const cost = d.taken[chosen.choice] ?? 1;
    return d.threat >= 0.3 && cost <= d.threat / 2
      ? `Good switch: ${c} takes ${d.foe}’s attacks much better than ${d.me} would.`
      : undefined;
  }
  const hit = d.hits[chosen.choice] ?? { damage: 0, ko: 0 };
  if (hit.ko >= 0.5) return `Good choice: ${c} could knock out ${d.foe}.`;
  const others = Object.entries(d.hits).filter(([choice]) => choice !== chosen.choice);
  const next = Math.max(0, ...others.map(([, h]) => h.damage));
  return hit.damage >= 0.3 && hit.damage >= next + 0.15
    ? `Good choice: ${c} was your strongest attack against ${d.foe}.`
    : undefined;
}

/** Why the best choice beat the player's, from the turn's facts, or undefined if they don't show it. */
function reason(d: Decision, best: ScoredAction, chosen: ScoredAction): string | undefined {
  const b = d.labels[best.choice] ?? best.choice;
  const c = d.labels[chosen.choice] ?? chosen.choice;
  if (best.kind === 'move') {
    const hit = d.hits[best.choice] ?? { damage: 0, ko: 0 };
    if (chosen.kind === 'switch') {
      const cost = d.taken[chosen.choice] ?? 0;
      if (hit.ko >= 0.5) return `Staying in was better: ${b} could knock out ${d.foe}.`;
      if (hit.damage >= 0.3 && cost >= 0.3)
        return `Staying in was better: ${b} does about ${pct(hit.damage)} to ${d.foe}, and ${c} takes about ${pct(cost)} switching in.`;
      return undefined;
    }
    const mine = d.hits[chosen.choice] ?? { damage: 0, ko: 0 };
    if (hit.ko >= 0.5 && mine.ko < 0.3) return `${b} could knock out ${d.foe}. ${c} couldn’t.`;
    if (hit.damage >= mine.damage + 0.15)
      return `${b} does about ${pct(hit.damage)} to ${d.foe}. ${c} does about ${pct(mine.damage)}.`;
    return undefined;
  }
  const safe = d.taken[best.choice] ?? 1;
  if (chosen.kind === 'move') {
    if (d.threat < 0.3 || safe > d.threat / 2) return undefined;
    const danger =
      d.threat >= 0.95
        ? `${d.foe} can knock out ${d.me}.`
        : `${d.foe} can hit ${d.me} for about ${pct(d.threat)}.`;
    return `${danger} ${b} would take only about ${pct(safe)}.`;
  }
  const cost = d.taken[chosen.choice] ?? 0;
  if (cost < 0.3 || safe > cost / 2) return undefined;
  return `${b} takes ${d.foe}’s best hit much better: about ${pct(safe)}, against ${pct(cost)} for ${c}.`;
}

/** Up to `max` key turns (biggest gaps first, shown in turn order) and 1–2 turns done well. */
export function buildReview(
  decisions: Decision[],
  lessons: { switching?: string; attacking?: string } = {},
  max = 3,
): Review {
  const key: (ReviewTurn & { gap: number })[] = [];
  const good: (ReviewTurn & { gap: number })[] = [];
  for (const d of decisions) {
    const ranked = [...d.scored].sort((a, b) => b.score - a.score);
    const best = ranked[0]!;
    const chosen = d.scored.find((s) => s.choice === d.choice)!;
    const base = { turn: d.turn, me: d.me, foe: d.foe, chose: d.labels[d.choice] ?? d.choice };
    if (chosen === best || chosen.score === best.score) {
      const margin = best.score - (ranked[1]?.score ?? best.score);
      const text = margin >= WELL_GAP ? praise(d, chosen) : undefined;
      if (text && !good.some((g) => g.text === text)) good.push({ ...base, text, gap: margin });
      continue;
    }
    const gap = best.score - chosen.score;
    if (gap < KEY_GAP) continue;
    const why = d.warning ? undefined : reason(d, best, chosen);
    const text = d.warning?.text ?? why;
    if (!text) continue;
    const lesson =
      d.warning?.lesson ??
      (best.kind === 'switch' || chosen.kind === 'switch' ? lessons.switching : lessons.attacking);
    key.push({
      ...base,
      // A warning names its own better option, which may not be the scores' best.
      ...(why ? { better: d.labels[best.choice] ?? best.choice } : {}),
      text,
      ...(lesson ? { lesson } : {}),
      gap,
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
