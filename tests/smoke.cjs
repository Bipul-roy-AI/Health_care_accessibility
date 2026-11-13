const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const appURL = new URL(process.env.BASE_URL || 'http://127.0.0.1:8000'); appURL.searchParams.set('source','osm');

// Deliberately fictional test fixtures; never included in the deployed website.
const elements = [
  {type:'node',id:1,lat:23.8103,lon:90.4125,tags:{name:'Test Hospital', 'name:bn':'পরীক্ষা হাসপাতাল',amenity:'hospital',wheelchair:'yes',phone:'+880 000000000',opening_hours:'24/7'}},
  {type:'way',id:2,center:{lat:23.812,lon:90.415},tags:{name:'Test Diagnostics',healthcare:'laboratory',wheelchair:'limited'}},
  {type:'node',id:3,lat:23.815,lon:90.41,tags:{name:'<img src=x onerror="window.injected=true">',amenity:'clinic'}},
  {type:'node',id:4,lat:23.817,lon:90.414,tags:{name:'Test Pharmacy',amenity:'pharmacy'}},
  {type:'node',id:5,lat:23.818,lon:90.413,tags:{name:'Test Dental',amenity:'dentist'}},
  {type:'node',id:6,tags:{name:'No coordinates',amenity:'hospital'}},
];
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : chromium.executablePath()),headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1050},geolocation:{latitude:23.811,longitude:90.414},permissions:['geolocation']});
    let mode='success', calls=0, lastQuery='', routeMode='success', layerMode='success', routeCalls=0, routeCoordinates='', cartoTiles=0;
    await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
    await context.route('https://basemaps.cartocdn.com/**', route=>{ cartoTiles++; return route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}); });
    await context.route('https://router.project-osrm.org/**', async route=>{
      routeCalls++; routeCoordinates=new URL(route.request().url()).pathname.split('/').pop();
      if(routeMode==='failure') return route.fulfill({status:503,body:'unavailable'});
      if(routeMode==='no-route') return route.fulfill({json:{code:'NoRoute',routes:[]}});
      if(routeMode==='invalid') return route.fulfill({json:{code:'Ok',routes:[{distance:25,duration:30,geometry:{type:'LineString',coordinates:[[null,3],[1,4]]},legs:[]}]}});
      if(routeMode==='delayed') await new Promise(r=>setTimeout(r,500));
      return route.fulfill({json:{code:'Ok',routes:[{distance:2500,duration:360,geometry:{type:'LineString',coordinates:[[90.414,23.811],[90.413,23.812],[90.4125,23.8103]]},legs:[{steps:[{name:'Test road',distance:1500,maneuver:{type:'depart',modifier:'straight'}},{name:'<img src=x onerror=window.routeInjected=true>',distance:1000,maneuver:{type:'turn',modifier:'right'}},{name:'',distance:0,maneuver:{type:'arrive'}}]}]}]}}).catch(()=>{});
    });
    await context.route('https://overpass-api.de/api/interpreter', async route=>{
      const query=new URLSearchParams(route.request().postData()).get('data');
      if(query.includes('out geom')) {
        if(layerMode==='failure') return route.fulfill({status:503,body:'unavailable'});
        if(layerMode==='delayed') await new Promise(r=>setTimeout(r,400));
        return route.fulfill({json:{elements:[{type:'way',id:100,tags:{highway:'primary',name:'Test road'},geometry:[{lat:23.810,lon:90.412},{lat:23.813,lon:90.415}]},{type:'way',id:101,tags:{building:'yes',name:'Test building'},geometry:[{lat:23.811,lon:90.413},{lat:23.811,lon:90.414},{lat:23.812,lon:90.414},{lat:23.812,lon:90.413},{lat:23.811,lon:90.413}]}]}}).catch(()=>{});
      }
      calls++; lastQuery=new URLSearchParams(route.request().postData()).get('data');
      if(mode==='failure') return route.fulfill({status:429,body:'rate limited'});
      if(mode==='remark') return route.fulfill({json:{remark:'runtime error: timeout',elements:[]}});
      if(mode==='delayed') await new Promise(r=>setTimeout(r,500));
      return route.fulfill({json:{elements:mode==='empty'?[]:elements}}).catch(()=>{});
    });
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto(appURL.href);
    await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='5 facilities');
    assert.match(lastQuery,/ISO3166-1/); assert.match(lastQuery,/out center tags/);
    assert.equal(await page.locator('.facility').count(),5);
    assert.equal(await page.locator('.leaflet-marker-icon').count(),5);
    assert.equal(await page.locator('.facility img').count(),0);
    assert.equal(await page.evaluate(()=>window.injected),undefined);
    await page.locator('[data-type=diagnostic]').click(); assert.equal(await page.locator('.facility').count(),1); assert.match(await page.locator('.facility-name').innerText(),/Diagnostics/);
    await page.locator('[data-type=all]').click(); await page.locator('#wheelchair').check(); assert.equal(await page.locator('.facility').count(),1);
    await page.locator('#wheelchair').uncheck(); await page.locator('#search').fill('pharmacy'); assert.equal(await page.locator('.facility').count(),1);
    await page.locator('#search').fill('no matching entry'); assert.equal(await page.locator('.facility').count(),0); assert.match(await page.locator('.empty').innerText(),/No matching/);
    await page.locator('#search').fill('');
    const directions=await page.locator('.facility-actions a').first().getAttribute('href'); assert.match(directions,/destination=23.8103%2C90.4125/);
    await page.locator('.facility-name').first().click(); await page.waitForSelector('.leaflet-popup-content'); assert.match(await page.locator('.leaflet-popup-content').innerText(),/Test Hospital/);
    await page.locator('.facility').first().locator('.view-details').click(); await page.waitForSelector('.facility-dialog[open]'); assert.match(await page.locator('.details-body').innerText(),/Wheelchair access/); assert.match(await page.locator('.details-body').innerText(),/Not recorded/); await page.keyboard.press('Escape'); assert.equal(await page.locator('.facility-dialog').isVisible(),false);
    await page.locator('#language').click(); assert.equal(await page.locator('html').getAttribute('lang'),'bn'); assert.match(await page.locator('.facility-name').first().innerText(),/পরীক্ষা/);
    await page.locator('#language').click(); assert.match(await page.locator('h1').innerText(),/Find health care/);
    await page.locator('#locate').click(); await page.waitForFunction(()=>document.querySelector('.facility-type').textContent.includes('km'));
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    mode='failure'; await page.locator('#refresh').click(); await page.waitForSelector('#status.error'); assert.equal(await page.locator('.facility').count(),5); assert.match(await page.locator('#status').innerText(),/last successful search/);
    mode='remark'; await page.locator('#refresh').click(); await page.waitForFunction(()=>!document.querySelector('#refresh').disabled); assert.match(await page.locator('#status').innerText(),/Could not load/); assert.equal(await page.locator('.facility').count(),5);
    mode='empty'; await page.locator('#refresh').click(); await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='0 facilities'); assert.equal(await page.locator('.facility').count(),0);
    mode='success'; await page.locator('#refresh').click(); await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='5 facilities');
    // Point-to-facility driving routes: values must come from the routing response.
    assert.equal(await page.locator('#get-route').isEnabled(),false);
    await page.locator('#destination').selectOption('node/1');
    await page.locator('#get-route').click();
    await page.waitForFunction(()=>!document.querySelector('#route-summary').hidden);
    assert.equal(await page.locator('#route-distance').innerText(),'2.50 km');
    assert.equal(await page.locator('#route-duration').innerText(),'6 min');
    assert.match(routeCoordinates,/^90\.414,23\.811;90\.4125,23\.8103$/);
    assert.equal(await page.locator('#route-steps li').count(),3);
    assert.equal(await page.locator('#route-steps img').count(),0);
    assert.equal(await page.locator('.leaflet-careRoute-pane path').count(),1);
    assert.equal(await page.locator('.origin-pin').count(),1);
    assert.equal(await page.locator('.route-destination-pin').count(),1);
    await page.locator('#route-instructions summary').click();
    await page.locator('#language').click(); assert.match(await page.locator('#route-status').innerText(),/নীল/); assert.match(await page.locator('#route-steps li').first().innerText(),/শুরু/); await page.locator('#language').click();
    routeMode='no-route'; await page.locator('#get-route').click(); await page.waitForSelector('#route-status.error'); assert.match(await page.locator('#route-status').innerText(),/No driving route/); assert.equal(await page.locator('#route-summary').isHidden(),true); assert.equal(await page.locator('.leaflet-careRoute-pane path').count(),0);
    routeMode='failure'; await page.locator('#get-route').click(); await page.waitForFunction(()=>document.querySelector('#route-status').textContent.includes('unavailable')); assert.equal(await page.locator('#get-route').isEnabled(),true);
    routeMode='invalid'; await page.locator('#get-route').click(); await page.waitForFunction(()=>document.querySelector('#route-status').textContent.includes('invalid route')); assert.equal(await page.locator('#route-summary').isHidden(),true);
    routeMode='delayed'; await page.locator('#get-route').click(); await page.locator('#destination').selectOption('way/2'); await page.waitForTimeout(600); assert.equal(await page.locator('#route-summary').isHidden(),true); assert.equal(await page.locator('.leaflet-careRoute-pane path').count(),0);
    routeMode='success'; await page.locator('#clear-route').click(); assert.equal(await page.locator('.origin-pin').count(),0); assert.equal(await page.locator('#get-route').isEnabled(),false);
    // A user can choose a point by clicking the map, without location permission.
    await page.locator('#pick-origin').click(); await page.locator('#map').click({position:{x:230,y:170}}); assert.match(await page.locator('#origin-label').innerText(),/Starting point:/); assert.equal(await page.locator('#pick-origin').getAttribute('aria-pressed'),'false');
    await page.locator('#destination').selectOption('node/1'); await page.locator('#get-route').click(); await page.waitForFunction(()=>!document.querySelector('#route-summary').hidden);
    assert.equal(routeCalls>=6,true);
    // Coordinates are also supported, independently of geolocation.
    await page.locator('.journey-origin summary').click(); await page.locator('#origin-lat').fill('23.811'); await page.locator('#origin-lon').fill('90.414'); await page.locator('#origin-form button').click(); assert.match(await page.locator('#origin-label').innerText(),/23.81100, 90.41400/); assert.equal(await page.locator('#route-summary').isHidden(),true);
    await page.locator('#get-route').click(); await page.waitForFunction(()=>!document.querySelector('#route-summary').hidden);
    // Independent basemaps and OSM geometry overlays.
    await page.locator('.leaflet-control-layers').hover();
    await page.locator('.leaflet-control-layers-base label').filter({hasText:'Light map'}).locator('input').check();
    await page.waitForSelector('.light-basemap-tiles img.leaflet-tile-loaded'); assert.match(await page.locator('.light-basemap-tiles').evaluate(e=>getComputedStyle(e).filter),/grayscale/);
    await page.locator('.facility-name').filter({hasText:'Test Hospital'}).click(); await page.waitForTimeout(350);
    await page.locator('.leaflet-control-layers').hover();
    const roads=page.locator('.leaflet-control-layers-overlays label').filter({hasText:'Road network'}).locator('input');
    const buildings=page.locator('.leaflet-control-layers-overlays label').filter({hasText:'Building footprints'}).locator('input');
    await roads.check(); await buildings.check(); await page.waitForFunction(()=>document.querySelector('#layer-status').textContent.includes('loaded for this area'));
    assert.equal(await page.locator('.leaflet-openRoads-pane path').count(),1); assert.equal(await page.locator('.leaflet-openBuildings-pane path').count(),1);
    layerMode='failure'; await page.locator('#update-details').click(); await page.waitForSelector('#layer-status.error'); assert.equal(await page.locator('.leaflet-openBuildings-pane path').count(),0);
    layerMode='success'; await page.locator('#update-details').click(); await page.waitForFunction(()=>document.querySelector('#layer-status').textContent.includes('loaded for this area'));
    await page.locator('.leaflet-control-layers').hover(); await roads.uncheck(); await buildings.uncheck(); assert.equal(await page.locator('.leaflet-openRoads-pane path').count(),0); assert.equal(await page.locator('.leaflet-openBuildings-pane path').count(),0);
    await page.locator('.leaflet-control-layers-base label').filter({hasText:'Street map'}).locator('input').check();
    await page.locator('#map').click({position:{x:150,y:250}});
    mode='delayed'; await page.locator('#city').selectOption('sylhet'); await page.locator('#city').selectOption('khulna'); await page.waitForFunction(()=>!document.querySelector('#refresh').disabled); assert.equal(await page.locator('.facility').count(),5);
    const before=calls; for(let i=0;i<4;i++) { await page.locator('.leaflet-control-zoom-out').click(); await page.waitForTimeout(350); } await page.locator('#search-area').click(); assert.match(await page.locator('#status').innerText(),/Zoom in/); assert.equal(calls,before);
    await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(100);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await page.screenshot({path:'/tmp/shasthopath-mobile.png',fullPage:true});
    await page.setViewportSize({width:1440,height:1050});
    mode='success'; await page.locator('#city').selectOption('dhaka'); await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    await page.screenshot({path:'/tmp/shasthopath-desktop.png',fullPage:true});
    assert.deepEqual(errors,[]);
    console.log('PASS: 18 browser checks — map/list, categories, wheelchair filter, text search, empty search, safe external tags, directions, popups, Bangla/English, geolocation/distances, rate-limit retention, partial-response rejection, empty response, recovery, cancellation, zoom guard, mobile layout, no JavaScript errors. Live data was mocked.');
    console.log('PASS: driving geometry, road/straight distances, ETA, directions and safe instructions, coordinate order, no-route/unavailable/invalid responses, stale route cancellation, map-picked and coordinate origins, clear journey, bilingual routes, free light basemap, road/building overlays and service errors. External services were mocked.');
    // Fresh load failures must show a recoverable error instead of an endless spinner.
    mode='failure'; const fresh=await context.newPage(); await fresh.goto(appURL.href); await fresh.waitForSelector('#status.error'); assert.equal(await fresh.locator('#refresh').isEnabled(),true); console.log('PASS: initial data failure is recoverable.');
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
