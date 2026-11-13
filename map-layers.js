/* Shared reference layers for the research maps: basemap tiles and
   administrative boundary outlines (BBS/OCHA via geoBoundaries, CC BY 3.0 IGO).
   addLayerControl(map, { boundaries: true }) adds one control with a basemap
   menu and, optionally, boundary check boxes. Labels follow the page language. */
'use strict';
(() => {
  const OSM = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors';
  const BASEMAPS = [
    { id: 'light', en: 'Light (grey)', bn: 'হালকা (ধূসর)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: OSM, className: 'light-basemap-tiles' } },
    { id: 'street', en: 'Streets', bn: 'রাস্তা', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 19, attribution: OSM } },
    { id: 'terrain', en: 'Terrain', bn: 'ভূপ্রকৃতি', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      options: { maxZoom: 17, subdomains: 'abc', attribution: `${OSM}, SRTM · style &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (CC-BY-SA)` } },
    { id: 'none', en: 'No basemap', bn: 'বেসম্যাপ নেই', url: null }
  ];
  // Outlines only, drawn below the data layers. Unions (≈4,500) load on demand as TopoJSON on a canvas.
  const BOUNDARIES = [
    { id: 'division', en: 'Divisions', bn: 'বিভাগ', url: './data/boundaries/bangladesh-divisions.geojson', style: { color: '#153a30', weight: 2.2 } },
    { id: 'district', en: 'Districts', bn: 'জেলা', url: './data/boundaries/bangladesh-districts.geojson', style: { color: '#2f5d50', weight: 1.2 } },
    { id: 'upazila', en: 'Upazilas', bn: 'উপজেলা', url: './data/boundaries/bangladesh-upazilas.geojson', style: { color: '#55786d', weight: 0.7 } },
    { id: 'union', en: 'Unions', bn: 'ইউনিয়ন', url: './data/boundaries/bangladesh-unions.topojson', topology: 'unions', style: { color: '#7d968e', weight: 0.4 } }
  ];
  const BOUNDARY_ATTRIBUTION = 'Boundaries: BBS/OCHA · <a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (CC BY 3.0 IGO)';
  const bn = () => document.documentElement.lang === 'bn';
  const read = (key) => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch (_) { /* storage blocked */ } };

  const geometry = new Map();
  function loadBoundary(def) {
    if (!geometry.has(def.url)) {
      geometry.set(def.url, fetch(def.url, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) throw new Error(`boundary fetch failed: ${def.url}`);
        return response.json();
      }).then((data) => (def.topology ? window.topojson.feature(data, data.objects[def.topology]) : data)));
    }
    return geometry.get(def.url);
  }

  function addLayerControl(map, options = {}) {
    const key = options.storageKey || 'shasthopath-basemap';
    const state = { basemap: null, tiles: null, on: new Set(), layers: new Map() };
    let canvas = null, svg = null;
    if (options.boundaries) {
      map.createPane('boundaries').style.zIndex = 350; // above tiles (200), below data (400)
      map.getPane('boundaries').style.pointerEvents = 'none';
      map.attributionControl.addAttribution(BOUNDARY_ATTRIBUTION);
      canvas = L.canvas({ pane: 'boundaries', padding: 0.3 });
      svg = L.svg({ pane: 'boundaries', padding: 0.3 });
    }
    const control = L.control({ position: options.position || 'topright' });
    let box;
    control.onAdd = () => {
      box = L.DomUtil.create('div', 'map-layer-control');
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      box.addEventListener('change', (event) => {
        const target = event.target;
        if (target.name === 'basemap') setBasemap(target.value);
        else if (target.dataset.boundary) setBoundary(target.dataset.boundary, target.checked);
      });
      return box;
    };
    control.addTo(map);

    function labels() {
      const options_ = BASEMAPS.map((b) => `<option value="${b.id}"${b.id === state.basemap ? ' selected' : ''}>${bn() ? b.bn : b.en}</option>`).join('');
      let html = `<label class="map-layer-row"><span>${bn() ? 'বেসম্যাপ' : 'Basemap'}</span><select name="basemap">${options_}</select></label>`;
      if (options.boundaries) {
        html += `<fieldset><legend>${bn() ? 'প্রশাসনিক সীমানা' : 'Boundaries'}</legend>` + BOUNDARIES.map((b) =>
          `<label><input type="checkbox" data-boundary="${b.id}"${state.on.has(b.id) ? ' checked' : ''}> ${bn() ? b.bn : b.en}</label>`).join('') + '</fieldset>';
      }
      box.innerHTML = html;
    }
    function setBasemap(id) {
      const chosen = BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
      if (state.tiles) map.removeLayer(state.tiles);
      state.tiles = chosen.url ? L.tileLayer(chosen.url, chosen.options).addTo(map) : null;
      state.basemap = chosen.id;
      write(key, chosen.id);
      labels();
      if (options.onBasemap) options.onBasemap(chosen.id, Boolean(state.tiles));
    }
    async function setBoundary(id, on) {
      const def = BOUNDARIES.find((b) => b.id === id);
      if (!def) return;
      if (!on) {
        state.on.delete(id);
        if (state.layers.has(id)) map.removeLayer(state.layers.get(id));
        return;
      }
      state.on.add(id);
      if (!state.layers.has(id)) {
        const data = await loadBoundary(def);
        state.layers.set(id, L.geoJSON(data, { pane: 'boundaries', renderer: def.topology ? canvas : svg, interactive: false,
                                               style: { ...def.style, fill: false, opacity: 0.9 } }));
      }
      if (state.on.has(id)) state.layers.get(id).addTo(map);
    }

    state.basemap = read(key) || options.basemap || 'light';
    (options.boundaries ? options.defaultBoundaries || ['district'] : []).forEach((id) => state.on.add(id));
    setBasemap(state.basemap);
    state.on.forEach((id) => setBoundary(id, true));
    document.addEventListener('site-language', labels);
    return { setBasemap, setBoundary, basemap: () => state.basemap, hasTiles: () => Boolean(state.tiles), boundaries: () => [...state.on] };
  }

  window.MapLayers = { addLayerControl, BASEMAPS: BASEMAPS.map((b) => b.id), BOUNDARIES: BOUNDARIES.map((b) => b.id) };
})();
