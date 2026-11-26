import { describe, expect, it } from 'vitest';
import { getWebStubDifficultyCount } from './index.js';

describe('web stub', () => {
  it('resolves shared difficulty configs', () => {
    expect(getWebStubDifficultyCount()).toBe(3);
  });
});
