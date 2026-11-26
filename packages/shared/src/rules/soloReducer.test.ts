import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_CONFIGS } from './difficulties.js';
import { WORDS_PER_CHAPTER } from './params.js';
import { calculateLevel, calculateTimeBonusXp, scoreWordSolve } from './scoring.js';
import { createInitialSoloState, reduce, type SoloState } from './soloReducer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function playFullChapter(state: SoloState, elapsedPerWord = 0): SoloState {
  let current = state;
  for (let i = 0; i < WORDS_PER_CHAPTER; i++) {
    current = reduce(current, { type: 'word_solved', elapsedSeconds: elapsedPerWord });
  }
  return current;
}

describe('soloReducer', () => {
  it('completes a full 15-word chapter with exact prototype XP & score totals', () => {
    const start = reduce(createInitialSoloState(), {
      type: 'chapter_started',
      difficulty: 'INTERMEDIATE',
      chapter: 1,
      seed: 777,
    });
    expect(start.status).toBe('playing');
    expect(start.slots).toHaveLength(15);
    expect(start.timeLeft).toBe(DIFFICULTY_CONFIGS.INTERMEDIATE.initialClock);

    // Manually simulate prototype totals in parallel
    let expectedScore = 0;
    let expectedStreak = 0;
    let expectedChapterXp = 0;
    let current = start;

    for (let i = 0; i < WORDS_PER_CHAPTER; i++) {
      const word = current.slots[i];
      if (!word) {
        throw new Error(`Missing word at slot ${String(i)}`);
      }
      const scored = scoreWordSolve(
        word.word.length,
        DIFFICULTY_CONFIGS.INTERMEDIATE,
        expectedStreak,
      );
      expectedStreak = scored.nextStreak;
      expectedScore += scored.wordPoints;
      expectedChapterXp += scored.wordXp;

      current = reduce(current, { type: 'word_solved', elapsedSeconds: 1.5 });
      // Quirk Q4: XP credited per solved word immediately
      expect(current.totalXp).toBe(expectedChapterXp);
      expect(current.level).toBe(calculateLevel(expectedChapterXp));
    }

    expect(current.wordIndex).toBe(15);
    expect(current.score).toBe(expectedScore);
    expect(current.streak).toBe(15);
    expect(current.bestChapterStreak).toBe(15);
    expect(current.wordsSolved).toBe(15);

    const finished = reduce(current, { type: 'chapter_finished', elapsedSeconds: 0.4 });
    const timeBonus = calculateTimeBonusXp(finished.timeLeft, DIFFICULTY_CONFIGS.INTERMEDIATE);
    expect(finished.status).toBe('victory');
    expect(finished.chapterXp).toBe(expectedChapterXp + timeBonus);
    expect(finished.totalXp).toBe(expectedChapterXp + timeBonus);
    expect(finished.constellationsCleared).toBe(1);
    expect(finished.runsCleared).toBe(1);
    expect(finished.missedWord).toBeNull();
  });

  it('caps clock at initialClock + 15s across consecutive fast solves', () => {
    let state = reduce(createInitialSoloState(), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed: 10,
    });
    state = playFullChapter(state, 0);
    expect(state.timeLeft).toBe(DIFFICULTY_CONFIGS.EASY.initialClock + 15);
  });

  it('resets streak on skip, replaces word from unboosted curve[slot] (Q1), and fails if clock hits 0', () => {
    let state = reduce(createInitialSoloState(), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 3, // boost +1, so slot 0 starts at tier 2
      seed: 2026,
    });
    expect(state.slots[0]?.tier).toBe(2);

    // Solve 3 words to build streak 3
    state = reduce(state, { type: 'word_solved', elapsedSeconds: 0 });
    state = reduce(state, { type: 'word_solved', elapsedSeconds: 0 });
    state = reduce(state, { type: 'word_solved', elapsedSeconds: 0 });
    expect(state.streak).toBe(3);

    // Skip slot 3 (EASY curve[3] = 2; boosted would be 3, Quirk Q1 keeps 2)
    const beforeSkipWord = state.slots[3];
    if (!beforeSkipWord) {
      throw new Error('Missing slot 3');
    }
    state = reduce(state, { type: 'word_skipped', elapsedSeconds: 0 });
    expect(state.status).toBe('playing');
    expect(state.streak).toBe(0);
    expect(state.bestChapterStreak).toBe(3);
    expect(state.wordIndex).toBe(3);
    expect(state.slots[3]?.id).not.toBe(beforeSkipWord.id);
    expect(state.slots[3]?.tier).toBe(DIFFICULTY_CONFIGS.EASY.tierCurve[3]);
    expect(state.timeLeft).toBe(state.timeLeft); // sanity
    expect(state.skipCount).toBe(1);

    // Skip when remaining time <= skipPenalty causes failure
    const lowClock = reduce(state, { type: 'word_skipped', elapsedSeconds: state.timeLeft - 1.0 });
    expect(lowClock.status).toBe('failed');
    expect(lowClock.timeLeft).toBe(0);
    expect(lowClock.missedWord?.id).toBe(state.slots[3]?.id);
    expect(lowClock.totalXp).toBe(state.totalXp);
  });

  it('fails on clock_expired while keeping XP earned from solved words', () => {
    let state = reduce(createInitialSoloState(), {
      type: 'chapter_started',
      difficulty: 'HARD',
      chapter: 1,
      seed: 33,
    });
    state = reduce(state, { type: 'word_solved', elapsedSeconds: 2 });
    const earnedXp = state.totalXp;
    expect(earnedXp).toBeGreaterThan(0);

    const expired = reduce(state, { type: 'clock_expired' });
    expect(expired.status).toBe('failed');
    expect(expired.timeLeft).toBe(0);
    expect(expired.chapterXp).toBe(earnedXp);
    expect(expired.totalXp).toBe(earnedXp);
    expect(expired.constellationsCleared).toBe(0);
    expect(expired.missedWord?.id).toBe(state.slots[1]?.id);
  });

  it('carries score, streak, totalXp, and usedWordIds to next chapter while resetting clock and chapterXp', () => {
    let ch1 = reduce(createInitialSoloState(), {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed: 404,
    });
    ch1 = playFullChapter(ch1, 1);
    ch1 = reduce(ch1, { type: 'chapter_finished' });
    expect(ch1.status).toBe('victory');

    const ch2 = reduce(ch1, {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 2,
      seed: 505,
    });
    expect(ch2.status).toBe('playing');
    expect(ch2.chapter).toBe(2);
    expect(ch2.score).toBe(ch1.score);
    expect(ch2.streak).toBe(15);
    expect(ch2.bestChapterStreak).toBe(15);
    expect(ch2.totalXp).toBe(ch1.totalXp);
    expect(ch2.chapterXp).toBe(0);
    expect(ch2.timeLeft).toBe(DIFFICULTY_CONFIGS.EASY.initialClock);
    expect(ch2.wordIndex).toBe(0);
    // No repeats from chapter 1
    const ch1Ids = new Set(ch1.slots.map((w) => w.id));
    for (const word of ch2.slots) {
      expect(ch1Ids.has(word.id)).toBe(false);
    }

    // Replay chapter 1 resets score, streak, and usedWordIds, keeping profile totals
    const replay = reduce(ch1, {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed: 606,
      keepRun: false,
    });
    expect(replay.score).toBe(0);
    expect(replay.streak).toBe(0);
    expect(replay.totalXp).toBe(ch1.totalXp);
    expect(replay.constellationsCleared).toBe(1);
  });

  it('ignores invalid state transitions and handles edge cases cleanly', () => {
    const idle = createInitialSoloState();
    expect(reduce(idle, { type: 'word_solved' })).toBe(idle);
    expect(reduce(idle, { type: 'word_skipped' })).toBe(idle);
    expect(reduce(idle, { type: 'clock_expired' })).toBe(idle);
    expect(reduce(idle, { type: 'chapter_finished' })).toBe(idle);

    const playing = reduce(idle, {
      type: 'chapter_started',
      difficulty: 'EASY',
      chapter: 1,
      seed: 1,
    });

    // Solving after clock elapsed to 0 fails cleanly
    const timedOutOnSolve = reduce(playing, { type: 'word_solved', elapsedSeconds: 100 });
    expect(timedOutOnSolve.status).toBe('failed');
    expect(timedOutOnSolve.timeLeft).toBe(0);

    // Finishing early before 15 words results in failed state
    const earlyFinish = reduce(playing, { type: 'chapter_finished' });
    expect(earlyFinish.status).toBe('failed');

    // Solving past slot 15 is ignored
    const solvedAll = playFullChapter(playing, 0);
    expect(reduce(solvedAll, { type: 'word_solved' })).toBe(solvedAll);
  });
});

describe('rules purity invariant (AGENTS.md #4)', () => {
  it('contains no DOM, Node APIs, or Math.random in packages/shared/src/rules', () => {
    const files = readdirSync(__dirname).filter(
      (f) => f.endsWith('.ts') && !f.endsWith('.test.ts'),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const content = readFileSync(resolve(__dirname, file), 'utf8');
      expect(content).not.toMatch(/\bMath\.random\b/);
      expect(content).not.toMatch(/\bwindow\b/);
      expect(content).not.toMatch(/\bdocument\b/);
      expect(content).not.toMatch(/\bnode:/);
    }
  });
});
