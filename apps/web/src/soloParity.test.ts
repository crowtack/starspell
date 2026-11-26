import { describe, expect, it } from 'vitest';
import {
  DIFFICULTY_CONFIGS,
  STREAK_MILESTONES,
  WORDS_PER_CHAPTER,
  calculateLevel,
  createInitialSoloState,
  reduce,
} from '@starspell/shared';

describe('Solo Q4 XP and score parity with prototype', () => {
  it('matches prototype end-of-chapter XP, score, and level totals for an uninterrupted 15-word chapter', () => {
    for (const diffKey of ['EASY', 'INTERMEDIATE', 'HARD'] as const) {
      const cfg = DIFFICULTY_CONFIGS[diffKey];
      let state = reduce(createInitialSoloState({ difficulty: diffKey, totalXp: 0 }), {
        type: 'chapter_started',
        difficulty: diffKey,
        chapter: 1,
        seed: 777,
      });

      // Simulate prototype end-of-chapter math independently
      let protoScore = 0;
      let protoStreak = 0;
      let protoXp = 0;
      let protoClock = cfg.initialClock;

      for (let i = 0; i < WORDS_PER_CHAPTER; i++) {
        const word = state.slots[i];
        expect(word).toBeDefined();
        if (!word) return;
        const elapsed = 1.5;
        protoClock = Math.max(0, protoClock - elapsed);
        protoClock = Math.min(cfg.initialClock + 15, protoClock + cfg.solveBonus);

        protoStreak += 1;
        let mult = 1.0;
        for (const m of STREAK_MILESTONES) {
          if (protoStreak >= m.streak) mult = m.mult;
        }
        const wordPoints = Math.round(word.word.length * 25 * cfg.xpMultiplier * mult);
        const wordXp = Math.round(wordPoints * 0.4);
        protoScore += wordPoints;
        protoXp += wordXp;

        state = reduce(state, { type: 'word_solved', elapsedSeconds: elapsed });
        expect(state.totalXp).toBe(protoXp);
        expect(state.level).toBe(calculateLevel(protoXp));
      }

      const timeBonusXp = Math.round(protoClock * 12 * cfg.xpMultiplier);
      protoXp += timeBonusXp;
      const protoLevel = Math.max(1, Math.floor(protoXp / 600) + 1);

      state = reduce(state, { type: 'chapter_finished', elapsedSeconds: 0 });
      expect(state.status).toBe('victory');
      expect(state.score).toBe(protoScore);
      expect(state.chapterXp).toBe(protoXp);
      expect(state.totalXp).toBe(protoXp);
      expect(state.level).toBe(protoLevel);
    }
  });
});
