'use strict';
// Browser checks for the Access page (population access, BBS Census 2022 x DGHS).
//   BASE_URL=http://127.0.0.1:8000 node tests/accessibility.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { chromium } = require('playwright');
const TILE_HOSTS = /(^|\.)(tile\.openstreetmap\.org|tile\.opentopomap\.org)$/;
const BLANK_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()), headless: true, args: ['--no-sandbox'] });
  const base = process.env.BASE_URL || 'http://127.0.0.1:8000';
  const summary = JSON.parse(fs.readFileSync('data/access/summary.json', 'utf8'));
  const districts = JSON.parse(fs.readFileSync('data/access/areas-district.json', 'utf8')).areas;
  const upazilas = JSON.parse(fs.readFileSync('data/access/areas-upazila.json', 'utf8')).areas;
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const external = [], errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (TILE_HOSTS.test(url.hostname)) return route.fulfill({ contentType: 'image/png', body: BLANK_PNG });
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) { external.push(url.href); return route.abort(); }
      return route.continue();
    });
    await page.goto(base + '/accessibility.html');
    await page.evaluate(() => localStorage.removeItem('shasthopath-language'));
    await page.reload();
    await page.waitForSelector('#atlas-content:not([hidden])', { timeout: 30000 });
    await page.waitForFunction((n) => document.querySelectorAll('#access-map .leaflet-overlay-pane path.leaflet-interactive').length === n, districts.length, { timeout: 30000 });

    // Headline numbers come straight from summary.json.
    const nat = summary.national.access;
    assert.equal(await page.textContent('#k-public5'), nat.public_hospital.within['5'].toFixed(1) + '%');
    assert.equal(await page.textContent('#k-primary2'), nat.primary_care.within['2'].toFixed(1) + '%');
    assert.equal((await page.textContent('#k-cc')).replace(/,/g, ''), String(summary.national.union_people_per_cc));

    // Reference layers: grey basemap and division outlines above the fills.
    await page.waitForSelector('#access-map .light-basemap-tiles img.leaflet-tile', { state: 'attached' });
    await page.waitForFunction(() => document.querySelectorAll('#access-map .leaflet-boundaries-pane path').length === 8);
    assert.equal(await page.$eval('#access-map .leaflet-boundaries-pane', (p) => getComputedStyle(p).zIndex), '450');

    // Ranking: 20 least-served districts for the default measure, worst first.
    const worst = [...districts].sort((a, b) => a.within.public_hospital['5'] - b.within.public_hospital['5'])[0];
    assert.equal(await page.locator('#c-rank .chart-observation').count(), 20);
    assert.equal(Number(await page.locator('#c-rank .chart-observation').first().getAttribute('data-value')), worst.within.public_hospital['5']);

    // Selecting an area fills the detail panel.
    await page.fill('#a-search', worst.name); await page.dispatchEvent('#a-search', 'change');
    await page.waitForFunction((name) => document.querySelector('#a-detail h3')?.textContent === name, worst.name);
    assert.equal(await page.locator('#a-detail .access-within').first().locator('tr').count(), 6);
    assert.equal(await page.locator('#a-detail .access-within').count(), 2);   // distance and travel-time tables

    // Facility overlay follows the measure.
    await page.check('#a-points');
    await page.waitForFunction(() => Number(document.querySelector('#a-points').dataset.count) > 0);
    assert.equal(Number(await page.getAttribute('#a-points', 'data-count')), nat.public_hospital.points);

    // Analysis sections.
    assert.ok(await page.$('#c-lorenz svg'));
    assert.equal(await page.locator('#c-lorenz svg path[fill="none"]').count(), 5);
    assert.equal(await page.locator('#t-gini tr').count(), 5);
    assert.equal(await page.locator('#t-moran tr').count(), 4);
    assert.equal(await page.locator('#c-social .chart-observation').count(), upazilas.length);
    assert.equal(await page.locator('#t-corr tr').count(), 4);
    assert.equal(await page.locator('#t-tiers tr').count(), 9);

    // People versus land: 3 classes x (people, land) curves; national table people / land.
    assert.equal(await page.locator('#c-curve svg path[fill="none"][stroke-dasharray]').count(), 3);
    assert.equal(await page.locator('#c-curve svg path[fill="none"]').count(), 6);
    const landNat = JSON.parse(fs.readFileSync('data/atlas/distance.json', 'utf8')).national;
    assert.equal(await page.locator('#t-national tr').count(), 3);
    assert.equal((await page.locator('#t-national tr').first().locator('td').nth(2).textContent()), landNat.public_hospital.median_km.toFixed(1));

    // Location quality moved from the Distance page.
    const quality = JSON.parse(fs.readFileSync('data/atlas/location-quality.json', 'utf8'));
    assert.match((await page.textContent('#q-summary')).replace(/,/g, ''), new RegExp(String(quality.flagged)));
    assert.equal(await page.locator('#c-flagged .chart-observation').count(), 20);
    assert.ok(await page.$('#c-status svg'));

    // Land basis on the map: former Distance measures, ranking excludes areas with < 5 grid cells.
    const landDistricts = JSON.parse(fs.readFileSync('data/atlas/areas-district.json', 'utf8')).areas;
    await page.selectOption('#a-basis', 'land');
    await page.waitForFunction(() => document.querySelector('#a-metric').value.startsWith('land_'));
    assert.equal(await page.locator('#a-metric option').count(), 7);
    const farthest = [...landDistricts].sort((a, b) => b.distance.public_hospital.median_km - a.distance.public_hospital.median_km)[0];
    assert.equal(Number(await page.locator('#c-rank .chart-observation').first().getAttribute('data-value')), farthest.distance.public_hospital.median_km);
    await page.fill('#a-search', farthest.name); await page.dispatchEvent('#a-search', 'change');
    await page.waitForFunction(() => /Land \(area basis\)/.test(document.querySelector('#a-detail').textContent));
    const landCsv = page.waitForEvent('download');
    await page.click('#a-export');
    assert.equal((await landCsv).suggestedFilename(), 'bangladesh-health-access-land-district.csv');
    await page.selectOption('#a-basis', 'people');
    await page.waitForFunction(() => document.querySelector('#a-metric').value === 'within5_public');

    // Travel time: national table and curves from travel.json; travel basis on the map.
    const travel = JSON.parse(fs.readFileSync('data/access/travel.json', 'utf8'));
    assert.equal(await page.locator('#t-travel tr').count(), 5);
    assert.equal(await page.locator('#t-travel tr').first().locator('td').nth(1).textContent(), travel.national.any_hospital.median_min.toFixed(1));
    assert.equal(await page.locator('#c-travel svg path[fill="none"]').count(), 4);
    await page.selectOption('#a-basis', 'travel');
    await page.waitForFunction(() => document.querySelector('#a-metric').value === 'tmean_any');
    const tp = travel.per_area.district, tmean = tp.travel.any_hospital.mean_min;
    const slowest = Math.max(...tmean);
    assert.equal(Number(await page.locator('#c-rank .chart-observation').first().getAttribute('data-value')), slowest);
    const slowName = districts.find((d) => d.pcode === tp.pcodes[tmean.indexOf(slowest)]).name;
    await page.fill('#a-search', slowName); await page.dispatchEvent('#a-search', 'change');
    await page.waitForFunction(() => /Travel time \(people\)/.test(document.querySelector('#a-detail').textContent));
    const travelCsv = page.waitForEvent('download');
    await page.click('#a-export');
    assert.equal((await travelCsv).suggestedFilename(), 'bangladesh-health-travel-floods-district.csv');

    // Floods: yearly charts (26 years), named-event table, event selector on the map.
    const floods = JSON.parse(fs.readFileSync('data/access/floods.json', 'utf8'));
    assert.equal(floods.years.length, 26);
    assert.equal(await page.locator('#c-flood-years .chart-observation').count(), 26);
    assert.equal(await page.locator('#c-flood-lost .chart-observation').count(), 26);
    assert.equal(await page.locator('#t-events tr').count(), floods.events.length);
    assert.ok(floods.events.every((e) => e.flooded_km2 <= e.surface_water_km2));
    const ev = floods.events[5];
    const fd = floods.per_area.district, lostTop = Math.max(...fd.pcodes.map((p, i) => fd[ev.id].lost_hospital[i] / districts.find((d) => d.pcode === p).population * 100));
    // The Floods section has its own map: districts drawn, ranking, 'Show' drives it.
    await page.waitForFunction((n) => document.querySelectorAll('#flood-map .leaflet-overlay-pane path.leaflet-interactive').length === n, districts.length, { timeout: 30000 });
    assert.equal(await page.$eval('#f-metric', (e) => e.value), 'f_lost_hosp');
    assert.equal(await page.locator('#c-flood-rank .chart-observation').count(), 20);
    await page.click(`#t-events tr:nth-child(6) .flood-map-btn`);
    await page.waitForFunction((id) => document.querySelector('#f-flood').value === id, ev.id);
    assert.equal(await page.$eval('#f-flood-wrap', (e) => e.hidden), false);
    assert.ok(Math.abs(Number(await page.locator('#c-flood-rank .chart-observation').first().getAttribute('data-value')) - lostTop) < 1e-9);
    const topFlood = districts.find((d, _, all) => Math.abs(fd[ev.id].lost_hospital[fd.pcodes.indexOf(d.pcode)] / d.population * 100 - lostTop) < 1e-9);
    await page.fill('#f-search', topFlood.name); await page.dispatchEvent('#f-search', 'change');
    await page.waitForFunction((name) => document.querySelector('#f-detail h3')?.textContent === name, topFlood.name);
    assert.match(await page.textContent('#f-detail'), /Lose hospital/);
    await page.selectOption('#f-metric', 'f_years');
    assert.equal(await page.$eval('#f-flood-wrap', (e) => e.hidden), true);
    assert.equal(await page.locator('#flood-map img.flood-raster').count(), 0);   // measures map: area colours only

    // Inundation map comes first and shows only the satellite layers; 'Show' moved it to the event too.
    const overlays = JSON.parse(fs.readFileSync('data/floods/overlays.json', 'utf8'));
    assert.equal(Object.keys(overlays.layers).length, floods.events.length + floods.years.length + 1);
    assert.ok(await page.$eval('#inund-map', (m) => m.compareDocumentPosition(document.querySelector('#flood-map')) & Node.DOCUMENT_POSITION_FOLLOWING));
    assert.equal(await page.$eval('#i-layer', (e) => e.value), ev.id);
    await page.waitForFunction((file) => { const img = document.querySelector('#inund-map img.flood-raster'); return img && img.src.includes(file) && img.complete && img.naturalWidth > 0; }, overlays.layers[ev.id].file);
    assert.equal(await page.locator('#inund-map .leaflet-overlay-pane path.leaflet-interactive').count(), 0);   // no area fills
    assert.match(await page.textContent('#inund-map .flood-legend'), /Flooded beyond normal monsoon water/);
    await page.selectOption('#i-layer', 'frequency');
    await page.waitForFunction(() => document.querySelector('#inund-map img.flood-raster')?.src.includes('frequency.png'));
    assert.match(await page.textContent('#inund-map .flood-legend'), /20–26 years/);
    await page.selectOption('#i-layer', 'y2004');
    await page.waitForFunction(() => document.querySelector('#inund-map img.flood-raster')?.src.includes('y2004.png'));
    assert.match(await page.textContent('#i-note'), /MODIS/);
    await page.selectOption('#f-level', 'upazila');
    await page.waitForFunction((n) => document.querySelectorAll('#flood-map .leaflet-overlay-pane path.leaflet-interactive').length === n && !document.querySelector('#flood-map.loading'), upazilas.length, { timeout: 30000 });
    // The main map's Floods basis still works, with its own selector.
    await page.selectOption('#a-basis', 'floods');
    await page.waitForFunction(() => document.querySelector('#a-metric').value === 'f_years');
    await page.selectOption('#a-metric', 'f_lost_hosp');
    assert.equal(await page.$eval('#a-flood-wrap', (e) => e.hidden), false);
    await page.selectOption('#a-basis', 'people');
    await page.waitForFunction(() => document.querySelector('#a-metric').value === 'within5_public');

    // Cluster map: upazila level, categorical legend.
    await page.click('#t-moran tr:first-child button');
    await page.waitForFunction((n) => document.querySelectorAll('#access-map .leaflet-overlay-pane path.leaflet-interactive').length === n, upazilas.length, { timeout: 30000 });
    assert.match(await page.textContent('#access-map .choropleth-legend'), /Low–low cluster/);
    const ll = upazilas.filter((u) => u.lisa.within5_public_hospital === 'LL').length;
    assert.match(await page.textContent('#lisa-low'), new RegExp(`${ll} upazilas`));

    // Union level loads on demand and draws on a canvas.
    await page.selectOption('#a-level', 'union');
    await page.waitForFunction(() => document.querySelector('#access-map canvas') && !document.querySelector('#access-map.loading'), null, { timeout: 60000 });

    // CSV export from the map's Export button (the separate Downloads buttons were removed).
    await page.selectOption('#a-level', 'upazila');
    await page.waitForFunction((n) => document.querySelectorAll('#access-map path.leaflet-interactive').length === n && !document.querySelector('#access-map.loading'), upazilas.length, { timeout: 60000 });
    const pending = page.waitForEvent('download');
    await page.click('#a-export');
    const file = await pending;
    assert.equal(file.suggestedFilename(), 'bangladesh-health-access-upazila.csv');
    const text = fs.readFileSync(await file.path(), 'utf8');
    assert.equal(text.trim().split('\n').length, upazilas.length + 1);

    // Bangla.
    await page.click('#language');
    assert.equal(await page.getAttribute('html', 'lang'), 'bn');
    assert.equal(await page.textContent('h1'), 'স্বাস্থ্যসেবায় প্রবেশগম্যতা');
    assert.match(await page.textContent('#k-public5'), /[০-৯]/);
    assert.match(await page.textContent('#access-map .map-layer-control'), /বেসম্যাপ/);

    // Narrow screens: no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2));

    assert.deepEqual(external, []);
    assert.deepEqual(errors, []);

    // Missing data is reported, not shown as an empty page.
    const broken = await context.newPage();
    await broken.route('**/data/access/summary.json', (route) => route.fulfill({ status: 503, body: 'unavailable' }));
    await broken.goto(base + '/accessibility.html');
    await broken.waitForSelector('#atlas-status.atlas-error');
    assert.ok(await broken.$('#atlas-content[hidden]'));
    console.log('PASS: Access page (BBS population x DGHS): KPIs, layers, ranking, detail, points, people vs land curves, location quality, land basis + CSV, travel time + CSV, floods (years, events, inundation map first, then impact map + detail + ranking, main-map basis), inequality, clusters, social, primary care, union level, CSV, Bangla, mobile, error state');
  } finally { await browser.close(); }
})();
