/* Shared Leaflet choropleth for the Distance page.
   Polygons: BBS/OCHA ROAP via geoBoundaries (CC BY 3.0 IGO). Unions load as
   TopoJSON and draw on a canvas. Values arrive per pcode; bins are quantiles
   of the non-missing values. Text follows the page language. */
'use strict';
(() => {
  const RAMPS = {
    green: ['#e8f3ec', '#c3e2d0', '#92caac', '#5bab84', '#2d8a63', '#0c6a49'],
    amber: ['#fdf1e0', '#f6d9ab', '#edbb74', '#df9743', '#c56f22', '#9d4e12']
  };
  const MISSING = '#e6e4dc';
  // Optional reference basemaps under the polygons. Fills turn semi-transparent
  // when one is shown so roads, rivers, towns and relief stay readable.
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
  const BASEMAP_KEY = 'shasthopath-atlas-basemap';
  const storedBasemap = () => { try { return localStorage.getItem(BASEMAP_KEY); } catch (_) { return null; } };
  const bn = () => document.documentElement.lang === 'bn';
  const fmt = (value, digits = 0) => Number.isFinite(value)
    ? value.toLocaleString(bn() ? 'bn-BD' : 'en-GB', { maximumFractionDigits: digits }) : (bn() ? 'তথ্য নেই' : 'no data');

  function quantileBins(values, count) {
    const sorted = [...values].sort((a, b) => a - b);
    const edges = [];
    for (let i = 1; i < count && sorted.length; i++) {
      const position = (sorted.length - 1) * i / count, low = Math.floor(position);
      const edge = sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (position - low);
      if (!edges.length || edge > edges[edges.length - 1]) edges.push(edge);
    }
    return edges;
  }

  const cache = new Map();
  function loadGeometry(source) {
    if (!cache.has(source.url)) {
      cache.set(source.url, fetch(source.url, { cache: 'no-cache' }).then((response) => {
        if (!response.ok) throw new Error(`boundary fetch failed: ${source.url}`);
        return response.json();
      }).then((data) => (source.topology ? window.topojson.feature(data, data.objects[source.topology]) : data)));
    }
    return cache.get(source.url);
  }

  function create(container, options = {}) {
    const map = L.map(container, { scrollWheelZoom: false, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution('BBS/OCHA · <a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (CC BY 3.0 IGO)');
    const canvas = L.canvas({ padding: 0.3 });
    const state = { layer: null, metric: null, selected: null, legend: null, token: 0, thin: false, basemap: null, tiles: null };
    const basemapControl = L.control({ position: 'topright' });
    basemapControl.onAdd = () => {
      const box = L.DomUtil.create('label', 'choropleth-basemap');
      box.innerHTML = '<span></span><select></select>';
      L.DomEvent.disableClickPropagation(box);
      L.DomEvent.disableScrollPropagation(box);
      box.querySelector('select').addEventListener('change', (event) => setBasemap(event.target.value));
      state.basemapBox = box;
      return box;
    };
    basemapControl.addTo(map);
    function basemapLabels() {
      const box = state.basemapBox, select = box.querySelector('select');
      box.querySelector('span').textContent = bn() ? 'বেসম্যাপ' : 'Basemap';
      select.innerHTML = BASEMAPS.map((b) => `<option value="${b.id}">${bn() ? b.bn : b.en}</option>`).join('');
      select.value = state.basemap;
    }
    function setBasemap(id) {
      const chosen = BASEMAPS.find((b) => b.id === id) || BASEMAPS[0];
      if (state.tiles) map.removeLayer(state.tiles);
      state.tiles = chosen.url ? L.tileLayer(chosen.url, chosen.options).addTo(map) : null;
      state.basemap = chosen.id;
      try { localStorage.setItem(BASEMAP_KEY, chosen.id); } catch (_) { /* storage blocked */ }
      basemapLabels();
      if (state.layer) state.layer.setStyle(style);
    }
    setBasemap(options.basemap || storedBasemap() || 'light');
    document.addEventListener('site-language', basemapLabels);
    const legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => { state.legend = L.DomUtil.create('div', 'choropleth-legend'); return state.legend; };
    legendControl.addTo(map);

    function fill(pcode) {
      const metric = state.metric;
      const value = metric ? metric.values.get(pcode) : NaN;
      if (!Number.isFinite(value)) return MISSING;
      let bin = 0;
      while (bin < metric.edges.length && value > metric.edges[bin]) bin++;
      return metric.ramp[Math.min(bin, metric.ramp.length - 1)];
    }
    function style(feature) {
      const selected = state.selected === feature.properties.pcode;
      return { fillColor: fill(feature.properties.pcode), fillOpacity: state.tiles ? 0.72 : 0.92, color: selected ? '#153a30' : '#ffffff',
               weight: selected ? 2.4 : state.thin ? 0.25 : 0.7, opacity: 1 };
    }
    function legend() {
      const m = state.metric;
      if (!m || !state.legend) return;
      const parts = [`<strong>${m.legendTitle}</strong>`];
      let low = m.min;
      m.ramp.slice(0, m.edges.length + 1).forEach((colour, i) => {
        const high = i < m.edges.length ? m.edges[i] : m.max;
        parts.push(`<span><i style="background:${colour}"></i>${fmt(low, m.digits)} – ${fmt(high, m.digits)}</span>`);
        low = high;
      });
      parts.push(`<span><i style="background:${MISSING}"></i>${bn() ? 'তথ্য নেই / খুব ছোট এলাকা' : 'no data / too small for the grid'}</span>`);
      state.legend.innerHTML = parts.join('');
    }
    function tooltip(feature) {
      const m = state.metric, p = feature.properties;
      const label = options.label ? options.label(p) : p.name;
      return `<strong>${label}</strong>` + (m ? `<br>${m.legendTitle}: <strong>${fmt(m.values.get(p.pcode), m.digits)}</strong>` : '')
        + (m && m.extra ? m.extra(p.pcode) : '');
    }
    function restyle() {
      if (!state.layer) return;
      state.layer.setStyle(style);
      legend();
    }

    async function setLayer(source) {
      const token = ++state.token;
      const collection = await loadGeometry(source);
      if (token !== state.token) return null;
      if (state.layer) map.removeLayer(state.layer);
      state.selected = null;
      state.thin = collection.features.length > 1000;
      state.layer = L.geoJSON(collection, {
        renderer: state.thin ? canvas : undefined,
        style,
        onEachFeature: (feature, polygon) => {
          polygon.bindTooltip(() => tooltip(feature), { sticky: true, direction: 'top', opacity: 0.96 });
          polygon.on('mouseover', () => polygon.setStyle({ weight: 2, color: '#153a30' }));
          polygon.on('mouseout', () => polygon.setStyle(style(feature)));
          polygon.on('click', () => select(feature.properties.pcode));
        }
      }).addTo(map);
      fit();
      return collection;
    }
    function select(pcode, zoom = false) {
      state.selected = pcode;
      if (!state.layer) return;
      state.layer.setStyle(style);
      if (zoom) state.layer.eachLayer((polygon) => {
        if (polygon.feature.properties.pcode === pcode) map.fitBounds(polygon.getBounds(), { maxZoom: 10, padding: [30, 30] });
      });
      if (options.onSelect) options.onSelect(pcode);
    }
    function setMetric(metric) {
      const numeric = [...metric.values.values()].filter(Number.isFinite);
      state.metric = { digits: 0, ...metric, edges: quantileBins(numeric, 6), ramp: RAMPS[metric.ramp || 'green'],
                       min: numeric.length ? Math.min(...numeric) : 0, max: numeric.length ? Math.max(...numeric) : 0 };
      restyle();
    }
    function fit() {
      map.invalidateSize();
      if (state.layer) map.fitBounds(state.layer.getBounds(), { padding: [8, 8] });
    }
    return { map, setLayer, setMetric, select, fit, refresh: restyle, setBasemap, basemap: () => state.basemap,
             layerCount: () => (state.layer ? state.layer.getLayers().length : 0) };
  }

  window.AtlasChoropleth = { create, RAMPS, BASEMAPS: BASEMAPS.map((b) => b.id) };
})();
