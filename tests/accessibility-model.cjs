'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const model = require('../accessibility-model.js');
const index = JSON.parse(fs.readFileSync('data/dghs/index.json', 'utf8'));
for (const tier of Object.keys(model.tiers)) {
  const result = model.summarize(index, tier);
  assert.equal(result.divisions.reduce((n, d) => n + d.active, 0), result.total);
  assert.equal(result.divisions.reduce((n, d) => n + d.mapped, 0), result.mapped);
  assert.equal(result.missing + result.mapped, result.total);
  assert(result.rows.every((r) => String(r.is_active) === '1' && model.tiers[tier].types.includes(r.facility_type_name)));
}
assert.equal(model.validPoint({ lat: null, lon: 90, coordinateStatus: 'published' }), false);
assert.equal(model.validPoint({ lat: '', lon: 90, coordinateStatus: 'published' }), false);
assert.equal(model.validPoint({ lat: 23, lon: 90, coordinateStatus: 'outside' }), false);
assert.throws(() => model.summarize({ source: 'OSM', records: [], count: 0 }, 'community'));
const result = model.summarize(index, 'community');
assert.equal(result.total, index.records.filter((r) => String(r.is_active) === '1' && r.facility_type_name === 'Community Clinic').length);
assert.equal(result.mapped, result.rows.filter((r) => r.coordinateStatus === 'published' && r.lat != null && r.lon != null && Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lon))).length);
console.log('PASS: exact DGHS type/active/coordinate rules, division reconciliation and real snapshot counts');
const division = index.records.find((r) => String(r.is_active) === '1' && r.facility_type_name === 'Community Clinic').division_name;
const subset = model.summarize(index, 'community', { division });
assert(subset.rows.every((r) => r.division_name === division));
assert.equal(subset.total, result.rows.filter((r) => r.division_name === division).length);
assert(model.areaValues(index, 'district', { division }).every((district) => index.records.some((r) => String(r.is_active) === '1' && r.division_name === division && r.district_name === district)));
assert.throws(() => model.areaValues(index, 'guessed-community'));
console.log('PASS: area-specific community counts and administrative filter options');
