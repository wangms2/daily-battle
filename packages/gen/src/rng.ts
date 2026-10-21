// Self-contained seeded rng, so a dependency upgrade can never change past days.

export type Rng = () => number;

/** cyrb128: hashes a string to four 32-bit seeds. */
function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703,
    h2 = 3144134277,
    h3 = 1013904242,
    h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** sfc32: small fast counter PRNG. Returns floats in [0, 1). */
function sfc32(a: number, b: number, c: number, d: number): Rng {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

export function rngFor(key: string): Rng {
  const rng = sfc32(...cyrb128(key));
  // Discard the first outputs, which are weakly mixed for similar keys.
  for (let i = 0; i < 15; i++) rng();
  return rng;
}

/** Draws `count` distinct items, each with probability proportional to its weight. */
export function weightedSample<T>(
  items: readonly T[],
  weight: (item: T) => number,
  count: number,
  rng: Rng,
): T[] {
  const pool = items.map((item) => ({ item, w: weight(item) }));
  const out: T[] = [];
  while (out.length < count && pool.length) {
    let r = rng() * pool.reduce((a, x) => a + x.w, 0);
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= pool[i]!.w;
      if (r < 0) break;
    }
    out.push(pool.splice(i, 1)[0]!.item);
  }
  return out;
}
