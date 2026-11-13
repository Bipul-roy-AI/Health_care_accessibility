// Browser checks for the Distance page and the site-wide language switch.
//   BASE_URL=http://127.0.0.1:8000 node tests/atlas.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
// Basemap tiles are the only external requests the Distance page may make; tests answer them with a blank PNG.
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org)$/;
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const PAGES = ['index.html', 'overview.html', 'statistics.html', 'analysis.html', 'atlas.html', 'accessibility.html', 'helplines.html'];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const watch = (page, allowExternal = false) => {
    page.on('pageerror', (e) => errors.push(`${page.url()} pageerror: ${e.message}`));
    // Pages with an OpenStreetMap basemap may fail to fetch tiles offline; script errors still count.
    page.on('console', (m) => { if (m.type() === 'error' && !(allowExternal && /Failed to load resource/.test(m.text()))) errors.push(`${page.url()} console: ${m.text()}`); });
    if (!allowExternal) page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(base).origin && !TILE_HOSTS.test(u.hostname)) errors.push('external request: ' + u.href); });
  };
  const levels = JSON.parse(fs.readFileSync('data/atlas/manifest.json', 'utf8')).levels;

  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await context.route((url) => TILE_HOSTS.test(url.hostname), (route) => route.fulfill({ contentType: 'image/png', body: BLANK_PNG }));
  const page = await context.newPage();
  watch(page);
  await page.goto(base + '/atlas.html');
  await page.evaluate(() => localStorage.removeItem('shasthopath-language'));
  await page.reload();
  await page.waitForSelector('#atlas-content:not([hidden])', { timeout: 30000 });
  await page.waitForFunction((n) => document.querySelectorAll('#atlas-map path.leaflet-interactive').length === n, levels.district, { timeout: 30000 });
  for (const id of ['#k-hospitals', '#k-public-median', '#k-any10', '#k-primary5']) assert.notEqual((await page.textContent(id)).trim(), '—', id);
  for (const id of ['#c-rank', '#c-div10', '#c-divprimary', '#c-curve', '#c-flagged', '#c-status', '#c-beds-public', '#c-beds-private']) assert.ok(await page.$(`${id} svg`), id);
  assert.equal(await page.$$eval('#c-curve svg path[fill="none"]', (p) => p.length), 4);
  assert.equal(await page.$$eval('#t-national tr', (r) => r.length), 4);
  assert.equal(await page.$$eval('#t-disparity tr', (r) => r.length), 4);

  // Basemap switcher: grey OSM by default, then streets, terrain and none; fills thin out over tiles.
  await page.waitForSelector('#atlas-map .light-basemap-tiles img.leaflet-tile', { state: 'attached' });
  assert.equal(await page.$eval('#atlas-map .choropleth-basemap select', (s) => s.options.length), 4);
  const opacity = () => page.$eval('#atlas-map path.leaflet-interactive', (p) => Number(p.getAttribute('fill-opacity')));
  assert.ok((await opacity()) < 0.8);
  await page.selectOption('#atlas-map .choropleth-basemap select', 'terrain');
  await page.waitForSelector('#atlas-map img.leaflet-tile[src*="opentopomap"]', { state: 'attached' });
  await page.selectOption('#atlas-map .choropleth-basemap select', 'none');
  await page.waitForFunction(() => !document.querySelector('#atlas-map img.leaflet-tile'));
  assert.ok((await opacity()) > 0.9);
  await page.selectOption('#atlas-map .choropleth-basemap select', 'light');

  // Every level draws all of its areas; unions use a canvas.
  for (const [level, count] of [['division', levels.division], ['upazila', levels.upazila]]) {
    await page.selectOption('#a-level', level);
    await page.waitForFunction((n) => document.querySelectorAll('#atlas-map path.leaflet-interactive').length === n, count, { timeout: 30000 });
  }
  await page.selectOption('#a-level', 'union');
  await page.waitForFunction(() => document.querySelector('#atlas-map canvas') && !document.querySelector('#atlas-map.loading'), null, { timeout: 60000 });
  assert.match(await page.textContent('#a-export'), /5,160 union/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#a-export')]);
  const csv = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '').trim().split('\n');
  assert.equal(csv.length, levels.union + 1);

  // Measures change the legend; the per-100k measure exists only for divisions.
  await page.selectOption('#a-level', 'district');
  await page.waitForFunction((n) => document.querySelectorAll('#atlas-map path.leaflet-interactive').length === n, levels.district);
  assert.equal(await page.locator('#a-metric option[value="per100k"]').count(), 0);
  await page.selectOption('#a-metric', 'primary_median');
  assert.match(await page.textContent('.choropleth-legend'), /primary care/);

  // Search selects and describes an area.
  await page.fill('#a-search', 'Bandarban');
  await page.dispatchEvent('#a-search', 'change');
  await page.waitForFunction(() => /Bandarban/.test(document.querySelector('#a-detail h3')?.textContent || ''));
  assert.match(await page.textContent('#a-detail'), /BBS pcode/);

  // Language: switch, persist across pages, every page translated.
  await page.click('#language');
  assert.equal(await page.getAttribute('html', 'lang'), 'bn');
  assert.equal(await page.textContent('h1'), 'স্বাস্থ্যসেবার দূরত্ব');
  assert.match(await page.textContent('#k-hospitals'), /[০-৯]/);
  assert.equal((await page.textContent('#atlas-map .choropleth-basemap span')).trim(), 'বেসম্যাপ');
  for (const name of PAGES) {
    const p = await context.newPage(); // same context: shares the stored language
    watch(p, name === 'index.html' || name === 'overview.html');
    await p.goto(`${base}/${name}`);
    await p.waitForTimeout(1500);
    assert.equal(await p.getAttribute('html', 'lang'), 'bn', `${name} should open in Bangla`);
    assert.equal((await p.textContent('#language')).trim(), 'English', name);
    assert.match(await p.textContent('h1'), /[ঀ-৿]/, `${name} heading in Bangla`);
    const navLinks = await p.$$eval('nav[aria-label="Main navigation"] a', (as) => as.map((a) => a.textContent));
    assert.equal(navLinks.length, 7, name);
    navLinks.forEach((t) => assert.match(t, /[ঀ-৿]/, `${name} nav "${t}"`));
    assert.match(await p.title(), /স্বাস্থ্যপথ/, `${name} title`);
    await p.close();
  }
  await page.click('#language');
  assert.equal(await page.getAttribute('html', 'lang'), 'en');

  // No page links to the removed research page.
  for (const name of PAGES) {
    const text = await (await page.request.get(`${base}/${name}`)).text();
    assert.doesNotMatch(text, /research\.html|Al Jubaer|aljubaer/i, name);
    assert.match(text, /src="\.\/i18n\.js/, `${name} loads i18n.js`);
  }

  // An outdated data file must produce a visible message, never empty sections.
  const stale = await context.newPage();
  await stale.route('**/data/atlas/distance.json', (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ classes: {}, national: {} }) }));
  await stale.goto(base + '/atlas.html');
  await stale.waitForFunction(() => !document.querySelector('#atlas-status').hidden && document.querySelector('#atlas-content').hidden, null, { timeout: 30000 });
  assert.match(await stale.textContent('#atlas-status'), /older version|could not be loaded/);
  await stale.close();

  // Mobile: no horizontal overflow on the Distance page.
  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobile.route((url) => TILE_HOSTS.test(url.hostname), (route) => route.fulfill({ contentType: 'image/png', body: BLANK_PNG }));
  watch(mobile);
  await mobile.goto(base + '/atlas.html');
  await mobile.waitForSelector('#atlas-content:not([hidden])');
  await mobile.waitForTimeout(1500);
  assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 1), 'mobile overflow');

  if (errors.length) console.error(errors.join("\n"));
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: Distance page (4 levels, 9 measures, disparities, quality, CSV) and English/Bangla on all 7 pages with persistence.');
})().catch((error) => { console.error(error); process.exit(1); });
