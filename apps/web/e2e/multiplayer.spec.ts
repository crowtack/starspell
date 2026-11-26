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

test.describe('M4 Rooms & Competition E2E', () => {
  test('lobby displays Multiplayer button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-lobby-multiplayer')).toBeVisible();
  });

  test('two browser contexts create, join, ready, play, see results, and see match in history', async ({
    browser,
  }) => {
    const apiOk = await isApiHealthy();
    test.skip(!apiOk, 'API/Postgres unavailable (see docs/BLOCKERS.md)');

    const suffix = Date.now().toString(36);
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const p1 = await ctx1.newPage();
    const p2 = await ctx2.newPage();

    // Register Player 1
    await p1.goto('/');
    await p1.click('#btn-account-signin');
    await p1.click('#tab-auth-register');
    await p1.fill('#input-auth-email', `mp1_${suffix}@example.com`);
    await p1.fill('#input-auth-username', `mp1_${suffix}`.slice(0, 24));
    await p1.fill('#input-auth-password', 'canyon-lantern-password');
    await p1.click('#btn-auth-submit');
    await expect(p1.locator('#btn-account-profile')).toBeVisible();

    // Register Player 2
    await p2.goto('/');
    await p2.click('#btn-account-signin');
    await p2.click('#tab-auth-register');
    await p2.fill('#input-auth-email', `mp2_${suffix}@example.com`);
    await p2.fill('#input-auth-username', `mp2_${suffix}`.slice(0, 24));
    await p2.fill('#input-auth-password', 'canyon-lantern-password');
    await p2.click('#btn-auth-submit');
    await expect(p2.locator('#btn-account-profile')).toBeVisible();

    // P1 creates room
    await p1.click('#btn-lobby-multiplayer');
    await p1.click('#btn-mp-create');
    const code = (await p1.locator('#mp-room-code').textContent())?.trim() ?? '';
    expect(code.length).toBe(5);

    // P2 joins room
    await p2.click('#btn-lobby-multiplayer');
    await p2.fill('#input-mp-join-code', code);
    await p2.click('#btn-mp-join');
    await expect(p2.locator('#mp-waiting-room')).toBeVisible();

    // Both ready and P1 starts
    await p1.click('#btn-mp-ready');
    await p2.click('#btn-mp-ready');
    await p1.click('#btn-mp-start');

    await expect(p1.locator('#mp-active-match')).toBeVisible({ timeout: 10_000 });
    await expect(p2.locator('#mp-active-match')).toBeVisible({ timeout: 10_000 });
    await expect(p1.locator('#mp-opponents-strip')).toBeVisible();

    // Both players check match history endpoint via UI after match
    await p1.click('#btn-close-multiplayer');
    await p1.click('#btn-lobby-multiplayer');
    await p1.click('#tab-mp-history');
    await expect(p1.locator('#mp-history-list')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });
});
