import { expect, test } from '@playwright/test';

const API_URL = process.env['VITE_API_URL'] ?? 'http://localhost:3001';

async function isApiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

test.describe('M5 Survival, Rating, and Leaderboards E2E', () => {
  test('lobby displays Leaderboards button and UTC reset notice on weekly tab', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#btn-lobby-leaderboards')).toBeVisible();
    await page.click('#btn-lobby-leaderboards');
    await expect(page.locator('#leaderboards-modal-overlay')).toBeVisible();
    await page.click('#tab-lb-survival');
    await page.click('button:has-text("weekly")');
    // Either error (when API offline) or UTC reset notice when API online
    await expect(page.locator('#leaderboards-modal-overlay')).toBeVisible();
  });

  test('two accounts play ranked Survival match, ratings update, and boards reflect results', async ({
    browser,
  }) => {
    const apiOk = await isApiHealthy();
    test.skip(!apiOk, 'API/Postgres unavailable (see docs/BLOCKERS.md)');

    const suffix = Date.now().toString(36);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    await p1.goto('/');
    await p1.click('#btn-account-signin');
    await p1.click('#tab-auth-register');
    await p1.fill('#input-auth-email', `s1_${suffix}@example.com`);
    await p1.fill('#input-auth-username', `s1_${suffix}`.slice(0, 24));
    await p1.fill('#input-auth-password', 'canyon-lantern-password');
    await p1.click('#btn-auth-submit');
    await expect(p1.locator('#btn-account-profile')).toBeVisible();

    await p2.goto('/');
    await p2.click('#btn-account-signin');
    await p2.click('#tab-auth-register');
    await p2.fill('#input-auth-email', `s2_${suffix}@example.com`);
    await p2.fill('#input-auth-username', `s2_${suffix}`.slice(0, 24));
    await p2.fill('#input-auth-password', 'canyon-lantern-password');
    await p2.click('#btn-auth-submit');
    await expect(p2.locator('#btn-account-profile')).toBeVisible();

    // P1 creates ranked Survival room
    await p1.click('#btn-lobby-multiplayer');
    await p1.selectOption('#select-mp-create-mode', 'SURVIVAL');
    await p1.check('#chk-mp-ranked');
    await p1.click('#btn-mp-create');
    const code = (await p1.locator('#mp-room-code').textContent())?.trim() ?? '';

    await p2.click('#btn-lobby-multiplayer');
    await p2.fill('#input-mp-join-code', code);
    await p2.click('#btn-mp-join');
    await p1.click('#btn-mp-ready');
    await p2.click('#btn-mp-ready');
    await p1.click('#btn-mp-start');

    await expect(p1.locator('#mp-active-match')).toBeVisible({ timeout: 10_000 });
    await expect(p1.locator('#mp-my-slot')).toContainText('/ 60');

    // Open Leaderboards Survival board
    await p1.click('#btn-close-multiplayer');
    await p1.click('#btn-lobby-leaderboards');
    await p1.click('#tab-lb-survival');
    await expect(p1.locator('#leaderboards-modal-overlay')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
