// The lesson catalog: plain data, safe to import on the main thread (no simulator).
import { gen3Lessons } from './gen3/lessons';
import type { Lesson } from './types';

export { gen3Lessons };
export { gen3Course, type CourseLesson, type CourseUnit } from './gen3/course/outline';
export type * from './types';

/** Lessons by format; only Gen 3 has a tutorial so far. */
export const LESSONS: Record<string, Lesson[]> = { gen3ou: gen3Lessons };
