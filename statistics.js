'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const node = (tag, value = '', cls = '') => { const e = document.createElement(tag); e.textContent = value; if (cls) e.className = cls; return e; };
  const number = (n, digits = 0) => Number.isFinite(n) ? n.toLocaleString('en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }) : '—';
  const ratio = (a, b, factor = 1) => b > 0 ? a / b * factor : null;
  const date = (s) => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  let summary, sources;

  function kpis(target, items) {
    const cards = items.map(([label, value, note]) => { const card = node('article', '', 'stat-kpi'); card.append(node('h3', label), node('strong', value), node('p', note)); return card; });
    $(target).replaceChildren(...cards);
  }
  function bars(target, rows, options = {}) {
    const maximum = options.maximum || Math.max(...rows.map((r) => r.value), 0);
    if (!rows.length || maximum === 0) { $(target).replaceChildren(node('p', 'No active listings in this selection.', 'empty-chart')); return; }
    const children = rows.map((r) => {
      const row = node('div', '', `bar-row${r.muted ? ' muted' : ''}${r.selected ? ' selected' : ''}`);
      const label = node('div', '', 'bar-label'); label.append(node('span', r.label), node('strong', r.display ?? number(r.value, options.digits || 0)));
      const track = node('div', '', 'bar-track'); track.setAttribute('aria-hidden', 'true');
      const fill = node('div', '', 'bar-fill'); fill.style.width = `${Math.max(0, Math.min(100, r.value / maximum * 100))}%`; track.append(fill);
      row.append(label, track); return row;
    });
    $(target).replaceChildren(...children);
  }
  function official() {
    const h = sources.health;
    kpis('#official-kpis', [
      ['Government hospitals', number(h.governmentHospitalsUnderDGHS), 'Under DGHS · published 2025 indicator'],
      ['Private hospitals & clinics', number(h.privateRegisteredHospitalsClinics), 'Registered · published 2025 indicator'],
      ['Private diagnostic centres', number(h.privateRegisteredDiagnosticCentres), 'Registered · published 2025 indicator'],
      ['Functional hospital beds', number(h.functionalBedsUnderDGHS), 'Under DGHS · published 2025 indicator']
    ]);
    bars('#bed-chart', [{ label: 'DGHS public hospitals', value: h.functionalBedsUnderDGHS }, { label: 'Registered private hospitals', value: h.privateRegisteredHospitalBeds, muted: true }]);
    const total = h.functionalBedsUnderDGHS + h.privateRegisteredHospitalBeds;
    $('#bed-note').textContent = `Together: ${number(total)} reported beds across these two sectors. Private-sector share: ${number(ratio(h.privateRegisteredHospitalBeds, total, 100), 1)}%. Calculated from the two published counts; not a real-time bed-availability figure.`;
    $('#staff-chart').replaceChildren(...[['Doctors (MBBS + dental)', h.doctorsUnderDGHS], ['Medical technologists', h.medicalTechnologistsUnderDGHS]].map(([label, values]) => {
      const card = node('div', '', 'staff-row'); const pct = ratio(values.existing, values.sanctioned, 100);
      card.append(node('h4', label)); const line = node('div', '', 'staff-values'); line.append(node('span', `${number(values.existing)} existing / ${number(values.sanctioned)} sanctioned`), node('strong', `${number(pct, 1)}%`));
      const track = node('div', '', 'bar-track'); track.setAttribute('aria-hidden', 'true'); const fill = node('div', '', 'bar-fill'); fill.style.width = `${pct}%`; track.append(fill);
      card.append(line, track, node('small', `Difference: ${number(values.sanctioned - values.existing)} posts (${number(100 - pct, 1)}% of sanctioned posts).`)); return card;
    }));
    for (const [id, page] of [['#health-source', 530], ['#population-source', 84], ['#official-pdf', 1]]) { $(id).href = `${sources.url}#page=${page}`; $(id).target = '_blank'; $(id).rel = 'noopener noreferrer'; }
    $('#research-cards').replaceChildren(...sources.research.map((paper) => {
      const article = node('article', '', 'research-card'); article.append(node('span', `${paper.year} · ${paper.journal}`, 'small-label'), node('h3', paper.title), node('p', paper.finding), node('p', `Study scope: ${paper.scope}`), node('p', paper.limit, 'research-limit'));
      const link = node('a', `Read the study · DOI ${paper.doi} ↗`); link.href = paper.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; article.append(link); return article;
    }));
  }
  function render() {
    if (!summary) return;
    const key = $('#stats-group').value; const group = summary.groups[key]; const scope = $('#stats-division').value;
    const selected = scope === 'all' ? group.national : group.divisions[scope];
    const population = scope === 'all' ? summary.populationTotal : sources.population.divisions[scope];
    const area = scope === 'all' ? 'Bangladesh' : scope;
    const nationalRate = ratio(group.national.count, summary.populationTotal, 100000);
    const rate = ratio(selected.count, population, 100000);
    const people = ratio(population, selected.count);
    $('#group-definition').textContent = group.definition;
    kpis('#registry-kpis', [
      [`Active listings · ${area}`, number(selected.count), group.label],
      ['Listings per 100,000 residents', number(rate, 2), 'Uses the 2022 adjusted census population'],
      ['People per listed institution', number(people), people === null ? 'Not calculable: no listings in this selection' : 'Population-to-listing ratio, not patients served'],
      ['Ownership not reported', number(selected.ownership['Not reported'] || 0), `${number(ratio(selected.ownership['Not reported'] || 0, selected.count, 100), 1)}% of the selected listings`]
    ]);
    const owners = Object.entries(selected.ownership).sort((a, b) => b[1] - a[1]);
    bars('#ownership-chart', owners.map(([label, value]) => ({ label, value, muted: label === 'Not reported', display: `${number(value)} · ${number(ratio(value, selected.count, 100), 1)}%` })));
    $('#ownership-note').textContent = `${area} · ${group.label}. Percentages use all ${number(selected.count)} selected records, including missing ownership.`;
    const types = Object.entries(selected.types).sort((a, b) => b[1] - a[1]);
    bars('#type-chart', types.slice(0, 8).map(([label, value]) => ({ label, value })));
    $('#type-table').replaceChildren(...types.map(([label, value]) => { const tr = node('tr'); const th = node('th', label); th.scope = 'row'; tr.append(th, node('td', number(value))); return tr; }));
    const measure = document.querySelector('input[name="stats-measure"]:checked').value;
    const comparisons = Object.entries(group.divisions).map(([label, v]) => ({ label, count: v.count, population: v.population, rate: ratio(v.count, v.population, 100000), value: measure === 'rate' ? ratio(v.count, v.population, 100000) : v.count, selected: scope === label }));
    comparisons.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
    $('#division-chart-title').textContent = measure === 'rate' ? 'Listings per 100,000 residents' : 'Number of active listings';
    $('#comparison-note').textContent = `${group.label}. All eight divisions remain visible for comparison${scope !== 'all' ? `; ${scope} is underlined` : ''}. Bars start at zero.`;
    bars('#division-chart', comparisons, { digits: measure === 'rate' ? 2 : 0 });
    $('#division-insight').textContent = `National baseline: ${number(nationalRate, 2)} listings per 100,000 people. Compare rates alongside the actual counts. One small facility and one large hospital each contribute one listing.`;
    const example = scope === 'all' ? [...comparisons].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0].label : scope;
    const populationShare = ratio(group.divisions[example].population, summary.populationTotal, 100);
    const listingShare = ratio(group.divisions[example].count, group.national.count, 100);
    $('#balance-note').textContent = scope === 'all' ? `${example}, the division with the most selected listings, is shown as an example. Choose any division above to inspect its balance.` : `${example}: share of Bangladesh’s population and share of selected listings.`;
    bars('#balance-chart', [{ label: 'Share of 2022 population', value: populationShare, display: `${number(populationShare, 1)}%`, muted: true }, { label: 'Share of selected listings', value: listingShare || 0, display: `${number(listingShare, 1)}%` }], { maximum: 100 });
    const relative = ratio(ratio(group.divisions[example].count, group.divisions[example].population, 100000), nationalRate);
    $('#balance-insight').textContent = relative === null ? 'No national listings are available for a relative comparison.' : `${example} has ${number(relative, 2)}× the national listing rate. This reflects relative concentration, not adequacy, unmet need or the percentage of people with access.`;
    $('#statistics-division-body').replaceChildren(...comparisons.map((r) => {
      const tr = node('tr'); if (scope === r.label) tr.className = 'selected'; const th = node('th', r.label); th.scope = 'row';
      const rel = ratio(r.rate, nationalRate);
      tr.append(th, node('td', number(r.population)), node('td', number(r.count)), node('td', number(r.rate, 2)), node('td', number(ratio(r.population, r.count))), node('td', rel === null ? '—' : `${number(rel, 2)}×`)); return tr;
    }));
    $('#division-caption').textContent = `${group.label} · All eight divisions · Active registry snapshot / adjusted Census 2022 population`;
    const districts = group.districts.filter((r) => scope === 'all' || r.division === scope).sort((a, b) => b.count - a.count || a.district.localeCompare(b.district)).slice(0, 10);
    bars('#district-chart', districts.map((r) => ({ label: `${r.district} · ${r.division}`, value: r.count })));
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
    $('#stats-group').replaceChildren(...Object.entries(summary.groups).map(([key, g]) => { const option = node('option', g.label); option.value = key; return option; }));
    for (const division of Object.keys(sources.population.divisions)) { const option = node('option', division); option.value = division; $('#stats-division').append(option); }
    document.querySelectorAll('.stats-controls select, .stats-controls button').forEach((e) => { e.disabled = false; });
    $('#registry-date').textContent = `Report snapshot: ${date(summary.reportExportedAt)}`;
    $('#statistics-status').textContent = `${number(summary.activeTotal)} active DGHS registry records · BBS Yearbook published June 2026 · Research checked ${date(sources.checkedAt)}`;
    $('#status-note').textContent = `${number(summary.registryTotal)} total registry records: ${number(summary.activeTotal)} active, ${number(summary.inactiveTotal)} inactive and ${number(summary.unknownStatusTotal)} with unknown status. Only the active records enter these charts.`;
    $('#date-note').textContent = `National registry report exported ${date(summary.reportExportedAt)}; saved dataset updated ${date(summary.datasetUpdatedAt)}. Individual record retrieval dates range from ${date(summary.recordUpdateRange.first)} to ${date(summary.recordUpdateRange.last)}. Profile enrichment does not mean the entire national list was re-exported.`;
    $('#ownership-rules').textContent = `Accepted public ownership values: ${summary.governmentOwnershipValues.join('; ')}.`;
    $('#hospital-types').replaceChildren(...summary.hospitalTypes.map((kind) => node('li', kind)));
    const quick = node('div', '', 'quick-totals'); quick.setAttribute('aria-label', 'National active registry listing shortcuts');
    for (const key of ['publicHospitals','privateClinics','bloodBanks','communityClinics']) { const button = node('button', `${number(summary.groups[key].national.count)} ${summary.groups[key].label.toLowerCase()}`); button.type = 'button'; button.addEventListener('click', () => { $('#stats-group').value = key; $('#stats-division').value = 'all'; render(); }); quick.append(button); }
    $('.stats-controls').before(quick);
    official(); render();
  }).catch(() => { $('#statistics-status').textContent = 'Statistics could not be loaded or validated. Reload this page, or use the source downloads below. No estimates are shown in place of missing data.'; $('#statistics-status').classList.add('error'); });
})();
