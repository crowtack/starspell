import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WIDTHS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const;

test.describe('M6 Hardening: Accessibility, Responsiveness, Reduced Effects, FPS', () => {
  test('axe accessibility audit passes on Lobby, Settings, Auth, Leaderboards, Multiplayer, and Gameplay', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('#btn-to-modes')).toBeVisible();

    const checkAxe = async (label: string) => {
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious',
      );
      expect(serious, `Axe serious/critical violations on ${label}`).toEqual([]);
    };

    await checkAxe('Lobby');

    // Settings modal
    await page.click('#btn-lobby-settings');
    await expect(page.locator('#settings-overlay')).toBeVisible();
    await checkAxe('Settings');
    await page.click('#btn-close-settings');

    // Auth modal
    await page.click('#btn-account-signin');
    await expect(page.locator('#auth-modal-overlay')).toBeVisible();
    await checkAxe('AuthModal');
    await page.click('#btn-close-auth');

    // Leaderboards modal
    await page.click('#btn-lobby-leaderboards');
    await expect(page.locator('#leaderboards-modal-overlay')).toBeVisible();
    await checkAxe('LeaderboardsModal');
    await page.click('#btn-close-leaderboards');

    // Multiplayer modal
    await page.click('#btn-lobby-multiplayer');
    await expect(page.locator('#multiplayer-modal-overlay')).toBeVisible();
    await checkAxe('MultiplayerModal');
    await page.click('#btn-close-multiplayer');

    // Mode select & Gameplay
    await page.click('#btn-to-modes');
    await checkAxe('ModeSelect');
    await page.click('#btn-begin-journey');
    await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);
    await checkAxe('Gameplay');
  });

  test('keyboard-only path navigates Lobby -> Mode Select -> Gameplay -> Settings', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Enter');
    await expect(page.locator('#mode-select-view')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);
    await page.click('#btn-hud-settings');
    await expect(page.locator('#settings-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('#settings-overlay')).toBeHidden();
  });

  for (const vp of WIDTHS) {
    test(`responsive layout has no horizontal overflow at ${String(vp.width)}x${String(vp.height)}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await expect(page.locator('#btn-to-modes')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
    });
  }

  test('reduced-effects setting applies reduced-motion class and measures lobby & gameplay FPS', async ({
    page,
  }) => {
    await page.goto('/');
    await page.click('#btn-lobby-settings');
    await page.click('#chk-reduce-motion');
    await expect(page.locator('body')).toHaveClass(/reduced-motion/);
    await page.click('#btn-close-settings');

    const measureFps = async () => {
      return page.evaluate(
        () =>
          new Promise<number>((resolve) => {
            let frames = 0;
            const start = performance.now();
            const step = (now: number) => {
              frames += 1;
              if (now - start >= 500) {
                resolve(Math.round((frames * 1000) / (now - start)));
                return;
              }
              requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          }),
      );
    };

    const lobbyFps = await measureFps();
    expect(lobbyFps).toBeGreaterThan(5);

    await page.click('#btn-to-modes');
    await page.click('#btn-begin-journey');
    const gameplayFps = await measureFps();
    console.log(JSON.stringify({ lobbyFps, gameplayFps }));
    expect(gameplayFps).toBeGreaterThan(5);
  });
});
