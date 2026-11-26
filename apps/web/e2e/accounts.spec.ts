import { expect, test } from '@playwright/test';

const API_URL = process.env['VITE_API_URL'] ?? 'http://localhost:3001';

async function isApiHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/health`);
    if (!res.ok) return false;
    const data = (await res.json()) as { status?: string; db?: string };
    return data.status === 'ok';
  } catch {
    return false;
  }
}

test.describe('M2 Accounts & Guest Import', () => {
  test('lobby displays guest storage notice and Sign In / Sign Up button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#btn-account-signin')).toBeVisible();
    await expect(page.locator('#guest-storage-notice')).toContainText(
      'Guest progress is stored on this device',
    );
  });

  test('register, import guest progress, log out, log in from fresh context and see same profile', async ({
    browser,
    page,
  }) => {
    const apiOk = await isApiHealthy();
    test.skip(!apiOk, 'API/Postgres unavailable (see docs/BLOCKERS.md)');

    const suffix = Date.now().toString(36);
    const email = `e2e_${suffix}@example.com`;
    const username = `e2e_${suffix}`.slice(0, 24);
    const password = 'canyon-lantern-password';

    // Seed local guest save before registering
    await page.addInitScript(() => {
      const save = {
        version: 1,
        selectedDifficulty: 'EASY',
        profile: {
          xp: 1200,
          level: 3,
          highScore: 1850,
          bestStreak: 8,
          wordsSolved: 25,
          constellationsCleared: 2,
        },
        difficulties: {
          EASY: {
            unlocked: true,
            completed: true,
            highScore: 1850,
            bestStreak: 8,
            wordsSolved: 25,
            runsCleared: 2,
          },
          INTERMEDIATE: {
            unlocked: true,
            completed: false,
            highScore: 0,
            bestStreak: 0,
            wordsSolved: 0,
            runsCleared: 0,
          },
          HARD: {
            unlocked: true,
            completed: false,
            highScore: 0,
            bestStreak: 0,
            wordsSolved: 0,
            runsCleared: 0,
          },
        },
        settings: {
          masterVol: 0.8,
          musicVol: 0.65,
          sfxVol: 0.85,
          musicEnabled: true,
          typingSfxEnabled: true,
          gameSfxEnabled: true,
          reducedEffects: false,
        },
      };
      window.localStorage.setItem('starspell_celestial_v1', JSON.stringify(save));
    });

    await page.goto('/');
    await page.click('#btn-account-signin');
    await page.click('#tab-auth-register');
    await page.fill('#input-auth-email', email);
    await page.fill('#input-auth-username', username);
    await page.fill('#input-auth-password', password);
    await page.click('#btn-auth-submit');

    // Guest import modal opens automatically after registration when guest XP > 0
    await expect(page.locator('#guest-import-overlay')).toBeVisible();
    await page.click('#btn-confirm-guest-import');
    await expect(page.locator('#guest-import-overlay')).toBeHidden();

    // Verify profile shows imported progress
    await page.click('#btn-account-profile');
    await expect(page.locator('#profile-stat-xp')).toHaveText('1200');
    await expect(page.locator('#profile-imported-badge')).toBeVisible();
    await page.click('#btn-close-profile');

    // Log out
    await page.click('#btn-account-logout');
    await expect(page.locator('#btn-account-signin')).toBeVisible();

    // Fresh browser context -> log in -> verify same profile
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto('/');
    await freshPage.click('#btn-account-signin');
    await freshPage.fill('#input-auth-identifier', username);
    await freshPage.fill('#input-auth-password', password);
    await freshPage.click('#btn-auth-submit');

    await expect(freshPage.locator('#btn-account-profile')).toContainText(`@${username}`);
    await freshPage.click('#btn-account-profile');
    await expect(freshPage.locator('#profile-stat-xp')).toHaveText('1200');
    await expect(freshPage.locator('#profile-imported-badge')).toBeVisible();
    await freshContext.close();
  });
});
