'use strict';
(() => {
  const $ = (s) => document.querySelector(s), model = window.HealthAccessibility;
  let index, result;
  const map = L.map('access-map', { preferCanvas: true }).setView([23.7, 90.1], 7);
  L.control.scale({ imperial: false }).addTo(map);
  const points = L.layerGroup().addTo(map), renderer = L.canvas({ padding: 0.3 });
  const number = (n) => n.toLocaleString('en-BD');
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
    const chartTitle = model.tiers[tier].label;
    window.HealthCharts.bars('#access-count-chart', result.divisions.map((r)=>({label:r.division,value:r.active})), {title:chartTitle+' active listings',axisLabel:'Active listings · selected area'});
    window.HealthCharts.bars('#access-completeness-chart', result.divisions.filter((r)=>r.active>0).map((r)=>({label:r.division,value:100*r.mapped/r.active,display:(100*r.mapped/r.active).toFixed(1)+'%',detail:r.mapped+' eligible / '+r.active+' active'})), {title:chartTitle+' coordinate availability',axisLabel:'Share of active listings (%)',maximum:100,stacked:true});
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
