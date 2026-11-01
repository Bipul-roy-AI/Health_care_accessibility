/* ShasthoPath: a static, key-free OpenStreetMap healthcare explorer. */
'use strict';
(() => {
  const $ = (selector) => document.querySelector(selector);
  const cities = { dhaka: [23.8103, 90.4125], chattogram: [22.3569, 91.7832], sylhet: [24.8949, 91.8687], rajshahi: [24.3745, 88.6042], khulna: [22.8456, 89.5403], barishal: [22.701, 90.3535], rangpur: [25.7439, 89.2752], mymensingh: [24.7471, 90.4203] };
  const bn = {
    explore: 'চিকিৎসা খুঁজুন', about: 'তথ্য সম্পর্কে', eyebrow: 'বাংলাদেশের উন্মুক্ত স্বাস্থ্যসেবা মানচিত্র', headline: 'সঠিক চিকিৎসা।\nআরও কাছে।', intro: 'আপনার এলাকায় হাসপাতাল, ক্লিনিক ও ডায়াগনস্টিক সেন্টার খুঁজুন।\nউন্মুক্ত তথ্যের ভিত্তিতে, সবার জন্য বিনামূল্যে।', note: 'আপনার স্বাস্থ্যসেবার যাত্রা শুরু হোক এখান থেকেই।', noteSmall: 'যাওয়ার আগে প্রতিষ্ঠানে যোগাযোগ করে সেবা ও সময় নিশ্চিত করুন।', findNearby: 'কাছাকাছি চিকিৎসা খুঁজুন', free: 'বিনামূল্যে ও উন্মুক্ত', chooseArea: 'একটি এলাকা বেছে নিন', all: 'সব প্রতিষ্ঠান', hospital: 'হাসপাতাল', clinic: 'ক্লিনিক', diagnostic: 'ডায়াগনস্টিক', pharmacy: 'ফার্মেসি', other: 'অন্যান্য সেবা', wheelchairFilter: 'শুধু হুইলচেয়ার প্রবেশের তথ্য আছে এমন প্রতিষ্ঠান', refresh: 'রিফ্রেশ', sourceLabel: 'কমিউনিটির তথ্য · OpenStreetMap', searchArea: 'এই মানচিত্রের এলাকায় খুঁজুন', mapHint: 'অন্য এলাকা দেখতে মানচিত্র সরান', openTitle: 'মানচিত্র, সম্পূর্ণ তালিকা নয়।', openBody: 'স্থানগুলোর তথ্য OpenStreetMap অবদানকারীদের দেওয়া, সরকারি DGHS রেজিস্ট্রি থেকে নয়। কিছু প্রতিষ্ঠান অনুপস্থিত বা তথ্য পুরোনো বা ভুল হতে পারে। ফলাফল শুধু অনুসন্ধান করা এলাকার জন্য।', accessTitle: 'তথ্য থেকেই সহজ প্রবেশের শুরু।', accessBody: 'হুইলচেয়ার প্রবেশ ও খোলার সময় কেবল তথ্য থাকলেই দেখানো হয়। অজানা মানে প্রবেশ অসম্ভব নয়। দূরত্ব সরলরেখায় আনুমানিক হিসাব, যাতায়াতের সময় নয়।', helpTitle: 'কোনো প্রতিষ্ঠান বাদ পড়েছে?', helpBody: 'OpenStreetMap-এ প্রতিষ্ঠান যোগ বা সংশোধন করে সাহায্য করুন। ডেটা সেবায় তথ্য পৌঁছানোর পর রিফ্রেশ করলে পরিবর্তন দেখা যাবে।', contribute: 'OpenStreetMap-এ অবদান রাখুন ↗', medicalNote: 'এটি প্রতিষ্ঠানের অবস্থানের তালিকা, চিকিৎসা পরামর্শ বা জরুরি সেবা নয়। বাংলাদেশে জরুরি প্রয়োজনে ৯৯৯ নম্বরে কল করুন।', loading: 'প্রতিষ্ঠান খোঁজা হচ্ছে…', loadingDetail: 'OpenStreetMap থেকে তথ্য আনা হচ্ছে। কিছু সময় লাগতে পারে।', count: 'টি প্রতিষ্ঠান', noResults: 'কোনো মিল পাওয়া যায়নি', tryAgain: 'অন্য ফিল্টার ব্যবহার করুন বা মানচিত্র সরিয়ে আবার খুঁজুন।', unknown: 'হুইলচেয়ার প্রবেশ: অজানা', accessible: 'হুইলচেয়ার প্রবেশের তথ্য আছে', limited: 'হুইলচেয়ার প্রবেশ: সীমিত', inaccessible: 'হুইলচেয়ার প্রবেশ: না', directions: 'দিকনির্দেশনা ↗', source: 'তথ্যের উৎস ↗', unnamed: 'নামহীন স্বাস্থ্য প্রতিষ্ঠান', addressUnknown: 'বিস্তারিত ঠিকানা দেওয়া নেই', hours: 'সময়', phone: 'ফোন', error: 'প্রতিষ্ঠানের তথ্য আনা যায়নি। সংযোগ পরীক্ষা করে রিফ্রেশ করুন।', stale: 'শেষ সফল অনুসন্ধানের ফলাফল দেখানো হচ্ছে। মানচিত্রের বর্তমান এলাকার ফলাফল নাও হতে পারে।', zoom: 'একটি শহর বা মহল্লায় জুম করে আবার খুঁজুন।', locationDenied: 'অবস্থান পাওয়া যায়নি। তালিকা থেকে এলাকা বেছে নিন বা মানচিত্র সরান।', outside: 'আপনার অবস্থান বাংলাদেশের বাইরে মনে হচ্ছে। বাংলাদেশের একটি এলাকা বেছে নিন।', locate: 'আমার অবস্থান ব্যবহার করুন', searchPlaceholder: 'লোড হওয়া প্রতিষ্ঠান খুঁজুন…', tileError: 'মানচিত্রের ছবি লোড হয়নি। প্রতিষ্ঠানের তালিকা ব্যবহার করতে পারেন।', fetched: 'অনুসন্ধানের সময়', subset: 'এই মানচিত্রের এলাকার মধ্যে', moved: 'নতুন এলাকার প্রতিষ্ঠান দেখতে “এই মানচিত্রের এলাকায় খুঁজুন” চাপুন।', privacy: 'দূরত্ব আপনার অবস্থান থেকে সরলরেখায়।', missingMap: 'মানচিত্র লোড হয়নি। পৃষ্ঠাটি রিফ্রেশ করুন।'
  };
  const en = { loading: 'Finding facilities…', loadingDetail: 'Fetching OpenStreetMap data. This may take a moment.', count: 'facilities', noResults: 'No matching facilities', tryAgain: 'Try another filter, or move the map and search again.', unknown: 'Wheelchair access: unknown', accessible: 'Wheelchair access reported', limited: 'Wheelchair access: limited', inaccessible: 'Wheelchair access: no', directions: 'Directions ↗', source: 'Data source ↗', unnamed: 'Unnamed healthcare facility', addressUnknown: 'Detailed address not recorded', hours: 'Hours', phone: 'Phone', error: 'Could not load facilities. Check your connection and try Refresh.', stale: 'Showing the last successful search. These results may be outside the current map area.', zoom: 'Zoom in to a city or neighbourhood, then search again.', locationDenied: 'Location unavailable. Choose an area or move the map instead.', outside: 'Your location appears outside Bangladesh. Choose an area in Bangladesh.', locate: 'Use my location', searchPlaceholder: 'Search loaded facilities…', tileError: 'Map tiles could not load. Facility search is still available.', fetched: 'Queried', subset: 'in the searched map area', moved: 'Map moved. Choose “Search this map area” to update facilities.', privacy: 'Distances are straight-line estimates from your location.', missingMap: 'The map could not load. Please refresh this page.' };
  document.querySelectorAll('[data-i18n]').forEach((el) => { en[el.dataset.i18n] = el.innerText; });
  Object.assign(en, window.CareMapTools.translations.en);
  Object.assign(en, window.FacilityDetails.translations.en);
  Object.assign(bn, window.FacilityDetails.translations.bn);
  Object.assign(en, window.RegistryDirectory.translations.en);
  Object.assign(bn, window.RegistryDirectory.translations.bn, { openTitle: 'সরকারি তথ্য, উন্মুক্ত মানচিত্র।', openBody: 'DGHS-এর আমদানি করা তালিকায় সারাদেশে খুঁজুন, অথবা কাছাকাছি OpenStreetMap প্রতিষ্ঠান দেখুন। DGHS-এর স্থান প্রকাশিত রেজিস্ট্রি থেকে। তথ্য সম্পূর্ণ বা সেবা হালনাগাদ থাকার নিশ্চয়তা নেই। ব্যবহারযোগ্য স্থানাঙ্ক নেই এমন প্রতিষ্ঠানও খুঁজে পাওয়া যায়।' });
  Object.assign(bn, window.CareMapTools.translations.bn, { accessBody: 'শুরুর স্থান ও প্রতিষ্ঠান বেছে নিয়ে গাড়ি চলার পথ, সড়কপথের দূরত্ব ও আনুমানিক সময় দেখুন। কার্ডের দূরত্ব সরলরেখায়। হুইলচেয়ার প্রবেশ ও খোলার সময় কেবল তথ্য থাকলেই দেখানো হয়।' });
  let language = 'en';
  const t = (key) => (language === 'bn' ? bn[key] : en[key]) || en[key] || key;
  const textElement = (tag, className, text) => { const el = document.createElement(tag); el.className = className; el.textContent = text; return el; };
  let facilities = [], filter = 'all', userLocation = null, request = null, requestNumber = 0, loading = false, fetchedAt = null, selected = null;
  let statusKey = '', statusError = false, preserveStatus = false;
  let sourceMode = new URLSearchParams(location.search).get('source') === 'osm' ? 'osm' : 'dghs';
  let pageNumber = 0, pageCount = 1, searchTimer;
  const PAGE_SIZE = 75, registry = new RegistryDirectory();
  const markers = new Map();
  function status(key, error = false) { statusKey = key; statusError = error; $('#status').textContent = key ? t(key) : ''; $('#status').classList.toggle('error', error); }
  if (!window.L) { status('missingMap', true); $('#result-count').textContent = '—'; return; }
  const map = L.map('map', { zoomControl: false, minZoom: 7, maxZoom: 19, maxBounds: [[19.8, 86.8], [27.5, 94]], maxBoundsViscosity: 0.8 }).setView(cities.dhaka, 13);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  const markerLayer = L.layerGroup().addTo(map);
  const registryLayer = L.markerClusterGroup({ maxClusterRadius: 48, disableClusteringAtZoom: 17, showCoverageOnHover: false, animate: false }).addTo(map);
  const symbols = { hospital: '✚', clinic: '+', diagnostic: '◈', pharmacy: '℞', other: '+' };
  const category = (tags) => {
    const value = tags.healthcare || tags.amenity || '';
    if (/hospital/.test(value)) return 'hospital';
    if (/laboratory|diagnostic/.test(value) || /diagnostic|ডায়াগনস্টিক/i.test(tags.name || '')) return 'diagnostic';
    if (/pharmacy/.test(value)) return 'pharmacy';
    if (/clinic|centre|center|doctor|health_post/.test(value)) return 'clinic';
    return 'other';
  };
  const name = (f) => language === 'bn' ? f.tags['name:bn'] || f.tags.name || f.tags['name:en'] || t('unnamed') : f.tags['name:en'] || f.tags.name || f.tags['name:bn'] || t('unnamed');
  const address = (tags) => tags['addr:full'] || [tags['addr:housenumber'], tags['addr:street'], tags['addr:suburb'], tags['addr:city']].filter(Boolean).join(', ') || t('addressUnknown');
  const tools = new CareMapTools(map, { t, getName: name, onOriginChange: (point) => { userLocation = point; render(); } });
  const details = new FacilityDetails({ t, getName: name, enrich: (f) => registry.enrich(f), onMap: (f) => { showFacility(f); $('#map').scrollIntoView({ block: 'center' }); }, onRoute: (f) => tools.selectDestination(f, true) });
  const hasPoint = FacilityDetails.hasCoordinates;
  const distance = (f) => userLocation && hasPoint(f) ? map.distance(userLocation, [f.lat, f.lon]) / 1000 : null;
  const sourceURL = (f) => FacilityDetails.sourceURL(f);
  const directionsURL = (f) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${f.lat},${f.lon}`)}`;
  const link = (label, href) => { const el = textElement('a', '', label); el.href = href; el.target = '_blank'; el.rel = 'noopener noreferrer'; return el; };
  function wheelchair(tags) { return tags.wheelchair === 'yes' ? 'accessible' : tags.wheelchair === 'limited' ? 'limited' : tags.wheelchair === 'no' ? 'inaccessible' : 'unknown'; }
  function showFacility(f) {
    if (!hasPoint(f)) { details.open(f); return; }
    selected = f.id;
    document.querySelectorAll('.facility').forEach((el) => el.classList.toggle('selected', el.dataset.id === f.id));
    map.setView([f.lat, f.lon], Math.max(map.getZoom(), 15));
    const marker = markers.get(f.id);
    if (f.registry && marker && registryLayer.hasLayer(marker)) registryLayer.zoomToShowLayer(marker, () => marker.openPopup());
    else marker?.openPopup();
  }
  function updateSourceUI() {
    $('#data-source').value = sourceMode;
    $('#within-map-label').hidden = sourceMode !== 'dghs';
    $('#search').placeholder = t(sourceMode === 'dghs' ? 'directorySearch' : 'searchPlaceholder');
    $('label[for="search"]').textContent = $('#search').placeholder;
    $('.sidebar-footer [data-i18n]').textContent = t(sourceMode === 'dghs' ? 'directorySource' : 'sourceOSM');
    const metadata = registry.metadata;
    $('#directory-info').textContent = sourceMode === 'dghs' ? (metadata ? `${t('snapshot')}: ${new Date(metadata.generatedAt).toLocaleDateString()} · ${metadata.coordinateCoverage.published.toLocaleString()} ${t('mapped')}; ${(metadata.count - metadata.coordinateCoverage.published).toLocaleString()} ${t('unmapped')}. ${t('directoryScope')}` : t('directoryLoading')) : '';
  }
  function render() {
    const query = $('#search').value.trim().toLocaleLowerCase();
    const bounds = map.getBounds();
    const shown = facilities.filter((f) => (filter === 'all' || f.category === filter) && (!$('#wheelchair').checked || f.tags.wheelchair === 'yes') && (sourceMode !== 'dghs' || !$('#within-map').checked || (hasPoint(f) && bounds.contains([f.lat, f.lon]))) && (!query || Object.values(f.tags).concat(Object.values(f.registry?.fields || {})).join(' ').toLocaleLowerCase().includes(query)));
    if (userLocation) shown.sort((a, b) => (distance(a) ?? Infinity) - (distance(b) ?? Infinity));
    $('#result-count').textContent = loading && !fetchedAt ? t('loading') : `${shown.length.toLocaleString(language === 'bn' ? 'bn-BD' : 'en')} ${t('count')}`;
    $('#result-count').title = fetchedAt ? `${t('fetched')}: ${fetchedAt.toLocaleString(language === 'bn' ? 'bn-BD' : 'en-GB')} — ${t('subset')}` : '';
    const fragment = document.createDocumentFragment();
    markerLayer.clearLayers(); registryLayer.clearLayers(); markers.clear();
    pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE)); pageNumber = Math.min(pageNumber, pageCount - 1);
    $('#result-pages').hidden = pageCount === 1; $('#previous-page').disabled = pageNumber === 0; $('#next-page').disabled = pageNumber >= pageCount - 1;
    $('#page-label').textContent = `${t('page')} ${pageNumber + 1} ${t('of')} ${pageCount}`;
    const onPage = shown.slice(pageNumber * PAGE_SIZE, (pageNumber + 1) * PAGE_SIZE);
    for (const f of onPage) {
      const card = textElement('article', 'facility', ''); card.dataset.id = f.id; card.classList.toggle('selected', selected === f.id);
      const top = textElement('div', 'facility-top', ''); top.append(textElement('span', 'facility-icon', symbols[f.category]));
      const copy = textElement('div', 'facility-copy', '');
      const title = textElement('button', 'facility-name', name(f)); title.type = 'button'; title.addEventListener('click', () => showFacility(f));
      const km = distance(f);
      copy.append(title, textElement('p', 'facility-type', (f.registry?.type || t(f.category)) + (km !== null ? ` · ${km.toFixed(1)} km ${t('straightShort')}` : ''))); top.append(copy); card.append(top);
      card.append(textElement('p', 'facility-address', address(f.tags)));
      if (f.tags.opening_hours) card.append(textElement('p', 'facility-details', `${t('hours')}: ${f.tags.opening_hours}`));
      const phone = f.tags.phone || f.tags['contact:phone'];
      if (phone) card.append(textElement('p', 'facility-details', `${t('phone')}: ${phone}`));
      const access = wheelchair(f.tags); card.append(textElement('span', `tag ${access === 'accessible' ? 'positive' : ''}`, t(access)));
      if (f.registry && !f.registry.active) card.append(textElement('p', 'facility-details inactive-record', t('inactiveRegistry')));
      if (f.registry) card.append(textElement('p', 'facility-details', `DGHS · ${f.registry.code || f.registry.id}`));
      if (!hasPoint(f)) card.append(textElement('p', 'facility-details', t('noCoordinates')));
      const routeButton = textElement('button', 'route-here', t('routeHere')); routeButton.type = 'button'; routeButton.addEventListener('click', () => tools.selectDestination(f, true));
      const detailButton = textElement('button', 'view-details', t('viewDetails')); detailButton.type = 'button'; detailButton.addEventListener('click', () => details.open(f));
      const actions = textElement('div', 'facility-actions', ''); actions.append(detailButton); if (hasPoint(f)) actions.append(routeButton, link(t('directions'), directionsURL(f))); actions.append(link(t('source'), sourceURL(f))); card.append(actions); fragment.append(card);
    }
    const clustered = [];
    for (const f of shown) {
      if (!hasPoint(f)) continue;
      const marker = L.marker([f.lat, f.lon], { title: name(f), keyboard: true, icon: L.divIcon({ className: '', html: `<div class="map-pin ${f.category}"><span>${symbols[f.category]}</span></div>`, iconSize: [30, 30], iconAnchor: [15, 30] }) }).bindPopup(() => details.popup(f), { maxWidth: 330, maxHeight: 350 });
      if (f.registry) clustered.push(marker); else marker.addTo(markerLayer);
      marker.on('click', () => { selected = f.id; document.querySelectorAll('.facility').forEach((el) => { el.classList.toggle('selected', el.dataset.id === f.id); if (el.dataset.id === f.id) el.scrollIntoView({ block: 'nearest', behavior: 'auto' }); }); });
      markers.set(f.id, marker);
    }
    registryLayer.addLayers(clustered);
    if (!shown.length && !loading) { const empty = textElement('div', 'empty', ''); empty.append(textElement('strong', '', t('noResults')), document.createTextNode(t('tryAgain'))); fragment.append(empty); }
    $('#results').replaceChildren(fragment);
    tools.setFacilities(onPage.filter(hasPoint));
  }
  async function loadRegistry() {
    request?.abort(); const version = ++requestNumber; setLoading(true); status('directoryLoading'); render();
    try {
      const records = await registry.load(); if (version !== requestNumber || sourceMode !== 'dghs') return;
      facilities = records; fetchedAt = new Date(registry.metadata.generatedAt); pageNumber = 0; selected = null; preserveStatus = false; status('');
      const requestedID = new URLSearchParams(location.search).get('institution');
      const requested = requestedID && facilities.find((f) => f.registry.id === requestedID);
      if (requested) { $('#search').value = requested.registry.code || requested.tags.name; }
    } catch { if (version === requestNumber && sourceMode === 'dghs') status('directoryError', true); }
    finally { if (version === requestNumber) { setLoading(false); updateSourceUI(); render(); const requestedID = new URLSearchParams(location.search).get('institution'); const requested = requestedID && facilities.find((f) => f.registry?.id === requestedID); if (requested) { if (hasPoint(requested)) showFacility(requested); details.open(requested); } } }
  }
  function setLoading(value) { loading = value; $('#refresh').disabled = value; $('#search-area').disabled = value; $('#search-area').textContent = value ? t('loading') : t('searchArea'); $('#results').setAttribute('aria-busy', String(value)); }
  async function loadFacilities() {
    request?.abort();
    const number = ++requestNumber;
    const bounds = map.getBounds();
    if (map.getZoom() < 11 || bounds.getNorth() - bounds.getSouth() > 0.65 || bounds.getEast() - bounds.getWest() > 0.8) { setLoading(false); status('zoom', true); render(); return; }
    const bbox = [bounds.getSouth(), bounds.getWest(), bounds.getNorth(), bounds.getEast()].map((n) => n.toFixed(5)).join(',');
    // Intersect the viewport with Bangladesh to exclude facilities over the border.
    const query = `[out:json][timeout:30];area["ISO3166-1"="BD"]["boundary"="administrative"]["admin_level"="2"]->.bd;(nwr["healthcare"](area.bd)(${bbox});nwr["amenity"~"^(hospital|clinic|doctors|dentist|pharmacy)$"](area.bd)(${bbox}););out center tags;`;
    request = new AbortController(); const controller = request;
    const timeout = setTimeout(() => controller.abort(), 40000);
    preserveStatus = false; setLoading(true); status('loadingDetail'); render();
    try {
      const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: query }), signal: controller.signal, credentials: 'omit', referrerPolicy: 'strict-origin-when-cross-origin' });
      if (!response.ok) throw new Error(`Data service HTTP ${response.status}`);
      const data = await response.json();
      // Overpass can return HTTP 200 with a runtime-error remark and incomplete elements.
      if (data.remark || !Array.isArray(data.elements)) throw new Error('Incomplete data service response');
      if (number !== requestNumber) return;
      const seen = new Set();
      facilities = data.elements.flatMap((el) => {
        const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !el.tags || !['node', 'way', 'relation'].includes(el.type) || !Number.isInteger(el.id)) return [];
        const id = `${el.type}/${el.id}`; if (seen.has(id)) return []; seen.add(id);
        return [{ id, osmType: el.type, osmId: el.id, lat, lon, tags: el.tags, category: category(el.tags), retrievedAt: new Date().toISOString(), osmSnapshot: data.osm3s?.timestamp_osm_base || null }];
      });
      fetchedAt = new Date(); selected = null; tools.setFacilities(facilities);
      const current = map.getBounds();
      const currentBbox = [current.getSouth(), current.getWest(), current.getNorth(), current.getEast()].map((n) => n.toFixed(5)).join(',');
      status(currentBbox === bbox ? '' : 'moved');
    } catch (error) {
      if (number !== requestNumber) return;
      preserveStatus = true; status('error', true);
    } finally {
      clearTimeout(timeout);
      if (number === requestNumber) { setLoading(false); render(); if (preserveStatus && fetchedAt) $('#status').textContent += ` ${t('stale')}`; }
    }
  }
  $('#city').addEventListener('change', () => { map.setView(cities[$('#city').value], 13, { animate: false }); if (sourceMode === 'osm') loadFacilities(); });
  $('#search').addEventListener('input', () => { clearTimeout(searchTimer); pageNumber = 0; if (sourceMode === 'dghs') searchTimer = setTimeout(render, 180); else render(); });
  $('#wheelchair').addEventListener('change', () => { pageNumber = 0; render(); });
  $('#within-map').addEventListener('change', () => { pageNumber = 0; render(); });
  $('#previous-page').addEventListener('click', () => { pageNumber = Math.max(0, pageNumber - 1); render(); $('#results').scrollTop = 0; });
  $('#next-page').addEventListener('click', () => { pageNumber = Math.min(pageCount - 1, pageNumber + 1); render(); $('#results').scrollTop = 0; });
  $('#data-source').addEventListener('change', () => {
    sourceMode = $('#data-source').value; clearTimeout(searchTimer); request?.abort(); requestNumber++; facilities = []; fetchedAt = null; pageNumber = 0; preserveStatus = false; selected = null; $('#within-map').checked = false;
    updateSourceUI();
    if (sourceMode === 'dghs') { map.fitBounds([[20.6, 88], [26.65, 92.7]], { animate: false }); loadRegistry(); }
    else { map.setView(cities[$('#city').value], 13, { animate: false }); loadFacilities(); }
  });
  document.querySelectorAll('.filter').forEach((button) => button.addEventListener('click', () => {
    filter = button.dataset.type; pageNumber = 0;
    document.querySelectorAll('.filter').forEach((el) => { el.classList.toggle('selected', el === button); el.setAttribute('aria-pressed', String(el === button)); }); render();
  }));
  $('#refresh').addEventListener('click', () => sourceMode === 'dghs' ? loadRegistry() : loadFacilities());
  $('#search-area').addEventListener('click', () => { if (sourceMode === 'dghs') { $('#within-map').checked = true; pageNumber = 0; render(); } else loadFacilities(); });
  map.on('moveend', () => { if (sourceMode === 'dghs') { if ($('#within-map').checked) { pageNumber = 0; render(); } } else if (!loading && !statusError && fetchedAt) status('moved'); });
  $('#locate').addEventListener('click', () => {
    if (!navigator.geolocation) { status('locationDenied', true); return; }
    $('#locate').disabled = true;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      $('#locate').disabled = false;
      if (coords.latitude < 20.5 || coords.latitude > 26.7 || coords.longitude < 88 || coords.longitude > 92.7) { status('outside', true); return; }
      tools.setOrigin([coords.latitude, coords.longitude]);
      map.setView(userLocation, 14, { animate: false }); if (sourceMode === 'osm') loadFacilities();
    }, () => { $('#locate').disabled = false; status('locationDenied', true); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  });
  $('#language').addEventListener('click', () => {
    language = language === 'en' ? 'bn' : 'en'; document.documentElement.lang = language;
    document.querySelectorAll('[data-i18n]').forEach((el) => { const value = t(el.dataset.i18n); if (el.tagName === 'H1' || el.classList.contains('intro-copy')) { el.replaceChildren(); value.split('\n').forEach((line, i) => { if (i) el.append(document.createElement('br')); el.append(document.createTextNode(line)); }); } else el.textContent = value; });
    $('#language').textContent = language === 'en' ? 'বাংলা' : 'English';
    $('#search').placeholder = t('searchPlaceholder'); $('#search').previousElementSibling?.setAttribute('aria-hidden', 'true');
    $('label[for="search"]').textContent = t('searchPlaceholder');
    $('#locate').title = t('locate'); $('#locate').setAttribute('aria-label', t('locate'));
    $('#map-warning').textContent = t('tileError');
    status(statusKey, statusError); if (preserveStatus && fetchedAt) $('#status').textContent += ` ${t('stale')}`;
    $('#search-area').textContent = loading ? t('loading') : t('searchArea'); tools.translate(); details.translate(); updateSourceUI(); render();
  });
  // Plain text is used for all external tags to prevent stored HTML injection.
  // No cookies, analytics, account, or persistent location storage.
  updateSourceUI();
  if (sourceMode === 'dghs') { map.fitBounds([[20.6, 88], [26.65, 92.7]], { animate: false }); loadRegistry(); }
  else loadFacilities();
})();
