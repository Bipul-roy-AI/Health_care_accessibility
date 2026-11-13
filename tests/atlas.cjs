// Browser checks for the site-wide language switch, navigation and the old Distance page redirect.
//   BASE_URL=http://127.0.0.1:8000 node tests/atlas.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
// Basemap tiles are the only external requests the Distance page may make; tests answer them with a blank PNG.
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org)$/;
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
const PAGES = ['index.html', 'overview.html', 'statistics.html', 'analysis.html', 'accessibility.html', 'helplines.html'];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  const errors = [];
  const watch = (page, allowExternal = false) => {
    page.on('pageerror', (e) => errors.push(`${page.url()} pageerror: ${e.message}`));
    // Pages with an OpenStreetMap basemap may fail to fetch tiles offline; script errors still count.
    page.on('console', (m) => { if (m.type() === 'error' && !(allowExternal && /Failed to load resource/.test(m.text()))) errors.push(`${page.url()} console: ${m.text()}`); });
    if (!allowExternal) page.on('request', (r) => { const u = new URL(r.url()); if (u.origin !== new URL(base).origin && !TILE_HOSTS.test(u.hostname)) errors.push('external request: ' + u.href); });
  };
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, acceptDownloads: true });
  await context.route((url) => TILE_HOSTS.test(url.hostname), (route) => route.fulfill({ contentType: 'image/png', body: BLANK_PNG }));

  // The Distance page now lives on the Access page: old links redirect (keeping any #section).
  const moved = await context.newPage();
  watch(moved);
  await moved.goto(base + '/atlas.html');
  await moved.waitForURL(/accessibility\.html#map-section$/);
  await moved.goto(base + '/atlas.html#quality');
  await moved.waitForURL(/accessibility\.html#quality$/);
  await moved.close();

  const page = await context.newPage();
  watch(page);
  await page.goto(base + '/accessibility.html');
  await page.evaluate(() => localStorage.removeItem('shasthopath-language'));
  await page.reload();
  await page.waitForSelector('#atlas-content:not([hidden])', { timeout: 30000 });

  // Language: switch, persist across pages, every page translated.
  await page.click('#language');
  assert.equal(await page.getAttribute('html', 'lang'), 'bn');
  assert.equal(await page.textContent('h1'), 'স্বাস্থ্যসেবায় প্রবেশগম্যতা');
  assert.match(await page.textContent('#k-public5'), /[০-৯]/);
  assert.equal((await page.textContent('#access-map .map-layer-control .map-layer-row span')).trim(), 'বেসম্যাপ');
  for (const name of PAGES) {
    const p = await context.newPage(); // same context: shares the stored language
    watch(p, name === 'index.html' || name === 'overview.html');
    await p.goto(`${base}/${name}`);
    await p.waitForTimeout(1500);
    assert.equal(await p.getAttribute('html', 'lang'), 'bn', `${name} should open in Bangla`);
    assert.equal((await p.textContent('#language')).trim(), 'English', name);
    assert.match(await p.textContent('h1'), /[ঀ-৿]/, `${name} heading in Bangla`);
    const navLinks = await p.$$eval('nav[aria-label="Main navigation"] a', (as) => as.map((a) => a.textContent));
    assert.equal(navLinks.length, 6, name);
    assert.ok(!(await p.$('nav[aria-label="Main navigation"] a[href="./atlas.html"]')), `${name} still links the old Distance page`);
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
  await stale.goto(base + '/accessibility.html');
  await stale.waitForFunction(() => !document.querySelector('#atlas-status').hidden && document.querySelector('#atlas-content').hidden, null, { timeout: 30000 });
  assert.match(await stale.textContent('#atlas-status'), /older version|could not be loaded/);
  await stale.close();

  if (errors.length) console.error(errors.join("\n"));
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('PASS: Distance page redirects to Access (hash kept); English/Bangla on all 6 pages with persistence; 6-item navigation; stale-data message.');
})().catch((error) => { console.error(error); process.exit(1); });
