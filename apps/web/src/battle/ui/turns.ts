/**
 * The log split into turns. A `== Turn N ==` line closes the turn that just
 * played (the engine writes it as the next turn starts), so the lines before
 * it are turn N − 1's; the opening lines (Go!, sent out) are the battle start.
 * Lines after the last marker are a turn still being played (or waiting on a
 * forced switch), which carries on into the next block.
 */
export interface TurnBlock {
  /** "Battle start", "Turn 4". */
  label: string;
  lines: string[];
}

export function turnBlocks(log: string[]): TurnBlock[] {
  const blocks: TurnBlock[] = [];
  let lines: string[] = [];
  let next = 1;
  for (const raw of log) {
    const line = raw.trim();
    if (!line) continue;
    const marker = /^== Turn (\d+) ==$/.exec(line);
    if (!marker) {
      lines.push(line);
      continue;
    }
    const n = Number(marker[1]);
    blocks.push({ label: n <= 1 ? 'Battle start' : `Turn ${n - 1}`, lines });
    lines = [];
    next = n;
  }
  if (lines.length) blocks.push({ label: `Turn ${next}`, lines });
  return blocks;
}
