'use strict';
// Render public institutional fields as text. Never interpret source HTML.
(() => {
  const translations = {
    en: { viewDetails: 'View full details', facilityDetails: 'Institution details', closeDetails: 'Close details', basicDetails: 'Institution', contactDetails: 'Contact & location', careDetails: 'Services & accessibility', sourceDetails: 'Sources & data quality', allSourceFields: 'All recorded source fields', field: 'Field', value: 'Value', nameLabel: 'Name', nameBn: 'Bangla name', nameEn: 'English name', typeLabel: 'Facility type', ownership: 'Ownership', operator: 'Operator', operatorType: 'Operator type', addressLabel: 'Address', phoneLabel: 'Phone', emailLabel: 'Email', websiteLabel: 'Website', coordinates: 'Map coordinates (latitude, longitude)', level: 'Healthcare level', specialty: 'Specialties', emergency: 'Emergency care', beds: 'Beds', openingHours: 'Opening hours (as recorded)', wheelchairLabel: 'Wheelchair access', wheelchairDescription: 'Access details', toiletsWheelchair: 'Wheelchair-accessible toilets', fee: 'Fee information', notRecorded: 'Not recorded', yes: 'Yes', no: 'No', limited: 'Limited', showOnMap: 'Show map point', noCoordinates: 'No published coordinates — this institution cannot be placed or routed on the map yet.', locationQuality: 'OSM points are community mapped; building centres are approximate and may not identify the entrance.', osmSource: 'OpenStreetMap community record', dghsSource: 'DGHS facility registry', originalRecord: 'Open original record', fetchedOn: 'Retrieved', osmSnapshot: 'OSM data snapshot', sourceNotice: 'These are source records, not independently verified services or licensing status. Contact the institution before visiting. Missing information is shown as “Not recorded”.', dghsFields: 'DGHS registry details', dghsNoMatch: 'No DGHS registry record has been linked to this OpenStreetMap feature. Similar names alone do not establish a match.', dghsRegistry: 'Browse the official DGHS registry', sourceType: 'Source', districtLabel: 'District', cityLabel: 'City / locality', institutionCode: 'Institution code' },
    bn: { viewDetails: 'সম্পূর্ণ তথ্য দেখুন', facilityDetails: 'প্রতিষ্ঠানের বিস্তারিত', closeDetails: 'বিস্তারিত বন্ধ করুন', basicDetails: 'প্রতিষ্ঠান', contactDetails: 'যোগাযোগ ও অবস্থান', careDetails: 'সেবা ও প্রবেশগম্যতা', sourceDetails: 'তথ্যের উৎস ও নির্ভরযোগ্যতা', allSourceFields: 'উৎসে থাকা সব তথ্য', field: 'বিষয়', value: 'তথ্য', nameLabel: 'নাম', nameBn: 'বাংলা নাম', nameEn: 'ইংরেজি নাম', typeLabel: 'প্রতিষ্ঠানের ধরন', ownership: 'মালিকানা', operator: 'পরিচালনাকারী', operatorType: 'পরিচালনাকারীর ধরন', addressLabel: 'ঠিকানা', phoneLabel: 'ফোন', emailLabel: 'ইমেইল', websiteLabel: 'ওয়েবসাইট', coordinates: 'মানচিত্রের স্থানাঙ্ক (অক্ষাংশ, দ্রাঘিমাংশ)', level: 'স্বাস্থ্যসেবার স্তর', specialty: 'বিশেষায়িত সেবা', emergency: 'জরুরি সেবা', beds: 'শয্যা', openingHours: 'খোলার সময় (উৎস অনুযায়ী)', wheelchairLabel: 'হুইলচেয়ার প্রবেশ', wheelchairDescription: 'প্রবেশের বিস্তারিত', toiletsWheelchair: 'হুইলচেয়ার ব্যবহারযোগ্য শৌচাগার', fee: 'ফি সংক্রান্ত তথ্য', notRecorded: 'তথ্য দেওয়া নেই', yes: 'হ্যাঁ', no: 'না', limited: 'সীমিত', showOnMap: 'মানচিত্রে স্থান দেখুন', noCoordinates: 'প্রকাশিত স্থানাঙ্ক নেই — এখনই এই প্রতিষ্ঠান মানচিত্রে দেখানো বা পথনির্দেশ দেওয়া সম্ভব নয়।', locationQuality: 'OSM-এর স্থান কমিউনিটির দেওয়া; ভবনের কেন্দ্র আনুমানিক এবং প্রবেশপথ নাও হতে পারে।', osmSource: 'OpenStreetMap কমিউনিটির তথ্য', dghsSource: 'DGHS প্রতিষ্ঠানের রেজিস্ট্রি', originalRecord: 'মূল তথ্য দেখুন', fetchedOn: 'তথ্য আনার সময়', osmSnapshot: 'OSM তথ্যের সময়', sourceNotice: 'এগুলো উৎসের তথ্য, স্বাধীনভাবে যাচাই করা সেবা বা লাইসেন্সের অবস্থা নয়। যাওয়ার আগে যোগাযোগ করুন। তথ্য না থাকলে তা স্পষ্টভাবে দেখানো হয়।', dghsFields: 'DGHS রেজিস্ট্রির তথ্য', dghsNoMatch: 'এই OpenStreetMap বৈশিষ্ট্যের সঙ্গে কোনো DGHS তথ্য যুক্ত করা হয়নি। শুধু নামের মিল দিয়ে একই প্রতিষ্ঠান নিশ্চিত করা হয় না।', dghsRegistry: 'সরকারি DGHS রেজিস্ট্রি দেখুন', sourceType: 'উৎস', districtLabel: 'জেলা', cityLabel: 'শহর / এলাকা', institutionCode: 'প্রতিষ্ঠানের কোড' }
  };
  const create = (tag, text, className = '') => { const element = document.createElement(tag); if (text != null) element.textContent = String(text); element.className = className; return element; };
  const registryURL = 'https://hrm.dghs.gov.bd/index.php/public/facility-registry';
  const hasCoordinates = (f) => Number.isFinite(f.lat) && Number.isFinite(f.lon) && Math.abs(f.lat) <= 90 && Math.abs(f.lon) <= 180 && (!f.registry || (f.registry.coordinateStatus === 'published' && f.registry.boundaryValidated === true));
  function safeURL(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    if (/^[a-z][a-z0-9+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) return null;
    try { const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && url.hostname.includes('.') && !/[\s<>]/.test(value) ? url.href : null; } catch { return null; }
  }
  function externalLink(text, url) { const link = create('a', text); link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link; }
  class FacilityDetails {
    static translations = translations;
    static hasCoordinates = hasCoordinates;
    static sourceURL(f) {
      if (f.registry) { const url = safeURL(f.registry.url); return url && new URL(url).hostname === 'hrm.dghs.gov.bd' ? url : registryURL; }
      return `https://www.openstreetmap.org/${f.osmType}/${f.osmId}`;
    }
    constructor(options) {
      this.options = options; this.t = options.t;
      this.dialog = create('dialog', null, 'facility-dialog'); this.dialog.setAttribute('aria-labelledby', 'details-title');
      const container = create('div', null, 'details-container');
      const header = create('header', null, 'details-header');
      const title = create('h2', '', 'details-title'); title.id = 'details-title';
      this.closeButton = create('button', '×', 'details-close'); this.closeButton.type = 'button'; this.closeButton.addEventListener('click', () => this.dialog.close());
      header.append(title, this.closeButton); this.content = create('div', null, 'details-body'); container.append(header, this.content); this.dialog.append(container); document.body.append(this.dialog);
    }
    sourceLink(f) { return FacilityDetails.sourceURL(f); }
    value(value) { return value == null || String(value).trim() === '' ? this.t('notRecorded') : ['yes', 'no', 'limited'].includes(value) ? this.t(value) : String(value); }
    row(list, key, value, linkURL) { const term = create('dt', this.t(key)), definition = create('dd'); if (linkURL) definition.append(externalLink(this.value(value), linkURL)); else definition.textContent = this.value(value); list.append(term, definition); }
    section(title, rows) { const section = create('section', null, 'details-section'); section.append(create('h3', this.t(title))); const list = create('dl', null, 'details-grid'); rows.forEach(([key, value, url]) => this.row(list, key, value, url)); section.append(list); return section; }
    open(facility) {
      this.facility = facility; this.loadError = false; this.render(); if (!this.dialog.open) this.dialog.showModal();
      if (facility.registry && !facility.registry.detailsLoaded && this.options.enrich) {
        this.options.enrich(facility).then(() => { if (this.facility === facility && this.dialog.open) this.render(); }).catch(() => { if (this.facility === facility && this.dialog.open) { this.loadError = true; this.render(); } });
      }
    }
    render() {
      const f = this.facility; if (!f) return;
      const tags = f.tags || {}; this.dialog.querySelector('#details-title').textContent = this.options.getName(f); this.closeButton.setAttribute('aria-label', this.t('closeDetails'));
      const content = document.createDocumentFragment();
      const provenance = create('p', f.registry ? this.t('dghsSource') : this.t('osmSource'), 'details-provenance'); content.append(provenance);
      const buttons = create('div', null, 'details-actions');
      if (hasCoordinates(f)) {
        const mapButton = create('button', this.t('showOnMap')); mapButton.type = 'button'; mapButton.addEventListener('click', () => { this.dialog.close(); this.options.onMap(f); });
        const routeButton = create('button', this.t('routeHere')); routeButton.type = 'button'; routeButton.addEventListener('click', () => { this.dialog.close(); this.options.onRoute(f); }); buttons.append(mapButton, routeButton);
      } else content.append(create('p', this.t(f.registry?.coordinateStatus === 'outside' ? 'outsideBoundaryDetails' : 'noCoordinates'), 'details-warning'));
      buttons.append(externalLink(this.t('originalRecord'), this.sourceLink(f))); content.append(buttons);
      content.append(this.section('basicDetails', [['nameLabel', tags.name || this.options.getName(f)], ['nameBn', tags['name:bn']], ['nameEn', tags['name:en']], ['typeLabel', tags.healthcare || tags.amenity || f.registry?.type], ['ownership', tags.ownership], ['operator', tags.operator], ['operatorType', tags['operator:type']], ['institutionCode', f.registry?.code || tags['ref:DGHS'] || tags['ref:moh']]]));
      const address = tags['addr:full'] || [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean).join(', ');
      const website = tags.website || tags['contact:website'];
      content.append(this.section('contactDetails', [['addressLabel', address], ['districtLabel', tags['addr:district']], ['cityLabel', tags['addr:city']], ['phoneLabel', tags.phone || tags['contact:phone']], ['emailLabel', tags.email || tags['contact:email']], ['websiteLabel', website, safeURL(website)], ['coordinates', hasCoordinates(f) ? `${f.lat.toFixed(6)}, ${f.lon.toFixed(6)}` : null]]));
      if (f.registry?.reportedPoint) content.append(this.section('coordinateReview', [['reportedCoordinates', f.registry.reportedPoint.map((n) => n.toFixed(6)).join(', ')]]));
      content.append(this.section('careDetails', [['level', tags['healthcare:level']], ['specialty', tags['healthcare:speciality'] || tags['healthcare:specialty']], ['emergency', tags.emergency], ['beds', tags.beds], ['openingHours', tags.opening_hours], ['wheelchairLabel', tags.wheelchair], ['wheelchairDescription', tags['wheelchair:description']], ['toiletsWheelchair', tags['toilets:wheelchair']], ['fee', tags.fee]]));
      if (f.registry?.fields) {
        if (!f.registry.detailsLoaded) { const state = create('p', this.t(this.loadError ? 'fullDetailsError' : 'fullDetailsLoading'), 'details-load-state'); state.setAttribute('role', 'status'); content.append(state); }
        const official = create('section', null, 'details-section'); official.append(create('h3', this.t('dghsFields'))); const list = create('dl', null, 'details-grid');
        for (const [label, value] of Object.entries(f.registry.fields)) list.append(create('dt', label), create('dd', this.value(value))); official.append(list); content.append(official);
        if (f.registry.profileText) { const snapshot = create('details', null, 'details-profile-text'); snapshot.append(create('summary', this.t('profileTextLabel')), create('pre', f.registry.profileText)); content.append(snapshot); }
      }
      const source = create('section', null, 'details-section'); source.append(create('h3', this.t('sourceDetails')), create('p', this.t('sourceNotice')));
      if (!f.registry) source.append(create('p', this.t('locationQuality')), create('p', this.t('dghsNoMatch')), externalLink(this.t('dghsRegistry'), registryURL));
      else source.append(create('p', this.t('registryCoordinateQuality')), create('p', this.t('moreOfficialDetails')));
      const meta = create('dl', null, 'details-grid'); this.row(meta, 'sourceType', f.registry ? this.t('dghsSource') : this.t('osmSource'));
      if (f.retrievedAt) this.row(meta, 'fetchedOn', new Date(f.retrievedAt).toLocaleString());
      if (f.osmSnapshot) this.row(meta, 'osmSnapshot', f.osmSnapshot);
      if (f.registry?.profileRetrievedAt) this.row(meta, 'profileSnapshot', new Date(f.registry.profileRetrievedAt).toLocaleString());
      source.append(meta); content.append(source);
      const raw = create('details', null, 'details-raw'); raw.append(create('summary', this.t('allSourceFields')));
      const table = create('table'); const head = create('thead'); const heading = create('tr'); heading.append(create('th', this.t('field')), create('th', this.t('value'))); head.append(heading); const body = create('tbody');
      for (const [key, value] of Object.entries(tags).sort(([a], [b]) => a.localeCompare(b))) { const row = create('tr'); row.append(create('td', key), create('td', this.value(value))); body.append(row); }
      table.append(head, body); raw.append(table); content.append(raw); this.content.replaceChildren(content);
    }
    popup(f) {
      const tags = f.tags || {}, popup = create('div', null, 'facility-popup'); popup.append(create('strong', this.options.getName(f)));
      const fields = [['typeLabel', tags.healthcare || tags.amenity || f.registry?.type], ['operator', tags.operator], ['addressLabel', tags['addr:full'] || [tags['addr:street'], tags['addr:city']].filter(Boolean).join(', ')], ['phoneLabel', tags.phone || tags['contact:phone']], ['openingHours', tags.opening_hours], ['wheelchairLabel', tags.wheelchair]];
      const list = create('dl', null, 'popup-fields'); fields.forEach(([key, value]) => this.row(list, key, value)); popup.append(list);
      if (hasCoordinates(f)) popup.append(create('p', `${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`, 'popup-coordinates'));
      const actions = create('div', null, 'details-actions'); const details = create('button', this.t('viewDetails')); details.type = 'button'; details.addEventListener('click', () => this.open(f)); actions.append(details);
      if (hasCoordinates(f)) { const route = create('button', this.t('routeHere')); route.type = 'button'; route.addEventListener('click', () => this.options.onRoute(f)); actions.append(route); }
      popup.append(actions); return popup;
    }
    translate() { if (this.dialog.open) this.render(); }
  }
  window.FacilityDetails = FacilityDetails;
})();
