'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const external = [], errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      // Basemap tiles are the only allowed external requests; answer them with a blank PNG.
      if (/(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org)$/.test(url.hostname)) return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64') });
      if (!['127.0.0.1','localhost'].includes(url.hostname)) { external.push(url.href); return route.abort(); }
      return route.continue();
    });
    const data = JSON.parse(fs.readFileSync('data/dghs/index.json','utf8'));
    const flagged = new Set(JSON.parse(fs.readFileSync('data/atlas/location-quality.json','utf8')).flagged_ids.map(String));
    const expected = (types) => { const rows=data.records.filter((r) => String(r.is_active)==='1' && types.includes(r.facility_type_name)); return { total: rows.length.toLocaleString('en-BD'), mapped: rows.filter((r) => r.coordinateStatus==='published' && !flagged.has(String(r.id)) && r.lat!=null && r.lon!=null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon))).length.toLocaleString('en-BD') }; };
    const community=expected(['Community Clinic']), union=expected(['Union Health Sub Center','Union Health Center','Union Health & Family Welfare Center (UH&FWC)']);
    const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
    await page.goto(base + '/accessibility.html');
    await page.waitForFunction((value) => document.querySelector('#access-total').textContent === value, community.total);
    assert.equal(await page.locator('#access-mapped').textContent(), community.mapped);
    assert.match(await page.locator('#access-status').textContent(), /points shown/);
    // Reference layers: grey basemap plus division and district outlines by default; unions load on demand.
    await page.waitForSelector('#access-map .light-basemap-tiles img.leaflet-tile', { state: 'attached' });
    await page.waitForFunction(() => document.querySelectorAll('#access-map .leaflet-boundaries-pane path').length === 8 + 64);
    await page.check('#access-map input[data-boundary="union"]');
    await page.waitForSelector('#access-map .leaflet-boundaries-pane canvas');
    await page.uncheck('#access-map input[data-boundary="union"]');
    await page.uncheck('#access-map input[data-boundary="district"]');
    await page.waitForFunction(() => document.querySelectorAll('#access-map .leaflet-boundaries-pane path').length === 8);
    await page.selectOption('#access-map .map-layer-control select', 'none');
    await page.waitForFunction(() => !document.querySelector('#access-map img.leaflet-tile'));
    await page.selectOption('#access-tier', 'union');
    assert.equal(await page.locator('#access-total').textContent(), union.total);
    assert.equal(await page.locator('#access-mapped').textContent(), union.mapped);
    const pending = page.waitForEvent('download');
    await page.click('#access-download');
    const file = await pending;
    assert.match(file.suggestedFilename(), /dghs_union_division_counts\.csv/);
    const division = data.records.find((r) => String(r.is_active) === '1' && r.facility_type_name === 'Community Clinic').division_name;
    await page.selectOption('#access-tier', 'community');
    await page.selectOption('#access-division', division);
    const localCount = data.records.filter((r) => String(r.is_active) === '1' && r.facility_type_name === 'Community Clinic' && r.division_name === division).length.toLocaleString('en-BD');
    assert.equal(await page.locator('#access-total').textContent(), localCount);
    assert.equal(await page.locator('#access-divisions tr').count(), 1);
    assert.equal(Number(await page.locator('#access-count-chart .chart-observation').getAttribute('data-value')),Number(localCount.replaceAll(',','')));
    assert.equal(await page.locator('#access-completeness-chart .chart-observation').count(),1);
    const areaDownload = page.waitForEvent('download');
    await page.click('#access-download');
    const areaFile = await areaDownload;
    const areaCSV = fs.readFileSync(await areaFile.path(),'utf8');
    assert.match(areaCSV, /selected_division/);
    assert(areaCSV.includes(division));
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));
    assert(await page.locator('nav[aria-label="Main navigation"] a[href="./analysis.html"]').isVisible());
    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);
    await page.route('**/data/dghs/index.json', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#access-status').classList.contains('error'));
    assert(await page.locator('#access-download').isDisabled());
    console.log('PASS: DGHS tiers/area filters, narrow layout, no external sources, unavailable data handling');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
