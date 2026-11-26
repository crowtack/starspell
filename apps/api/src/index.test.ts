import { describe, expect, it } from 'vitest';
import { getApiStubWordsPerChapter } from './index.js';

describe('api stub', () => {
  it('resolves shared constants', () => {
    expect(getApiStubWordsPerChapter()).toBe(15);
  });
});
