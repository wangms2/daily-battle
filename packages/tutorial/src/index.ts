export { battleInput, foePolicy, startPosition } from './battle';
export { gen3Lessons } from './gen3/lessons';
export { monSet, teamOf } from './teams';
export type * from './types';
export { lessonProblems } from './validate';

import { gen3Lessons } from './gen3/lessons';
import type { Lesson } from './types';

/** Lessons by format; only Gen 3 has a tutorial so far. */
export const LESSONS: Record<string, Lesson[]> = { gen3ou: gen3Lessons };
