'use strict';
(() => {
  const $ = (s) => document.querySelector(s), path = './data/accessibility/baseline/';
  const number = (n) => n.toLocaleString('en-BD');
  const labels = { community: 'Community clinics', union: 'Union-level facilities', upazila: 'Upazila health complexes', urban_primary: 'Urban primary care centres', secondary: 'District / general hospitals', tertiary: 'Tertiary facilities' };
  const date = (value) => new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(value));
  let baseline;
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
