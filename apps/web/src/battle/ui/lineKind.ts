/**
 * How much a line of the log matters, as on Showdown: what happened (moves, who
 * came in, who fainted, and how much damage it did) stands out, and the small print
 * (abilities showing, weather going on, leftovers, residual damage) shrinks.
 */
export type LineKind =
  'turn' | 'move' | 'switch' | 'faint' | 'damage' | 'effect' | 'minor' | 'normal';

const MINOR =
  /restored a little HP using|had its HP restored|is sapped by|is buffeted by|was hurt by|is hurt by|is exerting its pressure|stats were not lowered|shared their pain|Pointed stones (?:dug|float)|was damaged by the recoil|is raging|is crashing down|continues to|is still|loses? \w+ type this turn|^Rain |^The sunlight|^The (?:sandstorm|hail)/;

export function lineKind(line: string): LineKind {
  if (/^== Turn \d+ ==$/.test(line)) return 'turn';
  if (/ used \*\*.+\*\*/.test(line)) return 'move';
  if (/ fainted!$/.test(line)) return 'faint';
  if (/^(?:Go! |The opponent sent out |The opponent withdrew )|, come back!$/.test(line)) {
    return 'switch';
  }
  if (/lost (?:some of its HP|[\d.]+% of its health)/.test(line)) return 'damage';
  if (
    /^(?:It's super effective!|It's not very effective\.\.\.|A critical hit!|It doesn't affect|But it failed!|But there was no target)/.test(
      line,
    )
  ) {
    return 'effect';
  }
  if (/^\[.*\]$/.test(line) || /^\(.*\)$/.test(line) || MINOR.test(line)) return 'minor';
  return 'normal';
}
