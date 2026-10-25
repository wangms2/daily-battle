import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { lineKind } from './lineKind';
import { BattleLine } from './text';

describe('lineKind', () => {
  it.each([
    ['== Turn 3 ==', 'turn'],
    ['**Blissey** used **Seismic Toss**!', 'move'],
    ['The opposing **Zapdos** used **Thunderbolt**!', 'move'],
    ['Go! **Metagross**!', 'switch'],
    ['The opponent sent out **Hitmontop**!', 'switch'],
    ['Weezing, come back!', 'switch'],
    ['Weezing fainted!', 'faint'],
    ['The opposing Metagross fainted!', 'faint'],
    ['(Blissey lost 14.0% of its health!)', 'damage'],
    ['(The opposing Glalie lost 45% of its health!)', 'damage'],
    ['The opposing Gengar lost some of its HP!', 'damage'],
    ["It's super effective!", 'effect'],
    ["It's not very effective...", 'effect'],
    ['A critical hit!', 'effect'],
    ['But it failed!', 'effect'],
    ["[The opposing Hitmontop's Intimidate]", 'minor'],
    ['(The sandstorm is raging.)', 'minor'],
    ['(Rain continues to fall.)', 'minor'],
    ['Blissey restored a little HP using its Leftovers!', 'minor'],
    ['The opposing Tentacruel is buffeted by the sandstorm!', 'minor'],
    ['The opposing Zapdos was hurt by poison!', 'minor'],
    ["Metagross's stats were not lowered!", 'minor'],
    ["The opposing Gengar's health is sapped by Leech Seed!", 'minor'],
    ["The opposing Kingdra's Sp. Atk fell harshly!", 'normal'],
    ['A sandstorm kicked up!', 'normal'],
  ] as const)('%s is %s', (line, kind) => {
    expect(lineKind(line)).toBe(kind);
  });
});

describe('BattleLine', () => {
  it('highlights the percent a move did, and keeps move names bold', () => {
    const { container } = render(
      <>
        <BattleLine text="(The opposing Glalie lost 45% of its health!)" />
        <BattleLine text="**Diancie** used **Body Press**!" />
      </>,
    );
    expect(container.querySelector('[data-kind="damage"] .battle-pct')?.textContent).toBe('45%');
    expect(container.querySelector('[data-kind="move"] strong')?.textContent).toBe('Diancie');
  });

  it('shows a turn as a divider', () => {
    const { container } = render(<BattleLine text="== Turn 4 ==" />);
    expect(container.querySelector('[data-kind="turn"]')?.textContent).toBe('Turn 4');
  });
});
