import { describe, expect, it } from 'vitest';
import {
  createDefaultSaveData,
  parseSaveData,
  SAVE_SCHEMA_VERSION,
  SAVE_STORAGE_KEY,
} from './save.js';

describe('save schema (GAME_RULES §8)', () => {
  it('exposes the canonical storage key and defaults', () => {
    expect(SAVE_STORAGE_KEY).toBe('starspell_celestial_v1');
    const def = createDefaultSaveData();
    expect(def.schemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(def.selectedDifficulty).toBe('EASY');
    expect(def.difficulties.EASY.unlocked).toBe(true);
    expect(def.difficulties.INTERMEDIATE.unlocked).toBe(true);
    expect(def.difficulties.HARD.unlocked).toBe(true);
  });

  it('loads a prototype save without schemaVersion and forces all difficulties unlocked', () => {
    const prototypeSave = {
      profile: {
        xp: 1250,
        level: 3,
        highScore: 4800,
        bestStreak: 11,
        wordsSolved: 45,
        constellationsCleared: 3,
      },
      selectedDifficulty: 'HARD',
      difficulties: {
        EASY: {
          unlocked: false,
          completed: true,
          highScore: 2200,
          bestStreak: 8,
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
          highScore: 4800,
          bestStreak: 11,
          wordsSolved: 30,
          runsCleared: 2,
        },
      },
      settings: {
        masterVol: 0.5,
        musicEnabled: false,
      },
    };

    const parsed = parseSaveData(prototypeSave);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.selectedDifficulty).toBe('HARD');
    expect(parsed.profile.xp).toBe(1250);
    expect(parsed.profile.level).toBe(3);
    expect(parsed.difficulties.EASY.unlocked).toBe(true);
    expect(parsed.difficulties.INTERMEDIATE.unlocked).toBe(true);
    expect(parsed.difficulties.HARD.unlocked).toBe(true);
    expect(parsed.difficulties.HARD.runsCleared).toBe(2);
    expect(parsed.settings.masterVol).toBe(0.5);
    expect(parsed.settings.musicEnabled).toBe(false);
    // Missing setting fields filled from defaults
    expect(parsed.settings.musicVol).toBe(0.65);
    expect(parsed.settings.sfxVol).toBe(0.85);
  });

  it('falls back gracefully for corrupted or invalid inputs', () => {
    const fromNull = parseSaveData(null);
    expect(fromNull).toEqual(createDefaultSaveData());

    const fromBadFields = parseSaveData({
      selectedDifficulty: 'UNKNOWN',
      profile: { xp: -50 },
      settings: { masterVol: 99 },
    });
    expect(fromBadFields.selectedDifficulty).toBe('EASY');
    expect(fromBadFields.profile).toEqual(createDefaultSaveData().profile);
    expect(fromBadFields.settings).toEqual(createDefaultSaveData().settings);
  });
});
