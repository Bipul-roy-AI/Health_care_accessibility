'use strict';
// Open map layers and point-to-facility routing. No API keys or location storage.
(() => {
  const en = {
    journeyEyebrow: 'POINT TO CARE · ROAD ROUTING', journeyTitle: 'Plan a journey to a facility', driving: 'DRIVING ROUTE', startPoint: '1. Starting point', pickOrigin: 'Choose a point on the map', originEmpty: 'No starting point selected. You can also use ⌖ for your location.', enterCoordinates: 'Or enter latitude / longitude', setPoint: 'Set point', destinationLabel: '2. Medical institution', chooseDestination: 'Choose a loaded facility…', destinationHelp: 'Or choose “Route here” on a facility card.', getRoute: 'Show road route', clearRoute: 'Clear journey', roadDistance: 'Road distance', estimatedDrive: 'Estimated driving time', straightDistance: 'Straight-line distance', routeDisclaimer: 'OSRM driving estimate · No live traffic or wheelchair-access guarantee. The route uses the nearest routable road; check the facility entrance.', turns: 'Turn-by-turn directions', updateDetails: 'Update roads & buildings', layersHelp: 'Use the layers button to switch basemaps or enable roads and buildings.', mapHint: 'Move the map to explore another neighbourhood', streetMap: 'Street map · OpenStreetMap', lightMap: 'Light map · CARTO', roads: 'Road network · OSM', buildings: 'Building footprints · OSM', routeHere: 'Route here', startChosen: 'Starting point', chooseOnMap: 'Click or tap the map to set your starting point.', ready: 'Starting point set. Choose a facility, then show the road route.', routeLoading: 'Finding a driving route along the road network…', routeFailed: 'Routing service unavailable. Try again, or use the external Directions link on the facility card.', noRoute: 'No driving route found between these points. Try a point closer to a public road.', missingPoints: 'Choose both a starting point and a medical institution.', routeFound: 'Driving route shown in blue. A = start; B = medical institution.', invalidPoint: 'Enter a valid latitude (20.5–26.7) and longitude (88–92.7) for the Bangladesh map area.', layerZoom: 'Zoom to street level (15+) and choose Update roads & buildings.', layerLoading: 'Loading open road and building geometry…', layerLoaded: 'Open map details loaded for this area.', layerMoved: 'Map moved. Choose Update roads & buildings to refresh these layers.', layerFailed: 'Map details could not load. Try Update roads & buildings again.', layerEmpty: 'No mapped features found here. Coverage is incomplete.', layerLimit: 'Showing the first 5,000 features. Zoom in for a smaller area.', minute: 'min', hour: 'h', straightShort: 'straight-line', previousArea: 'previous search area', unnamedRoad: 'unnamed road', depart: 'Start on', arrive: 'Arrive at the destination', turn: 'Turn', continue: 'Continue', merge: 'Merge', fork: 'At the fork, keep', ramp: 'Take the ramp', roundabout: 'Enter the roundabout', exit: 'exit', onto: 'onto', left: 'left', right: 'right', straight: 'straight', slight: 'slightly', sharp: 'sharply', uturn: 'Make a U-turn', routeTooLong: 'The routing service returned an invalid route. Please try another starting point.'
  };
  const bn = {
    journeyEyebrow: 'একটি স্থান থেকে চিকিৎসা · সড়কপথ', journeyTitle: 'চিকিৎসা প্রতিষ্ঠানে যাওয়ার পথ খুঁজুন', driving: 'গাড়ি চালানোর পথ', startPoint: '১. যাত্রা শুরুর স্থান', pickOrigin: 'মানচিত্রে একটি স্থান বেছে নিন', originEmpty: 'শুরুর স্থান বাছাই করা হয়নি। নিজের অবস্থানের জন্য ⌖ ব্যবহার করুন।', enterCoordinates: 'অথবা অক্ষাংশ / দ্রাঘিমাংশ লিখুন', setPoint: 'স্থান নির্ধারণ', destinationLabel: '২. চিকিৎসা প্রতিষ্ঠান', chooseDestination: 'লোড হওয়া প্রতিষ্ঠান বেছে নিন…', destinationHelp: 'অথবা প্রতিষ্ঠানের কার্ডে “এখানে যাওয়ার পথ” চাপুন।', getRoute: 'সড়কপথ দেখান', clearRoute: 'যাত্রা মুছুন', roadDistance: 'সড়কপথের দূরত্ব', estimatedDrive: 'গাড়িতে আনুমানিক সময়', straightDistance: 'সরলরেখার দূরত্ব', routeDisclaimer: 'OSRM-এর গাড়ি চালানোর আনুমানিক হিসাব · সরাসরি যানজট বা হুইলচেয়ার প্রবেশের নিশ্চয়তা নেই। পথ নিকটতম চলাচলযোগ্য সড়ক পর্যন্ত; প্রতিষ্ঠানের প্রবেশপথ যাচাই করুন।', turns: 'ধাপে ধাপে পথনির্দেশ', updateDetails: 'সড়ক ও ভবন আপডেট করুন', layersHelp: 'বেসম্যাপ বদলাতে বা সড়ক ও ভবন দেখতে লেয়ার বোতাম ব্যবহার করুন।', streetMap: 'সড়ক মানচিত্র · OpenStreetMap', lightMap: 'হালকা মানচিত্র · CARTO', roads: 'সড়ক নেটওয়ার্ক · OSM', buildings: 'ভবনের সীমানা · OSM', routeHere: 'এখানে যাওয়ার পথ', startChosen: 'যাত্রা শুরুর স্থান', chooseOnMap: 'মানচিত্রে ক্লিক বা ট্যাপ করে যাত্রার শুরুর স্থান বেছে নিন।', ready: 'শুরুর স্থান নির্ধারিত। প্রতিষ্ঠান বেছে নিয়ে সড়কপথ দেখান।', routeLoading: 'সড়ক ধরে গাড়ি চালানোর পথ খোঁজা হচ্ছে…', routeFailed: 'পথনির্দেশ সেবা পাওয়া যাচ্ছে না। আবার চেষ্টা করুন বা প্রতিষ্ঠানের দিকনির্দেশনার লিংক ব্যবহার করুন।', noRoute: 'এই দুটি স্থানের মধ্যে গাড়ি চলার পথ পাওয়া যায়নি। সড়কের কাছের একটি স্থান বেছে নিন।', missingPoints: 'শুরুর স্থান ও চিকিৎসা প্রতিষ্ঠান দুটোই বেছে নিন।', routeFound: 'গাড়ি চলার পথ নীল রঙে দেখানো হয়েছে। A = শুরুর স্থান; B = চিকিৎসা প্রতিষ্ঠান।', invalidPoint: 'বাংলাদেশের মানচিত্রের জন্য সঠিক অক্ষাংশ (২০.৫–২৬.৭) ও দ্রাঘিমাংশ (৮৮–৯২.৭) লিখুন।', layerZoom: 'সড়ক পর্যায়ে (১৫+) জুম করে সড়ক ও ভবন আপডেট করুন।', layerLoading: 'উন্মুক্ত সড়ক ও ভবনের তথ্য আনা হচ্ছে…', layerLoaded: 'এই এলাকার উন্মুক্ত মানচিত্রের বিবরণ লোড হয়েছে।', layerMoved: 'মানচিত্র সরানো হয়েছে। সড়ক ও ভবন আবার আপডেট করুন।', layerFailed: 'মানচিত্রের বিবরণ লোড হয়নি। আবার সড়ক ও ভবন আপডেট করুন।', layerEmpty: 'এখানে কোনো ম্যাপ করা তথ্য পাওয়া যায়নি। তথ্য অসম্পূর্ণ হতে পারে।', layerLimit: 'প্রথম ৫,০০০টি বৈশিষ্ট্য দেখানো হচ্ছে। আরও জুম করুন।', minute: 'মিনিট', hour: 'ঘণ্টা', straightShort: 'সরলরেখায়', previousArea: 'আগের অনুসন্ধানের এলাকা', unnamedRoad: 'নামহীন সড়ক', depart: 'যাত্রা শুরু করুন', arrive: 'গন্তব্যে পৌঁছান', turn: 'মোড় নিন', continue: 'এগিয়ে যান', merge: 'মিলিত হোন', fork: 'দুই ভাগ হওয়া পথে থাকুন', ramp: 'র‍্যাম্পে উঠুন', roundabout: 'গোলচত্বরে প্রবেশ করুন', exit: 'বহির্গমন', onto: 'সড়ক', left: 'বামে', right: 'ডানে', straight: 'সোজা', slight: 'একটু', sharp: 'তীব্রভাবে', uturn: 'ইউ-টার্ন নিন', routeTooLong: 'পথনির্দেশ সেবা ভুল তথ্য দিয়েছে। অন্য শুরুর স্থান চেষ্টা করুন।'
  };
  const $ = (s) => document.querySelector(s);
  const el = (tag, text) => { const node = document.createElement(tag); node.textContent = text; return node; };
  class CareMapTools {
    static translations = { en, bn };
    constructor(map, options) {
      this.map = map; this.t = options.t; this.onOriginChange = options.onOriginChange; this.getName = options.getName;
      this.origin = null; this.destination = null; this.facilities = []; this.picking = false;
      this.routeVersion = 0; this.layerVersion = 0; this.routeBusy = false; this.routeData = null;
      this.routeStatus = ''; this.layerStatus = 'layersHelp'; this.autoRoute = false;
      map.createPane('openBuildings'); map.getPane('openBuildings').style.zIndex = 370;
      map.createPane('openRoads'); map.getPane('openRoads').style.zIndex = 390;
      map.createPane('careRoute'); map.getPane('careRoute').style.zIndex = 430;
      this.roadLayer = L.layerGroup(); this.buildingLayer = L.layerGroup(); this.routeLayer = L.layerGroup().addTo(map);
      const osmAttribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
      this.street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: osmAttribution }).addTo(map);
      this.light = L.tileLayer('https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', { maxZoom: 19, attribution: `${osmAttribution} &copy; <a href="https://carto.com/attributions">CARTO</a>` });
      for (const layer of [this.street, this.light]) {
        let errors = 0;
        layer.on('tileerror', () => { if (map.hasLayer(layer) && ++errors >= 3) { $('#map-warning').textContent = this.t('tileError'); $('#map-warning').hidden = false; } });
        layer.on('tileload', () => { if (map.hasLayer(layer)) { errors = 0; $('#map-warning').hidden = true; } });
      }
      this.makeLayerControl();
      $('#pick-origin').addEventListener('click', () => { this.autoRoute = false; this.setPicking(!this.picking); });
      $('#origin-form').addEventListener('submit', (event) => { event.preventDefault(); this.setOrigin([Number($('#origin-lat').value), Number($('#origin-lon').value)]); });
      $('#destination').addEventListener('change', () => {
        const f = this.facilities.find((f) => f.id === $('#destination').value);
        // A destination retained from an earlier viewport remains a valid choice.
        if (f) this.selectDestination(f); else if (!$('#destination').value) { this.autoRoute = false; this.destination = null; this.cancelRoute(); this.setRouteStatus(''); }
      });
      $('#get-route').addEventListener('click', () => this.calculateRoute());
      $('#clear-route').addEventListener('click', () => this.clearJourney());
      $('#update-details').addEventListener('click', () => this.loadDetails());
      map.on('click', (event) => { if (this.picking) this.setOrigin([event.latlng.lat, event.latlng.lng]); });
      map.on('overlayadd overlayremove', (event) => { if ([this.roadLayer, this.buildingLayer].includes(event.layer)) this.loadDetails(); });
      map.on('moveend', () => { if ((map.hasLayer(this.roadLayer) || map.hasLayer(this.buildingLayer)) && this.layerStatus !== 'layerLoading') this.setLayerStatus('layerMoved'); });
      map.on('baselayerchange', () => { $('#map-warning').hidden = true; });
    }
    makeLayerControl() {
      if (this.layersControl) this.map.removeControl(this.layersControl);
      this.layersControl = L.control.layers({ [this.t('streetMap')]: this.street, [this.t('lightMap')]: this.light }, { [this.t('roads')]: this.roadLayer, [this.t('buildings')]: this.buildingLayer }, { position: 'topright' }).addTo(this.map);
    }
    setLayerStatus(key, error = false) { this.layerStatus = key; this.layerError = error; $('#layer-status').textContent = this.t(key); $('#layer-status').classList.toggle('error', error); }
    setRouteStatus(key, error = false) { this.routeStatus = key; this.routeError = error; $('#route-status').textContent = key ? this.t(key) : ''; $('#route-status').classList.toggle('error', error); }
    setPicking(value) {
      this.picking = value; $('#pick-origin').setAttribute('aria-pressed', String(value)); $('.map-panel').classList.toggle('picking', value);
      if (value) { this.setRouteStatus('chooseOnMap'); $('#map').scrollIntoView({ block: 'center', behavior: 'auto' }); }
      else if (this.routeStatus === 'chooseOnMap') this.setRouteStatus(this.origin ? 'ready' : '');
    }
    updateOriginLabel() {
      $('#origin-label').textContent = this.origin ? `${this.t('startChosen')}: ${this.origin[0].toFixed(5)}, ${this.origin[1].toFixed(5)}` : this.t('originEmpty');
      if (this.originMarker) this.originMarker.setTooltipContent(this.t('startChosen'));
    }
    setOrigin(point) {
      if (!point.every(Number.isFinite) || point[0] < 20.5 || point[0] > 26.7 || point[1] < 88 || point[1] > 92.7) { this.setRouteStatus('invalidPoint', true); return false; }
      this.cancelRoute(); this.origin = point; this.setPicking(false);
      if (this.originMarker) this.map.removeLayer(this.originMarker);
      this.originMarker = L.marker(point, { title: this.t('startChosen'), icon: L.divIcon({ className: '', html: '<div class="origin-pin">A</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), zIndexOffset: 500 }).addTo(this.map).bindTooltip(this.t('startChosen'));
      $('#origin-lat').value = point[0].toFixed(6); $('#origin-lon').value = point[1].toFixed(6);
      this.updateOriginLabel(); this.onOriginChange(point); this.updateRouteButton();
      this.setRouteStatus('ready');
      if (this.autoRoute && this.destination) { this.autoRoute = false; this.calculateRoute(); }
      return true;
    }
    setFacilities(facilities) { this.facilities = facilities; this.populateDestinations(); }
    populateDestinations() {
      const options = [new Option(this.t('chooseDestination'), '')];
      const sorted = [...this.facilities].sort((a, b) => this.getName(a).localeCompare(this.getName(b)));
      if (this.destination && !sorted.some((f) => f.id === this.destination.id)) options.push(new Option(`${this.getName(this.destination)} (${this.t('previousArea')})`, this.destination.id));
      sorted.forEach((f) => options.push(new Option(this.getName(f), f.id)));
      $('#destination').replaceChildren(...options); $('#destination').value = this.destination?.id || '';
    }
    selectDestination(facility, routeNow = false) {
      this.autoRoute = false; this.cancelRoute(); this.destination = facility; this.populateDestinations(); this.updateRouteButton();
      if (routeNow) { if (this.origin) this.calculateRoute(); else { this.autoRoute = true; this.setPicking(true); } }
      else this.setRouteStatus(this.origin ? 'ready' : 'missingPoints');
    }
    updateRouteButton() { $('#get-route').disabled = !this.origin || !this.destination || this.routeBusy; }
    cancelRoute() {
      this.routeRequest?.abort(); this.routeVersion++; this.routeBusy = false; this.routeData = null; this.routeLayer.clearLayers(); $('#route-summary').hidden = true; $('#route-steps').replaceChildren(); this.updateRouteButton();
    }
    clearJourney() {
      this.autoRoute = false; this.cancelRoute(); this.origin = null; this.destination = null; this.setPicking(false);
      if (this.originMarker) { this.map.removeLayer(this.originMarker); this.originMarker = null; }
      $('#origin-lat').value = ''; $('#origin-lon').value = ''; this.updateOriginLabel(); this.populateDestinations(); this.onOriginChange(null); this.updateRouteButton(); this.setRouteStatus('');
    }
    formatDistance(metres) { return metres < 1000 ? `${Math.round(metres)} m` : `${(metres / 1000).toFixed(2)} km`; }
    formatDuration(seconds) { const minutes = Math.max(1, Math.round(seconds / 60)); return minutes >= 60 ? `${Math.floor(minutes / 60)} ${this.t('hour')} ${minutes % 60} ${this.t('minute')}` : `${minutes} ${this.t('minute')}`; }
    instruction(step) {
      const maneuver = step.maneuver || {}, road = step.name || this.t('unnamedRoad');
      if (maneuver.type === 'arrive') return this.t('arrive');
      if (maneuver.type === 'depart') return `${this.t('depart')} ${road}`;
      const modifier = String(maneuver.modifier || '').split(' ').map((part) => this.t(part)).join(' ');
      if (maneuver.modifier === 'uturn') return `${this.t('uturn')} ${this.t('onto')} ${road}`;
      if (/roundabout|rotary/.test(maneuver.type || '')) return `${this.t('roundabout')}${maneuver.exit ? ` · ${this.t('exit')} ${maneuver.exit}` : ''} · ${road}`;
      const action = maneuver.type === 'depart' ? 'depart' : maneuver.type === 'turn' ? 'turn' : maneuver.type === 'merge' ? 'merge' : maneuver.type === 'fork' ? 'fork' : /ramp/.test(maneuver.type || '') ? 'ramp' : 'continue';
      return `${this.t(action)} ${modifier} ${this.t('onto')} ${road}`.replace(/\s+/g, ' ').trim();
    }
    renderRouteSummary() {
      if (!this.routeData || !this.origin || !this.destination) return;
      $('#route-distance').textContent = this.formatDistance(this.routeData.distance);
      $('#route-duration').textContent = this.formatDuration(this.routeData.duration);
      $('#route-direct').textContent = this.formatDistance(this.map.distance(this.origin, [this.destination.lat, this.destination.lon]));
      const steps = this.routeData.legs.flatMap((leg) => Array.isArray(leg.steps) ? leg.steps : []);
      $('#route-steps').replaceChildren(...steps.map((step) => el('li', `${this.instruction(step)}${Number.isFinite(step.distance) && step.distance > 0 ? ` · ${this.formatDistance(step.distance)}` : ''}`)));
      $('#route-summary').hidden = false;
    }
    async calculateRoute() {
      if (!this.origin || !this.destination) { this.setRouteStatus('missingPoints', true); return; }
      this.cancelRoute(); const version = this.routeVersion;
      const origin = [...this.origin], destination = this.destination;
      this.routeRequest = new AbortController(); const controller = this.routeRequest;
      const timer = setTimeout(() => controller.abort(), 20000);
      this.routeBusy = true; this.updateRouteButton(); this.setRouteStatus('routeLoading');
      const coords = `${origin[1]},${origin[0]};${destination.lon},${destination.lat}`;
      try {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('routeFailed');
        const data = await response.json();
        if (version !== this.routeVersion) return;
        if (data.code === 'NoRoute' || data.code === 'NoSegment') throw new Error('noRoute');
        const route = data.routes?.[0];
        if (data.code !== 'Ok' || !route || !Number.isFinite(route.distance) || route.distance < 0 || !Number.isFinite(route.duration) || route.duration < 0 || route.geometry?.type !== 'LineString' || !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2 || !route.geometry.coordinates.every((p) => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90) || !Array.isArray(route.legs)) throw new Error('routeTooLong');
        this.routeData = route;
        const line = L.geoJSON(route.geometry, { pane: 'careRoute', style: { color: '#2474cb', weight: 6, opacity: 0.9 } }).addTo(this.routeLayer);
        L.marker([destination.lat, destination.lon], { title: this.getName(destination), icon: L.divIcon({ className: '', html: '<div class="route-destination-pin">B</div>', iconSize: [24, 24], iconAnchor: [12, 12] }), zIndexOffset: 500 }).addTo(this.routeLayer).bindTooltip(el('span', this.getName(destination)));
        this.map.fitBounds(line.getBounds().extend(origin).extend([destination.lat, destination.lon]), { padding: [40, 60], maxZoom: 16, animate: false });
        this.renderRouteSummary(); this.setRouteStatus('routeFound');
      } catch (error) {
        if (version !== this.routeVersion) return;
        this.setRouteStatus(['noRoute', 'routeTooLong'].includes(error.message) ? error.message : 'routeFailed', true);
      } finally { clearTimeout(timer); if (version === this.routeVersion) { this.routeBusy = false; this.updateRouteButton(); } }
    }
    async loadDetails() {
      this.layerRequest?.abort(); const version = ++this.layerVersion;
      const roads = this.map.hasLayer(this.roadLayer), buildings = this.map.hasLayer(this.buildingLayer);
      this.roadLayer.clearLayers(); this.buildingLayer.clearLayers();
      if (!roads && !buildings) { this.setLayerStatus('layersHelp'); return; }
      const b = this.map.getBounds();
      if (this.map.getZoom() < 15 || b.getNorth() - b.getSouth() > 0.08 || b.getEast() - b.getWest() > 0.12) { this.setLayerStatus('layerZoom'); return; }
      const bbox = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()].map((n) => n.toFixed(5)).join(',');
      const queries = [roads ? `way["highway"](${bbox});` : '', buildings ? `way["building"]["building"!="no"](${bbox});` : ''].join('');
      this.layerRequest = new AbortController(); const controller = this.layerRequest;
      const timer = setTimeout(() => controller.abort(), 30000); this.setLayerStatus('layerLoading');
      try {
        const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: `[out:json][timeout:25];(${queries});out geom;` }), signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('layers unavailable');
        const data = await response.json(); if (version !== this.layerVersion) return;
        if (data.remark || !Array.isArray(data.elements)) throw new Error('incomplete layers');
        let count = 0;
        for (const feature of data.elements.slice(0, 5000)) {
          if (!Array.isArray(feature.geometry) || !feature.tags) continue;
          const valid = feature.geometry.every((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon)); if (!valid) continue;
          const points = feature.geometry.map((p) => [p.lat, p.lon]);
          if (buildings && feature.tags.building && feature.tags.building !== 'no' && points.length >= 4) { L.polygon(points, { pane: 'openBuildings', color: '#866d52', weight: 1, fillColor: '#b7a58e', fillOpacity: 0.55 }).bindTooltip(el('span', feature.tags.name || this.t('buildings'))).addTo(this.buildingLayer); count++; }
          if (roads && feature.tags.highway && points.length >= 2) {
            const major = /^(motorway|trunk|primary|secondary)(_link)?$/.test(feature.tags.highway), path = /^(path|footway|steps|cycleway)$/.test(feature.tags.highway);
            L.polyline(points, { pane: 'openRoads', color: major ? '#cf8a34' : path ? '#9a5b68' : '#5e777e', weight: major ? 4 : 2, opacity: 0.85, dashArray: path ? '4 4' : null }).bindTooltip(el('span', feature.tags.name || feature.tags.highway)).addTo(this.roadLayer); count++;
          }
        }
        const current = this.map.getBounds();
        const currentBbox = [current.getSouth(), current.getWest(), current.getNorth(), current.getEast()].map((n) => n.toFixed(5)).join(',');
        this.setLayerStatus(currentBbox !== bbox ? 'layerMoved' : data.elements.length > 5000 ? 'layerLimit' : count ? 'layerLoaded' : 'layerEmpty');
      } catch { if (version === this.layerVersion) this.setLayerStatus('layerFailed', true); }
      finally { clearTimeout(timer); }
    }
    translate() {
      this.makeLayerControl(); this.populateDestinations(); this.updateOriginLabel();
      this.setLayerStatus(this.layerStatus, this.layerError); this.setRouteStatus(this.routeStatus, this.routeError); this.renderRouteSummary();
    }
  }
  window.CareMapTools = CareMapTools;
})();
