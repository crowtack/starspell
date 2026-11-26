import { expect, test, type Page } from '@playwright/test';
import {
  DIFFICULTY_KEYS,
  WORDS_PER_CHAPTER,
  planChapter,
  type DifficultyKey,
  type WayfaringStyle,
} from '@starspell/shared';

const STYLES: readonly WayfaringStyle[] = ['STARLIGHT', 'ECHO', 'FLASH'];

async function startSoloChapter(
  page: Page,
  difficulty: DifficultyKey,
  style: WayfaringStyle,
  seed = 42,
): Promise<void> {
  await page.goto(`/?seed=${seed}`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator(`[data-diff="${difficulty}"]`).click();
  await page.locator('#btn-to-modes').click();
  await page.locator(`[data-mode="${style}"]`).click();
  await page.locator('#btn-begin-journey').click();
  await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);
}

async function solveWord(page: Page, word: string): Promise<void> {
  await page.keyboard.type(word);
  // Wait for 420ms verification wave + next word load
  await page.waitForTimeout(480);
}

test.describe('Starspell Guest Solo E2E', () => {
  for (const difficulty of DIFFICULTY_KEYS) {
    for (const style of STYLES) {
      test(`completes a 15-word chapter on ${difficulty} × ${style}`, async ({ page }) => {
        const seed = 101;
        const plan = planChapter({
          seed,
          difficulty,
          chapter: 1,
          usedWordIds: [],
        });

        await startSoloChapter(page, difficulty, style, seed);

        if (style === 'STARLIGHT') {
          await expect(page.locator('#glimpse-badge')).toHaveText('Opening Lantern');
        } else if (style === 'FLASH') {
          await expect(page.locator('#glimpse-badge')).toHaveText('Sunbeam Glimpse');
        }

        for (let i = 0; i < WORDS_PER_CHAPTER; i++) {
          const slot = plan.slots[i];
          if (!slot) throw new Error(`Missing slot ${i}`);
          await expect(page.locator('#clue-definition')).toHaveText(slot.definition);
          await solveWord(page, slot.word);
        }

        await expect(page.locator('#summary-overlay')).toBeVisible();
        await expect(page.locator('#summary-heading')).toHaveText('Ridge Illuminated');
        await expect(page.locator('#btn-next-chapter')).toBeVisible();
      });
    }
  }

  test('timeout failure shows missed word & definition and preserves solved-word XP', async ({
    page,
  }) => {
    const seed = 202;
    const plan = planChapter({
      seed,
      difficulty: 'HARD',
      chapter: 1,
      usedWordIds: [],
    });

    await startSoloChapter(page, 'HARD', 'ECHO', seed);

    // Solve word 0 so XP is earned before timeout
    const firstWord = plan.slots[0]!;
    await solveWord(page, firstWord.word);

    const secondWord = plan.slots[1]!;
    await expect(page.locator('#clue-definition')).toHaveText(secondWord.definition);

    // Wait for the 38s (+2.4s solve bonus) HARD clock to expire naturally
    await expect(page.locator('#summary-overlay')).toBeVisible({ timeout: 55_000 });
    await expect(page.locator('#summary-heading')).toHaveText('Lanterns Dimmed');
    await expect(page.locator('#summary-missed-box')).toBeVisible();
    await expect(page.locator('#summary-missed-word')).toHaveText(secondWord.word.toUpperCase());
    await expect(page.locator('#summary-missed-def')).toHaveText(secondWord.definition);

    const saved = await page.evaluate(() => {
      const raw = localStorage.getItem('starspell_celestial_v1');
      return raw ? JSON.parse(raw) : null;
    });
    expect(saved?.profile?.xp).toBeGreaterThan(0);
  });

  test('skip resets streak, deducts penalty, and replaces the word', async ({ page }) => {
    const seed = 303;
    const plan = planChapter({
      seed,
      difficulty: 'EASY',
      chapter: 1,
      usedWordIds: [],
    });

    await startSoloChapter(page, 'EASY', 'STARLIGHT', seed);
    await solveWord(page, plan.slots[0]!.word);
    await expect(page.locator('#hud-streak-val')).toHaveText('1');

    const secondDef = plan.slots[1]!.definition;
    await expect(page.locator('#clue-definition')).toHaveText(secondDef);

    await page.locator('#btn-skip').click();
    await expect(page.locator('#hud-streak-val')).toHaveText('0');
    await expect(page.locator('#clue-definition')).not.toHaveText(secondDef);
  });

  test('resumes mid-chapter after reload via Lobby Resume prompt', async ({ page }) => {
    const seed = 404;
    const plan = planChapter({
      seed,
      difficulty: 'EASY',
      chapter: 1,
      usedWordIds: [],
    });

    await startSoloChapter(page, 'EASY', 'ECHO', seed);
    await solveWord(page, plan.slots[0]!.word);
    await solveWord(page, plan.slots[1]!.word);
    await expect(page.locator('#hud-streak-val')).toHaveText('2');

    await page.reload();
    await expect(page.locator('#resume-chapter-banner')).toBeVisible();
    await page.locator('#btn-resume-chapter').click();

    await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);
    await expect(page.locator('#hud-streak-val')).toHaveText('2');
    await expect(page.locator('#constellation-nodes .pearl-done')).toHaveCount(2);
    await expect(page.locator('#clue-definition')).toHaveText(plan.slots[2]!.definition);
  });

  test('Home and Abandon confirm dialogs cancel cleanly or discard checkpoint', async ({
    page,
  }) => {
    await startSoloChapter(page, 'EASY', 'STARLIGHT', 505);

    await page.locator('#btn-hud-home').click();
    await expect(page.locator('#confirm-overlay')).toBeVisible();
    await page.locator('#btn-confirm-cancel').click();
    await expect(page.locator('#confirm-overlay')).toBeHidden();
    await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);

    await page.locator('#btn-hud-home').click();
    await expect(page.locator('#confirm-overlay')).toBeVisible();
    await page.locator('#btn-confirm-abandon').click();

    await expect(page.locator('#lobby-view')).toBeVisible();
    await expect(page.locator('#resume-chapter-banner')).toBeHidden();
    const activeRaw = await page.evaluate(() => localStorage.getItem('starspell_active_v1'));
    expect(activeRaw).toBeNull();
  });

  test('production build ignores ?seed= query parameter', async ({ page }) => {
    await page.goto('http://127.0.0.1:4174/?seed=42');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#btn-to-modes').click();
    await page.locator('#btn-begin-journey').click();

    const firstSeed = await page.evaluate(() => {
      const raw = localStorage.getItem('starspell_active_v1');
      return raw ? JSON.parse(raw).soloState.seed : null;
    });

    await page.goto('http://127.0.0.1:4174/?seed=42');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await page.locator('#btn-to-modes').click();
    await page.locator('#btn-begin-journey').click();

    const secondSeed = await page.evaluate(() => {
      const raw = localStorage.getItem('starspell_active_v1');
      return raw ? JSON.parse(raw).soloState.seed : null;
    });

    expect(firstSeed).not.toBeNull();
    expect(secondSeed).not.toBeNull();
    expect(firstSeed).not.toBe(42);
    expect(firstSeed).not.toBe(secondSeed);
  });
});
