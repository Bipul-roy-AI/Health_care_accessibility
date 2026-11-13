/* Distance atlas: upazila choropleth, national distance curves, division
   comparisons, beds and establishment decades. All values come from
   data/atlas/*.json, built by scripts/build_atlas.py. */
'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const fmt = (value, digits = 0) => Number.isFinite(value)
    ? value.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const pct = (value) => Number.isFinite(value) ? fmt(value, 1) + '%' : '—';
  // Categorical order validated with the dataviz palette checker (light surface):
  // government, any hospital, non-government. Colour follows the class, never rank.
  const COLOURS = { public_hospital: '#077a53', any_hospital: '#2563eb', private_ngo_hospital: '#c2611e' };
  const LABELS = { public_hospital: 'Government hospitals', any_hospital: 'Any hospital', private_ngo_hospital: 'Non-government hospitals' };
  const LOW_CELLS = 5;
  const SOURCE = 'DGHS registry snapshot; BBS/OCHA boundaries via geoBoundaries; 2 km grid, straight-line km, land area.';

  const get = (path) => fetch(path).then((response) => {
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  });

  function cell(tag, value, attrs = {}) {
    const node = document.createElement(tag);
    node.textContent = value;
    for (const [key, val] of Object.entries(attrs)) node.setAttribute(key, val);
    return node;
  }
  function tableRows(target, rows) {
    $(target).replaceChildren(...rows.map((values) => {
      const tr = document.createElement('tr');
      values.forEach((value, index) => tr.append(cell(index ? 'td' : 'th', value, index ? {} : { scope: 'row' })));
      return tr;
    }));
  }
  function csvDownload(name, header, rows) {
    const escape = (value) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const body = [header, ...rows].map((row) => row.map(escape).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob(['﻿' + body], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function upazilaMetrics(areas) {
    const hospitals = (a) => (a.points.public_hospital || 0) + (a.points.private_ngo_hospital || 0);
    const distance = (klass, key) => (a) => {
      const stats = a.distance[klass];
      return stats && stats.cells ? stats[key] : NaN;
    };
    return [
      { id: 'public_median', label: 'Median km to a government hospital', ramp: 'amber', digits: 1, value: distance('public_hospital', 'median_km'),
        note: 'Median straight-line distance across the upazila\'s land area to the nearest mapped government hospital. Grey: too small for the 2 km grid.' },
      { id: 'public_p90', label: '90th percentile km to a government hospital', ramp: 'amber', digits: 1, value: distance('public_hospital', 'p90_km'),
        note: '90% of the upazila\'s land lies within this distance of a government hospital. Highlights remote corners that a median hides.' },
      { id: 'any_median', label: 'Median km to any hospital', ramp: 'amber', digits: 1, value: distance('any_hospital', 'median_km'),
        note: 'Includes private, NGO and other non-government hospital listings. Listing does not confirm services.' },
      { id: 'hospital_points', label: 'Hospital points inside', ramp: 'green', digits: 0, value: (a) => hospitals(a),
        note: 'Mapped hospital points of all ownership types inside the polygon. Listings without coordinates are not counted here.' },
      { id: 'public_points', label: 'Government hospital points inside', ramp: 'green', digits: 0, value: (a) => a.points.public_hospital || 0,
        note: 'Most upazilas have one Upazila Health Complex; zero often means the complex lacks published coordinates.' },
      { id: 'density', label: 'Hospital points per 1,000 km²', ramp: 'green', digits: 1, value: (a) => a.area_km2 > 0 ? hospitals(a) / a.area_km2 * 1000 : NaN,
        note: 'Points per land area. Dense city thanas dominate; compare rural upazilas with each other.' },
      { id: 'beds', label: 'Approved beds at mapped facilities', ramp: 'green', digits: 0, value: (a) => a.beds_points.total || 0,
        note: 'Approved bed numbers from DGHS profiles for facilities whose points fall inside the polygon. Approved beds are not functional or staffed beds.' }
    ];
  }

  function detail(area, metrics) {
    const box = $('#a-detail');
    const pub = area.distance.public_hospital || {}, any = area.distance.any_hospital || {};
    const low = pub.cells && pub.cells < LOW_CELLS;
    const rows = [
      ['District', area.district_name], ['BBS pcode', area.pcode], ['Area', fmt(area.area_km2, 1) + ' km²'],
      ['Grid cells', pub.cells ? fmt(pub.cells) + (low ? ' · low confidence' : '') : 'none · too small for the grid'],
      ['Median km · government', fmt(pub.median_km, 1)], ['90th pct km · government', fmt(pub.p90_km, 1)], ['Max km · government', fmt(pub.max_km, 1)],
      ['Median km · any hospital', fmt(any.median_km, 1)],
      ['Government hospital points', fmt(area.points.public_hospital || 0)], ['Non-government hospital points', fmt(area.points.private_ngo_hospital || 0)],
      ['Primary-care points', fmt(area.points.primary_care || 0)], ['Approved beds · mapped', fmt(area.beds_points.total || 0)]
    ];
    const list = document.createElement('dl');
    rows.forEach(([term, value]) => list.append(cell('dt', term), cell('dd', value)));
    box.replaceChildren(cell('h3', area.name), list,
      cell('p', 'Straight-line, land-area figures. Not travel time or population.', { class: 'research-note' }));
  }

  async function main() {
    const [adm3, distance, profiles, manifest] = await Promise.all([
      get('./data/atlas/areas-adm3.json'), get('./data/atlas/distance.json'),
      get('./data/atlas/profile-aggregates.json'), get('./data/atlas/manifest.json')]);
    const areas = adm3.areas;
    const byPcode = new Map(areas.map((a) => [a.pcode, a]));
    const national = distance.national;

    // KPIs
    $('#k-points').textContent = fmt(distance.classes.any_hospital);
    $('#k-listings').textContent = fmt(manifest.registry.hospital_listings_active);
    $('#k-public-median').textContent = fmt(national.public_hospital.median_km, 1) + ' km';
    $('#k-any10').textContent = pct(national.any_hospital.within_km['10']);
    $('#k-public10').textContent = pct(national.public_hospital.within_km['10']);
    $('#m-cells').textContent = fmt(distance.cells);
    $('#m-snapshot').textContent = `DGHS registry snapshot ${manifest.registry.datasetUpdatedAt || 'date not recorded'} · `
      + `${fmt(manifest.registry.active)} active records · index SHA-256 ${manifest.registry.sha256.slice(0, 12)}… · atlas built ${manifest.generatedAt.slice(0, 10)}.`;

    // 01 · map
    const metrics = upazilaMetrics(areas);
    $('#a-metric').replaceChildren(...metrics.map((m) => cell('option', m.label, { value: m.id })));
    $('#a-names').replaceChildren(...areas.map((a) => cell('option', '', { value: `${a.name} · ${a.district_name}` })));
    const map = window.AtlasChoropleth.create('atlas-map', {
      geojson: './data/boundaries/bangladesh-upazilas.geojson',
      onSelect: (properties) => detail(byPcode.get(properties.pcode), metrics)
    });
    const applyMetric = () => {
      const metric = metrics.find((m) => m.id === $('#a-metric').value) || metrics[0];
      $('#a-metric-note').textContent = metric.note;
      map.setMetric({
        legendTitle: metric.label, ramp: metric.ramp, digits: metric.digits,
        values: new Map(areas.map((a) => [a.pcode, metric.value(a)])),
        tooltipExtra: (pcode) => {
          const cells = byPcode.get(pcode).distance.public_hospital.cells || 0;
          return cells && cells < LOW_CELLS ? '<em>low confidence: under 5 grid cells</em>' : '';
        }
      });
    };
    $('#a-metric').addEventListener('change', applyMetric);
    applyMetric();
    $('#a-search').addEventListener('change', (event) => {
      const query = event.target.value.split(' · ')[0].trim().toLowerCase();
      const match = areas.find((a) => a.name.toLowerCase() === query)
        || areas.find((a) => a.name.toLowerCase().includes(query) || a.district_name.toLowerCase() === query);
      if (match) detail(match, metrics);
    });

    const far = areas.filter((a) => a.distance.public_hospital.cells)
      .sort((a, b) => b.distance.public_hospital.median_km - a.distance.public_hospital.median_km).slice(0, 20);
    window.HealthCharts.bars($('#c-far'), far.map((a) => ({
      label: `${a.name} · ${a.district_name}`, value: a.distance.public_hospital.median_km,
      display: fmt(a.distance.public_hospital.median_km, 1) + ' km',
      detail: `90th pct ${fmt(a.distance.public_hospital.p90_km, 1)} km; ${fmt(a.distance.public_hospital.cells)} cells`
    })), { title: 'Median straight-line km to the nearest government hospital · top 20 upazilas', axisLabel: 'Kilometres (straight line, land area)', digits: 1, source: SOURCE });

    const dense = [...areas].sort((a, b) => ((b.points.public_hospital || 0) + (b.points.private_ngo_hospital || 0))
      - ((a.points.public_hospital || 0) + (a.points.private_ngo_hospital || 0))).slice(0, 20);
    window.HealthCharts.bars($('#c-dense'), dense.map((a) => {
      const total = (a.points.public_hospital || 0) + (a.points.private_ngo_hospital || 0);
      return { label: `${a.name} · ${a.district_name}`, value: total,
               detail: `government ${a.points.public_hospital || 0}, non-government ${a.points.private_ngo_hospital || 0}` };
    }), { title: 'Mapped hospital points inside each upazila · top 20', axisLabel: 'Hospital points', source: SOURCE });

    $('#a-export').addEventListener('click', () => csvDownload('bangladesh-upazila-hospital-distance-atlas.csv',
      ['pcode', 'upazila', 'district', 'area_km2', 'grid_cells', 'median_km_government', 'p90_km_government', 'max_km_government',
       'median_km_any_hospital', 'government_hospital_points', 'non_government_hospital_points', 'primary_care_points', 'approved_beds_mapped', 'low_confidence'],
      areas.map((a) => {
        const p = a.distance.public_hospital, any = a.distance.any_hospital;
        return [a.pcode, a.name, a.district_name, a.area_km2, p.cells || 0, p.median_km ?? '', p.p90_km ?? '', p.max_km ?? '',
          any.median_km ?? '', a.points.public_hospital || 0, a.points.private_ngo_hospital || 0, a.points.primary_care || 0,
          a.beds_points.total || 0, !p.cells || p.cells < LOW_CELLS ? 'yes' : 'no'];
      })));

    // 02 · curves
    const order = ['public_hospital', 'any_hospital', 'private_ngo_hospital'];
    window.HealthCharts.lines($('#c-curve'), order.map((klass) => ({
      label: LABELS[klass], color: COLOURS[klass], points: national[klass].curve
    })), { title: 'Share of Bangladesh land area within a straight-line distance of the nearest mapped hospital',
      axisLabel: 'Straight-line distance to nearest mapped hospital (km)', yLabel: '% of land area', xmax: 40, ymax: 100, xUnit: 'km', digits: 1, source: SOURCE });
    tableRows('#t-national', order.map((klass) => {
      const n = national[klass];
      return [LABELS[klass], fmt(distance.classes[klass]), fmt(n.median_km, 1), fmt(n.p90_km, 1),
        pct(n.within_km['5']), pct(n.within_km['10']), pct(n.within_km['20']), pct(n.within_km['30'])];
    }));

    // 03 · divisions
    const divisions = Object.entries(distance.divisions)
      .map(([pcode, entry]) => ({ pcode, ...entry }))
      .sort((a, b) => b.public_hospital.within_km['10'] - a.public_hospital.within_km['10']);
    window.HealthCharts.bars($('#c-div10'), divisions.map((d) => ({
      label: d.name, value: d.public_hospital.within_km['10'], display: pct(d.public_hospital.within_km['10'])
    })), { title: 'Land within 10 km (straight line) of a mapped government hospital, by division', axisLabel: '% of division land area', maximum: 100, digits: 1, source: SOURCE });
    const byMedian = [...divisions].sort((a, b) => b.public_hospital.median_km - a.public_hospital.median_km);
    window.HealthCharts.bars($('#c-divmedian'), byMedian.map((d) => ({
      label: d.name, value: d.public_hospital.median_km, display: fmt(d.public_hospital.median_km, 1) + ' km'
    })), { title: 'Median straight-line km to the nearest mapped government hospital, by division', axisLabel: 'Kilometres (land area)', digits: 1, source: SOURCE });
    tableRows('#t-divisions', divisions.map((d) => {
      const rate = profiles.division_rates[d.pcode]?.per_100000;
      const hospitalRate = rate ? (rate.public_hospital || 0) + (rate.private_ngo_hospital || 0) : NaN;
      const p = d.public_hospital;
      return [d.name, fmt(p.median_km, 1), fmt(p.p90_km, 1), pct(p.within_km['5']), pct(p.within_km['10']),
        pct(p.within_km['20']), pct(d.any_hospital.within_km['10']), fmt(hospitalRate, 2)];
    }));

    // 04 · beds, growth, services
    const cov = profiles.coverage;
    $('#beds-note').textContent = `Approved beds recorded in DGHS facility profiles: ${fmt(cov.approved_beds_total)} across all active facility types. `
      + 'Approved (licensed or sanctioned) beds are not functional or staffed beds, and are not a measure of service capacity. Government means explicit fully government, autonomous or semi-autonomous ownership.';
    const beds = Object.entries(profiles.divisions).map(([name, groups]) => ({ name, publicBeds: groups.beds?.public || 0, privateBeds: groups.beds?.private_ngo || 0 }));
    // Same scale on both panels so the bars can be compared across them.
    const bedMax = Math.ceil(Math.max(...beds.map((b) => Math.max(b.publicBeds, b.privateBeds))) / 10000) * 10000;
    window.HealthCharts.bars($('#c-beds-public'), [...beds].sort((a, b) => b.publicBeds - a.publicBeds)
      .map((b) => ({ label: b.name, value: b.publicBeds })), { title: 'Approved beds · government-owned facilities, by division (shared scale)', axisLabel: 'Approved beds', maximum: bedMax, source: 'DGHS facility profiles (approved_bed_number).' });
    window.HealthCharts.bars($('#c-beds-private'), [...beds].sort((a, b) => b.privateBeds - a.privateBeds)
      .map((b) => ({ label: b.name, value: b.privateBeds, muted: true })), { title: 'Approved beds · non-government or ownership not reported, by division (shared scale)', axisLabel: 'Approved beds', maximum: bedMax, source: 'DGHS facility profiles (approved_bed_number).' });

    const decades = Object.entries(profiles.growth_by_decade).map(([decade, counts]) => ({ decade: Number(decade), ...counts }))
      .filter((d) => d.decade >= 1950).sort((a, b) => a.decade - b.decade);
    const early = Object.entries(profiles.growth_by_decade).filter(([decade]) => Number(decade) < 1950)
      .reduce((sum, [, counts]) => sum + (counts.all || 0), 0);
    $('#growth-note').textContent = `Based on ${fmt(cov.establishment_year_reported)} of ${fmt(cov.facilities_total_active)} active facilities (${pct(cov.establishment_year_reported / cov.facilities_total_active * 100)}) that report an establishment year; ${fmt(early)} listed before 1950 are omitted from the chart. Unreported years make recent decades and missing sectors uncertain. The 2020s cover 2020–2026 only.`;
    window.HealthCharts.lines($('#c-growth'), [
      { label: 'Government-owned', color: COLOURS.public_hospital, points: decades.map((d) => [d.decade, d.public || 0]) },
      { label: 'All facilities', color: COLOURS.any_hospital, points: decades.map((d) => [d.decade, d.all || 0]) },
      { label: 'Non-government / not reported', color: COLOURS.private_ngo_hospital, points: decades.map((d) => [d.decade, d.private_ngo || 0]) }
    ],
    { title: 'Active DGHS-registered facilities by decade of establishment (all facility types)', axisLabel: 'Decade of establishment (2020s = 2020–2026)', yLabel: 'Facilities established', xmin: 1950, xmax: 2020, xTicks: 7, xFormat: (v) => String(Math.round(v)) + 's', digits: 0, source: 'DGHS facility profiles (establishment_year); only facilities reporting a year.' });

    const services = [['Emergency service', 'emergency'], ['Ambulance', 'ambulance'], ['In-patient department (IPD)', 'ipd']];
    tableRows('#t-services', services.map(([label, key]) => {
      const reported = cov.service_flags_reported[key] || 0;
      return [label, fmt(reported), pct(reported / cov.facilities_total_active * 100)];
    }));

    $('#atlas-status').hidden = true;
    $('#atlas-content').hidden = false;
    await map.ready;
    map.fit();
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch((error) => {
      $('#atlas-status').textContent = 'The atlas data could not be loaded. Please refresh the page. (' + error.message + ')';
    });
  });
})();
