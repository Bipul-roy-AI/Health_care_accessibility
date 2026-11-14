'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const node = (tag, value = '', cls = '') => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  const T = (en, bn) => (window.SiteI18n ? window.SiteI18n.t(en, bn) : en);
  const loc = () => (document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB');
  const place = (name) => (window.NamesBn ? window.NamesBn.name(name) : name);
  const GROUP_BN = { hospitals: 'হাসপাতাল / স্বাস্থ্য কমপ্লেক্স', publicHospitals: 'সরকারি হাসপাতাল', privateClinics: 'বেসরকারি হাসপাতাল / ক্লিনিক', bloodBanks: 'ব্লাড ব্যাংক', diagnostics: 'ডায়াগনস্টিক সেন্টার', communityClinics: 'কমিউনিটি ক্লিনিক', all: 'সব প্রতিষ্ঠান' };
  const glabel = (key) => T(summary.groups[key].label, GROUP_BN[key]);
  const number = (n, digits = 0) => Number.isFinite(n) ? n.toLocaleString(loc(), { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const ratio = (a, b, factor = 1) => b > 0 ? a / b * factor : null;
  const date = (s) => new Date(s).toLocaleDateString(loc(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  let summary, sources;

  function kpis(target, items) {
    const cards = items.map(([label, value, note]) => { const card = node('article', '', 'stat-kpi'); card.append(node('h3', label), node('strong', value), node('p', note)); return card; });
    $(target).replaceChildren(...cards);
  }
  function bars(target, rows, options = {}) {
    const heading = $(target).closest('article')?.querySelector('h3')?.textContent || T('Statistical comparison', 'পরিসংখ্যানগত তুলনা');
    const scope = $('#stats-division').value === 'all' ? T('Bangladesh', 'বাংলাদেশ') : place($('#stats-division').value);
    const title = target === '#bed-chart' ? heading : `${heading} · ${glabel($('#stats-group').value)} · ${target === '#division-chart' ? T('all divisions', 'সব বিভাগ') : scope}`;
    const axisLabel = target === '#bed-chart' ? T('Reported hospital beds', 'প্রতিবেদিত হাসপাতাল শয্যা') : target === '#balance-chart' ? T('Share (%)', 'অংশ (%)') : target === '#division-chart' && options.digits ? T('Listings per 100,000 BBS 2022 residents', 'প্রতি ১,০০,০০০ জনে তালিকা (BBS ২০২২)') : T('Active DGHS listings', 'সক্রিয় DGHS তালিকা');
    const source = target === '#bed-chart' ? T('DGHS 2025 indicators; BBS Yearbook 2025, table 13.01.', 'DGHS ২০২৫ সূচক; BBS বর্ষগ্রন্থ ২০২৫, সারণি ১৩.০১।') : T(`DGHS active report: ${date(summary.reportExportedAt)}. Population where used: BBS Census 2022.`, `DGHS প্রতিবেদন: ${date(summary.reportExportedAt)}। জনসংখ্যা: BBS জনশুমারি ২০২২।`);
    window.StatisticsCharts.plot(target, rows, { title, axisLabel, kind: ['#bed-chart','#ownership-chart'].includes(target) ? 'doughnut' : target === '#division-chart' ? 'columns' : 'bars', totalLabel: target === '#bed-chart' ? T('reported beds', 'প্রতিবেদিত শয্যা') : T('active listings', 'সক্রিয় তালিকা'), source, ...options });
  }
  function official() {
    const h = sources.health;
    kpis('#official-kpis', [
      [T('Government hospitals', 'সরকারি হাসপাতাল'), number(h.governmentHospitalsUnderDGHS), T('Under DGHS · published 2025 indicator', 'DGHS-এর অধীনে · ২০২৫ সালের প্রকাশিত সূচক')],
      [T('Private hospitals & clinics', 'বেসরকারি হাসপাতাল ও ক্লিনিক'), number(h.privateRegisteredHospitalsClinics), T('Registered · published 2025 indicator', 'নিবন্ধিত · ২০২৫ সালের প্রকাশিত সূচক')],
      [T('Private diagnostic centres', 'বেসরকারি ডায়াগনস্টিক সেন্টার'), number(h.privateRegisteredDiagnosticCentres), T('Registered · published 2025 indicator', 'নিবন্ধিত · ২০২৫ সালের প্রকাশিত সূচক')],
      [T('Functional hospital beds', 'কার্যকর হাসপাতাল শয্যা'), number(h.functionalBedsUnderDGHS), T('Under DGHS · published 2025 indicator', 'DGHS-এর অধীনে · ২০২৫ সালের প্রকাশিত সূচক')]
    ]);
    bars('#bed-chart', [{ label: T('DGHS public hospitals', 'DGHS সরকারি হাসপাতাল'), value: h.functionalBedsUnderDGHS }, { label: T('Registered private hospitals', 'নিবন্ধিত বেসরকারি হাসপাতাল'), value: h.privateRegisteredHospitalBeds, muted: true }]);
    const total = h.functionalBedsUnderDGHS + h.privateRegisteredHospitalBeds;
    $('#bed-note').textContent = T(`Together: ${number(total)} reported beds. Private-sector share: ${number(ratio(h.privateRegisteredHospitalBeds, total, 100), 1)}%. From two published counts; not live bed availability.`, `মোট: ${number(total)}টি প্রতিবেদিত শয্যা। বেসরকারি খাতের অংশ: ${number(ratio(h.privateRegisteredHospitalBeds, total, 100), 1)}%। দুটি প্রকাশিত সংখ্যা থেকে হিসাব; তাৎক্ষণিক শয্যার প্রাপ্যতা নয়।`);
    $('#staff-chart').replaceChildren(...[[T('Doctors (MBBS + dental)', 'চিকিৎসক (এমবিবিএস + ডেন্টাল)'), h.doctorsUnderDGHS], [T('Medical technologists', 'মেডিকেল টেকনোলজিস্ট'), h.medicalTechnologistsUnderDGHS]].map(([label, values]) => {
      const card = node('div', '', 'staff-row'); const pct = ratio(values.existing, values.sanctioned, 100);
      card.append(node('h4', label)); const line = node('div', '', 'staff-values'); line.append(node('span', T(`${number(values.existing)} existing / ${number(values.sanctioned)} sanctioned`, `${number(values.existing)} কর্মরত / ${number(values.sanctioned)} অনুমোদিত`)), node('strong', `${number(pct, 1)}%`));
      const track = node('div', '', 'bar-track'); track.setAttribute('aria-hidden', 'true'); const fill = node('div', '', 'bar-fill'); fill.style.width = `${pct}%`; track.append(fill);
      card.append(line, track, node('small', T(`Gap: ${number(values.sanctioned - values.existing)} posts (${number(100 - pct, 1)}% of sanctioned posts).`, `ঘাটতি: ${number(values.sanctioned - values.existing)}টি পদ (অনুমোদিত পদের ${number(100 - pct, 1)}%)।`))); return card;
    }));
    const staffFigure = node('div'); $('#staff-chart').append(staffFigure);
    window.StatisticsCharts.staffing(staffFigure, h);
    for (const [id, page] of [['#health-source', 530], ['#population-source', 84], ['#official-pdf', 1]]) { if (!$(id)) continue; $(id).href = `${sources.url}#page=${page}`; $(id).target = '_blank'; $(id).rel = 'noopener noreferrer'; }
    $('#research-cards').replaceChildren(...sources.research.map((paper) => {
      const article = node('article', '', 'research-card'); article.append(node('span', `${paper.year} · ${paper.journal}`, 'small-label'), node('h3', paper.title), node('p', paper.finding), node('p', `${T('Study scope', 'গবেষণার পরিধি')}: ${paper.scope}`), node('p', paper.limit, 'research-limit'));
      const link = node('a', `${T('Read the study', 'গবেষণাটি পড়ুন')} · DOI ${paper.doi} ↗`); link.href = paper.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link); return article;
    }));
  }
  function render() {
    if (!summary) return;
    const key = $('#stats-group').value; const group = summary.groups[key]; const scope = $('#stats-division').value;
    const selected = scope === 'all' ? group.national : group.divisions[scope];
    const population = scope === 'all' ? summary.populationTotal : sources.population.divisions[scope];
    const area = scope === 'all' ? T('Bangladesh', 'বাংলাদেশ') : place(scope);
    const nationalRate = ratio(group.national.count, summary.populationTotal, 100000);
    const rate = ratio(selected.count, population, 100000);
    const people = ratio(population, selected.count);
    $('#group-definition').textContent = group.definition;
    kpis('#registry-kpis', [
      [`${T('Active listings', 'সক্রিয় তালিকা')} · ${area}`, number(selected.count), glabel(key)],
      [T('Listings per 100,000 residents', 'প্রতি ১,০০,০০০ জনে তালিকা'), number(rate, 2), T('2022 adjusted census population', '২০২২ সালের সমন্বিত জনশুমারি')],
      [T('People per listed institution', 'প্রতি প্রতিষ্ঠানে জনসংখ্যা'), number(people), people === null ? T('Not calculable: no listings', 'হিসাব করা যায় না: তালিকা নেই') : T('Population ÷ listings, not patients served', 'জনসংখ্যা ÷ তালিকা, রোগী নয়')],
      [T('Ownership not reported', 'মালিকানা উল্লেখ নেই'), number(selected.ownership['Not reported'] || 0), T(`${number(ratio(selected.ownership['Not reported'] || 0, selected.count, 100), 1)}% of the selected listings`, `নির্বাচিত তালিকার ${number(ratio(selected.ownership['Not reported'] || 0, selected.count, 100), 1)}%`)]
    ]);
    const owners = Object.entries(selected.ownership).sort((a, b) => b[1] - a[1]);
    bars('#ownership-chart', owners.map(([label, value]) => ({ label: label === 'Not reported' ? T('Not reported', 'উল্লেখ নেই') : label, value, muted: label === 'Not reported', display: `${number(value)} · ${number(ratio(value, selected.count, 100), 1)}%` })));
    $('#ownership-note').textContent = T(`${area} · ${glabel(key)}. Percentages use all ${number(selected.count)} selected records.`, `${area} · ${glabel(key)}। শতাংশ নির্বাচিত ${number(selected.count)}টি রেকর্ডের ভিত্তিতে।`);
    const types = Object.entries(selected.types).sort((a, b) => b[1] - a[1]);
    bars('#type-chart', types.slice(0, 8).map(([label, value]) => ({ label, value })));
    $('#type-table').replaceChildren(...types.map(([label, value]) => { const tr = node('tr'); const th = node('th', label); th.scope = 'row'; tr.append(th, node('td', number(value))); return tr; }));
    const measure = document.querySelector('input[name="stats-measure"]:checked').value;
    const comparisons = Object.entries(group.divisions).map(([label, v]) => ({ label: place(label), key: label, count: v.count, population: v.population, rate: ratio(v.count, v.population, 100000), value: measure === 'rate' ? ratio(v.count, v.population, 100000) : v.count, selected: scope === label }));
    comparisons.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    $('#division-chart-title').textContent = measure === 'rate' ? T('Listings per 100,000 residents', 'প্রতি ১,০০,০০০ জনে তালিকা') : T('Number of active listings', 'সক্রিয় তালিকার সংখ্যা');
    $('#comparison-note').textContent = T(`${group.label}. All eight divisions shown${scope !== 'all' ? `; ${scope} is underlined` : ''}.`, `${glabel(key)}। আট বিভাগই দেখানো হয়েছে${scope !== 'all' ? `; ${place(scope)} চিহ্নিত` : ''}।`);
    bars('#division-chart', comparisons, { digits: measure === 'rate' ? 2 : 0 });
    $('#division-insight').textContent = T(`National rate: ${number(nationalRate, 2)} listings per 100,000 people. A small facility and a large hospital each count as one listing.`, `জাতীয় হার: প্রতি ১,০০,০০০ জনে ${number(nationalRate, 2)}টি তালিকা। ছোট প্রতিষ্ঠান ও বড় হাসপাতাল—দুটিই একটি করে তালিকা।`);
    const example = scope === 'all' ? [...comparisons].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0].key : scope;
    const populationShare = ratio(group.divisions[example].population, summary.populationTotal, 100);
    const listingShare = ratio(group.divisions[example].count, group.national.count, 100);
    $('#balance-note').textContent = scope === 'all' ? T(`${example}, the division with the most listings, is shown. Choose a division above to change it.`, `সবচেয়ে বেশি তালিকার বিভাগ ${place(example)} দেখানো হয়েছে। ওপরে অন্য বিভাগ বাছুন।`) : T(`${example}: share of population and share of listings.`, `${place(example)}: জনসংখ্যার অংশ ও তালিকার অংশ।`);
    bars('#balance-chart', [{ label: T('Share of 2022 population', '২০২২ জনসংখ্যার অংশ'), value: populationShare, display: `${number(populationShare, 1)}%`, muted: true }, { label: T('Share of selected listings', 'নির্বাচিত তালিকার অংশ'), value: listingShare || 0, display: `${number(listingShare, 1)}%` }], { maximum: 100, digits: 1, title: T(`${example} · ${group.label} · population and listing shares`, `${place(example)} · ${glabel(key)} · জনসংখ্যা ও তালিকার অংশ`) });
    const relative = ratio(ratio(group.divisions[example].count, group.divisions[example].population, 100000), nationalRate);
    $('#balance-insight').textContent = relative === null ? T('No national listings to compare.', 'তুলনার জন্য জাতীয় তালিকা নেই।') : T(`${example} has ${number(relative, 2)}× the national listing rate: relative concentration, not adequacy or access.`, `${place(example)}-এ তালিকার হার জাতীয় হারের ${number(relative, 2)} গুণ: আপেক্ষিক ঘনত্ব, পর্যাপ্ততা বা সেবাপ্রাপ্তি নয়।`);
    $('#statistics-division-body').replaceChildren(...comparisons.map((r) => {
      const tr = node('tr'); if (scope === r.key) tr.className = 'selected'; const th = node('th', r.label); th.scope = 'row';
      const rel = ratio(r.rate, nationalRate);
      tr.append(th, node('td', number(r.population)), node('td', number(r.count)), node('td', number(r.rate, 2)), node('td', number(ratio(r.population, r.count))), node('td', rel === null ? '—' : `${number(rel, 2)}×`)); return tr;
    }));
    $('#division-caption').textContent = T(`${group.label} · eight divisions · active registry records / adjusted Census 2022 population`, `${glabel(key)} · আট বিভাগ · সক্রিয় রেকর্ড / সমন্বিত জনশুমারি ২০২২`);
    const districts = group.districts.filter((r) => scope === 'all' || r.division === scope).sort((a, b) => b.count - a.count || a.district.localeCompare(b.district)).slice(0, 10);
    bars('#district-chart', districts.map((r) => ({ label: `${place(r.district)} · ${place(r.division)}`, value: r.count })));
  }
  function download() {
    const key = $('#stats-group').value; const g = summary.groups[key];
    const nationalRate = ratio(g.national.count, summary.populationTotal, 100000);
    const rows = [['facility_group','division','active_listings','population_2022_adjusted','listings_per_100000','people_per_listing','relative_to_national_rate','registry_report_exported_at','dataset_updated_at','population_source_table','population_source_url']];
    for (const [division, r] of Object.entries(g.divisions)) {
      const rate = ratio(r.count, r.population, 100000);
      rows.push([g.label, division, r.count, r.population, rate, ratio(r.population, r.count) ?? '', ratio(rate, nationalRate) ?? '', summary.reportExportedAt, summary.datasetUpdatedAt, 'BBS Yearbook 2025 Table 2.03; Census 2022', sources.url]);
    }
    const safe = (v) => { const s = String(v); return '"' + (/^[=+@-]/.test(s) ? "'" : '') + s.replaceAll('"', '""') + '"'; };
    const blob = new Blob(['\ufeff' + rows.map((row) => row.map(safe).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob); const a = node('a'); a.href = url; a.download = `shasthopath-${key}-division-statistics.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function validate(data, refs) {
    if (data.schemaVersion !== 1 || refs.schemaVersion !== 1 || !data.groups || !refs.population?.divisions || !refs.health || !Array.isArray(refs.research)) throw Error('Unsupported data format');
    const populations = refs.population.divisions;
    if (Object.keys(populations).length !== 8 || Object.values(populations).some((n) => !Number.isInteger(n) || n <= 0) || Object.values(populations).reduce((a, b) => a + b, 0) !== data.populationTotal) throw Error('Population table does not match summary');
    if (!['hospitals','publicHospitals','privateClinics','bloodBanks','diagnostics','communityClinics','all'].every((key) => data.groups[key])) throw Error('Missing facility group');
    for (const g of Object.values(data.groups)) {
      if (!Number.isInteger(g.national.count) || g.national.count < 0 || Object.keys(g.divisions).length !== 8 || Object.values(g.divisions).reduce((sum, r) => sum + r.count, 0) !== g.national.count) throw Error('Invalid division totals');
      for (const [name, r] of Object.entries(g.divisions)) if (r.population !== populations[name] || !Number.isInteger(r.count) || r.count < 0) throw Error('Invalid division data');
    }
  }
  $('#stats-group').addEventListener('change', render); $('#stats-division').addEventListener('change', render);
  document.querySelectorAll('[name="stats-measure"]').forEach((e) => e.addEventListener('change', render));
  $('#stats-reset').addEventListener('click', () => { $('#stats-group').value = 'hospitals'; $('#stats-division').value = 'all'; document.querySelector('[name="stats-measure"][value="rate"]').checked = true; render(); });
  $('#stats-download').addEventListener('click', download);
  const load = async (path) => { const r = await fetch(path, { cache: 'no-cache', credentials: 'omit' }); if (!r.ok) throw Error('Source could not be loaded'); return r.json(); };
  Promise.all([load('./data/statistics/summary.json'), load('./data/statistics/sources.json')]).then(([data, refs]) => {
    validate(data, refs); summary = data; sources = refs;
    const labels = () => {
      const group = $('#stats-group').value || 'hospitals', division = $('#stats-division').value || 'all';
      $('#stats-group').replaceChildren(...Object.keys(summary.groups).map((key) => { const option = node('option', glabel(key)); option.value = key; return option; }));
      $('#stats-division').replaceChildren(Object.assign(node('option', T('All Bangladesh', 'সারা বাংলাদেশ')), { value: 'all' }),
        ...Object.keys(sources.population.divisions).map((d) => Object.assign(node('option', place(d)), { value: d })));
      $('#stats-group').value = group; $('#stats-division').value = division;
      $('#registry-date').textContent = T(`Report snapshot: ${date(summary.reportExportedAt)}`, `প্রতিবেদনের তারিখ: ${date(summary.reportExportedAt)}`);
      $('#statistics-status').textContent = T(`${number(summary.activeTotal)} active DGHS registry records · BBS Yearbook published June 2026 · Research checked ${date(sources.checkedAt)}`, `${number(summary.activeTotal)}টি সক্রিয় DGHS রেকর্ড · BBS বর্ষগ্রন্থ প্রকাশ জুন ২০২৬ · গবেষণা যাচাই ${date(sources.checkedAt)}`);
      if ($('#status-note')) $('#status-note').textContent = T(`${number(summary.registryTotal)} registry records: ${number(summary.activeTotal)} active, ${number(summary.inactiveTotal)} inactive, ${number(summary.unknownStatusTotal)} unknown. Only active records are charted.`, `${number(summary.registryTotal)}টি রেকর্ড: ${number(summary.activeTotal)}টি সক্রিয়, ${number(summary.inactiveTotal)}টি নিষ্ক্রিয়, ${number(summary.unknownStatusTotal)}টি অজানা। শুধু সক্রিয় রেকর্ড চার্টে।`);
      if ($('#date-note')) $('#date-note').textContent = T(`Registry report exported ${date(summary.reportExportedAt)}; dataset updated ${date(summary.datasetUpdatedAt)}; record retrieval ${date(summary.recordUpdateRange.first)} to ${date(summary.recordUpdateRange.last)}.`, `রেজিস্ট্রি প্রতিবেদন ${date(summary.reportExportedAt)}; তথ্য হালনাগাদ ${date(summary.datasetUpdatedAt)}; রেকর্ড সংগ্রহ ${date(summary.recordUpdateRange.first)} থেকে ${date(summary.recordUpdateRange.last)}।`);
      if ($('#ownership-rules')) $('#ownership-rules').textContent = `${T('Accepted public ownership values', 'গৃহীত সরকারি মালিকানার মান')}: ${summary.governmentOwnershipValues.join('; ')}.`;
      if ($('#hospital-types')) $('#hospital-types').replaceChildren(...summary.hospitalTypes.map((kind) => node('li', kind)));
      document.querySelector('.quick-totals')?.remove();
      const quick = node('div', '', 'quick-totals'); quick.setAttribute('aria-label', T('National totals', 'জাতীয় মোট'));
      for (const key of ['publicHospitals','privateClinics','bloodBanks','communityClinics']) { const button = node('button', `${number(summary.groups[key].national.count)} ${glabel(key).toLowerCase()}`); button.type = 'button'; button.addEventListener('click', () => { $('#stats-group').value = key; $('#stats-division').value = 'all'; render(); }); quick.append(button); }
      $('.stats-controls').before(quick);
    };
    labels();
    document.querySelectorAll('.stats-controls select, .stats-controls button').forEach((e) => { e.disabled = false; });
    document.addEventListener('site-language', () => { labels(); official(); render(); });
    document.addEventListener('site-theme', () => render());
    // Canvas charts draw with whatever font is ready; redraw once Montserrat has loaded.
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => render());
    official(); render();
  }).catch(() => { $('#statistics-status').textContent = T('Statistics could not be loaded. Reload the page or use the source downloads below.', 'পরিসংখ্যান লোড হয়নি। পৃষ্ঠাটি রিফ্রেশ করুন বা নিচের উৎস ডাউনলোড করুন।'); $('#statistics-status').classList.add('error'); });
})();
