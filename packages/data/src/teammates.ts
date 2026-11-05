// Teammate and counter stats, kept out of the main entry so the web bundle
// never carries them: only the schedule pipeline builds opponents from them.
import gen3ou from '../sources/gen3ou-teammates.json';
import gen4ou from '../sources/gen4ou-teammates.json';
import gen5ou from '../sources/gen5ou-teammates.json';
import gen6ou from '../sources/gen6ou-teammates.json';
import type { FormatId } from './formats';
import type { TeammatesFile } from './types';

export type { TeammatesFile } from './types';

const FILES: Record<FormatId, TeammatesFile> = {
  gen3ou: gen3ou as TeammatesFile,
  gen4ou: gen4ou as TeammatesFile,
  gen5ou: gen5ou as TeammatesFile,
  gen6ou: gen6ou as TeammatesFile,
};

/** A format's teammate and counter stats. */
export function teammatesFor(format: string): TeammatesFile {
  const found = FILES[format as FormatId];
  if (!found) throw new Error(`No teammate stats for ${format}`);
  return found;
}
