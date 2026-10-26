// The Gen 3 course (DESIGN.md §22, docs/plan-tutorial-coach.md step 4b): short
// lessons on the battle screen, in course order. The course map
// (course/outline.ts) lists all 18; the rest are still being made.
import { effective } from './course/effective';
import { immune } from './course/immune';
import { priority } from './course/priority';
import { reviewDamage } from './course/review-damage';
import { reviewSwitching } from './course/review-switching';
import { speed } from './course/speed';
import { split } from './course/split';
import { stab } from './course/stab';
import { switching } from './course/switching';
import { turn } from './course/turn';
import type { Lesson } from '../types';

/** The Gen 3 lessons and unit reviews, in course order. */
export const gen3Lessons: Lesson[] = [
  turn,
  effective,
  immune,
  stab,
  split,
  reviewDamage,
  switching,
  speed,
  priority,
  reviewSwitching,
];
