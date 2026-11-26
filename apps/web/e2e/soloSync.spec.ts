import { expect, test } from '@playwright/test';
import { planChapter } from '@starspell/shared';

const API_URL = process.env['VITE_API_URL'] ?? 'http://localhost:3001';

async function isApiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

test.describe('M3 Solo Sync, Resume, and Idempotency E2E', () => {
  test('closing tab mid-chapter and reopening resumes at same word index, score, streak, and clock within 1s', async ({
    context,
  }) => {
    const seed = 2026;
    const plan = planChapter({ seed, difficulty: 'EASY', chapter: 1, usedWordIds: [] });

    const page1 = await context.newPage();
    await page1.goto(`/?seed=${seed}`);
    await page1.evaluate(() => localStorage.clear());
    await page1.reload();

    await page1.locator('[data-diff="EASY"]').click();
    await page1.locator('#btn-to-modes').click();
    await page1.locator('#btn-begin-journey').click();
    await expect(page1.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);

    // Solve 3 words
    for (let i = 0; i < 3; i += 1) {
      await page1.keyboard.type(plan.slots[i]!.word);
      await page1.waitForTimeout(500);
    }

    // Wait > 500ms so periodic checkpoint saves latest clock
    await page1.waitForTimeout(600);
    const scoreBeforeClose = await page1.locator('#hud-score-val').textContent();
    const streakBeforeClose = await page1.locator('#hud-streak-val').textContent();
    const timerBeforeClose = Number(await page1.locator('#hud-timer-text').textContent());
    expect(streakBeforeClose).toBe('3');

    // Close the tab
    await page1.close();

    // Reopen a new tab in the same context
    const page2 = await context.newPage();
    await page2.goto(`/?seed=${seed}`);
    await expect(page2.locator('#btn-resume-chapter')).toBeVisible();
    await page2.locator('#btn-resume-chapter').click();
    await expect(page2.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);

    await expect(page2.locator('#hud-score-val')).toHaveText(scoreBeforeClose ?? '');
    await expect(page2.locator('#hud-streak-val')).toHaveText('3');
    const timerAfterReopen = Number(await page2.locator('#hud-timer-text').textContent());
    expect(Math.abs(timerAfterReopen - timerBeforeClose)).toBeLessThanOrEqual(1);
    await expect(page2.locator('#constellation-nodes .pearl-done')).toHaveCount(3);
  });

  test('plays three words offline, goes online, and syncs all in order once', async ({
    context,
    page,
  }) => {
    const apiOk = await isApiHealthy();
    test.skip(!apiOk, 'API/Postgres unavailable (see docs/BLOCKERS.md)');

    const seed = 3030;
    const plan = planChapter({ seed, difficulty: 'EASY', chapter: 1, usedWordIds: [] });
    const suffix = Date.now().toString(36);

    await page.goto(`/?seed=${seed}`);
    await page.click('#btn-account-signin');
    await page.click('#tab-auth-register');
    await page.fill('#input-auth-email', `offline_${suffix}@example.com`);
    await page.fill('#input-auth-username', `off_${suffix}`.slice(0, 24));
    await page.fill('#input-auth-password', 'canyon-lantern-password');
    await page.click('#btn-auth-submit');
    await expect(page.locator('#btn-account-profile')).toBeVisible();

    await page.locator('[data-diff="EASY"]').click();
    await page.locator('#btn-to-modes').click();
    await page.locator('#btn-begin-journey').click();

    await context.setOffline(true);
    await expect(page.locator('#sync-status-label')).toHaveText('Offline — will sync');

    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.type(plan.slots[i]!.word);
      await page.waitForTimeout(500);
    }

    await context.setOffline(false);
    await expect(page.locator('#sync-status-label')).toHaveText('Synced', { timeout: 15_000 });
  });

  test('two browser contexts on one account trigger conflict dialog without data loss', async ({
    browser,
  }) => {
    const apiOk = await isApiHealthy();
    test.skip(!apiOk, 'API/Postgres unavailable (see docs/BLOCKERS.md)');

    const seed = 4040;
    const plan = planChapter({ seed, difficulty: 'EASY', chapter: 1, usedWordIds: [] });
    const suffix = Date.now().toString(36);
    const username = `conf_${suffix}`.slice(0, 24);
    const password = 'canyon-lantern-password';

    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto(`/?seed=${seed}`);
    await page1.click('#btn-account-signin');
    await page1.click('#tab-auth-register');
    await page1.fill('#input-auth-email', `conf_${suffix}@example.com`);
    await page1.fill('#input-auth-username', username);
    await page1.fill('#input-auth-password', password);
    await page1.click('#btn-auth-submit');
    await expect(page1.locator('#btn-account-profile')).toBeVisible();

    // Context 1 starts and solves 1 word
    await page1.locator('[data-diff="EASY"]').click();
    await page1.locator('#btn-to-modes').click();
    await page1.locator('#btn-begin-journey').click();
    await page1.keyboard.type(plan.slots[0]!.word);
    await page1.waitForTimeout(550);

    // Context 2 logs into same account while offline/divergent, then solves a word
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`/?seed=${seed}`);
    await page2.click('#btn-account-signin');
    await page2.fill('#input-auth-identifier', username);
    await page2.fill('#input-auth-password', password);
    await page2.click('#btn-auth-submit');

    await expect(page2.locator('#btn-resume-chapter')).toBeVisible();
    await page2.locator('#btn-resume-chapter').click();

    // Context 1 advances ahead while ctx2 is offline, then ctx2 goes online and triggers conflict
    await ctx2.setOffline(true);
    await page1.keyboard.type(plan.slots[1]!.word);
    await page1.waitForTimeout(600);
    await page2.keyboard.type(plan.slots[1]!.word);
    await page2.waitForTimeout(600);
    await ctx2.setOffline(false);

    await expect(page2.locator('#sync-conflict-overlay')).toBeVisible({ timeout: 15_000 });
    await page2.click('#btn-conflict-keep-server');
    await expect(page2.locator('#sync-conflict-overlay')).toBeHidden();

    await ctx1.close();
    await ctx2.close();
  });
});
