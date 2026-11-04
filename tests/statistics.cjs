const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const summary=JSON.parse(fs.readFileSync('data/statistics/summary.json','utf8'));
const base=process.env.BASE_URL || 'http://127.0.0.1:8000/';
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || chromium.executablePath(),headless:true,args:['--no-sandbox']});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(new URL('statistics.html',base).href);
  await page.waitForFunction(()=>!document.querySelector('#stats-group').disabled);
  assert.equal(await page.locator('#official-kpis strong').first().innerText(),'652');
  assert.equal(await page.locator('#statistics-division-body tr').count(),8);
  for(const key of Object.keys(summary.groups)){
   await page.locator('#stats-group').selectOption(key);
   assert.equal(await page.locator('#registry-kpis strong').first().innerText(),summary.groups[key].national.count.toLocaleString('en-GB'));
  }
  await page.locator('#stats-group').selectOption('bloodBanks');
  await page.locator('#stats-division').selectOption('Dhaka');
  const dhaka=summary.groups.bloodBanks.divisions.Dhaka;
  assert.equal(await page.locator('#registry-kpis strong').first().innerText(),dhaka.count.toLocaleString('en-GB'));
  assert.equal(await page.locator('#registry-kpis strong').nth(1).innerText(),(dhaka.count/dhaka.population*100000).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2}));
  await page.locator('[name="stats-measure"][value="count"]').check();
  assert.match(await page.locator('#division-chart-title').innerText(),/Number/);
  const downloadPromise=page.waitForEvent('download'); await page.locator('#stats-download').click();
  const download=await downloadPromise; const csv=fs.readFileSync(await download.path(),'utf8');
  assert.equal(csv.trim().split('\r\n').length,9);assert.match(csv,/population_2022_adjusted/);assert.match(csv,/Blood-bank listings/);
  await page.locator('#stats-reset').click();
  assert.equal(await page.locator('#stats-group').inputValue(),'hospitals');
  assert.equal(await page.locator('#research-cards article').count(),2);
  await page.screenshot({path:'/tmp/statistics-desktop.png',fullPage:true});
  for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overflow at ${width}`);
  }
  await page.screenshot({path:'/tmp/statistics-mobile.png',fullPage:true});
  assert.deepEqual(errors,[]);
  await page.route('**/data/statistics/summary.json',r=>r.fulfill({status:500,body:'unavailable'}));
  await page.reload(); await page.locator('#statistics-status.error').waitFor();
  assert.equal(await page.locator('#stats-group').isDisabled(),true);
  assert.equal(await page.locator('#registry-kpis strong').count(),0);
  console.log('PASS: statistics sources, seven filters, eight divisions, rates, CSV, research, responsive layout and missing-data handling.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
