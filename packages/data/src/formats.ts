// The formats Daily Battle plays. Everything format-specific (the sim's
// format id, its dex generation, the lower tier its extra sets come from)
// hangs off this, so a second format is a new entry rather than new code.

export interface FormatInfo {
  /** The sim's format id, e.g. `gen4ou`. */
  id: string;
  /** Dex generation. */
  gen: number;
  /** Player-facing name, e.g. "Gen 4". */
  name: string;
  /** The curated tier used for below-OU species without OU sets, e.g. `gen4uu`. */
  uu: string;
  /** Whether the sim shows both teams before the battle (Gen 5 onward). */
  teamPreview: boolean;
}

export const FORMATS = {
  gen4ou: { id: 'gen4ou', gen: 4, name: 'Gen 4', uu: 'gen4uu', teamPreview: false },
  gen5ou: { id: 'gen5ou', gen: 5, name: 'Gen 5', uu: 'gen5uu', teamPreview: true },
} as const satisfies Record<string, FormatInfo>;

export type FormatId = keyof typeof FORMATS;

export const DEFAULT_FORMAT: FormatId = 'gen4ou';

export function formatInfo(id: string): FormatInfo {
  const info = (FORMATS as Record<string, FormatInfo>)[id];
  if (!info) throw new Error(`Unknown format ${id}`);
  return info;
}

/** Dex generation of a format id, e.g. `gen4ou` → 4. */
export const genOf = (format: string): number => formatInfo(format).gen;
