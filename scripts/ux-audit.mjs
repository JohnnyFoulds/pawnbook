/* eslint-disable no-console */
/**
 * UX audit script — captures full-page screenshots of every route.
 * Run: node scripts/ux-audit.mjs
 * Requires: npx playwright install chromium (if not already installed)
 */
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const OUT  = join(dirname(fileURLToPath(import.meta.url)), '../ux-audit-screenshots');
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: '01-home',        url: '/' },
  { name: '02-play',        url: '/play.html' },
  { name: '03-games',       url: '/games.html' },
  { name: '04-repertoire',  url: '/repertoire.html' },
  { name: '05-stats',       url: '/stats.html' },
  { name: '06-quiz',        url: '/quiz.html' },
  { name: '07-review',      url: '/review.html' },
  { name: '08-puzzles',     url: '/puzzles.html' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

for (const { name, url } of PAGES) {
  try {
    await page.goto(`${BASE}${url}`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
  }
}

await browser.close();
console.log(`\nScreenshots saved to: ${OUT}`);
