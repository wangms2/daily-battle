// The playtest report (M9): what a tester copies from Settings and pastes back,
// and what the pipeline's calibrate script reads. Anonymous by construction:
// dates, the tester's own team and leads, and each try's outcome. No names,
// seeds, choices, or anything about the opponent beyond the date.

export const REPORT_HEADER = '#daily-battle-report v1';

export interface ReportTry {
  /** w = win, l = loss, f = gave up (or abandoned). */
  r: 'w' | 'l' | 'f';
  /** The tester's Pokémon left at the end. */
  left: number;
  /** Choices made, a rough proxy for turns. */
  n: number;
  lead: string;
}

export interface ReportDay {
  /** `YYYY-MM-DD` */
  d: string;
  /** Team species for the first try, lead first. */
  team: string[];
  /** Finished tries in order (practice runs included; the first 3 count). */
  tries: ReportTry[];
}

export interface PlaytestReport {
  v: 1;
  /** Engine version (`sim … ai …`). */
  engine: string;
  hints: boolean;
  speed: string;
  days: ReportDay[];
}

/** The text to copy: the header line, then the report as one line of JSON. */
export function formatReport(report: PlaytestReport): string {
  return `${REPORT_HEADER}\n${JSON.stringify(report)}`;
}

/** Every report found in pasted text (chat logs may hold several, or wrap lines). */
export function parseReports(text: string): PlaytestReport[] {
  const out: PlaytestReport[] = [];
  for (const chunk of text.split(REPORT_HEADER).slice(1)) {
    const start = chunk.indexOf('{');
    if (start < 0) continue;
    // Take the first balanced JSON object, tolerating line breaks added by chat apps.
    let depth = 0;
    let inString = false;
    for (let i = start; i < chunk.length; i++) {
      const c = chunk[i];
      if (inString) {
        if (c === '\\') i++;
        else if (c === '"') inString = false;
      } else if (c === '"') inString = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try {
          const report = JSON.parse(
            chunk.slice(start, i + 1).replace(/\r?\n/g, ''),
          ) as PlaytestReport;
          if (report.v === 1 && Array.isArray(report.days)) out.push(report);
        } catch {
          // Not a report after all; skip it.
        }
        break;
      }
    }
  }
  return out;
}
