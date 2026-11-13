// Browser checks for the Distance atlas page. Run against a served _site:
//   BASE_URL=http://127.0.0.1:8000 node tests/atlas.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const watch = (page) => {
    page.on('pageerror', (error) => errors.push('pageerror: ' + error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push('console: ' + message.text()); });
    // The page must not need any third-party host: no basemap, no CDN.
    page.on('request', (request) => { const url = new URL(request.url()); if (url.origin !== new URL(base).origin) errors.push('external request: ' + url.href); });
  };

  const page = await browser.newPage({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  watch(page);
  await page.goto(base + '/atlas.html');
  await page.waitForSelector('#atlas-content:not([hidden])', { timeout: 30000 });
  await page.waitForFunction(() => document.querySelectorAll('#atlas-map path.leaflet-interactive').length === 544, null, { timeout: 30000 });

  for (const id of ['#k-points', '#k-listings', '#k-public-median', '#k-any10', '#k-public10', '#m-cells']) {
    const text = (await page.textContent(id)).trim();
    assert.ok(text && text !== '—', `${id} should be filled, got "${text}"`);
  }
  assert.equal(await page.textContent('#k-points'), '6,027');
  assert.equal(await page.textContent('#k-listings'), '8,363');

  // Every chart rendered an SVG, the curve has three lines, tables are filled.
  for (const id of ['#c-far', '#c-dense', '#c-curve', '#c-div10', '#c-divmedian', '#c-beds-public', '#c-beds-private', '#c-growth']) {
    assert.ok(await page.$(`${id} svg`), `${id} should contain an SVG chart`);
  }
  assert.equal(await page.$$eval('#c-curve svg path[fill="none"]', (paths) => paths.length), 3);
  assert.equal(await page.$$eval('#t-national tr', (rows) => rows.length), 3);
  assert.equal(await page.$$eval('#t-divisions tr', (rows) => rows.length), 8);
  assert.equal(await page.$$eval('#t-services tr', (rows) => rows.length), 3);

  // Switching measures recolours the map and rewrites the legend.
  const legendBefore = await page.textContent('.choropleth-legend');
  await page.selectOption('#a-metric', 'hospital_points');
  await page.waitForFunction((before) => document.querySelector('.choropleth-legend').textContent !== before, legendBefore);
  assert.match(await page.textContent('.choropleth-legend'), /Hospital points inside/);

  // Clicking a polygon fills the detail panel.
  await page.locator('#atlas-map').scrollIntoViewIfNeeded();
  const box = await page.locator('#atlas-map').boundingBox();
  await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.42);
  await page.waitForFunction(() => document.querySelector('#a-detail dl'));
  assert.match(await page.textContent('#a-detail'), /BBS pcode/);

  // Search selects an upazila by name.
  await page.fill('#a-search', 'Char Fasson');
  await page.dispatchEvent('#a-search', 'change');
  await page.waitForFunction(() => document.querySelector('#a-detail h3').textContent === 'Char Fasson');

  // CSV export: header plus 544 rows.
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#a-export')]);
  const csv = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').trim().split('\n');
  assert.equal(csv.length, 545);
  assert.match(csv[0], /^pcode,upazila,district/);

  if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.SCREENSHOT_DIR}/atlas-desktop.png`, fullPage: true });

  // Mobile: no horizontal overflow, map still drawn.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  watch(mobile);
  await mobile.goto(base + '/atlas.html');
  await mobile.waitForFunction(() => document.querySelectorAll('#atlas-map path.leaflet-interactive').length === 544, null, { timeout: 30000 });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 1, `mobile horizontal overflow: ${overflow}px`);
  if (process.env.SCREENSHOT_DIR) await mobile.screenshot({ path: `${process.env.SCREENSHOT_DIR}/atlas-mobile.png`, fullPage: true });

  // The new nav link exists on every page.
  for (const name of ['index.html', 'overview.html', 'statistics.html', 'helplines.html', 'accessibility.html', 'analysis.html', 'research.html']) {
    const response = await page.request.get(`${base}/${name}`);
    assert.match(await response.text(), /href="\.\/atlas\.html"/, `${name} should link to the atlas`);
  }

  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: atlas loads 544 upazilas, 8 charts, 3 tables, measure switch, click and search detail, 544-row CSV, mobile layout, nav links, no external requests or console errors.');
})().catch((error) => { console.error(error); process.exit(1); });
