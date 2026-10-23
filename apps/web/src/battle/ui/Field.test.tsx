import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { MonView, SideConds, View } from '../frames';
import { Field } from './Field';

const side: SideConds = { sr: false, spikes: 0, tspikes: 0, reflect: false, lightScreen: false };
const mon = (species: string, substitute = false): MonView => ({
  species,
  hp: 100,
  status: '',
  boosts: {},
  substitute,
  fainted: false,
});
const view = (you: MonView, foe: MonView): View => ({
  turn: 1,
  you,
  foe,
  yourSide: side,
  foeSide: side,
  weather: '',
  revealed: {},
  yourTeam: [],
  foeTeam: [],
});

function show(v: View) {
  return render(
    <Field
      view={v}
      anim={null}
      animate={false}
      background="bg.png"
      floats={[]}
      onFloatDone={() => {}}
      onTap={() => {}}
      info={null}
      onInfo={() => {}}
      popover={null}
    />,
  );
}

describe('Field', () => {
  it('shows the Pokémon, and the substitute doll while it has one up', () => {
    const { container, rerender } = show(view(mon('Heatran', true), mon('Gengar')));
    const srcs = () =>
      [...container.querySelectorAll<HTMLImageElement>('[data-mon] img')].map((i) => i.src);
    expect(srcs().some((s) => s.includes('substitute'))).toBe(true);
    expect(srcs().some((s) => s.includes('gengar'))).toBe(true);
    rerender(
      <Field
        view={view(mon('Heatran'), mon('Gengar'))}
        anim={null}
        animate={false}
        background="bg.png"
        floats={[]}
        onFloatDone={() => {}}
        onTap={() => {}}
        info={null}
        onInfo={() => {}}
        popover={null}
      />,
    );
    expect(srcs().some((s) => s.includes('substitute'))).toBe(false);
  });
});
