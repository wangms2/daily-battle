import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@daily-battle/ai', () => {
  it('loads', () => {
    expect(packageName).toBe('@daily-battle/ai');
  });
});
