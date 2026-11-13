'use strict';
(() => {
  const charts = new WeakMap(), palette = ['#176b58', '#4196ab', '#b98c36', '#9c80aa', '#71988a', '#d27b59'];
  const L = (en, bn) => (document.documentElement.lang === 'bn' ? bn : en);
  const number = (n, digits = 0) => n.toLocaleString((document.documentElement.lang === 'bn' ? 'bn-BD' : 'en-GB'), { maximumFractionDigits: digits });
  const wrap = (text, length) => {
    const lines = []; let line = '';
    for (const word of text.split(' ')) { if (line && (line + ' ' + word).length > length) { lines.push(line); line = ''; } line += (line ? ' ' : '') + word; }
    if (line) lines.push(line); return lines;
  };
  const figurePlugin = {
    id: 'statisticsFigure',
    beforeDraw(chart) {
      const { ctx, width, height } = chart; ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.restore();
    },
    afterDatasetsDraw(chart) {
      const { ctx } = chart, opt = chart.options.plugins.statisticsFigure;
      ctx.save(); ctx.fillStyle = '#214b3e'; ctx.font = '600 11px system-ui, sans-serif';
      if (chart.config.type === 'doughnut') {
        const arc = chart.getDatasetMeta(0).data[0];
        if (arc) { ctx.textAlign = 'center'; ctx.font = '700 23px system-ui, sans-serif'; ctx.fillText(number(opt.total), arc.x, arc.y); ctx.font = '11px system-ui, sans-serif'; ctx.fillText(opt.totalLabel, arc.x, arc.y + 21); }
      } else chart.data.datasets.forEach((dataset, index) => {
        if (chart.options.indexAxis !== 'y' && chart.width < 420 && dataset.data.length > 5) return;
        chart.getDatasetMeta(index).data.forEach((bar, i) => {
          const horizontal = chart.options.indexAxis === 'y'; ctx.textAlign = horizontal ? 'left' : 'center';
          ctx.fillText(number(dataset.data[i], opt.digits), horizontal ? bar.x + 6 : bar.x, horizontal ? bar.y + 4 : bar.y - 7);
        });
      }); ctx.restore();
    }
  };
  function mount(target, config, options, table) {
    if (typeof target === 'string') target = document.querySelector(target);
    charts.get(target)?.destroy();
    const holder = document.createElement('div'); holder.className = 'statistics-plot'; holder.style.height = options.height + 'px';
    const canvas = document.createElement('canvas'); canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', options.title); holder.append(canvas);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'chart-download'; button.textContent = L('Download chart · PNG ↓', 'চার্ট ডাউনলোড · PNG ↓'); button.setAttribute('aria-label', 'Download ' + options.title + ' as PNG');
    const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = L('View chart data', 'চার্টের তথ্য দেখুন'); details.append(summary);
    const scroll = document.createElement('div'); scroll.className = 'stats-table-wrap'; const dataTable = document.createElement('table');
    const caption = document.createElement('caption'); caption.textContent = options.title + ' — exact source values'; dataTable.append(caption);
    for (const [i, row] of table.entries()) {
      const tr = document.createElement('tr'); for (const value of row) { const cell = document.createElement(i === 0 ? 'th' : 'td'); cell.textContent = value; tr.append(cell); } dataTable.append(tr);
    }
    scroll.append(dataTable); details.append(scroll); target.replaceChildren(holder, button, details);
    const source = config.options.plugins.subtitle.text.join(' ');
    config.options.onResize = (chart, size) => {
      chart.options.plugins.title.text = wrap(options.title, Math.max(22, Math.floor((size.width - 30) / 7)));
      chart.options.plugins.subtitle.text = wrap(source, Math.max(28, Math.floor((size.width - 30) / 5)));
    };
    const chart = new Chart(canvas, config); charts.set(target, chart);
    button.addEventListener('click', () => {
      const link = document.createElement('a'); link.href = chart.toBase64Image('image/png', 1); link.download = options.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 100) + '.png'; link.click();
    });
  }
  function options(title, source, extra = {}) {
    return { responsive: true, maintainAspectRatio: false, animation: false, devicePixelRatio: 2,
      layout: { padding: { top: 8, right: 44, bottom: 10, left: 5 } },
      plugins: { title: { display: true, text: wrap(title, 42), align: 'start', color: '#214b3e', font: { size: 14, weight: '600' }, padding: { bottom: 8 } },
        subtitle: { display: true, text: wrap(source, 62), align: 'start', color: '#61766e', font: { size: 10 }, padding: { bottom: 22 } },
        legend: { display: false }, statisticsFigure: { digits: 0 }, tooltip: { displayColors: true } }, ...extra };
  }
  function plot(target, rows, opt = {}) {
    const title = opt.title || 'Statistical comparison', source = opt.source || L('Source: DGHS registry / BBS Yearbook 2025; dates on this page.', 'উৎস: DGHS রেজিস্ট্রি / BBS বর্ষগ্রন্থ ২০২৫; তারিখ এই পৃষ্ঠায়।');
    const values = rows.map((r) => r.value), total = values.reduce((a, b) => a + b, 0), digits = opt.digits || 0;
    if (!rows.length || (opt.kind === 'doughnut' && total === 0)) {
      if (typeof target === 'string') target = document.querySelector(target);
      charts.get(target)?.destroy(); target.textContent = L('No active listings in this selection.', 'এই বাছাইয়ে কোনো সক্রিয় তালিকা নেই।'); return;
    }
    const config = { type: opt.kind === 'doughnut' ? 'doughnut' : 'bar', plugins: [figurePlugin],
      data: { labels: rows.map((r) => opt.kind === 'doughnut' ? r.label : wrap(r.label, opt.kind === 'columns' ? 12 : 23)), datasets: [{ label: opt.axisLabel, data: values, backgroundColor: rows.map((r, i) => r.muted ? '#bba984' : opt.kind === 'doughnut' ? palette[i % palette.length] : r.selected ? '#b8842c' : '#267a66'), borderRadius: opt.kind === 'doughnut' ? 0 : 3, borderWidth: opt.kind === 'doughnut' ? 2 : 0, borderColor: '#fff', maxBarThickness: 35 }] },
      options: options(title, source) };
    config.options.plugins.statisticsFigure = { digits, total, totalLabel: opt.totalLabel || 'active listings' };
    if (opt.kind === 'doughnut') {
      config.options.cutout = '65%'; config.options.layout.padding.right = 5;
      config.options.plugins.legend = { display: true, position: 'bottom', onClick: () => {}, labels: { usePointStyle: true, boxWidth: 10, padding: 15, font: { size: 11 } } };
      config.options.plugins.tooltip.callbacks = { label: (context) => `${context.label}: ${number(context.raw)} (${number(context.raw / total * 100, 1)}%)` };
    } else {
      const horizontal = opt.kind !== 'columns'; config.options.indexAxis = horizontal ? 'y' : 'x';
      const ticks = { color: '#456456', font: { size: 11 }, maxRotation: 45, autoSkip: false };
      const category = { grid: { display: false }, ticks };
      const numeric = { beginAtZero: true, ...(opt.maximum ? { max: opt.maximum } : {}), grid: { color: '#e5ece7' }, title: { display: true, text: wrap(opt.axisLabel || L('Active listings', 'সক্রিয় তালিকা'), 38), color: '#456456' }, ticks: { color: '#456456', callback: (v) => number(v, digits) } };
      config.options.scales = horizontal ? { x: numeric, y: category } : { x: category, y: numeric };
      config.options.plugins.tooltip.callbacks = { title: (items) => rows[items[0].dataIndex].label, label: (context) => `${opt.axisLabel}: ${number(context.raw, digits)}` };
    }
    mount(target, config, { title, height: opt.kind === 'doughnut' ? 400 : opt.kind === 'columns' ? 440 : Math.max(310, rows.length * 47 + 160) }, [[L('Category', 'শ্রেণি'), opt.axisLabel || 'Value'], ...rows.map((r) => [r.label, r.value])]);
  }
  function staffing(target, health) {
    const title = L('DGHS workforce — existing staff and sanctioned posts', 'DGHS জনবল — কর্মরত ও অনুমোদিত পদ');
    const rows = [[L('Doctors', 'চিকিৎসক'), health.doctorsUnderDGHS], [L('Medical technologists', 'মেডিকেল টেকনোলজিস্ট'), health.medicalTechnologistsUnderDGHS]];
    const config = { type: 'bar', plugins: [figurePlugin], data: { labels: rows.map(([label]) => wrap(label, 18)), datasets: [
      { label: L('Existing staff', 'কর্মরত'), data: rows.map(([, v]) => v.existing), backgroundColor: '#267a66', maxBarThickness: 42 },
      { label: L('Sanctioned posts', 'অনুমোদিত পদ'), data: rows.map(([, v]) => v.sanctioned), backgroundColor: '#bba984', maxBarThickness: 42 }
    ] }, options: options(title, L('BBS Yearbook 2025, table 13.01; original source: DGHS.', 'BBS বর্ষগ্রন্থ ২০২৫, সারণি ১৩.০১; মূল উৎস: DGHS।')) };
    config.options.plugins.legend = { display: true, position: 'bottom', labels: { usePointStyle: true, font: { size: 11 } } };
    config.options.scales = { x: { grid: { display: false }, ticks: { color: '#456456' } }, y: { beginAtZero: true, grid: { color: '#e5ece7' }, title: { display: true, text: L('Staff / posts · published 2025', 'জনবল / পদ · ২০২৫'), color: '#456456' } } };
    mount(target, config, { title, height: 420 }, [[L('Staff category', 'জনবলের ধরন'), L('Existing staff', 'কর্মরত'), L('Sanctioned posts', 'অনুমোদিত পদ')], ...rows.map(([label, v]) => [label, v.existing, v.sanctioned])]);
  }
  window.StatisticsCharts = { plot, staffing };
})();
