'use strict';
(() => {
  const $ = (s) => document.querySelector(s), path = './data/accessibility/baseline/';
  const number = (n) => n.toLocaleString('en-BD');
  const labels = { community: 'Community clinics', union: 'Union-level facilities', upazila: 'Upazila health complexes', urban_primary: 'Urban primary care centres', secondary: 'District / general hospitals', tertiary: 'Tertiary facilities' };
  const date = (value) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));
  let baseline;
  const areaCache = new Map(); let areaRequest = 0;
  const numeric = (value) => value === '' ? null : Number(value);
  async function renderAreaCharts() {
    if (!baseline) return;
    const request = ++areaRequest, level = $('#area-chart-level').value, tier = $('#area-chart-tier').value;
    const measure = $('#area-chart-measure'), rate = measure.querySelector('[value="active_listings_per_100000_bbs_residents"]');
    rate.disabled = level !== 'division';
    if (rate.disabled && measure.value === rate.value) measure.value = 'active_listings_by_registry_name';
    const metric = measure.value, search = $('#area-chart-search').value.trim().toLocaleLowerCase();
    $('#area-chart-status').textContent = 'Loading area figures…';
    try {
      if (!areaCache.has(level)) areaCache.set(level, fetch(path + level + '_availability.csv').then((r) => {
        if (!r.ok) throw new Error('Area table unavailable'); return r.text();
      }).then((text) => {
        const rows = window.HealthCharts.csv(text);
        if (rows.length !== baseline.levels[level].features * 6 || rows.some((r) => !r.pcode || !r.area_name || !labels[r.tier] || !Number.isFinite(numeric(r.active_listings_by_registry_name)))) throw new Error('Area table incomplete');
        return rows;
      }).catch((e) => { areaCache.delete(level); throw e; }));
      const rows = await areaCache.get(level);
      if (request !== areaRequest) return;
      const selected = rows.filter((r) => r.tier === tier && (!search || (r.area_name + ' ' + r.pcode).toLocaleLowerCase().includes(search)));
      const available = selected.filter((r) => numeric(r[metric]) !== null && Number.isFinite(numeric(r[metric])));
      available.sort((a, b) => metric === 'coordinate_availability_pct' ? numeric(a[metric]) - numeric(b[metric]) || a.pcode.localeCompare(b.pcode) : numeric(b[metric]) - numeric(a[metric]) || a.pcode.localeCompare(b.pcode));
      const shown = available.slice(0, 15), measurement = measure.selectedOptions[0].text, geography = $('#area-chart-level').selectedOptions[0].text;
      $('#area-ranking-title').textContent = measurement;
      window.HealthCharts.bars('#area-ranking-chart', shown.map((r) => ({ label: r.area_name + ' · ' + r.pcode, value: numeric(r[metric]) })), {
        title: labels[tier] + ' — ' + geography + ' — ' + measurement,
        axisLabel: metric === 'coordinate_availability_pct' ? 'Eligible coordinates among listings (%)' : metric === rate.value ? 'Listings per 100,000 BBS 2022 residents' : 'Facility listings',
        digits: metric === 'coordinate_availability_pct' ? 1 : metric === rate.value ? 3 : 0,
        ...(metric === 'coordinate_availability_pct' ? { maximum: 100 } : {}), emptyMessage: 'No areas with a calculable value match this selection.' });
      window.HealthCharts.scatter('#area-scatter-chart', selected.filter((r) => numeric(r.coordinate_availability_pct) !== null).map((r) => ({ label: r.area_name + ' · ' + r.pcode, x: numeric(r.active_listings_by_registry_name), y: numeric(r.coordinate_availability_pct) })), { title: labels[tier] + ' — ' + geography + ' — listings and coordinate completeness' });
      $('#area-chart-status').textContent = `${labels[tier]} · ${selected.length} matching areas. Comparison shows ${shown.length} of ${available.length} areas with calculable values, ${metric === 'coordinate_availability_pct' ? 'lowest coordinate availability first' : 'highest values first'}. Scatter includes every matching area with a coordinate-completeness percentage. Full values remain in the CSV.`;
      $('#area-chart-values').href = path + level + '_availability.csv';
    } catch (error) {
      if (request !== areaRequest) return;
      $('#area-chart-status').textContent = 'The area table could not be loaded or validated. No area chart is shown.';
      window.HealthCharts.bars('#area-ranking-chart', [], { emptyMessage: 'No validated area figures available.' });
      window.HealthCharts.scatter('#area-scatter-chart', [], { emptyMessage: 'No validated area figures available.' });
    }
  }
  for (const name of ['level', 'tier', 'measure']) $('#area-chart-' + name).addEventListener('change', renderAreaCharts);
  $('#area-chart-search').addEventListener('input', renderAreaCharts);
  fetch('./data/accessibility/study-status.json').then((r) => { if (!r.ok) throw new Error('Study status unavailable'); return r.json(); }).then((status) => {
    $('#study-scenario').textContent = `Selected scenario: motorised travel only · ${status.threshold_minutes.join(', ')} minutes. AccessMod 5 execution: not run. Input check: ${date(status.checked_at)}.`;
    const modules = document.createDocumentFragment();
    for (const module of status.analyses) {
      const article = document.createElement('article'); article.className = 'study-module';
      const badge = document.createElement('span'); badge.className = 'study-status'; badge.textContent = 'NOT RUN · INPUTS / MODEL VALIDATION NEEDED';
      const heading = document.createElement('h3'); heading.textContent = module.label;
      const question = document.createElement('p'); question.textContent = module.question;
      const outputs = document.createElement('p'); outputs.textContent = 'Planned outputs: ' + module.outputs;
      const list = document.createElement('ul');
      for (const key of module.missing_inputs) { const li = document.createElement('li'); li.textContent = 'Needed: ' + status.input_checks[key].label; list.append(li); }
      article.append(badge, heading, question, outputs, list); modules.append(article);
    }
    $('#study-modules').replaceChildren(modules);
  }).catch(() => { $('#study-scenario').textContent = 'The advanced-analysis input report could not be loaded. No advanced results are shown.'; });
  function renderMap() {
    if (!baseline) return;
    const level = $('#baseline-level').value, metric = $('#baseline-metric');
    const rate = metric.querySelector('[value="active_listings_per_100000_bbs_residents"]');
    rate.disabled = level !== 'division';
    if (rate.disabled && metric.value === rate.value) metric.value = 'active_listings_by_registry_name';
    const filename = `${level}_${metric.value}.png`;
    if (!baseline.levels[level]?.maps.includes(filename)) return;
    const title = `${$('#baseline-level').selectedOptions[0].text}: ${metric.selectedOptions[0].text}`;
    $('#baseline-figure').hidden = true;
    $('#baseline-map-status').classList.remove('error');
    $('#baseline-map-status').textContent = 'Loading map…';
    $('#baseline-image').alt = title + '; six separate DGHS facility tiers';
    $('#baseline-image').src = path + filename;
    $('#baseline-image-link').href = path + filename;
    $('#baseline-map-download').href = path + filename;
    $('#baseline-caption').textContent = title + '. Select the image to open the full-size PNG.';
    $('#baseline-table').href = path + level + '_availability.csv';
    $('#baseline-unmatched').href = path + level + '_unmatched_names.csv';
    $('#baseline-assignments').href = path + level + '_facility_assignments.csv';
    const totals = Object.values(baseline.levels[level].tiers).reduce((out, row) => {
      for (const key of ['active', 'registry_matched', 'point_assigned', 'point_outside', 'point_ambiguous_border', 'name_point_disagreement']) out[key] = (out[key] || 0) + (row[key] || 0);
      return out;
    }, {});
    $('#baseline-qa').textContent = `Across six tiers: ${number(totals.registry_matched)} of ${number(totals.active)} active listings matched by administrative names; ${number(totals.point_assigned)} eligible points assigned to one polygon; ${number(totals.point_outside)} points outside the supplied footprint; ${number(totals.point_ambiguous_border)} ambiguous at shared boundaries. ${number(totals.name_point_disagreement)} name–point area disagreements require review. Neither assignment automatically corrects the other.`;
  }
  $('#baseline-image').addEventListener('load', () => {
    $('#baseline-figure').hidden = false;
    $('#baseline-map-status').textContent = 'Map ready. Download the area table for exact figures.';
  });
  $('#baseline-image').addEventListener('error', () => {
    $('#baseline-figure').hidden = true;
    $('#baseline-map-status').textContent = 'This map could not be loaded. Its CSV tables remain available below.';
    $('#baseline-map-status').classList.add('error');
  });
  $('#baseline-level').addEventListener('change', renderMap);
  $('#baseline-metric').addEventListener('change', renderMap);
  fetch(path + 'manifest.json').then((response) => {
    if (!response.ok) throw new Error('Analysis unavailable');
    return response.json();
  }).then((data) => {
    if (data.status !== 'COMPLETED' || data.national.length !== 6 || !data.levels.division || !data.levels.district || !data.levels.upazila_thana) throw new Error('Incomplete analysis');
    baseline = data;
    $('#analysis-active').textContent = number(data.national.reduce((sum, r) => sum + r.active, 0));
    $('#analysis-points').textContent = number(data.national.reduce((sum, r) => sum + r.eligible_coordinates, 0));
    $('#analysis-areas').textContent = number(Object.values(data.levels).reduce((sum, r) => sum + r.features, 0));
    $('#analysis-maps').textContent = number(Object.values(data.levels).reduce((sum, r) => sum + r.maps.length, 0));
    $('#analysis-population').textContent = number(data.national[0].bbs_population_2022);
    const body = document.createDocumentFragment();
    for (const row of data.national) {
      const tr = document.createElement('tr');
      const completeness = row.active ? (100 * row.eligible_coordinates / row.active).toFixed(1) + '%' : '—';
      for (const value of [labels[row.tier], number(row.active), number(row.eligible_coordinates), completeness, row.active_per_100000_bbs_residents.toFixed(3)]) {
        const td = document.createElement('td'); td.textContent = value; tr.append(td);
      }
      body.append(tr);
    }
    $('#analysis-national').replaceChildren(body);
    window.HealthCharts.bars('#national-count-chart', data.national.map((r) => ({label:labels[r.tier],value:r.active})), {title:'Active DGHS facility listings by care tier',axisLabel:'Active listings · selected six tiers'});
    window.HealthCharts.bars('#national-coordinate-chart', data.national.filter((r)=>r.active>0).map((r) => ({label:labels[r.tier],value:100*r.eligible_coordinates/r.active,display:(100*r.eligible_coordinates/r.active).toFixed(1)+'%',detail:r.eligible_coordinates+' eligible / '+r.active+' active'})), {title:'DGHS coordinate availability by care tier',axisLabel:'Share of active listings (%)',maximum:100,stacked:true});
    for (const name of ['level','tier','measure','search']) $('#area-chart-'+name).disabled=false;
    renderAreaCharts();
    $('#analysis-status').textContent = `Saved baseline · DGHS report ${date(data.sources.dghs_report_exported_at)} · Facility availability and coordinate quality`;
    $('#baseline-meta').textContent = `DGHS report exported ${date(data.sources.dghs_report_exported_at)}; directory snapshot updated ${date(data.sources.dghs_snapshot_updated_at)}. Population: BBS adjusted Census 2022, republished in the Statistical Yearbook 2025 (June 2026). This is a mixed-vintage comparison, not a 2026 population estimate.`;
    $('#analysis-dghs-source').href = data.sources.dghs_source_url;
    $('#analysis-bbs-source').href = data.sources.bbs_url;
    $('#baseline-level').disabled = false;
    $('#baseline-metric').disabled = false;
    $('#baseline-downloads').hidden = false;
    renderMap();
  }).catch(() => {
    $('#analysis-status').textContent = 'The saved analysis could not be loaded. Maps and calculated figures are unavailable; please try again later.';
    $('#analysis-status').classList.add('error');
  });
})();
