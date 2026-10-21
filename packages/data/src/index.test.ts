import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@daily-battle/data', () => {
  it('loads', () => {
    expect(packageName).toBe('@daily-battle/data');
  });
});
