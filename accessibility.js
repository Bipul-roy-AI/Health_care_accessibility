'use strict';
(() => {
  const $ = (s) => document.querySelector(s), model = window.HealthAccessibility;
  let index, result;
  const map = L.map('access-map', { preferCanvas: true }).setView([23.7, 90.1], 7);
  L.control.scale({ imperial: false }).addTo(map);
  const points = L.layerGroup().addTo(map), renderer = L.canvas({ padding: 0.3 });
  const number = (n) => n.toLocaleString('en-BD');
  let baseline;
  const baselinePath = './data/accessibility/baseline/';
  function renderBaseline() {
    if (!baseline) return;
    const level = $('#baseline-level').value, metricSelect = $('#baseline-metric');
    const rate = metricSelect.querySelector('[value="active_listings_per_100000_bbs_residents"]');
    rate.disabled = level !== 'division';
    if (rate.disabled && metricSelect.value === rate.value) metricSelect.value = 'active_listings_by_registry_name';
    const metric = metricSelect.value, filename = `${level}_${metric}.png`;
    if (!baseline.levels[level]?.maps.includes(filename)) return;
    const title = `${$('#baseline-level').selectedOptions[0].text}: ${metricSelect.selectedOptions[0].text}`;
    $('#baseline-image').src = baselinePath + filename;
    $('#baseline-image').alt = title + '; six separate DGHS facility tiers';
    $('#baseline-image-link').href = baselinePath + filename;
    $('#baseline-caption').textContent = title + '. Select the image to open the full-size PNG.';
    $('#baseline-table').href = baselinePath + level + '_availability.csv';
    $('#baseline-unmatched').href = baselinePath + level + '_unmatched_names.csv';
    $('#baseline-assignments').href = baselinePath + level + '_facility_assignments.csv';
    const totals = Object.values(baseline.levels[level].tiers).reduce((out, row) => {
      for (const key of ['active', 'registry_matched', 'point_assigned', 'point_outside', 'point_ambiguous_border', 'name_point_disagreement']) out[key] = (out[key] || 0) + (row[key] || 0);
      return out;
    }, {});
    $('#baseline-qa').textContent = `All six tiers: ${number(totals.registry_matched)} of ${number(totals.active)} active listings matched by administrative names; ${number(totals.point_assigned)} points assigned to one polygon; ${number(totals.point_outside)} outside the supplied footprint; ${number(totals.point_ambiguous_border)} ambiguous at shared boundaries. ${number(totals.name_point_disagreement)} name–point area disagreements require review. Neither assignment corrects the other.`;
    $('#baseline-figure').hidden = false;
  }
  $('#baseline-level').addEventListener('change', renderBaseline);
  $('#baseline-metric').addEventListener('change', renderBaseline);
  fetch(baselinePath + 'manifest.json').then((response) => {
    if (!response.ok) throw new Error('Baseline unavailable');
    return response.json();
  }).then((data) => {
    if (data.status !== 'COMPLETED') throw new Error('Baseline incomplete');
    baseline = data;
    $('#baseline-meta').textContent = `Saved DGHS snapshot: ${data.sources.dghs_snapshot_updated_at}. Registry report: ${data.sources.dghs_report_exported_at}. BBS population: 2022 adjusted census, table 2.03. Boundary geometry: 2015, validOn 2020-11-13. This frozen baseline is separate from the current directory filters above.`;
    renderBaseline();
  }).catch(() => {
    $('#baseline-meta').textContent = 'The saved baseline could not be loaded. No zonal map is displayed.';
    $('#baseline-meta').classList.add('error');
  });
  const area = () => ({ division: $('#access-division').value, district: $('#access-district').value, upazila: $('#access-upazila').value });
  function options(level, parents) {
    const select = $('#access-' + level), old = select.value;
    select.replaceChildren(new Option('All ' + (level === 'upazila' ? 'upazilas' : level + 's'), ''), ...model.areaValues(index, level, parents).map((value) => new Option(value, value)));
    if ([...select.options].some((o) => o.value === old)) select.value = old;
  }
  function render() {
    const tier = $('#access-tier').value;
    result = model.summarize(index, tier, area());
    $('#access-total').textContent = number(result.total);
    $('#access-mapped').textContent = number(result.mapped);
    $('#access-missing').textContent = number(result.missing);
    $('#access-types').textContent = 'Included DGHS types: ' + model.tiers[tier].types.join('; ') + '. Offices, training bodies and inactive listings are excluded.';
    points.clearLayers();
    for (const row of result.points) {
      const label = document.createElement('div');
      const title = document.createElement('strong'); title.textContent = row.name; label.append(title);
      label.append(document.createElement('br'), document.createTextNode(`${row.facility_type_name} · DGHS ${row.code || row.id}`));
      L.circleMarker([Number(row.lat), Number(row.lon)], { renderer, radius: 3, color: '#176552', weight: 0.6, fillOpacity: 0.65 }).bindPopup(label).addTo(points);
    }
    if (!result.points.length) map.setView([23.7, 90.1], 7);
    if (result.points.length) map.fitBounds(L.latLngBounds(result.points.map((r) => [Number(r.lat), Number(r.lon)])), { padding: [15, 15], maxZoom: 9 });
    const body = document.createDocumentFragment();
    for (const row of result.divisions) {
      const tr = document.createElement('tr');
      for (const value of [row.division, number(row.active), number(row.mapped)]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
      body.append(tr);
    }
    $('#access-divisions').replaceChildren(body);
    $('#access-dates').textContent = `DGHS national report: ${index.reportExportedAt || 'Not reported'}. Snapshot update: ${index.generatedAt || 'Not reported'}. Facility locations do not establish population coverage or service capacity.`;
    $('#access-status').textContent = `${model.tiers[tier].label}: ${number(result.mapped)} points displayed. No travel-time or population-coverage calculation is shown.`;
    $('#access-download').disabled = false;
  }
  $('#access-division').addEventListener('change', () => { if (!index) return; $('#access-district').value = ''; $('#access-upazila').value = ''; options('district', { division: area().division }); options('upazila', { division: area().division }); render(); });
  $('#access-district').addEventListener('change', () => { if (!index) return; $('#access-upazila').value = ''; options('upazila', { division: area().division, district: area().district }); render(); });
  $('#access-upazila').addEventListener('change', () => { if (index) render(); });
  $('#access-tier').addEventListener('change', () => { if (index) render(); });
  $('#access-download').addEventListener('click', () => {
    if (!result) return;
    const safe = (value) => '"' + String(value).replace(/^[=+@-]/, "'" + '$&').replaceAll('"', '""') + '"';
    const selected = area();
    const text = [['selected_division', 'selected_district', 'selected_upazila', 'division', 'active_listings', 'mapped_listings'], ...result.divisions.map((r) => [selected.division || 'All', selected.district || 'All', selected.upazila || 'All', r.division, r.active, r.mapped])].map((row) => row.map(safe).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), link = document.createElement('a');
    link.href = url; link.download = `dghs_${$('#access-tier').value}_division_counts.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  fetch('./data/dghs/index.json').then((response) => { if (!response.ok) throw new Error('DGHS data unavailable'); return response.json(); }).then((data) => { index = data; options('division', {}); options('district', {}); options('upazila', {}); render(); }).catch(() => {
    $('#access-status').textContent = 'The DGHS snapshot could not be validated or loaded. No counts or access estimates are shown.';
    $('#access-status').classList.add('error'); $('#access-download').disabled = true;
  });
})();
