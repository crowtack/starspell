/**
 * Capture visual parity screenshots for Starspell M1.
 * Serves apps/web/dist (production build) and reference/starspell.html,
 * and captures desktop (1280x720) & mobile (390x844) screenshots of all screens.
 * Run from repo root: node scripts/capture-parity.mjs
 */
import playwright from '@playwright/test';
const { chromium } = playwright;
import { createServer } from 'http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const CWD = process.cwd();
const OUT = join(CWD, 'docs', 'parity');
mkdirSync(OUT, { recursive: true });

const PORT_PORT = 4176;
const DESKTOP = { width: 1280, height: 720 };
const MOBILE = { width: 390, height: 844 };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function staticServer(root, port) {
  return new Promise((resolve) => {
    const srv = createServer((req, res) => {
      let url = (req.url || '/').split('?')[0];
      if (url === '/') url = '/index.html';
      const fp = join(root, url);
      if (existsSync(fp) && statSync(fp).isFile()) {
        const ext = extname(fp);
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
        createReadStream(fp).pipe(res);
      } else {
        const idx = join(root, 'index.html');
        if (existsSync(idx)) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          createReadStream(idx).pipe(res);
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      }
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function capturePortSet(browser, baseUrl, viewport, suffix) {
  const ctx = await browser.newContext({ viewport });
  const p = await ctx.newPage();
  await p.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await wait(1200);

  // Lobby across all 3 difficulties
  for (const diff of ['EASY', 'INTERMEDIATE', 'HARD']) {
    await p.locator(`[data-diff="${diff}"]`).click();
    await wait(900);
    await p.screenshot({ path: join(OUT, `port-lobby-${diff.toLowerCase()}-${suffix}.png`) });
    console.log(`  port-lobby-${diff.toLowerCase()}-${suffix}.png ✓`);
  }

  // Settings modal (from lobby)
  await p.locator('#btn-lobby-settings').click();
  await wait(400);
  await p.screenshot({ path: join(OUT, `port-settings-${suffix}.png`) });
  console.log(`  port-settings-${suffix}.png ✓`);
  await p.locator('#btn-save-settings').click();
  await wait(300);

  // Style select (EASY)
  await p.locator('[data-diff="EASY"]').click();
  await wait(400);
  await p.locator('#btn-to-modes').click();
  await wait(400);
  await p.screenshot({ path: join(OUT, `port-styleselect-${suffix}.png`) });
  console.log(`  port-styleselect-${suffix}.png ✓`);

  // Gameplay across all 3 difficulties (with 4 letters typed)
  for (const diff of ['EASY', 'INTERMEDIATE', 'HARD']) {
    await p.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await wait(500);
    await p.locator(`[data-diff="${diff}"]`).click();
    await p.locator('#btn-to-modes').click();
    await p.locator('[data-mode="STARLIGHT"]').click();
    await p.locator('#btn-begin-journey').click();
    await wait(1400); // let 750ms opening lantern settle, scenery transition finish
    for (const ch of ['s', 't', 'a', 'r']) {
      await p.keyboard.press(ch);
      await wait(80);
    }
    await wait(250);
    await p.screenshot({ path: join(OUT, `port-gameplay-${diff.toLowerCase()}-${suffix}.png`) });
    console.log(`  port-gameplay-${diff.toLowerCase()}-${suffix}.png ✓`);
  }

  await ctx.close();
}

async function main() {
  const distDir = join(CWD, 'apps', 'web', 'dist');
  if (!existsSync(distDir)) {
    console.error('ERROR: apps/web/dist not found.');
    process.exit(1);
  }
  const portSrv = await staticServer(distDir, PORT_PORT);
  const browser = await chromium.launch({ headless: true });

  try {
    const baseUrl = `http://127.0.0.1:${PORT_PORT}/`;
    console.log('\n── Desktop 1280×720 ──');
    await capturePortSet(browser, baseUrl, DESKTOP, 'desktop');

    console.log('\n── Mobile 390×844 ──');
    await capturePortSet(browser, baseUrl, MOBILE, 'mobile');
  } finally {
    await browser.close();
    portSrv.close();
  }

  console.log('\n✅ Parity screenshots updated in docs/parity/');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
