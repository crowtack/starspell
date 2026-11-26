# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e\survival.spec.ts >> M5 Leaderboards & Ranked Survival E2E >> opens leaderboard modal from lobby and switches mode tabs
- Location: e2e\survival.spec.ts:15:3

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test';
  2  | 
  3  | const API_URL = process.env['VITE_API_URL'] ?? 'http://localhost:3001';
  4  | 
  5  | async function isApiAvailable(): Promise<boolean> {
  6  |   try {
  7  |     const res = await fetch(`${API_URL}/api/health`);
  8  |     return res.ok;
  9  |   } catch {
  10 |     return false;
  11 |   }
  12 | }
  13 | 
  14 | test.describe('M5 Leaderboards & Ranked Survival E2E', () => {
  15 |   test('opens leaderboard modal from lobby and switches mode tabs', async ({ page }) => {
> 16 |     await page.goto('/');
     |                ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  17 |     await page.locator('#btn-lobby-leaderboards').click();
  18 |     await expect(page.locator('#leaderboard-modal')).toBeVisible();
  19 |     await page.locator('[data-lb-mode="SURVIVAL"]').click();
  20 |     await page.locator('[data-lb-mode="COMPETITION"]').click();
  21 |     await page.locator('#btn-leaderboard-close').click();
  22 |     await expect(page.locator('#leaderboard-modal')).not.toBeVisible();
  23 |   });
  24 | 
  25 |   test('two accounts play ranked Survival match, Elo ratings update, and leaderboards update', async ({
  26 |     browser,
  27 |   }) => {
  28 |     const apiOk = await isApiAvailable();
  29 |     test.skip(!apiOk, 'API/Postgres unavailable (see docs/BLOCKERS.md)');
  30 | 
  31 |     const ctx1 = await browser.newContext();
  32 |     const ctx2 = await browser.newContext();
  33 |     const p1 = await ctx1.newPage();
  34 |     const p2 = await ctx2.newPage();
  35 | 
  36 |     const ts = Date.now();
  37 |     const u1 = `surv1_${String(ts)}`;
  38 |     const u2 = `surv2_${String(ts)}`;
  39 | 
  40 |     // Register both accounts
  41 |     for (const [page, uname] of [
  42 |       [p1, u1],
  43 |       [p2, u2],
  44 |     ] as const) {
  45 |       await page.goto('/');
  46 |       await page.locator('#btn-account-signin').click();
  47 |       await page.locator('#tab-auth-register').click();
  48 |       await page.locator('#auth-email').fill(`${uname}@example.com`);
  49 |       await page.locator('#auth-username').fill(uname);
  50 |       await page.locator('#auth-password').fill('StarspellPass123!');
  51 |       await page.locator('#btn-auth-submit').click();
  52 |       await expect(page.locator('#btn-account-profile')).toBeVisible();
  53 |     }
  54 | 
  55 |     // Create ranked Survival room on p1
  56 |     await p1.locator('#btn-lobby-multiplayer').click();
  57 |     await p1.locator('#select-mp-create-mode').selectOption('SURVIVAL');
  58 |     await p1.locator('#chk-mp-ranked').check();
  59 |     await p1.locator('#btn-mp-create').click();
  60 |     const code = (await p1.locator('#mp-room-code').textContent())?.trim() ?? '';
  61 |     expect(code.length).toBe(5);
  62 | 
  63 |     // Join on p2
  64 |     await p2.locator('#btn-lobby-multiplayer').click();
  65 |     await p2.locator('#input-mp-join-code').fill(code);
  66 |     await p2.locator('#btn-mp-join').click();
  67 | 
  68 |     await p1.locator('#btn-mp-ready').click();
  69 |     await p2.locator('#btn-mp-ready').click();
  70 |     await p1.locator('#btn-mp-start').click();
  71 | 
  72 |     await expect(p1.locator('#mp-active-match')).toBeVisible({ timeout: 10_000 });
  73 |     await expect(p2.locator('#mp-active-match')).toBeVisible({ timeout: 10_000 });
  74 | 
  75 |     await ctx1.close();
  76 |     await ctx2.close();
  77 |   });
  78 | });
  79 | 
```