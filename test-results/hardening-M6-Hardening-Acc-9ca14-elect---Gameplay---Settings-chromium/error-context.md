# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hardening.spec.ts >> M6 Hardening: Accessibility, Responsiveness, Reduced Effects, FPS >> keyboard-only path navigates Lobby -> Mode Select -> Gameplay -> Settings
- Location: apps\web\e2e\hardening.spec.ts:59:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('#mode-select-view')
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" locator('#mode-select-view') with timeout 5000ms
  - waiting for locator('#mode-select-view')
    13 × locator resolved to <div id="mode-select-view" class="my-auto mx-auto w-full max-w-xl twilight-glass rounded-[2rem] p-5 sm:p-7 flex-col gap-5 hidden">…</div>
       - unexpected value "hidden"

```

```yaml
- banner:
  - button "Starspell"
  - text: Sunset Breeze Chapter 1
  - img
  - text: 45 ☀ 0 Lvl 1 • 0
  - button "Toggle Sound":
    - img
  - button "Open Settings":
    - img
- main:
  - button "Listen":
    - img
    - text: Listen
  - button "Skip -3.0s"
  - paragraph
  - img
  - paragraph: Tap ⌫ to fix a highlighted letter
  - navigation "On-screen Keyboard":
    - button "Q"
    - button "W"
    - button "E"
    - button "R"
    - button "T"
    - button "Y"
    - button "U"
    - button "I"
    - button "O"
    - button "P"
    - button "A"
    - button "S"
    - button "D"
    - button "F"
    - button "G"
    - button "H"
    - button "J"
    - button "K"
    - button "L"
    - button "↵"
    - button "Z"
    - button "X"
    - button "C"
    - button "V"
    - button "B"
    - button "N"
    - button "M"
    - button "⌫"
- button "Play Sunset Breeze"
- button "Sign In / Sign Up"
- button "Sound & Scenery":
  - img
  - text: Sound & Scenery
- text: "Difficulty: Easy • Sunset Breeze"
- heading "Starspell" [level=1]
- paragraph: Breathe in the warm golden canyon air and weave lantern words across the ridge before dusk settles.
- button "Easy Sunset Breeze Warm golden canyon":
  - text: Easy
  - paragraph: Sunset Breeze
  - paragraph: Warm golden canyon
- button "Intermediate Twilight Journey Moonlit indigo canyon":
  - text: Intermediate
  - paragraph: Twilight Journey
  - paragraph: Moonlit indigo canyon
- button "Hard Eclipse of the Summit Crimson lunar eclipse":
  - text: Hard
  - paragraph: Eclipse of the Summit
  - paragraph: Crimson lunar eclipse
- button "Start Playing →"
- button "Multiplayer"
- button "Leaderboards"
- text: Level 1 • Sunset Breeze Best 0 • Streak 0
- paragraph: Guest progress is stored on this device
```

# Test source

```ts
  1   | import AxeBuilder from '@axe-core/playwright';
  2   | import { expect, test } from '@playwright/test';
  3   | 
  4   | const WIDTHS = [
  5   |   { width: 390, height: 844 },
  6   |   { width: 768, height: 1024 },
  7   |   { width: 1280, height: 800 },
  8   | ] as const;
  9   | 
  10  | test.describe('M6 Hardening: Accessibility, Responsiveness, Reduced Effects, FPS', () => {
  11  |   test('axe accessibility audit passes on Lobby, Settings, Auth, Leaderboards, Multiplayer, and Gameplay', async ({
  12  |     page,
  13  |   }) => {
  14  |     await page.goto('/');
  15  |     await expect(page.locator('#btn-to-modes')).toBeVisible();
  16  | 
  17  |     const checkAxe = async (label: string) => {
  18  |       const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  19  |       const serious = results.violations.filter(
  20  |         (v) => v.impact === 'critical' || v.impact === 'serious',
  21  |       );
  22  |       expect(serious, `Axe serious/critical violations on ${label}`).toEqual([]);
  23  |     };
  24  | 
  25  |     await checkAxe('Lobby');
  26  | 
  27  |     // Settings modal
  28  |     await page.click('#btn-lobby-settings');
  29  |     await expect(page.locator('#settings-overlay')).toBeVisible();
  30  |     await checkAxe('Settings');
  31  |     await page.click('#btn-close-settings');
  32  | 
  33  |     // Auth modal
  34  |     await page.click('#btn-account-signin');
  35  |     await expect(page.locator('#auth-modal-overlay')).toBeVisible();
  36  |     await checkAxe('AuthModal');
  37  |     await page.click('#btn-close-auth');
  38  | 
  39  |     // Leaderboards modal
  40  |     await page.click('#btn-lobby-leaderboards');
  41  |     await expect(page.locator('#leaderboards-modal-overlay')).toBeVisible();
  42  |     await checkAxe('LeaderboardsModal');
  43  |     await page.click('#btn-close-leaderboards');
  44  | 
  45  |     // Multiplayer modal
  46  |     await page.click('#btn-lobby-multiplayer');
  47  |     await expect(page.locator('#multiplayer-modal-overlay')).toBeVisible();
  48  |     await checkAxe('MultiplayerModal');
  49  |     await page.click('#btn-close-multiplayer');
  50  | 
  51  |     // Mode select & Gameplay
  52  |     await page.click('#btn-to-modes');
  53  |     await checkAxe('ModeSelect');
  54  |     await page.click('#btn-begin-journey');
  55  |     await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);
  56  |     await checkAxe('Gameplay');
  57  |   });
  58  | 
  59  |   test('keyboard-only path navigates Lobby -> Mode Select -> Gameplay -> Settings', async ({
  60  |     page,
  61  |   }) => {
  62  |     await page.goto('/');
  63  |     await page.keyboard.press('Enter');
> 64  |     await expect(page.locator('#mode-select-view')).toBeVisible();
      |                                                     ^ Error: expect(locator).toBeVisible() failed
  65  |     await page.keyboard.press('Enter');
  66  |     await expect(page.locator('#gameplay-arena')).not.toHaveClass(/opacity-0/);
  67  |     await page.click('#btn-hud-settings');
  68  |     await expect(page.locator('#settings-overlay')).toBeVisible();
  69  |     await page.keyboard.press('Escape');
  70  |     await expect(page.locator('#settings-overlay')).toBeHidden();
  71  |   });
  72  | 
  73  |   for (const vp of WIDTHS) {
  74  |     test(`responsive layout has no horizontal overflow at ${String(vp.width)}x${String(vp.height)}`, async ({
  75  |       page,
  76  |     }) => {
  77  |       await page.setViewportSize({ width: vp.width, height: vp.height });
  78  |       await page.goto('/');
  79  |       await expect(page.locator('#btn-to-modes')).toBeVisible();
  80  |       const overflow = await page.evaluate(
  81  |         () => document.documentElement.scrollWidth > window.innerWidth,
  82  |       );
  83  |       expect(overflow).toBe(false);
  84  |     });
  85  |   }
  86  | 
  87  |   test('reduced-effects setting applies reduced-motion class and measures lobby & gameplay FPS', async ({
  88  |     page,
  89  |   }) => {
  90  |     await page.goto('/');
  91  |     await page.click('#btn-lobby-settings');
  92  |     await page.click('#chk-reduce-motion');
  93  |     await expect(page.locator('body')).toHaveClass(/reduced-motion/);
  94  |     await page.click('#btn-close-settings');
  95  | 
  96  |     const measureFps = async () => {
  97  |       return page.evaluate(
  98  |         () =>
  99  |           new Promise<number>((resolve) => {
  100 |             let frames = 0;
  101 |             const start = performance.now();
  102 |             const step = (now: number) => {
  103 |               frames += 1;
  104 |               if (now - start >= 500) {
  105 |                 resolve(Math.round((frames * 1000) / (now - start)));
  106 |                 return;
  107 |               }
  108 |               requestAnimationFrame(step);
  109 |             };
  110 |             requestAnimationFrame(step);
  111 |           }),
  112 |       );
  113 |     };
  114 | 
  115 |     const lobbyFps = await measureFps();
  116 |     expect(lobbyFps).toBeGreaterThan(5);
  117 | 
  118 |     await page.click('#btn-to-modes');
  119 |     await page.click('#btn-begin-journey');
  120 |     const gameplayFps = await measureFps();
  121 |     console.log(JSON.stringify({ lobbyFps, gameplayFps }));
  122 |     expect(gameplayFps).toBeGreaterThan(5);
  123 |   });
  124 | });
  125 | 
```