'use strict';
(() => {
  const $ = (s) => document.querySelector(s), model = window.HealthAccessibility;
  let index, result;
  const map = L.map('access-map', { preferCanvas: true }).setView([23.7, 90.1], 7);
  L.control.scale({ imperial: false }).addTo(map);
  const points = L.layerGroup().addTo(map), renderer = L.canvas({ padding: 0.3 });
  const T = (en, bn) => (window.SiteI18n ? window.SiteI18n.t(en, bn) : en);
  const place = (name) => (window.NamesBn ? window.NamesBn.name(name) : name);
  const TIER_BN = { community: 'কমিউনিটি ক্লিনিক', union: 'ইউনিয়ন-স্তরের প্রতিষ্ঠান', upazila: 'উপজেলা স্বাস্থ্য কমপ্লেক্স', urban_primary: 'নগর প্রাথমিক স্বাস্থ্যকেন্দ্র' };
  const tierLabel = (tier) => T(model.tiers[tier].label, TIER_BN[tier]);
  const number = (n) => n.toLocaleString(document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-BD');
  const area = () => ({ division: $('#access-division').value, district: $('#access-district').value, upazila: $('#access-upazila').value });
  function options(level, parents) {
    const select = $('#access-' + level), old = select.value;
    const all = { division: T('All divisions', 'সব বিভাগ'), district: T('All districts', 'সব জেলা'), upazila: T('All upazilas', 'সব উপজেলা') }[level];
    select.replaceChildren(new Option(all, ''), ...model.areaValues(index, level, parents).map((value) => new Option(level === 'upazila' ? value : place(value), value)));
    if ([...select.options].some((o) => o.value === old)) select.value = old;
  }
  function render() {
    const tier = $('#access-tier').value;
    result = model.summarize(index, tier, area());
    $('#access-total').textContent = number(result.total);
    $('#access-mapped').textContent = number(result.mapped);
    $('#access-missing').textContent = number(result.missing);
    $('#access-types').textContent = T('Included DGHS types: ', 'অন্তর্ভুক্ত DGHS ধরন: ') + model.tiers[tier].types.join('; ') + T('. Offices, training bodies and inactive listings are excluded.', '। দপ্তর, প্রশিক্ষণ প্রতিষ্ঠান ও নিষ্ক্রিয় তালিকা বাদ।');
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
      for (const value of [place(row.division), number(row.active), number(row.mapped)]) { const td = document.createElement('td'); td.textContent = value; tr.append(td); }
      body.append(tr);
    }
    $('#access-divisions').replaceChildren(body);
    const chartTitle = tierLabel(tier);
    window.HealthCharts.bars('#access-count-chart', result.divisions.map((r)=>({label:place(r.division),value:r.active})), {title:chartTitle+T(' · active listings',' · সক্রিয় তালিকা'),axisLabel:T('Active listings · selected area','সক্রিয় তালিকা · নির্বাচিত এলাকা')});
    window.HealthCharts.bars('#access-completeness-chart', result.divisions.filter((r)=>r.active>0).map((r)=>({label:place(r.division),value:100*r.mapped/r.active,display:number(Math.round(1000*r.mapped/r.active)/10)+'%',detail:T(r.mapped+' usable / '+r.active+' active', number(r.mapped)+' ব্যবহারযোগ্য / '+number(r.active)+' সক্রিয়')})), {title:chartTitle+T(' · usable coordinates',' · ব্যবহারযোগ্য স্থানাঙ্ক'),axisLabel:T('Share of active listings (%)','সক্রিয় তালিকার অংশ (%)'),maximum:100,stacked:true});
    $('#access-dates').textContent = T(`DGHS national report: ${index.reportExportedAt || 'not reported'}. Snapshot update: ${index.generatedAt || 'not reported'}.`, `DGHS জাতীয় প্রতিবেদন: ${index.reportExportedAt || 'উল্লেখ নেই'}। তথ্য হালনাগাদ: ${index.generatedAt || 'উল্লেখ নেই'}।`);
    $('#access-status').textContent = T(`${model.tiers[tier].label}: ${number(result.mapped)} points shown.`, `${TIER_BN[tier]}: ${number(result.mapped)}টি স্থান দেখানো হয়েছে।`);
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
  Promise.all([fetch('./data/dghs/index.json').then((response) => { if (!response.ok) throw new Error('DGHS data unavailable'); return response.json(); }),
    fetch('./data/atlas/location-quality.json').then((r) => (r.ok ? r.json() : null)).catch(() => null)]).then(([data, quality]) => {
    const flagged = new Set((quality?.flagged_ids || []).map(String));
    data.records.forEach((record) => { if (flagged.has(String(record.id))) record.locationFlag = true; });
    index = data; options('division', {}); options('district', {}); options('upazila', {}); render();
    document.addEventListener('site-language', () => { const a = area(); options('division', {}); $('#access-division').value = a.division; options('district', { division: a.division }); $('#access-district').value = a.district; options('upazila', { division: a.division, district: a.district }); $('#access-upazila').value = a.upazila; render(); });
  }).catch(() => {
    $('#access-status').textContent = T('The DGHS snapshot could not be loaded.', 'DGHS তথ্য লোড হয়নি।');
    $('#access-status').classList.add('error'); $('#access-download').disabled = true;
  });
})();
