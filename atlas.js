/* Distance page: division-to-union choropleth, disparities, distance curves,
   location quality and beds. Data: data/atlas/*.json (scripts/build_atlas.py). */
'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const T = (en, bn) => window.SiteI18n ? window.SiteI18n.t(en, bn) : en;
  const N = (v, d = 0) => window.SiteI18n ? window.SiteI18n.number(v, d) : (Number.isFinite(v) ? v.toFixed(d) : '—');
  const pct = (v) => Number.isFinite(v) ? N(v, 1) + '%' : '—';
  const km = (v) => Number.isFinite(v) ? N(v, 1) + T(' km', ' কিমি') : '—';
  const place = (name) => window.NamesBn ? window.NamesBn.name(name) : name;
  const LOW_CELLS = 5;
  // Validated categorical order (dataviz palette check): government, any hospital, non-government, primary care.
  const COLOURS = { public_hospital: '#077a53', any_hospital: '#2563eb', private_ngo_hospital: '#c2611e', primary_care: '#8b5cf6' };
  const CLASS = {
    public_hospital: ['Government hospitals', 'সরকারি হাসপাতাল'], any_hospital: ['Any hospital', 'যেকোনো হাসপাতাল'],
    private_ngo_hospital: ['Non-government hospitals', 'বেসরকারি হাসপাতাল'], primary_care: ['Primary care', 'প্রাথমিক স্বাস্থ্যসেবা']
  };
  const cls = (k) => T(...CLASS[k]);
  const LEVELS = {
    division: { en: 'Division', bn: 'বিভাগ', geo: { url: './data/boundaries/bangladesh-divisions.geojson' } },
    district: { en: 'District', bn: 'জেলা', geo: { url: './data/boundaries/bangladesh-districts.geojson' } },
    upazila: { en: 'Upazila / thana', bn: 'উপজেলা / থানা', geo: { url: './data/boundaries/bangladesh-upazilas.geojson' } },
    union: { en: 'Union', bn: 'ইউনিয়ন', geo: { url: './data/boundaries/bangladesh-unions.topojson', topology: 'unions' } }
  };
  const lvl = (k) => T(LEVELS[k].en, LEVELS[k].bn);

  const dist = (klass, key, sub) => (a) => {
    const s = a.distance[klass];
    if (!s || !s.cells) return NaN;
    return sub ? s.within_km?.[sub] ?? NaN : s[key];
  };
  const pts = (a, k) => a.points[k] || 0;
  const MEASURES = [
    { id: 'public_median', en: 'Median km to a government hospital', bn: 'সরকারি হাসপাতালের মধ্যমা দূরত্ব (কিমি)', ramp: 'amber', digits: 1, worse: 'high', grid: true, value: dist('public_hospital', 'median_km'),
      note: ['Half of the area\'s land is closer than this to a government hospital.', 'এলাকার অর্ধেক ভূমি সরকারি হাসপাতাল থেকে এর চেয়ে কম দূরত্বে।'] },
    { id: 'any_median', en: 'Median km to any hospital', bn: 'যেকোনো হাসপাতালের মধ্যমা দূরত্ব (কিমি)', ramp: 'amber', digits: 1, worse: 'high', grid: true, value: dist('any_hospital', 'median_km'),
      note: ['Government and non-government hospitals together.', 'সরকারি ও বেসরকারি হাসপাতাল একসাথে।'] },
    { id: 'primary_median', en: 'Median km to primary care', bn: 'প্রাথমিক স্বাস্থ্যসেবার মধ্যমা দূরত্ব (কিমি)', ramp: 'amber', digits: 1, worse: 'high', grid: true, value: dist('primary_care', 'median_km'),
      note: ['Community clinics, union health centres, UH&FWC, MCWC and urban primary-care centres.', 'কমিউনিটি ক্লিনিক, ইউনিয়ন স্বাস্থ্যকেন্দ্র, UH&FWC, MCWC ও নগর প্রাথমিক স্বাস্থ্যকেন্দ্র।'] },
    { id: 'public_w10', en: '% land within 10 km of a government hospital', bn: 'সরকারি হাসপাতাল থেকে ১০ কিমির মধ্যে ভূমি (%)', ramp: 'green', digits: 1, worse: 'low', grid: true, value: dist('public_hospital', null, '10'),
      note: ['Share of the area\'s land within 10 km in a straight line.', 'সরলরেখায় ১০ কিমির মধ্যে থাকা ভূমির অংশ।'] },
    { id: 'primary_w5', en: '% land within 5 km of primary care', bn: 'প্রাথমিক স্বাস্থ্যসেবা থেকে ৫ কিমির মধ্যে ভূমি (%)', ramp: 'green', digits: 1, worse: 'low', grid: true, value: dist('primary_care', null, '5'),
      note: ['Share of the area\'s land within 5 km in a straight line.', 'সরলরেখায় ৫ কিমির মধ্যে থাকা ভূমির অংশ।'] },
    { id: 'hospital_density', en: 'Hospital locations per 1,000 km²', bn: 'প্রতি ১,০০০ বর্গকিমিতে হাসপাতাল', ramp: 'green', digits: 1, worse: 'low', value: (a) => a.area_km2 > 0 ? (pts(a, 'public_hospital') + pts(a, 'private_ngo_hospital')) / a.area_km2 * 1000 : NaN,
      note: ['Usable hospital locations inside the area, per land area.', 'এলাকার ভেতরে ব্যবহারযোগ্য হাসপাতালের অবস্থান, ভূমির আয়তন অনুযায়ী।'] },
    { id: 'primary_density', en: 'Primary-care locations per 100 km²', bn: 'প্রতি ১০০ বর্গকিমিতে প্রাথমিক স্বাস্থ্যসেবা', ramp: 'green', digits: 1, worse: 'low', value: (a) => a.area_km2 > 0 ? pts(a, 'primary_care') / a.area_km2 * 100 : NaN,
      note: ['Usable primary-care locations inside the area, per land area.', 'এলাকার ভেতরে ব্যবহারযোগ্য প্রাথমিক স্বাস্থ্যসেবার অবস্থান, ভূমির আয়তন অনুযায়ী।'] },
    { id: 'beds', en: 'Approved beds at mapped facilities', bn: 'মানচিত্রে থাকা প্রতিষ্ঠানের অনুমোদিত শয্যা', ramp: 'green', digits: 0, worse: 'low', value: (a) => a.beds || 0,
      note: ['Approved (sanctioned or licensed) beds, not functional beds.', 'অনুমোদিত শয্যা, কার্যকর শয্যা নয়।'] },
    { id: 'per100k', en: 'Hospital listings per 100,000 people', bn: 'প্রতি ১,০০,০০০ জনে হাসপাতাল', ramp: 'green', digits: 2, worse: 'low', levels: ['division'], value: (a) => a.population_2022 && a.registry ? ((a.registry.public_hospital || 0) + (a.registry.private_ngo_hospital || 0)) / a.population_2022 * 1e5 : NaN,
      note: ['Active hospital listings ÷ BBS Census 2022 population. Division level only: smaller-area population is not yet loaded.', 'সক্রিয় হাসপাতাল ÷ BBS জনশুমারি ২০২২। শুধু বিভাগ স্তরে; ছোট এলাকার জনসংখ্যা এখনও যোগ হয়নি।'] }
  ];

  const state = { level: 'district', measure: 'public_median', data: {}, map: null, selected: null };
  const areasOf = (level) => state.data.areas[level];
  const byPcode = (level) => state.data.index[level];
  const measure = () => MEASURES.find((m) => m.id === state.measure);
  const lowConfidence = (a) => (a.distance.public_hospital?.cells || 0) < LOW_CELLS;
  const areaLabel = (a, level) => {
    const name = level === 'division' || level === 'district' ? place(a.name) : a.name;
    return a.parent_name ? `${name} · ${place(a.parent_name)}` : name;
  };

  // no-cache: always revalidate, so a browser never mixes a new page with old data files.
  const get = (path) => fetch(path, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); });
  function rows(target, data) {
    $(target).replaceChildren(...data.map((values) => {
      const tr = document.createElement('tr');
      values.forEach((v, i) => { const c = document.createElement(i ? 'td' : 'th'); if (!i) c.scope = 'row'; c.textContent = v; tr.append(c); });
      return tr;
    }));
  }
  function csv(name, header, body) {
    const esc = (v) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
    const url = URL.createObjectURL(new Blob(['﻿' + [header, ...body].map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const SOURCE = () => T('DGHS registry; BBS/OCHA boundaries via geoBoundaries; 1 km grid, straight-line km, land area.',
    'DGHS রেজিস্ট্রি; BBS/OCHA সীমানা (geoBoundaries); ১ কিমি গ্রিড, সরলরৈখিক দূরত্ব, ভূমির আয়তন।');

  function fillSelects() {
    const level = $('#a-level'), metric = $('#a-metric');
    level.replaceChildren(...Object.keys(LEVELS).map((k) => new Option(`${lvl(k)} · ${N(areasOf(k).length)}`, k)));
    level.value = state.level;
    const allowed = MEASURES.filter((m) => !m.levels || m.levels.includes(state.level));
    if (!allowed.some((m) => m.id === state.measure)) state.measure = allowed[0].id;
    metric.replaceChildren(...allowed.map((m) => new Option(T(m.en, m.bn), m.id)));
    metric.value = state.measure;
    $('#a-names').replaceChildren(...areasOf(state.level).map((a) => new Option('', areaLabel(a, state.level))));
    $('#a-export').textContent = T(`Download all ${areasOf(state.level).length.toLocaleString('en-GB')} ${LEVELS[state.level].en.toLowerCase()} areas · CSV`, `সব ${N(areasOf(state.level).length)}টি ${LEVELS[state.level].bn} · CSV ডাউনলোড`);
  }

  function paint() {
    const m = measure(), level = state.level, list = areasOf(level);
    $('#a-metric-note').textContent = T(...m.note) + (m.grid ? ' ' + T('Grey: too small for the 1 km grid.', 'ধূসর: ১ কিমি গ্রিডের জন্য খুব ছোট।') : '');
    state.map.setMetric({
      legendTitle: T(m.en, m.bn), ramp: m.ramp, digits: m.digits,
      values: new Map(list.map((a) => [a.pcode, m.value(a)])),
      extra: (pcode) => (m.grid && lowConfidence(byPcode(level).get(pcode)) ? `<br><em>${T('low confidence: under 5 grid cells', 'কম নির্ভরযোগ্য: ৫টির কম গ্রিড ঘর')}</em>` : '')
    });
    // Ranking: the 20 least-served areas for this measure (low-confidence areas left out for grid measures).
    const usable = list.filter((a) => Number.isFinite(m.value(a)) && !(m.grid && lowConfidence(a)));
    usable.sort((a, b) => (m.worse === 'high' ? m.value(b) - m.value(a) : m.value(a) - m.value(b)));
    const top = usable.slice(0, 20);
    $('#c-rank-title').textContent = T(`Least served ${LEVELS[level].en.toLowerCase()} areas · ${m.en}`, `সবচেয়ে কম সেবাপ্রাপ্ত ${LEVELS[level].bn} · ${m.bn}`);
    window.HealthCharts.bars($('#c-rank'), top.map((a) => ({ label: areaLabel(a, level), value: m.value(a), display: N(m.value(a), m.digits) })),
      { title: T(m.en, m.bn), axisLabel: T(m.en, m.bn), digits: m.digits, source: SOURCE() });
    disparity();
  }

  function disparity() {
    const m = measure();
    $('#t-disparity-caption').textContent = T(m.en, m.bn);
    rows('#t-disparity', Object.keys(LEVELS).filter((k) => !m.levels || m.levels.includes(k)).map((k) => {
      const values = areasOf(k).filter((a) => !(m.grid && lowConfidence(a))).map(m.value).filter(Number.isFinite).sort((a, b) => a - b);
      if (!values.length) return [lvl(k), '0', '—', '—', '—', '—', '—'];
      const n = values.length, tenth = Math.max(1, Math.floor(n / 10));
      const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
      const lowMean = mean(values.slice(0, tenth)), highMean = mean(values.slice(n - tenth));
      const avg = mean(values), sd = Math.sqrt(mean(values.map((x) => (x - avg) ** 2)));
      return [lvl(k), N(n), N(values[0], m.digits), N(values[Math.floor(n / 2)], m.digits), N(values[n - 1], m.digits),
        lowMean > 0 ? N(highMean / lowMean, 1) + '×' : '—', avg > 0 ? N(sd / avg, 2) : '—'];
    }));
  }

  function detail(pcode) {
    const level = state.level, a = pcode ? byPcode(level).get(pcode) : null, box = $('#a-detail');
    if (!a) {
      const h = document.createElement('h3'); h.textContent = T('Select an area', 'একটি এলাকা বাছুন');
      const p = document.createElement('p'); p.textContent = T('Click the map or search by name.', 'মানচিত্রে ক্লিক করুন বা নাম খুঁজুন।');
      box.replaceChildren(h, p); return;
    }
    const d = (k) => a.distance[k] || {};
    const items = [[T('Level', 'স্তর'), lvl(level)], [T('Area', 'আয়তন'), N(a.area_km2, 1) + T(' km²', ' বর্গকিমি')],
      [T('Grid cells', 'গ্রিড ঘর'), d('public_hospital').cells ? N(d('public_hospital').cells) + (lowConfidence(a) ? T(' · low confidence', ' · কম নির্ভরযোগ্য') : '') : T('none · too small', 'নেই · খুব ছোট')]];
    for (const k of ['public_hospital', 'any_hospital', 'primary_care']) {
      if (!d(k).cells) continue;
      const within = k === 'primary_care' ? '5' : '10';
      items.push([`${cls(k)} · ${T('median', 'মধ্যমা')}`, km(d(k).median_km)]);
      items.push([`${cls(k)} · ≤ ${N(Number(within))} ${T('km', 'কিমি')}`, pct(d(k).within_km?.[within])]);
    }
    items.push([T('Government hospital locations', 'সরকারি হাসপাতালের অবস্থান'), N(pts(a, 'public_hospital'))],
      [T('Non-government hospital locations', 'বেসরকারি হাসপাতালের অবস্থান'), N(pts(a, 'private_ngo_hospital'))],
      [T('Primary-care locations', 'প্রাথমিক স্বাস্থ্যসেবার অবস্থান'), N(pts(a, 'primary_care'))],
      [T('Approved beds (mapped)', 'অনুমোদিত শয্যা (মানচিত্রে)'), N(a.beds || 0)]);
    if (a.registry) items.push([T('Registry listings (all)', 'রেজিস্ট্রিতে মোট'), N(a.registry.listings || 0)], [T('Locations flagged', 'চিহ্নিত অবস্থান'), N(a.registry.flagged || 0)]);
    if (a.population_2022) items.push([T('Population (Census 2022)', 'জনসংখ্যা (জনশুমারি ২০২২)'), N(a.population_2022)]);
    const dl = document.createElement('dl');
    items.forEach(([t, v]) => { const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = t; dd.textContent = v; dl.append(dt, dd); });
    const h = document.createElement('h3'); h.textContent = areaLabel(a, level);
    const code = document.createElement('p'); code.className = 'atlas-code'; code.textContent = `${level === 'union' ? T('ID', 'আইডি') : 'BBS pcode'}: ${a.pcode}`;
    box.replaceChildren(h, code, dl);
  }

  async function showLevel(level) {
    state.level = level; state.selected = null;
    fillSelects();
    detail(null);
    $('#atlas-map').classList.add('loading');
    await state.map.setLayer(LEVELS[level].geo);
    $('#atlas-map').classList.remove('loading');
    paint();
  }

  function staticCharts() {
    const { distance, quality, profiles, manifest } = state.data;
    const nat = distance.national;
    $('#k-hospitals').textContent = N(distance.points.any_hospital);
    $('#k-public-median').textContent = km(nat.public_hospital.median_km);
    $('#k-any10').textContent = pct(nat.any_hospital.within_km['10']);
    $('#k-primary5').textContent = pct(nat.primary_care.within_km['5']);

    const order = ['public_hospital', 'any_hospital', 'private_ngo_hospital', 'primary_care'];
    window.HealthCharts.lines($('#c-curve'), order.map((k) => ({ label: cls(k), color: COLOURS[k], points: nat[k].curve })),
      { title: T('Share of land within a straight-line distance of the nearest facility', 'নিকটতম প্রতিষ্ঠান থেকে নির্দিষ্ট দূরত্বের মধ্যে ভূমির অংশ'),
        axisLabel: T('Straight-line distance (km)', 'সরলরৈখিক দূরত্ব (কিমি)'), yLabel: T('% of land', 'ভূমির %'), xmax: 40, ymax: 100, xUnit: T('km', 'কিমি'), digits: 1, source: SOURCE() });
    rows('#t-national', order.map((k) => [cls(k), N(distance.points[k]), N(nat[k].median_km, 1), N(nat[k].p90_km, 1),
      pct(nat[k].within_km['2']), pct(nat[k].within_km['5']), pct(nat[k].within_km['10']), pct(nat[k].within_km['20'])]));

    const divisions = [...areasOf('division')];
    const div10 = [...divisions].sort((a, b) => b.distance.public_hospital.within_km['10'] - a.distance.public_hospital.within_km['10']);
    window.HealthCharts.bars($('#c-div10'), div10.map((d) => ({ label: place(d.name), value: d.distance.public_hospital.within_km['10'], display: pct(d.distance.public_hospital.within_km['10']) })),
      { title: T('Land within 10 km of a government hospital', 'সরকারি হাসপাতাল থেকে ১০ কিমির মধ্যে ভূমি'), axisLabel: T('% of division land', 'বিভাগের ভূমির %'), maximum: 100, digits: 1, source: SOURCE() });
    const divP = [...divisions].sort((a, b) => b.distance.primary_care.median_km - a.distance.primary_care.median_km);
    window.HealthCharts.bars($('#c-divprimary'), divP.map((d) => ({ label: place(d.name), value: d.distance.primary_care.median_km, display: km(d.distance.primary_care.median_km) })),
      { title: T('Median distance to primary care', 'প্রাথমিক স্বাস্থ্যসেবার মধ্যমা দূরত্ব'), axisLabel: T('Kilometres', 'কিলোমিটার'), digits: 1, source: SOURCE() });

    // Location quality.
    const r = quality.flag_reasons;
    $('#q-summary').textContent = T(
      `Of ${N(quality.published)} published coordinates, ${N(quality.flagged)} (${pct(quality.flagged / quality.published * 100)}) are flagged and left out of maps and distances: ${N(r['outside recorded district'] || 0)} lie more than 1 km outside the district recorded for the facility, and ${N(r['coordinate shared with facilities in other areas'] || 0)} share an identical coordinate with facilities recorded in other districts or upazilas (a record can have both). For hospitals, ${N(quality.hospitals.flagged)} of ${N(quality.hospitals.published)} are flagged.`,
      `${N(quality.published)}টি প্রকাশিত স্থানাঙ্কের মধ্যে ${N(quality.flagged)}টি (${pct(quality.flagged / quality.published * 100)}) চিহ্নিত এবং মানচিত্র ও দূরত্ব থেকে বাদ: ${N(r['outside recorded district'] || 0)}টি নথিভুক্ত জেলার ১ কিমির বেশি বাইরে, এবং ${N(r['coordinate shared with facilities in other areas'] || 0)}টি অন্য জেলা বা উপজেলার প্রতিষ্ঠানের সাথে হুবহু একই স্থানাঙ্কে (একটি রেকর্ডে দুটোই থাকতে পারে)। হাসপাতালের ক্ষেত্রে ${N(quality.hospitals.published)}টির মধ্যে ${N(quality.hospitals.flagged)}টি চিহ্নিত।`);
    const flagged = areasOf('district').filter((d) => d.registry?.published >= 20)
      .map((d) => ({ d, share: d.registry.flagged / d.registry.published * 100 })).sort((a, b) => b.share - a.share).slice(0, 20);
    window.HealthCharts.bars($('#c-flagged'), flagged.map(({ d, share }) => ({ label: place(d.name), value: share, display: pct(share),
      detail: T(`${d.registry.flagged} of ${d.registry.published}`, `${N(d.registry.published)}টির মধ্যে ${N(d.registry.flagged)}টি`) })),
      { title: T('Flagged share of published locations', 'প্রকাশিত অবস্থানের চিহ্নিত অংশ'), axisLabel: T('% flagged', '% চিহ্নিত'), maximum: 100, digits: 1, source: T('Districts with at least 20 published locations, by recorded district.', 'অন্তত ২০টি প্রকাশিত অবস্থান আছে এমন জেলা, নথিভুক্ত জেলা অনুযায়ী।') });
    const status = quality.coordinate_status;
    window.HealthCharts.bars($('#c-status'), [
      [T('Usable', 'ব্যবহারযোগ্য'), quality.usable], [T('Flagged (misplaced or shared)', 'চিহ্নিত (ভুল স্থানে বা ভাগ করা)'), quality.flagged],
      [T('No coordinates', 'স্থানাঙ্ক নেই'), status.missing || 0], [T('Outside Bangladesh', 'বাংলাদেশের বাইরে'), status.outside || 0], [T('Invalid', 'অবৈধ'), status.invalid || 0]
    ].map(([label, value]) => ({ label, value })), { title: T('Active records by location status', 'অবস্থানের অবস্থা অনুযায়ী সক্রিয় রেকর্ড'), axisLabel: T('Records', 'রেকর্ড'), source: T('DGHS registry snapshot; location audit.', 'DGHS রেজিস্ট্রি; অবস্থান যাচাই।') });

    // Beds.
    const cov = profiles.coverage;
    $('#beds-note').textContent = T(
      `${N(cov.approved_beds_total)} approved beds are recorded in DGHS facility profiles. Approved beds are sanctioned or licensed beds, not functional or staffed beds. Service fields are sparse: emergency is reported for ${N(cov.service_flags_reported.emergency)} of ${N(cov.facilities_total_active)} active facilities.`,
      `DGHS প্রতিষ্ঠানের প্রোফাইলে ${N(cov.approved_beds_total)}টি অনুমোদিত শয্যা নথিভুক্ত। অনুমোদিত শয্যা মানে মঞ্জুর বা লাইসেন্সপ্রাপ্ত শয্যা, কার্যকর বা জনবলসহ শয্যা নয়। সেবার তথ্য অসম্পূর্ণ: ${N(cov.facilities_total_active)}টি সক্রিয় প্রতিষ্ঠানের মধ্যে মাত্র ${N(cov.service_flags_reported.emergency)}টি জরুরি সেবার তথ্য দিয়েছে।`);
    const beds = Object.entries(profiles.divisions).filter(([name]) => name !== 'Unknown').map(([name, g]) => ({ name, pub: g.beds?.public || 0, pri: g.beds?.private_ngo || 0 }));
    const bedMax = Math.ceil(Math.max(...beds.map((b) => Math.max(b.pub, b.pri))) / 10000) * 10000;
    window.HealthCharts.bars($('#c-beds-public'), [...beds].sort((a, b) => b.pub - a.pub).map((b) => ({ label: place(b.name), value: b.pub })),
      { title: T('Approved beds · government', 'অনুমোদিত শয্যা · সরকারি'), axisLabel: T('Approved beds (shared scale)', 'অনুমোদিত শয্যা (একই মাপকাঠি)'), maximum: bedMax, source: 'DGHS' });
    window.HealthCharts.bars($('#c-beds-private'), [...beds].sort((a, b) => b.pri - a.pri).map((b) => ({ label: place(b.name), value: b.pri, muted: true })),
      { title: T('Approved beds · non-government', 'অনুমোদিত শয্যা · বেসরকারি'), axisLabel: T('Approved beds (shared scale)', 'অনুমোদিত শয্যা (একই মাপকাঠি)'), maximum: bedMax, source: 'DGHS' });

    $('#m-snapshot').textContent = T(
      `DGHS registry snapshot ${manifest.registry.datasetUpdatedAt || ''} · ${N(manifest.registry.active)} active records · built ${manifest.generatedAt.slice(0, 10)} · ${N(distance.cells)} grid cells.`,
      `DGHS রেজিস্ট্রি ${manifest.registry.datasetUpdatedAt || ''} · ${N(manifest.registry.active)}টি সক্রিয় রেকর্ড · তৈরি ${manifest.generatedAt.slice(0, 10)} · ${N(distance.cells)}টি গ্রিড ঘর।`);
  }

  async function main() {
    const levels = Object.keys(LEVELS);
    const [distance, quality, profiles, manifest, ...areaFiles] = await Promise.all([
      get('./data/atlas/distance.json'), get('./data/atlas/location-quality.json'), get('./data/atlas/profile-aggregates.json'),
      get('./data/atlas/manifest.json'), ...levels.map((k) => get(`./data/atlas/areas-${k}.json`))]);
    if (!manifest.levels || !distance.points || !distance.national?.primary_care || !quality.flagged_ids) {
      throw new Error(T('the data files are an older version; please reload the page (Ctrl+F5)', 'তথ্যের ফাইল পুরোনো সংস্করণের; পৃষ্ঠাটি আবার লোড করুন (Ctrl+F5)'));
    }
    state.data = { distance, quality, profiles, manifest, areas: {}, index: {} };
    levels.forEach((k, i) => { state.data.areas[k] = areaFiles[i].areas; state.data.index[k] = new Map(areaFiles[i].areas.map((a) => [a.pcode, a])); });

    $('#atlas-status').hidden = true;
    $('#atlas-content').hidden = false;
    state.map = window.AtlasChoropleth.create('atlas-map', {
      label: (p) => { const a = byPcode(state.level).get(p.pcode); return a ? areaLabel(a, state.level) : p.name || p.shapeName; },
      onSelect: (pcode) => { state.selected = pcode; detail(pcode); }
    });
    $('#a-level').addEventListener('change', (e) => showLevel(e.target.value));
    $('#a-metric').addEventListener('change', (e) => { state.measure = e.target.value; paint(); });
    $('#a-search').addEventListener('change', (e) => {
      const q = e.target.value.trim().toLowerCase(), name = q.split(' · ')[0];
      const list = areasOf(state.level);
      const hit = list.find((a) => areaLabel(a, state.level).toLowerCase() === q) || list.find((a) => a.name.toLowerCase() === name) || list.find((a) => a.name.toLowerCase().includes(name));
      if (hit) state.map.select(hit.pcode, true);
    });
    $('#a-export').addEventListener('click', () => {
      const level = state.level, list = areasOf(level);
      const v = (a, k, key, sub) => { const s = a.distance[k]; return s && s.cells ? (sub ? s.within_km?.[sub] ?? '' : s[key] ?? '') : ''; };
      csv(`bangladesh-health-distance-${level}.csv`,
        ['id', 'name', 'parent', 'area_km2', 'grid_cells', 'median_km_government_hospital', 'pct_land_within_10km_government_hospital', 'median_km_any_hospital',
         'median_km_primary_care', 'pct_land_within_5km_primary_care', 'government_hospital_locations', 'non_government_hospital_locations', 'primary_care_locations', 'approved_beds_mapped', 'low_confidence'],
        list.map((a) => [a.pcode, a.name, a.parent_name || '', a.area_km2, a.distance.public_hospital?.cells || 0, v(a, 'public_hospital', 'median_km'), v(a, 'public_hospital', null, '10'),
          v(a, 'any_hospital', 'median_km'), v(a, 'primary_care', 'median_km'), v(a, 'primary_care', null, '5'), pts(a, 'public_hospital'), pts(a, 'private_ngo_hospital'),
          pts(a, 'primary_care'), a.beds || 0, lowConfidence(a) ? 'yes' : 'no']));
    });
    staticCharts();
    await showLevel(state.level);

    document.addEventListener('site-language', () => {
      fillSelects();
      staticCharts();
      paint();
      detail(state.selected);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    main().catch((error) => {
      // Show the problem instead of empty sections.
      $('#atlas-content').hidden = true;
      const status = $('#atlas-status');
      status.hidden = false;
      status.classList.add('atlas-error');
      status.textContent = T('The data could not be loaded: ', 'তথ্য লোড হয়নি: ') + error.message;
    });
  });
})();
