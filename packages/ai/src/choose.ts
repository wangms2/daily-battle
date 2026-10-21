import type { Rng } from '@daily-battle/sim-bridge';

/** Softmax probabilities over scores at a temperature (DESIGN.md §8.4). */
export function softmax(scores: number[], temperature: number): number[] {
  if (!scores.length) return [];
  const t = Math.max(temperature, 1e-6);
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp((s - max) / t));
  const total = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / total);
}

/** Samples an index from probabilities with `rng`. */
export function sample(probs: number[], rng: Rng): number {
  let r = rng();
  for (let i = 0; i < probs.length; i++) {
    r -= probs[i]!;
    if (r < 0) return i;
  }
  return probs.length - 1;
}
