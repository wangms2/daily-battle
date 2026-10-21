import { describe, expect, it } from 'vitest';
import { packageName } from './index';

describe('@daily-battle/pipeline', () => {
  it('loads', () => {
    expect(packageName).toBe('@daily-battle/pipeline');
  });
});
