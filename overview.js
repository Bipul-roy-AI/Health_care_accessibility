'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const dictionaries = { en: { ...RegistryDirectory.translations.en, ...FacilityDetails.translations.en, routeHere: 'Open facility & directions', layersLoading: 'Loading the directory and division boundaries…', pointsNote: 'Each coloured dot is a boundary-checked institution location. Overlapping dots indicate concentration; zoom in for detail.', totalsNote: 'Division shading shows counts, not population-adjusted rates. Select a division to explore its institutions.', overviewFailed: 'The national dataset could not load. Reload this page or return to Find care.', snapshotLabel: 'Dataset snapshot', unspecified: 'Unspecified division', divisionSelected: 'Selected division', of: 'of', nationalOverview: 'National overview' }, bn: { statisticsNav: "পরিসংখ্যান", ...RegistryDirectory.translations.bn, ...FacilityDetails.translations.bn, findCare: 'চিকিৎসা খুঁজুন', nationalOverview: 'সারাদেশের চিত্র', overviewEyebrow: 'বাংলাদেশ · প্রতিষ্ঠানের বিস্তার', overviewTitle: 'আমাদের প্রতিষ্ঠান কোথায়।', overviewIntro: 'বাংলাদেশের আট বিভাগে প্রতিষ্ঠানের অবস্থান ও ঘনত্ব দেখুন।', viewData: 'GitHub-এ তথ্য ও আমদানির ইতিহাস →', matchingInstitutions: 'মিল পাওয়া প্রতিষ্ঠান', usablePoints: 'প্রকাশিত মানচিত্রের স্থান আছে', unusablePoints: 'ব্যবহারযোগ্য স্থানাঙ্ক নেই', reportedDivisions: 'রেকর্ডে থাকা বিভাগ', divisionLabel: 'বিভাগ', allDivisions: 'সব বিভাগ', typeLabel: 'প্রতিষ্ঠানের ধরন', allTypes: 'সব ধরন', hospital: 'হাসপাতাল / স্বাস্থ্য কমপ্লেক্স', clinic: 'ক্লিনিক / স্বাস্থ্যকেন্দ্র', diagnostic: 'ডায়াগনস্টিক / ল্যাবরেটরি', pharmacy: 'ফার্মেসি', other: 'অন্যান্য প্রতিষ্ঠান / কার্যালয়', viewMode: 'মানচিত্রের ধরন', pointsMode: 'প্রতিষ্ঠানের স্থান', totalsMode: 'বিভাগ অনুযায়ী মোট', resetView: 'মানচিত্র রিসেট', pointLegend: 'পয়েন্টের চিহ্ন', divisionComparison: 'বিভাগের তুলনা', divisionComparisonNote: 'সংখ্যা DGHS-এ লেখা প্রশাসনিক বিভাগ অনুযায়ী; স্থানাঙ্ক দেখে নতুন বিভাগ নির্ধারণ করা হয়নি।', totalLabel: 'মোট', mappedLabel: 'মানচিত্রে', downloadIndex: 'প্রতিষ্ঠানের তালিকা ডাউনলোড (JSON)', distributionCaveat: 'এগুলো প্রতিষ্ঠানের সংখ্যা, জনসংখ্যা অনুযায়ী সেবাপ্রাপ্তির হার নয়। ব্যবহারযোগ্য স্থানাঙ্ক না থাকলেও মোট সংখ্যায় প্রতিষ্ঠান থাকে। প্রশাসনিক দপ্তর ও নিষ্ক্রিয় রেকর্ডও অন্তর্ভুক্ত; রেকর্ড থাকা মানেই বর্তমানে চিকিৎসা দেয় এমন নয়।', boundaryCaveat: 'জাতীয় সীমানা: দ্বীপসহ OpenStreetMap বাংলাদেশ সীমানা (ODbL)। বিভাগের সীমানা: geoBoundaries, উৎসের বছর ২০১৫ (CC0)। শুধু জাতীয় সীমানার মধ্যে থাকা স্থান দেখানো হয়; মূল স্থানাঙ্ক যাচাইয়ের জন্য রাখা আছে। এগুলো জমি জরিপের মানচিত্র নয়।', routeHere: 'প্রতিষ্ঠান ও পথনির্দেশ খুলুন', layersLoading: 'প্রতিষ্ঠান ও বিভাগের সীমানা লোড হচ্ছে…', pointsNote: 'প্রতিটি রঙিন বিন্দু সীমানার মধ্যে যাচাই করা একটি প্রতিষ্ঠানের স্থান। বিন্দুর ঘনত্ব প্রতিষ্ঠানের বিস্তার বোঝায়; বিস্তারিত দেখতে জুম করুন।', totalsNote: 'বিভাগের রং প্রতিষ্ঠানের সংখ্যা বোঝায়, জনসংখ্যা অনুযায়ী হার নয়। একটি বিভাগ বেছে নিন।', overviewFailed: 'সারাদেশের তথ্য লোড হয়নি। পৃষ্ঠাটি রিফ্রেশ করুন বা চিকিৎসা অনুসন্ধানে ফিরুন।', snapshotLabel: 'তথ্য আনার সময়', unspecified: 'বিভাগ দেওয়া নেই', divisionSelected: 'বাছাই করা বিভাগ', of: 'এর মধ্যে' } };
  document.querySelectorAll('[data-i18n]').forEach((e) => { dictionaries.en[e.dataset.i18n] = e.innerText; });
  let language = 'en', selectedDivision = 'all', selectedType = 'all', mode = 'points';
  const t = (key) => dictionaries[language][key] || dictionaries.en[key] || key;
  const text = (tag, value, className = '') => { const e = document.createElement(tag); e.textContent = value; e.className = className; return e; };
  const number = (n) => n.toLocaleString(language === 'bn' ? 'bn-BD' : 'en');
  const aliases = { barisal: 'Barishal', barishal: 'Barishal', chittagong: 'Chattogram', chattogram: 'Chattogram', dhaka: 'Dhaka', khulna: 'Khulna', mymensingh: 'Mymensingh', rajshahi: 'Rajshahi', rajshani: 'Rajshahi', rangpur: 'Rangpur', sylhet: 'Sylhet' };
  const namesBn = { Barishal: 'বরিশাল', Chattogram: 'চট্টগ্রাম', Dhaka: 'ঢাকা', Khulna: 'খুলনা', Mymensingh: 'ময়মনসিংহ', Rajshahi: 'রাজশাহী', Rangpur: 'রংপুর', Sylhet: 'সিলেট' };
  const canonical = (value) => aliases[String(value).trim().toLowerCase()] || 'unspecified';
  const divisionName = (name) => name === 'unspecified' ? t('unspecified') : language === 'bn' ? namesBn[name] || name : name;
  const types = ['hospital', 'clinic', 'diagnostic', 'pharmacy', 'other'];
  const map = L.map('national-map', { minZoom: 6, maxZoom: 19, zoomControl: false }).fitBounds([[20.6, 88], [26.65, 92.7]]);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution }).addTo(map);
  const light = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution, className: 'light-basemap-tiles' });
  L.control.layers({ 'OpenStreetMap': street, 'Light (OpenStreetMap)': light }, {}, { position: 'topright' }).addTo(map);
  const registry = new RegistryDirectory();
  const clusters = L.layerGroup().addTo(map);
  const pointRenderer = L.canvas({ padding: 0.2 });
  const markerById = new Map(); let institutions = [], boundaries, geojson, ready = false;
  const getName = (f) => language === 'bn' ? f.tags['name:bn'] || f.tags.name : f.tags.name;
  const details = new FacilityDetails({ t, getName, enrich: (f) => registry.enrich(f), onMap: (f) => { map.setView([f.lat, f.lon], 16); markerById.get(f.id)?.openPopup(); }, onRoute: (f) => { location.href = `./?source=dghs&institution=${encodeURIComponent(f.registry.id)}`; } });
  const shade = (count) => count >= 10000 ? '#07503d' : count >= 5000 ? '#238060' : count >= 3000 ? '#64a183' : count >= 1000 ? '#a3c8a8' : count > 0 ? '#dbe9cc' : '#f0f1eb';
  function selectDivision(value, fit = true) {
    selectedDivision = value; $('#overview-division').value = value; render();
    if (fit) { const layer = boundaries.getLayers().find((l) => canonical(l.feature.properties.shapeName) === value); if (layer) map.fitBounds(layer.getBounds(), { padding: [25, 25], animate: false }); else map.fitBounds([[20.6, 88], [26.65, 92.7]], { animate: false }); }
  }
  function render() {
    if (!ready) return;
    const matchingType = institutions.filter((f) => selectedType === 'all' || f.category === selectedType);
    const selected = matchingType.filter((f) => selectedDivision === 'all' || canonical(f.registry.division) === selectedDivision);
    const mapped = selected.filter(FacilityDetails.hasCoordinates);
    const outside = selected.filter((f) => f.registry.coordinateStatus === 'outside').length;
    const misplaced = selected.filter((f) => f.registry.locationFlag).length;
    $('#boundary-summary').innerHTML = '';
    $('#boundary-summary').append(language === 'bn'
      ? `দেখানো হয়নি: ${number(outside)}টি বাংলাদেশের সীমানার বাইরে, ${number(misplaced)}টি নথিভুক্ত জেলার বাইরে বা একাধিক এলাকার একই স্থানাঙ্কে। সব প্রতিষ্ঠান মোট সংখ্যায় আছে। `
      : `Not plotted: ${number(outside)} outside Bangladesh, ${number(misplaced)} outside their recorded district or on a coordinate shared across areas. All records stay in the totals. `);
    const auditLink = document.createElement('a'); auditLink.href = './data/atlas/flagged-locations.csv'; auditLink.download = '';
    auditLink.textContent = language === 'bn' ? 'চিহ্নিত স্থানের তালিকা (CSV)' : 'Flagged locations (CSV)';
    $('#boundary-summary').append(auditLink);
    $('#overview-total').textContent = number(selected.length); $('#overview-mapped').textContent = number(mapped.length); $('#overview-unmapped').textContent = number(selected.length - mapped.length);
    $('#overview-divisions').textContent = number(new Set(selected.map((f) => canonical(f.registry.division)).filter((name) => name !== 'unspecified')).size);
    const counts = new Map(Object.values(aliases).map((name) => [name, { total: 0, mapped: 0 }]));
    for (const f of matchingType) { const name = canonical(f.registry.division); if (!counts.has(name)) counts.set(name, { total: 0, mapped: 0 }); const c = counts.get(name); c.total++; if (FacilityDetails.hasCoordinates(f)) c.mapped++; }
    boundaries.eachLayer((layer) => { const name = canonical(layer.feature.properties.shapeName), count = counts.get(name)?.total || 0; layer.setStyle({ color: selectedDivision === name ? '#ce8c30' : '#496f59', weight: selectedDivision === name ? 3 : 1.3, fillColor: mode === 'totals' ? shade(count) : '#c8dcc0', fillOpacity: mode === 'totals' ? 0.8 : 0.12 }); layer.unbindTooltip(); layer.bindTooltip(text('span', `${divisionName(name)} · ${number(count)} ${t('directoryCount')}`), { sticky: true }); });
    clusters.clearLayers(); markerById.clear();
    if (mode === 'points') {
      const colours = { hospital: '#126751', clinic: '#398da0', diagnostic: '#c88b23', pharmacy: '#8a61ad', other: '#747f80' };
      mapped.forEach((f) => { const marker = L.circleMarker([f.lat, f.lon], { renderer: pointRenderer, radius: 3, color: colours[f.category], weight: 0.5, fillColor: colours[f.category], fillOpacity: 0.65 }).bindPopup(() => details.popup(f), { maxWidth: 330, maxHeight: 350 }).addTo(clusters); markerById.set(f.id, marker); });
    }
    const tbody = document.createDocumentFragment();
    [...counts].sort((a, b) => b[1].total - a[1].total).forEach(([name, count]) => { const tr = document.createElement('tr'); tr.classList.toggle('selected', name === selectedDivision); const td = document.createElement('td'); const button = text('button', divisionName(name)); button.type = 'button'; button.addEventListener('click', () => selectDivision(name)); td.append(button); tr.append(td, text('td', number(count.total)), text('td', number(count.mapped))); tbody.append(tr); });
    $('#division-table-body').replaceChildren(tbody);
    window.HealthCharts.bars('#overview-count-chart', [...counts].sort((a,b)=>b[1].total-a[1].total).map(([name,count])=>({label:divisionName(name),value:count.total,selected:name===selectedDivision})), {title:'DGHS institution listings by division',axisLabel:'Directory records · selected institution type'});
    $('#legend-title').textContent = t(mode === 'points' ? 'pointLegend' : 'totalsMode');
    const legend = document.createDocumentFragment();
    if (mode === 'points') for (const type of types) { const row = text('div', '', 'legend-row'); const swatch = text('span', '', `legend-dot ${type}`); row.append(swatch, text('span', t(type)), text('strong', number(mapped.filter((f) => f.category === type).length))); legend.append(row); }
    else for (const [label, count] of [['0', 0], ['1–999', 1], ['1,000–2,999', 1000], ['3,000–4,999', 3000], ['5,000–9,999', 5000], ['10,000+', 10000]]) { const row = text('div', '', 'legend-row'); const swatch = text('span', '', 'legend-shade'); swatch.style.background = shade(count); row.append(swatch, text('span', label)); legend.append(row); }
    $('#point-legend').replaceChildren(legend); $('#legend-note').textContent = t(mode === 'points' ? 'pointsNote' : 'totalsNote');
    $('#overview-snapshot').textContent = `${t('snapshotLabel')}: ${new Date(registry.metadata.generatedAt).toLocaleString()}`;
  }
  function populateDivisions() { const selected = $('#overview-division').value; $('#overview-division').replaceChildren(new Option(t('allDivisions'), 'all'), ...[...new Set(institutions.map((f) => canonical(f.registry.division)))].sort().map((name) => new Option(divisionName(name), name))); $('#overview-division').value = selected || 'all'; }
  $('#overview-division').addEventListener('change', () => selectDivision($('#overview-division').value));
  $('#overview-type').addEventListener('change', () => { selectedType = $('#overview-type').value; render(); });
  document.querySelectorAll('[name="overview-mode"]').forEach((radio) => radio.addEventListener('change', () => { mode = radio.value; render(); }));
  $('#overview-reset').addEventListener('click', () => { selectedType = 'all'; $('#overview-type').value = 'all'; selectDivision('all'); });
  $('#language').addEventListener('click', () => { language = language === 'en' ? 'bn' : 'en'; document.documentElement.lang = language; document.querySelectorAll('[data-i18n]').forEach((e) => { e.textContent = t(e.dataset.i18n); }); $('#language').textContent = language === 'en' ? 'বাংলা' : 'English'; populateDivisions(); details.translate(); render(); });
  $('#overview-status').textContent = t('layersLoading');
  Promise.all([registry.load(), fetch('./data/boundaries/bangladesh-divisions.geojson').then((r) => { if (!r.ok) throw new Error('Boundary file unavailable'); return r.json(); })]).then(([records, geometry]) => {
    if (geometry.type !== 'FeatureCollection' || geometry.features?.length !== 8 || new Set(geometry.features.map((f) => canonical(f.properties?.shapeName))).size !== 8 || geometry.features.some((f) => canonical(f.properties?.shapeName) === 'unspecified')) throw new Error('Invalid division boundaries');
    institutions = records; geojson = geometry;
    L.geoJSON(registry.country.geometry, { style: { color: '#173f35', weight: 2, fill: false }, interactive: false }).addTo(map);
    boundaries = L.geoJSON(geojson, { onEachFeature: (feature, layer) => layer.on('click', () => selectDivision(canonical(feature.properties.shapeName))) }).addTo(map);
    populateDivisions(); ready = true; $('#overview-status').textContent = ''; render();
  }).catch(() => { $('#overview-status').textContent = t('overviewFailed'); $('#overview-status').classList.add('error'); });
})();
