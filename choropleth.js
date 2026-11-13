/* Shared Leaflet choropleth for the atlas page.
   Polygons: BBS/OCHA ROAP boundaries via geoBoundaries (CC BY 3.0 IGO).
   Values arrive per pcode; bins are quantiles of the non-missing values. */
'use strict';
(() => {
  const RAMPS = {
    green: ['#e8f3ec', '#c3e2d0', '#92caac', '#5bab84', '#2d8a63', '#0c6a49'],
    amber: ['#fdf1e0', '#f6d9ab', '#edbb74', '#df9743', '#c56f22', '#9d4e12']
  };
  const MISSING = '#efeee7';
  const fmt = (value, digits = 0) => Number.isFinite(value)
    ? value.toLocaleString('en-GB', { maximumFractionDigits: digits }) : 'no data';

  function quantileBins(values, count) {
    const sorted = [...values].sort((a, b) => a - b);
    if (!sorted.length) return [];
    const edges = [];
    for (let i = 1; i < count; i++) {
      const position = (sorted.length - 1) * i / count;
      const low = Math.floor(position);
      const edge = sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (position - low);
      if (!edges.length || edge > edges[edges.length - 1]) edges.push(edge);
    }
    return edges;
  }

  function create(container, options) {
    const map = L.map(container, { scrollWheelZoom: false, attributionControl: true, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    map.attributionControl.addAttribution(
      'Boundaries: BBS/OCHA via <a href="https://www.geoboundaries.org" target="_blank" rel="noopener noreferrer">geoBoundaries</a> (CC BY 3.0 IGO)');
    const state = { layer: null, features: null, selected: null, legend: null, metric: null };

    const legendControl = L.control({ position: 'bottomright' });
    legendControl.onAdd = () => { state.legend = L.DomUtil.create('div', 'choropleth-legend'); return state.legend; };
    legendControl.addTo(map);

    function style(feature) {
      const metric = state.metric;
      if (!metric) return { fillColor: MISSING, fillOpacity: 0.92, color: '#ffffff', weight: 0.7, opacity: 1 };
      const value = metric.values.get(feature.properties.pcode);
      let fill = MISSING;
      if (Number.isFinite(value)) {
        let bin = 0;
        while (bin < metric.edges.length && value > metric.edges[bin]) bin++;
        fill = metric.ramp[Math.min(bin, metric.ramp.length - 1)];
      }
      const selected = state.selected === feature.properties.pcode;
      return { fillColor: fill, fillOpacity: 0.92, color: selected ? '#153a30' : '#ffffff',
               weight: selected ? 2.2 : 0.7, opacity: 1 };
    }

    function legend() {
      const metric = state.metric;
      const parts = [`<strong>${metric.legendTitle}</strong>`];
      let low = metric.min;
      metric.ramp.forEach((colour, index) => {
        const high = index < metric.edges.length ? metric.edges[index] : metric.max;
        parts.push(`<span><i style="background:${colour}"></i>${fmt(low, metric.digits)} – ${fmt(high, metric.digits)}</span>`);
        low = high;
      });
      parts.push(`<span><i style="background:${MISSING}"></i>no data</span>`);
      state.legend.innerHTML = parts.join('');
    }

    function setMetric(metric) {
      const numeric = [...metric.values.values()].filter(Number.isFinite);
      const edges = quantileBins(numeric, 6);
      state.metric = {
        digits: 0, ...metric, edges,
        ramp: RAMPS[metric.ramp || 'green'],
        min: numeric.length ? Math.min(...numeric) : 0,
        max: numeric.length ? Math.max(...numeric) : 0
      };
      if (state.layer) { state.layer.setStyle(style); legend(); refreshTooltips(); }
    }

    function refreshTooltips() {
      state.layer.eachLayer((polygon) => {
        const properties = polygon.feature.properties;
        const value = state.metric.values.get(properties.pcode);
        polygon.setTooltipContent(
          `<strong>${properties.name}</strong>${properties.district_name ? ' · ' + properties.district_name : ''}` +
          `<br>${state.metric.legendTitle}: <strong>${fmt(value, state.metric.digits)}</strong>` +
          (state.metric.tooltipExtra ? '<br>' + state.metric.tooltipExtra(properties.pcode) : ''));
      });
    }

    const ready = fetch(options.geojson).then((response) => {
      if (!response.ok) throw new Error('boundary fetch failed');
      return response.json();
    }).then((collection) => {
      state.features = collection;
      state.layer = L.geoJSON(collection, {
        style,
        onEachFeature: (feature, polygon) => {
          polygon.bindTooltip('', { sticky: true, direction: 'top', opacity: 0.96 });
          polygon.on('mouseover', () => polygon.setStyle({ weight: 2, color: '#153a30' }));
          polygon.on('mouseout', () => { if (state.selected !== feature.properties.pcode) state.layer.resetStyle(polygon); });
          polygon.on('click', () => {
            state.selected = feature.properties.pcode;
            state.layer.setStyle(style);
            if (options.onSelect) options.onSelect(feature.properties);
          });
        }
      }).addTo(map);
      map.fitBounds(state.layer.getBounds(), { padding: [8, 8] });
      if (state.metric) { state.layer.setStyle(style); legend(); refreshTooltips(); }
      return state;
    });

    return {
      ready,
      setMetric: (metric) => ready.then(() => setMetric(metric)),
      clearSelection: () => { state.selected = null; if (state.layer) state.layer.setStyle(style); },
      fit: () => { map.invalidateSize(); if (state.layer) map.fitBounds(state.layer.getBounds(), { padding: [8, 8] }); },
      map
    };
  }

  window.AtlasChoropleth = { create, RAMPS };
})();
