'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [], external = [], requests = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url()); requests.push(url.pathname);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.href); return route.abort(); }
      return route.continue();
    });
    const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
    const baseline = JSON.parse(fs.readFileSync('data/accessibility/baseline/manifest.json', 'utf8'));
    for (const name of ['index.html', 'overview.html', 'statistics.html', 'helplines.html', 'accessibility.html']) {
      const response = await page.request.get(`${base}/${name}`);
      assert.equal(response.status(), 200);
      assert.match(await response.text(), /href="\.\/analysis\.html">Analysis<\/a>/, name);
    }
    await page.goto(base + '/analysis.html');
    await page.waitForFunction(() => !document.querySelector('#baseline-figure').hidden);
    assert.equal(await page.title(), 'Analysis — ShasthoPath');
    assert.equal(await page.locator('nav[aria-label="Main navigation"] [aria-current="page"]').textContent(), 'Analysis');
    assert.equal(await page.locator('#analysis-active').textContent(), '20,206');
    assert.equal(await page.locator('#analysis-areas').textContent(), '616');
    assert.equal(await page.locator('#analysis-maps').textContent(), '10');
    assert.equal(await page.locator('#analysis-national tr').count(), 6);
    assert.match(await page.locator('#analysis-national tr').nth(1).textContent(), /19\.9%/);
    for (const row of baseline.national) assert((await page.locator('#analysis-national').textContent()).includes(row.active.toLocaleString('en-BD')));
    await page.selectOption('#baseline-metric', 'active_listings_per_100000_bbs_residents');
    await page.waitForFunction(() => !document.querySelector('#baseline-figure').hidden);
    assert.match(await page.locator('#baseline-image').getAttribute('src'), /division_active_listings_per_100000/);
    await page.selectOption('#baseline-level', 'district');
    assert.equal(await page.locator('#baseline-metric').inputValue(), 'active_listings_by_registry_name');
    assert(await page.locator('#baseline-metric option[value="active_listings_per_100000_bbs_residents"]').isDisabled());
    assert.match(await page.locator('#baseline-qa').textContent(), /1,498 name–point/);
    await page.selectOption('#baseline-level', 'upazila_thana');
    const pending = page.waitForEvent('download'); await page.click('#baseline-table');
    const file = await pending;
    assert.equal(file.suggestedFilename(), 'upazila_thana_availability.csv');
    const csv = fs.readFileSync(await file.path(), 'utf8');
    assert.match(csv, /spatial_points_inside/); assert.equal(csv.trim().split('\n').length, 544 * 6 + 1);
    const imagePending = page.waitForEvent('download'); await page.click('#baseline-map-download');
    const imageFile = await imagePending;
    assert.equal(imageFile.suggestedFilename(), 'upazila_thana_active_listings_by_registry_name.png');
    for (const width of [390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), `Overflow at ${width}px`);
      assert(await page.locator('nav[aria-label="Main navigation"] a[href="./analysis.html"]').isVisible());
      assert(await page.locator('.analysis-jump a[href="#maps"]').isVisible());
    }
    assert.deepEqual(external, []);
    assert(!requests.includes('/data/dghs/index.json'), 'Analysis should use the saved results, not the live registry index');
    assert.deepEqual(errors, []);
    // A failed image must not leave a misleading or broken map visible.
    await page.route('**/data/accessibility/baseline/division_coordinate_availability_pct.png', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.selectOption('#baseline-level', 'division');
    await page.selectOption('#baseline-metric', 'coordinate_availability_pct');
    await page.waitForFunction(() => document.querySelector('#baseline-map-status').classList.contains('error'));
    assert(await page.locator('#baseline-figure').isHidden());
    assert(await page.locator('#baseline-downloads').isVisible());
    await page.route('**/data/accessibility/baseline/manifest.json', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#analysis-status').classList.contains('error'));
    assert(await page.locator('#baseline-figure').isHidden());
    assert(await page.locator('#baseline-level').isDisabled());
    assert.equal(await page.locator('#analysis-active').textContent(), '—');
    console.log('PASS: Analysis navigation, source-backed figures, maps/CSV, division-only rates, mobile/tablet layout, failed data/image handling and no external requests');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
