import { PRNG, type PRNGSeed } from '@pkmn/sim';

/** Uniform float in [0, 1). Policies only ever see this, never the PRNG. */
export type Rng = () => number;

export function makeRng(seed: PRNGSeed): Rng {
  const prng = new PRNG(seed);
  return () => prng.random();
}

/** Derives a stable seed from a base string and an index, e.g. for battle N of a soak run. */
export function deriveSeed(base: string, index: number): PRNGSeed {
  let h = 2166136261;
  for (const c of `${base}:${index}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const parts = [0, 1, 2, 3].map((i) => (Math.imul(h ^ (i + 1), 2654435761) >>> 16) & 0xffff);
  return parts.join(',') as PRNGSeed;
}
