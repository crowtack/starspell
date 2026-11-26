import { describe, expect, it } from 'vitest';
import { ACTIVE_CHECKPOINT_STORAGE_KEY, createInitialSoloState, reduce } from '@starspell/shared';
import {
  clearActiveCheckpoint,
  loadActiveCheckpoint,
  saveActiveCheckpoint,
} from './activeCheckpoint';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(map.keys())[index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

describe('activeCheckpoint', () => {
  it('saves, loads, and clears a playing checkpoint', () => {
    const storage = createMemoryStorage();
    const started = reduce(createInitialSoloState(), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed: 42,
    });
    const afterOne = reduce(started, { type: 'word_solved', elapsedSeconds: 2.5 });

    saveActiveCheckpoint(
      {
        style: 'ECHO',
        soloState: afterOne,
        elapsedSinceLastEvent: 1.25,
        savedAt: 1700000000000,
      },
      storage,
    );

    const loaded = loadActiveCheckpoint(storage);
    expect(loaded).not.toBeNull();
    expect(loaded?.style).toBe('ECHO');
    expect(loaded?.soloState.wordIndex).toBe(1);
    expect(loaded?.soloState.score).toBe(afterOne.score);
    expect(loaded?.elapsedSinceLastEvent).toBe(1.25);

    clearActiveCheckpoint(storage);
    expect(loadActiveCheckpoint(storage)).toBeNull();
  });

  it('returns null for corrupt JSON or non-playing state', () => {
    const storage = createMemoryStorage();
    storage.setItem(ACTIVE_CHECKPOINT_STORAGE_KEY, '{not valid json');
    expect(loadActiveCheckpoint(storage)).toBeNull();

    storage.setItem(
      ACTIVE_CHECKPOINT_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        style: 'STARLIGHT',
        soloState: createInitialSoloState(), // status: 'idle'
        elapsedSinceLastEvent: 0,
        savedAt: 1,
      }),
    );
    expect(loadActiveCheckpoint(storage)).toBeNull();
  });
});
