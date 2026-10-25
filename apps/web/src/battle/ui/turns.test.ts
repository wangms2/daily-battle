import { describe, expect, it } from 'vitest';
import { turnBlocks } from './turns';

describe('turnBlocks', () => {
  it('closes each turn at the marker the engine writes as the next begins', () => {
    const log = [
      'Go! **Blissey**!',
      'The opponent sent out **Ursaring**!',
      '== Turn 1 ==',
      'The opposing Ursaring used **Facade**!',
      'Blissey used **Calm Mind**!',
      '== Turn 2 ==',
    ];
    expect(turnBlocks(log)).toEqual([
      { label: 'Battle start', lines: ['Go! **Blissey**!', 'The opponent sent out **Ursaring**!'] },
      {
        label: 'Turn 1',
        lines: ['The opposing Ursaring used **Facade**!', 'Blissey used **Calm Mind**!'],
      },
    ]);
  });

  it('keeps a turn in progress, or waiting on a forced switch, as the last block', () => {
    const log = ['Go! **A**!', '== Turn 1 ==', '**A** used **U-turn**!', "It's super effective!"];
    const blocks = turnBlocks(log);
    expect(blocks.map((b) => b.label)).toEqual(['Battle start', 'Turn 1']);
    expect(blocks[1]!.lines).toEqual(['**A** used **U-turn**!', "It's super effective!"]);
  });

  it('carries a turn across a forced switch into the lines that finish it', () => {
    const log = [
      '== Turn 3 ==',
      '**A** used **U-turn**!',
      'Go! **B**!',
      'The opposing C used **Surf**!',
      '== Turn 4 ==',
    ];
    expect(turnBlocks(log)).toEqual([
      { label: 'Turn 2', lines: [] },
      {
        label: 'Turn 3',
        lines: ['**A** used **U-turn**!', 'Go! **B**!', 'The opposing C used **Surf**!'],
      },
    ]);
  });

  it('skips blank lines and has no blocks for an empty log', () => {
    expect(turnBlocks([])).toEqual([]);
    expect(turnBlocks(['', '  '])).toEqual([]);
  });
});
