import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@daily-battle/gen', () => {
  it('loads', () => {
    expect(packageName).toBe('@daily-battle/gen');
  });
});
