/* Shared Leaflet choropleth for the Distance page.
   Polygons: BBS/OCHA ROAP via geoBoundaries (CC BY 3.0 IGO). Unions load as
   TopoJSON and draw on a canvas. Values arrive per pcode; bins are quantiles
   of the non-missing values. Text follows the page language. */
'use strict';
(() => {
  const RAMPS = {
    green: ['#e8f3ec', '#c3e2d0', '#92caac', '#5bab84', '#2d8a63', '#0c6a49'],
    amber: ['#fdf1e0', '#f6d9ab', '#edbb74', '#df9743', '#c56f22', '#9d4e12'],
    blue: ['#eaf2fb', '#c6dcf2', '#93bde5', '#5a98d3', '#2f74b5', '#174f88']
  };
  const dark = () => document.documentElement.dataset.theme === 'dark';
  const missing = () => (dark() ? '#3a4642' : '#e6e4dc');
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
    const state = { layer: null, metric: null, selected: null, legend: null, token: 0, thin: false };
    // Reference basemap (shared with the other maps); fills thin out over tiles.
    const layers = window.MapLayers.addLayerControl(map, { storageKey: options.storageKey || 'shasthopath-atlas-basemap', basemap: options.basemap,
      boundaries: Boolean(options.boundaries), defaultBoundaries: options.defaultBoundaries, boundariesAbove: true, boundaryAttribution: false,
      onBasemap: () => { if (state.layer) state.layer.setStyle(style); } });
    const legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => { state.legend = L.DomUtil.create('div', 'choropleth-legend'); return state.legend; };
    legendControl.addTo(map);
    document.addEventListener('site-theme', () => restyle());

    function fill(pcode) {
      const metric = state.metric;
      if (metric && metric.categories) {
        const category = metric.categories.find((c) => c.key === metric.values.get(pcode));
        return category ? category.color : missing();
      }
      const value = metric ? metric.values.get(pcode) : NaN;
      if (!Number.isFinite(value)) return missing();
      let bin = 0;
      while (bin < metric.edges.length && value > metric.edges[bin]) bin++;
      return metric.ramp[Math.min(bin, metric.ramp.length - 1)];
    }
    function style(feature) {
      const selected = state.selected === feature.properties.pcode;
      return { fillColor: fill(feature.properties.pcode), fillOpacity: state.metric?.fillOpacity ?? (layers.hasTiles() ? 0.72 : 0.92), color: selected ? (dark() ? '#f2f8f5' : '#153a30') : (dark() ? '#0f1a17' : '#ffffff'),
               weight: selected ? 2.4 : state.thin ? 0.25 : 0.7, opacity: 1 };
    }
    function legend() {
      const m = state.metric;
      if (!m || !state.legend) return;
      const parts = [`<strong>${m.legendTitle}</strong>`];
      if (m.categories) {
        m.categories.forEach((c) => parts.push(`<span><i style="background:${c.color}"></i>${c.label}</span>`));
        state.legend.innerHTML = parts.join('');
        return;
      }
      let low = m.min;
      m.ramp.slice(0, m.edges.length + 1).forEach((colour, i) => {
        const high = i < m.edges.length ? m.edges[i] : m.max;
        parts.push(`<span><i style="background:${colour}"></i>${fmt(low, m.digits)} – ${fmt(high, m.digits)}</span>`);
        low = high;
      });
      parts.push(`<span><i style="background:${missing()}"></i>${bn() ? 'তথ্য নেই / খুব ছোট এলাকা' : 'no data / too small for the grid'}</span>`);
      state.legend.innerHTML = parts.join('');
    }
    function tooltip(feature) {
      const m = state.metric, p = feature.properties;
      const label = options.label ? options.label(p) : p.name;
      const shown = m && m.categories ? ((m.categories.find((c) => c.key === m.values.get(p.pcode)) || {}).label || fmt(NaN))
        : m ? fmt(m.values.get(p.pcode), m.digits) : '';
      return `<strong>${label}</strong>` + (m ? `<br>${m.legendTitle}: <strong>${shown}</strong>` : '')
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
          polygon.on('mouseover', () => polygon.setStyle({ weight: 2, color: dark() ? '#f2f8f5' : '#153a30' }));
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
      if (metric.categories) { state.metric = { ...metric }; restyle(); return; }
      const numeric = [...metric.values.values()].filter(Number.isFinite);
      state.metric = { digits: 0, ...metric, edges: quantileBins(numeric, 6), ramp: RAMPS[metric.ramp || 'green'],
                       min: numeric.length ? Math.min(...numeric) : 0, max: numeric.length ? Math.max(...numeric) : 0 };
      restyle();
    }
    function fit() {
      map.invalidateSize();
      if (state.layer) map.fitBounds(state.layer.getBounds(), { padding: [8, 8] });
    }
    return { map, setLayer, setMetric, select, fit, refresh: restyle, setBasemap: layers.setBasemap, basemap: layers.basemap,
             layerCount: () => (state.layer ? state.layer.getLayers().length : 0) };
  }

  window.AtlasChoropleth = { create, RAMPS };
})();
