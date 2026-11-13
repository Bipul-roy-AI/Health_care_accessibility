/* Dependency-free SVG figures. Values are supplied by each page's source data. */
'use strict';
(() => {
  const ns = 'http://www.w3.org/2000/svg', states = new WeakMap();
  const fmt = (n, digits = 0) => n.toLocaleString('en-GB', { maximumFractionDigits: digits });
  function element(tag, attributes = {}, text) {
    const node = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  const nice = (value) => { if (!(value > 0)) return 1; const power = 10 ** Math.floor(Math.log10(value)), scaled = value / power; return [1, 2, 5, 10].find((v) => v >= scaled) * power; };
  function base(width, height, title) {
    const svg = element('svg', { xmlns: ns, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': title, class: 'data-chart', style: 'font-family:system-ui,sans-serif;background:white;color:#21473f' });
    svg.append(element('title', {}, title));
    return svg;
  }
  function text(svg, value, x, y, attributes = {}) {
    svg.append(element('text', { x, y, fill: '#38594f', 'font-size': 12, ...attributes }, value));
  }
  function download(svg, title) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'chart-download'; button.textContent = 'Download figure · SVG ↓'; button.setAttribute('aria-label', `Download ${title} as SVG`);
    button.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100) + '.svg'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }); return button;
  }
  function draw(target, state) {
    const { kind, rows, options } = state, width = Math.max(280, Math.round(target.clientWidth || 600));
    const title = options.title || 'Data comparison';
    if (!rows.length) { const p = document.createElement('p'); p.textContent = options.emptyMessage || 'No observations available for this selection.'; target.replaceChildren(p); return; }
    const wrap = (value, limit) => {
      const lines = []; let line = '';
      for (const word of value.split(' ')) { if (line && (line + ' ' + word).length > limit) { lines.push(line); line = ''; } line += (line ? ' ' : '') + word; }
      if (line) lines.push(line); return lines;
    };
    const headings = wrap(title, Math.max(22, Math.floor((width - 32) / 7)));
    const source = wrap(options.source || 'Source: accompanying DGHS/BBS tables; see page for dates and definitions.', Math.max(30, Math.floor((width - 32) / 5.5)));
    const headerHeight = headings.length * 17 + 14;
    let root, svg;
    function canvas(height) {
      root = base(width, height + headerHeight + source.length * 14 + 10, title);
      headings.forEach((line, i) => text(root, line, 16, 17 + i * 17, { 'font-weight': 600, 'font-size': 12 }));
      source.forEach((line, i) => text(root, line, 16, height + headerHeight + 12 + i * 14, { 'font-size': 10, fill: '#627a70' }));
      const content = element('g', { transform: `translate(0 ${headerHeight})` }); root.append(content); return content;
    }
    if (kind === 'bars') {
      const maximum = options.maximum ?? nice(Math.max(...rows.map((r) => r.value), 0));
      const height = rows.length * 57 + 70 + (options.stacked ? 24 : 0), left = 16, right = width - 22, plot = right - left;
      svg = canvas(height);
      const bottom = rows.length * 57 + 8;
      for (let i = 0; i <= 4; i++) {
        const x = left + plot * i / 4, value = maximum * i / 4;
        svg.append(element('line', { x1: x, x2: x, y1: 26, y2: bottom, stroke: '#e1e9e3', 'stroke-width': 1 }));
        text(svg, fmt(value, value < 1 ? 3 : options.digits || (maximum < 10 ? 2 : 0)), x, bottom + 19, { 'text-anchor': i === 0 ? 'start' : i === 4 ? 'end' : 'middle', 'font-size': 11 });
      }
      rows.forEach((row, i) => {
        const y = i * 57 + 18, value = row.display ?? fmt(row.value, options.digits || 0);
        const cap = Math.max(8, Math.floor((width - String(value).length * 7 - 36) / 7));
        const label = row.label.length > cap ? row.label.slice(0, cap - 1) + '…' : row.label;
        text(svg, label, left, y, { 'font-weight': row.selected ? 700 : 400, 'text-decoration': row.selected ? 'underline' : 'none' });
        text(svg, value, right, y, { 'text-anchor': 'end', 'font-weight': 600 });
        const group = element('g', { class: 'chart-observation', 'data-label': row.label, 'data-value': row.value });
        group.append(element('title', {}, `${row.label}: ${value}${row.detail ? '; ' + row.detail : ''}`));
        group.append(element('rect', { x: left, y: y + 9, width: plot, height: 17, rx: 2, fill: options.stacked ? '#e8c8a5' : '#f0f4f0' }));
        group.append(element('rect', { x: left, y: y + 9, width: maximum > 0 ? Math.max(0, Math.min(1, row.value / maximum)) * plot : 0, height: 17, rx: 2, fill: row.muted ? '#83a49b' : '#176b58' }));
        svg.append(group);
      });
      wrap(options.axisLabel || 'Value', Math.max(25, Math.floor((width - 30) / 7))).forEach((line, i) => text(svg, line, width / 2, bottom + 41 + i * 14, { 'text-anchor': 'middle', 'font-size': 12 }));
      if (options.stacked) {
        svg.append(element('rect', { x: left, y: height - 22, width: 10, height: 10, fill: '#176b58' })); text(svg, 'Eligible coordinates', left + 16, height - 13, { 'font-size': 10 });
        svg.append(element('rect', { x: width / 2, y: height - 22, width: 10, height: 10, fill: '#e8c8a5' })); text(svg, 'Unavailable / withheld', width / 2 + 16, height - 13, { 'font-size': 10 });
      }
    } else if (kind === 'lines') {
      const height = 340, left = 50, right = width - 20, top = 26, bottom = height - 56;
      const xmin = options.xmin ?? 0;
      const xmax = options.xmax ?? nice(Math.max(...rows.flatMap((r) => r.points.map((p) => p[0])), 0));
      const xLabel = options.xFormat || ((value) => fmt(value, xmax - xmin < 10 ? 1 : 0));
      const ymax = options.ymax ?? nice(Math.max(...rows.flatMap((r) => r.points.map((p) => p[1])), 0));
      svg = canvas(height);
      const xTicks = options.xTicks || 4;
      for (let i = 0; i <= xTicks; i++) {
        const x = left + (right - left) * i / xTicks;
        svg.append(element('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: '#e1e9e3' }));
        text(svg, xLabel(xmin + (xmax - xmin) * i / xTicks), x, bottom + 17, { 'text-anchor': i === xTicks ? 'end' : i === 0 ? 'start' : 'middle', 'font-size': 10 });
      }
      for (let i = 0; i <= 4; i++) {
        const y = bottom - (bottom - top) * i / 4;
        svg.append(element('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#e1e9e3' }));
        text(svg, fmt(ymax * i / 4, ymax < 10 ? 1 : 0), left - 6, y + 4, { 'text-anchor': 'end', 'font-size': 10 });
      }
      const px = (x) => left + (x - xmin) / (xmax - xmin) * (right - left), py = (y) => bottom - y / ymax * (bottom - top);
      const ends = [];
      rows.forEach((row) => {
        const colour = row.color || '#176b58';
        const path = row.points.map((p, i) => (i ? 'L' : 'M') + px(p[0]).toFixed(1) + ' ' + py(p[1]).toFixed(1)).join('');
        svg.append(element('path', { d: path, fill: 'none', stroke: colour, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        const last = row.points[row.points.length - 1];
        ends.push({ label: row.label, colour, y: py(last[1]) - 6 });
      });
      // Direct end labels: spread vertically so they never overlap (>=13px apart).
      ends.forEach((end) => { end.y = Math.max(top + 10, end.y); });
      ends.sort((a, b) => a.y - b.y);
      for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 13);
      const overflow = ends.length ? ends[ends.length - 1].y - (bottom - 4) : 0;
      if (overflow > 0) ends.forEach((end) => { end.y -= overflow; });
      ends.forEach((end) => text(svg, end.label, right - 2, end.y, { 'text-anchor': 'end', 'font-size': 11, 'font-weight': 600, fill: end.colour, style: 'paint-order:stroke;stroke:#fff;stroke-width:3px' }));
      const legend = element('g', {});
      rows.forEach((row, index) => {
        const x = left + index * Math.max(120, (right - left) / rows.length);
        legend.append(element('rect', { x, y: height - 14, width: 10, height: 3, fill: row.color || '#176b58' }));
        text(svg, row.label, x + 15, height - 9, { 'font-size': 10 });
      });
      svg.append(legend);
      const hover = element('g', { style: 'display:none', 'pointer-events': 'none' });
      const hoverLine = element('line', { y1: top, y2: bottom, stroke: '#8aa79b', 'stroke-dasharray': '3 3' });
      const hoverText = element('text', { 'font-size': 11, fill: '#21473f', style: 'paint-order:stroke;stroke:#fff;stroke-width:3px' });
      const hoverDots = rows.map((row) => element('circle', { r: 3.5, fill: row.color || '#176b58', stroke: '#fff', 'stroke-width': 1.5 }));
      hover.append(hoverLine, ...hoverDots, hoverText);
      svg.append(hover);
      root.addEventListener('pointermove', (event) => {
        const box = root.getBoundingClientRect();
        const svgX = (event.clientX - box.left) * (width / box.width);
        const xValue = Math.max(xmin, Math.min(xmax, xmin + (svgX - left) / (right - left) * (xmax - xmin)));
        hover.style.display = '';
        const sx = px(xValue);
        hoverLine.setAttribute('x1', sx); hoverLine.setAttribute('x2', sx);
        const readings = rows.map((row, index) => {
          let best = row.points[0];
          for (const point of row.points) if (Math.abs(point[0] - xValue) < Math.abs(best[0] - xValue)) best = point;
          hoverDots[index].setAttribute('cx', px(best[0])); hoverDots[index].setAttribute('cy', py(best[1]));
          return `${row.label} ${fmt(best[1], options.digits ?? 1)}`;
        });
        hoverText.textContent = `${xLabel(rows[0] ? closestX(rows[0].points, xValue) : xValue)} ${options.xUnit || ''} · ${readings.join(' · ')}`;
        hoverText.setAttribute('x', Math.min(sx + 8, width - 8)); hoverText.setAttribute('y', top + 12);
        hoverText.setAttribute('text-anchor', sx > width * 0.55 ? 'end' : 'start');
        if (sx > width * 0.55) hoverText.setAttribute('x', sx - 8);
      });
      root.addEventListener('pointerleave', () => { hover.style.display = 'none'; });
      function closestX(points, value) { let best = points[0]; for (const point of points) if (Math.abs(point[0] - value) < Math.abs(best[0] - value)) best = point; return best[0]; }
      wrap(options.axisLabel || 'Value', Math.max(25, Math.floor((width - 30) / 7))).forEach((line, i) => text(svg, line, width / 2, bottom + 34 + i * 13, { 'text-anchor': 'middle', 'font-size': 11 }));
      text(svg, options.yLabel || '', 0, 0, { transform: `translate(12 ${(top + bottom) / 2}) rotate(-90)`, 'text-anchor': 'middle', 'font-size': 11 });
    } else {
      const height = 330, left = 47, right = width - 22, top = 23, bottom = height - 52;
      const xmax = nice(Math.max(...rows.map((r) => r.x), 0)); svg = canvas(height);
      for (let i = 0; i <= 4; i++) {
        const x = left + (right - left) * i / 4, y = bottom - (bottom - top) * i / 4;
        svg.append(element('line', { x1: x, x2: x, y1: top, y2: bottom, stroke: '#e1e9e3' }), element('line', { x1: left, x2: right, y1: y, y2: y, stroke: '#e1e9e3' }));
        text(svg, fmt(xmax * i / 4), x, bottom + 18, { 'text-anchor': i === 4 ? 'end' : 'middle', 'font-size': 10 });
        text(svg, String(i * 25), left - 7, y + 4, { 'text-anchor': 'end', 'font-size': 10 });
      }
      for (const row of rows) {
        const circle = element('circle', { cx: left + row.x / xmax * (right - left), cy: bottom - row.y / 100 * (bottom - top), r: 4, fill: '#176b58', 'fill-opacity': .55, 'data-label': row.label, 'data-x': row.x, 'data-y': row.y });
        circle.append(element('title', {}, `${row.label}: ${fmt(row.x)} listings; ${fmt(row.y, 1)}% eligible coordinates`)); svg.append(circle);
      }
      text(svg, 'Active listings in area', width / 2, height - 9, { 'text-anchor': 'middle' });
      text(svg, 'Coordinates available (%)', 0, 0, { transform: `translate(13 ${height / 2}) rotate(-90)`, 'text-anchor': 'middle', 'font-size': 11 });
    }
    target.replaceChildren(root, download(root, title));
  }
  function render(kind, target, rows, options = {}) {
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target) return;
    const clean = kind === 'lines'
      ? rows.filter((r) => Array.isArray(r.points) && r.points.length > 1 && r.points.every((p) => Number.isFinite(p[0]) && Number.isFinite(p[1])))
      : rows.filter((r) => kind === 'bars' ? Number.isFinite(r.value) && r.value >= 0 : Number.isFinite(r.x) && r.x >= 0 && Number.isFinite(r.y) && r.y >= 0 && r.y <= 100);
    let state = states.get(target);
    if (!state) {
      state = {}; states.set(target, state);
      state.observer = new ResizeObserver(() => { if (state.width !== target.clientWidth) { state.width = target.clientWidth; draw(target, state); } }); state.observer.observe(target);
    }
    Object.assign(state, { kind, rows: clean, options, width: target.clientWidth }); draw(target, state);
  }
  function csv(text) {
    const rows = []; let row = [], field = '', quoted = false;
    text = text.replace(/^\ufeff/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === ',' || c === '\n' || c === '\r')) {
        row.push(field); field = '';
        if (c !== ',') { if (row.some((v) => v !== '')) rows.push(row); row = []; if (c === '\r' && text[i + 1] === '\n') i++; }
      } else field += c;
    }
    if (quoted) throw new Error('Unterminated CSV quote');
    if (field || row.length) { row.push(field); rows.push(row); }
    const headers = rows.shift();
    if (!headers || new Set(headers).size !== headers.length || rows.some((r) => r.length !== headers.length)) throw new Error('Invalid CSV columns');
    return rows.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i]])));
  }
  window.HealthCharts = { bars: (target, rows, options) => render('bars', target, rows, options), scatter: (target, rows, options) => render('scatter', target, rows, options), lines: (target, rows, options) => render('lines', target, rows, options), csv };
})();
