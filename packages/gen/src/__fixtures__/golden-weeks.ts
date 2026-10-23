/** Weeks whose full output is pinned in the golden fixtures. */
export const GOLDEN_WEEKS = ['2026-10-19', '2026-10-26', '2027-01-04'];

/** Each format's fixture; Gen 4 OU keeps the file it started with. */
export const goldenFile = (format: string) =>
  format === 'gen4ou' ? 'golden.json' : `golden-${format}.json`;
