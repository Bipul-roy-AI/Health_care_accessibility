const { chromium } = require('playwright');
const assert = require('node:assert/strict');

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
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1050},geolocation:{latitude:23.811,longitude:90.414},permissions:['geolocation']});
    let mode='success', calls=0, lastQuery='';
    await context.route('https://tile.openstreetmap.org/**',route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')}));
    await context.route('https://overpass-api.de/api/interpreter', async route=>{
      calls++; lastQuery=new URLSearchParams(route.request().postData()).get('data');
      if(mode==='failure') return route.fulfill({status:429,body:'rate limited'});
      if(mode==='remark') return route.fulfill({json:{remark:'runtime error: timeout',elements:[]}});
      if(mode==='delayed') await new Promise(r=>setTimeout(r,500));
      return route.fulfill({json:{elements:mode==='empty'?[]:elements}}).catch(()=>{});
    });
    const page=await context.newPage(); const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto(process.env.BASE_URL || 'http://127.0.0.1:8000');
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
    await page.locator('#language').click(); assert.equal(await page.locator('html').getAttribute('lang'),'bn'); assert.match(await page.locator('.facility-name').first().innerText(),/পরীক্ষা/);
    await page.locator('#language').click(); assert.equal(await page.locator('h1 br').count(),1);
    await page.locator('#locate').click(); await page.waitForFunction(()=>document.querySelector('.facility-type').textContent.includes('km'));
    await page.waitForFunction(()=>!document.querySelector('#refresh').disabled);
    mode='failure'; await page.locator('#refresh').click(); await page.waitForSelector('#status.error'); assert.equal(await page.locator('.facility').count(),5); assert.match(await page.locator('#status').innerText(),/last successful search/);
    mode='remark'; await page.locator('#refresh').click(); await page.waitForFunction(()=>!document.querySelector('#refresh').disabled); assert.match(await page.locator('#status').innerText(),/Could not load/); assert.equal(await page.locator('.facility').count(),5);
    mode='empty'; await page.locator('#refresh').click(); await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='0 facilities'); assert.equal(await page.locator('.facility').count(),0);
    mode='success'; await page.locator('#refresh').click(); await page.waitForFunction(()=>document.querySelector('#result-count').textContent==='5 facilities');
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
    // Fresh load failures must show a recoverable error instead of an endless spinner.
    mode='failure'; const fresh=await context.newPage(); await fresh.goto(process.env.BASE_URL || 'http://127.0.0.1:8000'); await fresh.waitForSelector('#status.error'); assert.equal(await fresh.locator('#refresh').isEnabled(),true); console.log('PASS: initial data failure is recoverable.');
  } finally {await browser.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
