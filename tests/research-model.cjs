'use strict';
const assert=require('node:assert/strict'), fs=require('node:fs'), M=require('../research-model.js');
assert.equal(M.distance({lat:0,lon:0},{lat:0,lon:0}),0);
assert(Math.abs(M.distance({lat:0,lon:0},{lat:0,lon:1})-111.195)<0.001);
const r=[{id:'1',lat:0,lon:0,coordinateStatus:'published',agency:'DGHS',type:'Hospital',division:'A',districtKey:'a',ownership:'Government / autonomous'},{id:'2',lat:0,lon:.01,coordinateStatus:'published',agency:'Other',type:'Hospital',division:'B',districtKey:'b'},{id:'3',lat:null,lon:null,coordinateStatus:'missing',agency:'DGHS',type:'Hospital',division:'A',districtKey:null}];
assert.equal(M.select(r,{scope:'dghs'}).length,2);assert.equal(M.select(r,{scope:'public'}).length,1);
assert.equal(M.select(r,{scope:'all',division:'A'}).length,2);assert.equal(M.select(r,{scope:'all',division:'A'},false).length,3);
const p=M.probe(r,{lat:0,lon:.009});assert.equal(p.nearest[0].id,'2');assert.equal(p.total,2);assert.equal(p.curve[0].count,1);assert.equal(p.curve[1].count,2);assert.equal(p.rings.reduce((n,x)=>n+x.count,0),2);
assert.equal(M.districtSummary(r,{empty:{name:'Empty',division:'A'}})[0].completeness,null);
assert(M.csv([['=cmd','a"b','a,b']]).includes('"\'=cmd"'));assert(M.csv([['a"b']]).includes('a""b'));
const data=JSON.parse(fs.readFileSync('data/research/hospitals.json','utf8')), raw=JSON.parse(fs.readFileSync('data/dghs/index.json','utf8'));
const source=raw.records.filter(r=>String(r.is_active).trim()==='1'&&data.hospitalTypes.includes(r.facility_type_name));
assert.equal(data.records.length,source.length);assert.deepEqual(new Set(data.records.map(r=>r.id)),new Set(source.map(r=>String(r.id))));
for(const scope of ['all','dghs','public']){const rows=M.select(data.records,{scope}), ds=M.districtSummary(rows,data.districts);assert.equal(ds.reduce((n,r)=>n+r.count,0)+rows.filter(r=>!r.districtKey).length,rows.length);assert(ds.every(r=>r.mapped<=r.count));}
assert(data.records.every(r=>!r.type.toLowerCase().includes('pharmacy')));
assert.equal(Object.keys(data.districts).length,64);
assert(Object.values(data.districts).every(d=>d.division in data.populationSource.population.divisions));
assert.equal(M.districtSummary([],data.districts,'Chattogram').length,11);
console.log('PASS: hospital inclusion, national cross-border destinations, distance units, missing denominators, CSV quoting and real-data district reconciliation.');
