import { describe, expect, it } from 'vitest';
import { explainer } from './labels';

describe('explainer', () => {
  it('gives hazards’ exact damage, and Air Balloon only once it exists', () => {
    expect(explainer('stealthrock', 4)).toContain('12.5% if neutral, 25% if weak (50% if 4× weak)');
    expect(explainer('spikes', 3)).toContain('12.5% of max HP with one layer, 16.7% with two, 25%');
    expect(explainer('spikes', 4)).not.toContain('Air Balloon');
    expect(explainer('spikes', 5)).toContain('Levitate or an Air Balloon');
  });
});
