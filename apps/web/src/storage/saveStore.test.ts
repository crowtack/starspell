import { describe, expect, it } from 'vitest';
import { SAVE_STORAGE_KEY } from '@starspell/shared';
import { loadSave, persistSave } from './saveStore';

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

describe('saveStore', () => {
  it('loads a prototype save JSON without schemaVersion and keeps all difficulties unlocked', () => {
    const storage = createMemoryStorage();
    const prototypeSave = {
      profile: {
        xp: 1250,
        level: 3,
        highScore: 4200,
        bestStreak: 11,
        wordsSolved: 30,
        constellationsCleared: 2,
      },
      selectedDifficulty: 'HARD',
      difficulties: {
        EASY: {
          unlocked: true,
          completed: true,
          highScore: 3100,
          bestStreak: 9,
          wordsSolved: 15,
          runsCleared: 1,
        },
        INTERMEDIATE: {
          unlocked: false,
          completed: false,
          highScore: 0,
          bestStreak: 0,
          wordsSolved: 0,
          runsCleared: 0,
        },
        HARD: {
          unlocked: false,
          completed: true,
          highScore: 4200,
          bestStreak: 11,
          wordsSolved: 15,
          runsCleared: 1,
        },
      },
      settings: {
        masterVol: 0.7,
        musicVol: 0.5,
        sfxVol: 0.9,
        musicEnabled: false,
        typingSfxEnabled: true,
        gameSfxEnabled: true,
        reducedEffects: true,
      },
    };

    storage.setItem(SAVE_STORAGE_KEY, JSON.stringify(prototypeSave));

    const loaded = loadSave(storage);
    expect(loaded.schemaVersion).toBe(1);
    expect(loaded.profile.xp).toBe(1250);
    expect(loaded.profile.level).toBe(3);
    expect(loaded.selectedDifficulty).toBe('HARD');
    expect(loaded.difficulties.EASY.unlocked).toBe(true);
    expect(loaded.difficulties.INTERMEDIATE.unlocked).toBe(true);
    expect(loaded.difficulties.HARD.unlocked).toBe(true);
    expect(loaded.settings.reducedEffects).toBe(true);
    expect(loaded.settings.musicEnabled).toBe(false);
  });

  it('persists and reloads save data cleanly', () => {
    const storage = createMemoryStorage();
    const initial = loadSave(storage);
    const updated = {
      ...initial,
      selectedDifficulty: 'INTERMEDIATE' as const,
      profile: { ...initial.profile, xp: 600, level: 2 },
    };

    persistSave(updated, storage);
    const reloaded = loadSave(storage);
    expect(reloaded.selectedDifficulty).toBe('INTERMEDIATE');
    expect(reloaded.profile.xp).toBe(600);
    expect(reloaded.profile.level).toBe(2);
  });
});
