/* Nalarine Graph Builder — graph configuration editor and student renderer. */
(function () {
  'use strict';

  var palette = ['#2563eb', '#0f9d78', '#e08a22', '#8b5cf6', '#e05274', '#0891b2'];
  var chartInstances = new Set();
  var editorRoot = null;
  var draft = null;
  var editorMode = 'off';
  var nextSvgId = 0;

  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }
  function number(v, fallback) {
    var n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function rangeValue(v, fallback) {
    if (Array.isArray(v) && v.length === 2) return [number(v[0], fallback[0]), number(v[1], fallback[1])];
    return fallback.slice();
  }
  function safeRange(r, name) {
    if (!Array.isArray(r) || r.length !== 2 || !r.every(Number.isFinite) || r[0] >= r[1]) {
      return name + ' harus berisi nilai minimum dan maksimum yang valid, dengan minimum lebih kecil.';
    }
    if (Math.abs(r[0]) > 1000000 || Math.abs(r[1]) > 1000000) return name + ' terlalu lebar.';
    return '';
  }
  function blank(type) {
    var base = { versi: 1, judul: 'Grafik baru' };
    if (type === 'bar') return Object.assign(base, { jenis: 'bar', sumbuX: 'Kategori', sumbuY: 'Nilai', namaDataset: 'Jumlah', kategori: [{ nama: 'A', nilai: 5 }, { nama: 'B', nilai: 8 }, { nama: 'C', nilai: 3 }] });
    if (type === 'line') return Object.assign(base, { jenis: 'line', sumbuX: 'Waktu', sumbuY: 'Nilai', kategori: ['Jan', 'Feb', 'Mar'], datasets: [{ nama: 'Dataset 1', nilai: [4, 7, 5] }] });
    if (type === 'pie') return Object.assign(base, { jenis: 'pie', kategori: [{ nama: 'Kategori A', nilai: 40 }, { nama: 'Kategori B', nilai: 35 }, { nama: 'Kategori C', nilai: 25 }] });
    if (type.indexOf('fungsi-') === 0) {
      var sub = type.slice(7);
      var expr = sub === 'linear' ? '2*x+1' : sub === 'kuadrat' ? 'x^2-2*x-3' : sub === 'eksponen' ? '2^x' : 'sin(x)';
      return Object.assign(base, { jenis: 'fungsi', subjenis: sub, fungsi: [{ nama: 'f(x)', persamaan: expr }], rentangX: [-5, 5], rentangY: [-5, 12] });
    }
    if (type === 'koordinat') return Object.assign(base, { jenis: 'koordinat', titik: [{ nama: 'A', x: -2, y: 1 }, { nama: 'B', x: 1, y: 3 }, { nama: 'C', x: 4, y: -1 }], hubungkan: true, rentangX: [-5, 5], rentangY: [-5, 5] });
    return Object.assign(base, { jenis: 'pertidaksamaan', pertidaksamaan: 'y >= 2*x+1', rentangX: [-5, 5], rentangY: [-5, 12] });
  }
  function typeFromGraph(g) {
    if (!g) return 'bar';
    if (g.jenis === 'fungsi') return 'fungsi-' + (g.subjenis || 'lainnya');
    if (['bar', 'line', 'pie', 'koordinat', 'pertidaksamaan'].indexOf(g.jenis) >= 0) return g.jenis;
    if (['fungsi-linear', 'fungsi-kuadrat', 'fungsi-eksponen', 'fungsi-lainnya'].indexOf(g.jenis) >= 0) return g.jenis;
    return 'bar';
  }
  function normalize(g) {
    if (typeof g === 'string') {
      try { g = JSON.parse(g); } catch (e) { return null; }
    }
    if (!g || typeof g !== 'object') return null;
    var out = clone(g);
    if (out.jenis && String(out.jenis).indexOf('fungsi-') === 0) {
      out.subjenis = String(out.jenis).slice(7);
      out.jenis = 'fungsi';
    }
    if (out.jenis === 'fungsi') {
      out.fungsi = Array.isArray(out.fungsi) ? out.fungsi.map(function (f, i) {
        if (typeof f === 'string') return { nama: 'f' + (i ? i + 1 : '') + '(x)', persamaan: f };
        return { nama: f.nama || 'f(x)', persamaan: f.persamaan || f.expr || 'x' };
      }) : [];
    }
    if (out.jenis === 'koordinat' && !Array.isArray(out.titik) && Array.isArray(out.points)) out.titik = out.points;
    if (out.jenis === 'koordinat' && Array.isArray(out.titik)) {
      out.titik = out.titik.map(function (p, i) { return { nama: p.nama || p.name || String.fromCharCode(65 + i), x: number(p.x, 0), y: number(p.y, 0) }; });
    }
    if (out.jenis === 'line' && !Array.isArray(out.kategori) && Array.isArray(out.labels)) out.kategori = out.labels;
    if (out.jenis === 'line' && Array.isArray(out.datasets)) {
      out.datasets = out.datasets.map(function (d) { return { nama: d.nama || d.label || 'Dataset', nilai: d.nilai || d.data || [] }; });
    }
    return out;
  }

  /* Math.js parser with a strict AST allowlist. No eval(), Function(), assignments,
     property access, arrays, objects, or arbitrary function calls are permitted. */
  function compileSafe(expression) {
    var text = String(expression || '').trim().replace(/^\s*y\s*=\s*/i, '');
    if (!text || text.length > 180) throw new Error('Persamaan kosong atau terlalu panjang.');
    if (!window.math || typeof window.math.parse !== 'function') throw new Error('Parser matematika belum termuat. Periksa koneksi lalu muat ulang halaman.');
    var tree;
    try { tree = window.math.parse(text); } catch (e) { throw new Error('Persamaan tidak dapat dibaca: ' + e.message); }
    var count = 0;
    var symbols = { x: true, pi: true, e: true };
    var funcs = { sqrt: true, abs: true, sin: true, cos: true, tan: true, asin: true, acos: true, atan: true, exp: true, log: true, log10: true, ln: true };
    function inspect(node, depth) {
      count++;
      if (count > 100 || depth > 18) throw new Error('Persamaan terlalu kompleks.');
      if (node.isConstantNode) {
        if (typeof node.value !== 'number' || !Number.isFinite(node.value)) throw new Error('Hanya konstanta angka yang diperbolehkan.');
        return;
      }
      if (node.isSymbolNode) {
        if (!symbols[node.name]) throw new Error('Simbol "' + node.name + '" tidak diizinkan. Gunakan variabel x.');
        return;
      }
      if (node.isOperatorNode) {
        if (['+', '-', '*', '/', '^', '%'].indexOf(node.op) < 0) throw new Error('Operator "' + node.op + '" tidak diizinkan.');
        node.args.forEach(function (arg) { inspect(arg, depth + 1); });
        return;
      }
      if (node.isParenthesisNode) { inspect(node.content, depth + 1); return; }
      if (node.isFunctionNode) {
        var fnName = node.fn && node.fn.name ? node.fn.name : node.name;
        if (!funcs[fnName]) throw new Error('Fungsi "' + fnName + '" tidak diizinkan.');
        node.args.forEach(function (arg) { inspect(arg, depth + 1); });
        return;
      }
      throw new Error('Bentuk persamaan ini tidak diizinkan.');
    }
    inspect(tree, 0);
    var compiled = tree.compile();
    return function (x) {
      try {
        var value = compiled.evaluate({ x: x, pi: Math.PI, e: Math.E });
        return typeof value === 'number' && Number.isFinite(value) ? value : NaN;
      } catch (e) { return NaN; }
    };
  }
  function validation(g) {
    if (!g || typeof g !== 'object') return 'Grafik belum dipilih.';
    if (String(g.judul || '').length > 120) return 'Judul grafik maksimal 120 karakter.';
    if (['bar', 'line', 'pie', 'fungsi', 'koordinat', 'pertidaksamaan'].indexOf(g.jenis) < 0) return 'Jenis grafik tidak dikenal.';
    if (g.jenis === 'bar') {
      if (!Array.isArray(g.kategori) || !g.kategori.length) return 'Grafik batang membutuhkan minimal satu kategori.';
      if (g.kategori.length > 40) return 'Maksimal 40 kategori.';
      if (g.kategori.some(function (x) { return !String(x.nama || '').trim() || !Number.isFinite(Number(x.nilai)); })) return 'Setiap kategori grafik batang harus memiliki nama dan nilai angka yang valid.';
    }
    if (g.jenis === 'line') {
      if (!Array.isArray(g.kategori) || !g.kategori.length || !Array.isArray(g.datasets) || !g.datasets.length) return 'Grafik garis membutuhkan kategori dan minimal satu dataset.';
      if (g.kategori.length > 40 || g.datasets.length > 8) return 'Grafik garis dibatasi hingga 40 titik dan 8 dataset.';
      if (g.datasets.some(function (d) { return !String(d.nama || '').trim() || !Array.isArray(d.nilai) || d.nilai.length !== g.kategori.length || d.nilai.some(function (v) { return !Number.isFinite(Number(v)); }); })) return 'Jumlah nilai setiap dataset harus sama dengan jumlah kategori dan semuanya berupa angka.';
    }
    if (g.jenis === 'pie') {
      if (!Array.isArray(g.kategori) || !g.kategori.length || g.kategori.length > 30) return 'Diagram lingkaran membutuhkan 1–30 kategori.';
      if (g.kategori.some(function (x) { return !String(x.nama || '').trim() || !Number.isFinite(Number(x.nilai)) || Number(x.nilai) < 0; })) return 'Kategori diagram lingkaran harus memiliki nama dan nilai nol atau lebih.';
      if (g.kategori.reduce(function (a, x) { return a + Number(x.nilai); }, 0) <= 0) return 'Jumlah nilai diagram lingkaran harus lebih dari nol.';
    }
    if (g.jenis === 'fungsi') {
      if (!Array.isArray(g.fungsi) || !g.fungsi.length || g.fungsi.length > 8) return 'Tambahkan 1–8 fungsi.';
      var rx = safeRange(g.rentangX, 'Rentang X'), ry = safeRange(g.rentangY, 'Rentang Y');
      if (rx || ry) return rx || ry;
      try { g.fungsi.forEach(function (f) { compileSafe(f.persamaan); }); } catch (e) { return e.message; }
    }
    if (g.jenis === 'koordinat') {
      if (!Array.isArray(g.titik) || !g.titik.length || g.titik.length > 40) return 'Grafik koordinat membutuhkan 1–40 titik.';
      var rx2 = safeRange(g.rentangX, 'Rentang X'), ry2 = safeRange(g.rentangY, 'Rentang Y');
      if (rx2 || ry2) return rx2 || ry2;
      if (g.titik.some(function (p) { return !String(p.nama || '').trim() || !Number.isFinite(Number(p.x)) || !Number.isFinite(Number(p.y)); })) return 'Setiap titik harus memiliki nama serta koordinat X dan Y berupa angka.';
    }
    if (g.jenis === 'pertidaksamaan') {
      var rx3 = safeRange(g.rentangX, 'Rentang X'), ry3 = safeRange(g.rentangY, 'Rentang Y');
      if (rx3 || ry3) return rx3 || ry3;
      var m = String(g.pertidaksamaan || '').replace(/≥/g, '>=').replace(/≤/g, '<=').match(/^\s*y\s*(>=|<=|>|<)\s*(.+)$/i);
      if (!m) return 'Gunakan bentuk pertidaksamaan seperti y >= 2*x + 1.';
      try { compileSafe(m[2]); } catch (e) { return e.message; }
    }
    return '';
  }

  function graphHTML(g) {
    if (!g) return '';
    return '<div class="ng-visualisasi" data-ng-graph="' + encodeURIComponent(JSON.stringify(g)) + '"></div>';
  }
  function destroyDisconnected() {
    chartInstances.forEach(function (chart) {
      if (!chart.canvas || !document.documentElement.contains(chart.canvas)) {
        try { chart.destroy(); } catch (e) {}
        chartInstances.delete(chart);
      }
    });
  }
  function paletteColor(i) { return palette[i % palette.length]; }
  function cssColor(name, fallback) {
    try { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
    catch (e) { return fallback; }
  }
  function drawChart(node, g) {
    if (!window.Chart) {
      node.innerHTML = '<div class="ng-gagal">Library grafik statistik tidak berhasil dimuat. Muat ulang halaman untuk mencoba kembali.</div>';
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', g.judul || 'Grafik statistik');
    node.appendChild(canvas);
    var labels, datasets, type, options = {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: { display: true, position: 'bottom', labels: { color: cssColor('--muted', '#5f6b85'), boxWidth: 12, usePointStyle: true } },
        title: { display: false },
        tooltip: { enabled: true }
      }
    };
    if (g.jenis === 'bar') {
      type = 'bar';
      labels = g.kategori.map(function (x) { return x.nama; });
      datasets = [{ label: g.namaDataset || 'Dataset 1', data: g.kategori.map(function (x) { return Number(x.nilai); }), backgroundColor: paletteColor(0), borderRadius: 5, maxBarThickness: 56 }];
    } else if (g.jenis === 'line') {
      type = 'line';
      labels = g.kategori;
      datasets = g.datasets.map(function (d, i) {
        return { label: d.nama, data: d.nilai.map(Number), borderColor: paletteColor(i), backgroundColor: paletteColor(i), tension: 0.22, pointRadius: 3.5, pointHoverRadius: 5, fill: false };
      });
    } else {
      type = 'pie';
      labels = g.kategori.map(function (x) { return x.nama; });
      datasets = [{ label: g.judul || 'Proporsi', data: g.kategori.map(function (x) { return Number(x.nilai); }), backgroundColor: g.kategori.map(function (_, i) { return paletteColor(i); }), borderColor: cssColor('--card', '#fff'), borderWidth: 2 }];
      options.plugins.legend.position = 'right';
    }
    if (type !== 'pie') {
      options.scales = {
        x: { title: { display: true, text: g.sumbuX || 'Kategori', color: cssColor('--muted', '#5f6b85') }, ticks: { color: cssColor('--muted', '#5f6b85') }, grid: { color: cssColor('--border', '#e1e7f3') } },
        y: { beginAtZero: true, title: { display: true, text: g.sumbuY || 'Nilai', color: cssColor('--muted', '#5f6b85') }, ticks: { color: cssColor('--muted', '#5f6b85') }, grid: { color: cssColor('--border', '#e1e7f3') } }
      };
    }
    try {
      var chart = new window.Chart(canvas.getContext('2d'), { type: type, data: { labels: labels, datasets: datasets }, options: options });
      chartInstances.add(chart);
    } catch (e) {
      node.innerHTML = '<div class="ng-gagal">Grafik tidak dapat dirender: ' + esc(e.message) + '</div>';
    }
  }
  function niceStep(span, target) {
    var raw = span / target, power = Math.pow(10, Math.floor(Math.log10(raw))), unit = raw / power;
    return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
  }
  function fmt(v) {
    if (Math.abs(v) < 0.000001) return '0';
    return Number(v.toPrecision(4)).toString();
  }
  function plotSvg(g) {
    var width = 680, height = 390, left = 58, right = 22, top = 22, bottom = 48;
    var x0 = Number(g.rentangX[0]), x1 = Number(g.rentangX[1]), y0 = Number(g.rentangY[0]), y1 = Number(g.rentangY[1]);
    var pw = width - left - right, ph = height - top - bottom;
    var px = function (x) { return left + (x - x0) / (x1 - x0) * pw; };
    var py = function (y) { return top + (y1 - y) / (y1 - y0) * ph; };
    var sx = niceStep(x1 - x0, 9), sy = niceStep(y1 - y0, 8), grid = '';
    var xstart = Math.ceil(x0 / sx) * sx, ystart = Math.ceil(y0 / sy) * sy;
    for (var tx = xstart, ct = 0; tx <= x1 + sx * 0.0001 && ct < 50; tx += sx, ct++) {
      var xx = px(tx);
      grid += '<line x1="' + xx + '" y1="' + top + '" x2="' + xx + '" y2="' + (height - bottom) + '" class="ng-grid"/><text x="' + xx + '" y="' + (height - bottom + 21) + '" class="ng-tick" text-anchor="middle">' + esc(fmt(tx)) + '</text>';
    }
    for (var ty = ystart, cy = 0; ty <= y1 + sy * 0.0001 && cy < 50; ty += sy, cy++) {
      var yy = py(ty);
      grid += '<line x1="' + left + '" y1="' + yy + '" x2="' + (width - right) + '" y2="' + yy + '" class="ng-grid"/><text x="' + (left - 9) + '" y="' + (yy + 4) + '" class="ng-tick" text-anchor="end">' + esc(fmt(ty)) + '</text>';
    }
    var axisX = y0 <= 0 && y1 >= 0 ? py(0) : height - bottom;
    var axisY = x0 <= 0 && x1 >= 0 ? px(0) : left;
    var axes = '<line x1="' + left + '" y1="' + axisX + '" x2="' + (width - right) + '" y2="' + axisX + '" class="ng-axis"/><line x1="' + axisY + '" y1="' + top + '" x2="' + axisY + '" y2="' + (height - bottom) + '" class="ng-axis"/><text x="' + (width - right) + '" y="' + (axisX - 9) + '" class="ng-axis-label" text-anchor="end">X</text><text x="' + (axisY + 10) + '" y="' + (top + 5) + '" class="ng-axis-label">Y</text>';
    var clipId = 'ngclip' + (++nextSvgId);
    var defs = '<defs><clipPath id="' + clipId + '"><rect x="' + left + '" y="' + top + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs>';
    var marks = '';
    if (g.jenis === 'fungsi') {
      g.fungsi.forEach(function (f, fi) {
        var fn;
        try { fn = compileSafe(f.persamaan); } catch (e) { return; }
        var path = '', active = false, steps = 280;
        for (var i = 0; i <= steps; i++) {
          var x = x0 + (x1 - x0) * i / steps, y = fn(x);
          if (!Number.isFinite(y) || y < y0 - (y1 - y0) * 2 || y > y1 + (y1 - y0) * 2) { active = false; continue; }
          var cmd = active ? 'L' : 'M';
          path += cmd + px(x).toFixed(2) + ' ' + py(y).toFixed(2) + ' ';
          active = true;
        }
        marks += '<path d="' + path + '" class="ng-curve" stroke="' + paletteColor(fi) + '"/>';
      });
    } else if (g.jenis === 'pertidaksamaan') {
      var m = String(g.pertidaksamaan).replace(/≥/g, '>=').replace(/≤/g, '<=').match(/^\s*y\s*(>=|<=|>|<)\s*(.+)$/i);
      var fn = compileSafe(m[2]), topLine = m[1] === '>=' || m[1] === '>', line = '', region = '', pts = [], steps = 260;
      for (var j = 0; j <= steps; j++) {
        var xx2 = x0 + (x1 - x0) * j / steps, yy2 = fn(xx2);
        if (!Number.isFinite(yy2)) yy2 = topLine ? y0 : y1;
        pts.push({ x: xx2, y: Math.max(y0, Math.min(y1, yy2)) });
      }
      pts.forEach(function (p, k) { line += (k ? 'L' : 'M') + px(p.x).toFixed(2) + ' ' + py(p.y).toFixed(2) + ' '; });
      if (topLine) region = line + 'L' + px(x1) + ' ' + py(y1) + 'L' + px(x0) + ' ' + py(y1) + 'Z';
      else region = line + 'L' + px(x1) + ' ' + py(y0) + 'L' + px(x0) + ' ' + py(y0) + 'Z';
      marks += '<path d="' + region + '" class="ng-region"/><path d="' + line + '" class="ng-curve" stroke-dasharray="' + (m[1] === '>' || m[1] === '<' ? '7 5' : 'none') + '"/>';
    } else if (g.jenis === 'koordinat') {
      if (g.hubungkan && g.titik.length > 1) {
        var poly = g.titik.filter(function (p) { return p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1; })
          .map(function (p, i) { return (i ? 'L' : 'M') + px(p.x) + ' ' + py(p.y); }).join(' ');
        marks += '<path d="' + poly + '" class="ng-curve" stroke="' + paletteColor(0) + '"/>';
      }
      g.titik.forEach(function (p) {
        if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) return;
        marks += '<circle cx="' + px(p.x) + '" cy="' + py(p.y) + '" r="5" class="ng-point"/><text x="' + (px(p.x) + 9) + '" y="' + (py(p.y) - 9) + '" class="ng-point-label">' + esc(p.nama) + '</text>';
      });
    }
    var legend = '';
    if (g.jenis === 'fungsi') {
      legend = '<div class="ng-legend">' + g.fungsi.map(function (f, i) {
        return '<span><i style="background:' + paletteColor(i) + '"></i>' + esc(f.nama) + ': ' + esc(f.persamaan) + '</span>';
      }).join('') + '</div>';
    }
    var svg = '<svg class="ng-plot" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(g.judul || 'Grafik koordinat') + '">' + defs + grid + axes + '<g clip-path="url(#' + clipId + ')">' + marks + '</g></svg>';
    return svg + legend;
  }
  function drawGraph(node, g) {
    var title = g.judul ? '<div class="ng-visual-title">' + esc(g.judul) + '</div>' : '';
    node.classList.add('ng-visualisasi');
    node.innerHTML = '<div class="ng-visual-card">' + title + '<div class="ng-canvas-wrap"></div></div>';
    var box = node.querySelector('.ng-canvas-wrap');
    if (['bar', 'line', 'pie'].indexOf(g.jenis) >= 0) {
      drawChart(box, g);
    } else {
      try { box.innerHTML = plotSvg(g); }
      catch (e) { box.innerHTML = '<div class="ng-gagal">Grafik tidak dapat dirender: ' + esc(e.message) + '</div>'; }
    }
  }
  function renderAll(root) {
    destroyDisconnected();
    if (!root) return;
    var nodes = [];
    if (root.matches && root.matches('[data-ng-graph]')) nodes.push(root);
    if (root.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll('[data-ng-graph]')));
    nodes.forEach(function (node) {
      if (node.dataset.ngRendered === '1') return;
      try {
        var g = normalize(JSON.parse(decodeURIComponent(node.getAttribute('data-ng-graph'))));
        var err = validation(g);
        if (err) node.innerHTML = '<div class="ng-gagal">Konfigurasi grafik tidak valid: ' + esc(err) + '</div>';
        else drawGraph(node, g);
      } catch (e) {
        node.innerHTML = '<div class="ng-gagal">Grafik tidak dapat dimuat: ' + esc(e.message) + '</div>';
      }
      node.dataset.ngRendered = '1';
    });
  }

  function field(label, key, value, type, placeholder, hint) {
    return '<label class="ng-field"><span>' + esc(label) + '</span><input class="input" type="' + (type || 'text') + '" data-ng-field="' + esc(key) + '" value="' + esc(value == null ? '' : value) + '" placeholder="' + esc(placeholder || '') + '">' + (hint ? '<small>' + esc(hint) + '</small>' : '') + '</label>';
  }
  function rangeFields(g) {
    var rx = g.rentangX || [-5, 5], ry = g.rentangY || [-5, 5];
    return '<div class="ng-grid-fields">' + field('X minimum', 'xMin', rx[0], 'number') + field('X maksimum', 'xMax', rx[1], 'number')
      + field('Y minimum', 'yMin', ry[0], 'number') + field('Y maksimum', 'yMax', ry[1], 'number') + '</div>';
  }
  function rowButton(action, index, label) {
    return '<button type="button" class="btn btn-secondary btn-kecil" data-ng-action="' + action + '" data-index="' + index + '">' + esc(label || 'Hapus') + '</button>';
  }
  function rowInputs(rows, kind) {
    return rows.map(function (r, i) {
      if (kind === 'bar' || kind === 'pie') return '<div class="ng-data-row" data-ng-row="' + kind + '" data-index="' + i + '"><label><span>Nama kategori</span><input class="input" data-ng-key="nama" value="' + esc(r.nama) + '"></label><label><span>Nilai</span><input class="input" type="number" step="any" data-ng-key="nilai" value="' + esc(r.nilai) + '"></label>' + rowButton('remove-' + kind, i, 'Hapus') + '</div>';
      if (kind === 'line-category') return '<div class="ng-data-row ng-category-row" data-ng-row="' + kind + '" data-index="' + i + '"><label><span>Kategori / titik X</span><input class="input" data-ng-key="nama" value="' + esc(r) + '"></label>' + rowButton('remove-category', i, 'Hapus') + '</div>';
      if (kind === 'line-dataset') return '<div class="ng-data-row ng-dataset-row" data-ng-row="' + kind + '" data-index="' + i + '"><label><span>Nama dataset</span><input class="input" data-ng-key="nama" value="' + esc(r.nama) + '"></label><label><span>Nilai (urut sesuai kategori, pisahkan dengan koma)</span><input class="input" data-ng-key="nilaiText" value="' + esc(r.nilai.join(', ')) + '"></label>' + rowButton('remove-dataset', i, 'Hapus') + '</div>';
      if (kind === 'fungsi') return '<div class="ng-data-row ng-function-row" data-ng-row="' + kind + '" data-index="' + i + '"><label><span>Nama kurva</span><input class="input" data-ng-key="nama" value="' + esc(r.nama) + '"></label><label><span>Persamaan y =</span><input class="input" data-ng-key="persamaan" value="' + esc(r.persamaan) + '" placeholder="2*x + 3"></label>' + rowButton('remove-fungsi', i, 'Hapus') + '</div>';
      return '<div class="ng-data-row ng-point-row" data-ng-row="titik" data-index="' + i + '"><label><span>Nama titik</span><input class="input" data-ng-key="nama" value="' + esc(r.nama) + '"></label><label><span>X</span><input class="input" type="number" step="any" data-ng-key="x" value="' + esc(r.x) + '"></label><label><span>Y</span><input class="input" type="number" step="any" data-ng-key="y" value="' + esc(r.y) + '"></label>' + rowButton('remove-titik', i, 'Hapus') + '</div>';
    }).join('');
  }
  function renderControls(g, type) {
    var html = field('Judul grafik', 'judul', g.judul || '');
    if (g.jenis === 'bar') {
      html += '<div class="ng-grid-fields">' + field('Nama sumbu X', 'sumbuX', g.sumbuX || 'Kategori') + field('Nama sumbu Y', 'sumbuY', g.sumbuY || 'Nilai') + field('Nama dataset', 'namaDataset', g.namaDataset || 'Jumlah') + '</div>';
      html += '<div class="ng-subtitle">Kategori dan nilai</div><div id="ng-row-list">' + rowInputs(g.kategori, 'bar') + '</div><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="add-kategori">+ Tambah kategori</button>';
    } else if (g.jenis === 'line') {
      html += '<div class="ng-grid-fields">' + field('Nama sumbu X', 'sumbuX', g.sumbuX || 'Kategori') + field('Nama sumbu Y', 'sumbuY', g.sumbuY || 'Nilai') + '</div>';
      html += '<div class="ng-subtitle">Kategori / titik X</div><div id="ng-row-list">' + rowInputs(g.kategori, 'line-category') + '</div><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="add-category">+ Tambah kategori</button>';
      html += '<div class="ng-subtitle">Dataset garis</div><div id="ng-dataset-list">' + rowInputs(g.datasets, 'line-dataset') + '</div><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="add-dataset">+ Tambah dataset</button><p class="ng-help">Jumlah nilai setiap dataset harus sama dengan jumlah kategori. Contoh: 3, 5, 7.</p>';
    } else if (g.jenis === 'pie') {
      html += '<div class="ng-subtitle">Kategori dan nilai</div><div id="ng-row-list">' + rowInputs(g.kategori, 'pie') + '</div><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="add-kategori">+ Tambah kategori</button>';
    } else if (g.jenis === 'fungsi') {
      html += '<div class="ng-subtitle">Persamaan fungsi</div><div id="ng-row-list">' + rowInputs(g.fungsi, 'fungsi') + '</div><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="add-fungsi">+ Tambah fungsi</button><p class="ng-help">Gunakan x sebagai variabel. Operator yang didukung: +, −, ×, ÷, pangkat (^), serta sqrt, abs, sin, cos, tan, exp, log. Contoh: 2*x+3 atau x^2-4.</p>';
      html += rangeFields(g);
    } else if (g.jenis === 'koordinat') {
      html += '<div class="ng-subtitle">Titik koordinat</div><div id="ng-row-list">' + rowInputs(g.titik, 'titik') + '</div><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="add-titik">+ Tambah titik</button><label class="ng-check"><input type="checkbox" data-ng-field="hubungkan" ' + (g.hubungkan ? 'checked' : '') + '> Hubungkan titik sesuai urutan</label>';
      html += rangeFields(g);
    } else if (g.jenis === 'pertidaksamaan') {
      html += field('Pertidaksamaan', 'pertidaksamaan', g.pertidaksamaan || 'y >= 2*x+1', 'text', 'y >= 2*x + 1', 'Gunakan tanda >=, <=, >, atau <. Area penyelesaian akan diarsir.');
      html += rangeFields(g);
    }
    return html;
  }
  function readEditorForm() {
    if (!editorRoot || editorMode !== 'on') return null;
    var type = editorRoot.querySelector('[data-ng-type]').value;
    var g = { versi: 1, judul: editorRoot.querySelector('[data-ng-field="judul"]').value.trim() };
    function val(key) { var el = editorRoot.querySelector('[data-ng-field="' + key + '"]'); return el ? el.value.trim() : ''; }
    function num(key) { var raw = val(key); return raw === '' ? NaN : Number(raw); }
    function readRange() { return { rentangX: [num('xMin'), num('xMax')], rentangY: [num('yMin'), num('yMax')] }; }
    if (type === 'bar') {
      g.jenis = 'bar'; g.sumbuX = val('sumbuX'); g.sumbuY = val('sumbuY'); g.namaDataset = val('namaDataset');
      g.kategori = Array.prototype.slice.call(editorRoot.querySelectorAll('[data-ng-row="bar"]')).map(function (r) { return { nama: r.querySelector('[data-ng-key="nama"]').value.trim(), nilai: (r.querySelector('[data-ng-key="nilai"]').value.trim() === '' ? NaN : Number(r.querySelector('[data-ng-key="nilai"]').value)) }; });
    } else if (type === 'pie') {
      g.jenis = 'pie';
      g.kategori = Array.prototype.slice.call(editorRoot.querySelectorAll('[data-ng-row="pie"]')).map(function (r) { return { nama: r.querySelector('[data-ng-key="nama"]').value.trim(), nilai: (r.querySelector('[data-ng-key="nilai"]').value.trim() === '' ? NaN : Number(r.querySelector('[data-ng-key="nilai"]').value)) }; });
    } else if (type === 'line') {
      g.jenis = 'line'; g.sumbuX = val('sumbuX'); g.sumbuY = val('sumbuY');
      g.kategori = Array.prototype.slice.call(editorRoot.querySelectorAll('[data-ng-row="line-category"]')).map(function (r) { return r.querySelector('[data-ng-key="nama"]').value.trim(); });
      g.datasets = Array.prototype.slice.call(editorRoot.querySelectorAll('[data-ng-row="line-dataset"]')).map(function (r) {
        var text = r.querySelector('[data-ng-key="nilaiText"]').value;
        return { nama: r.querySelector('[data-ng-key="nama"]').value.trim(), nilai: text.split(',').map(function (v) { return v.trim() === '' ? NaN : Number(v.trim()); }) };
      });
    } else if (type.indexOf('fungsi-') === 0) {
      g.jenis = 'fungsi'; g.subjenis = type.slice(7);
      g.fungsi = Array.prototype.slice.call(editorRoot.querySelectorAll('[data-ng-row="fungsi"]')).map(function (r) { return { nama: r.querySelector('[data-ng-key="nama"]').value.trim(), persamaan: r.querySelector('[data-ng-key="persamaan"]').value.trim() }; });
      Object.assign(g, readRange());
    } else if (type === 'koordinat') {
      g.jenis = 'koordinat';
      g.titik = Array.prototype.slice.call(editorRoot.querySelectorAll('[data-ng-row="titik"]')).map(function (r) { return { nama: r.querySelector('[data-ng-key="nama"]').value.trim(), x: (r.querySelector('[data-ng-key="x"]').value.trim() === '' ? NaN : Number(r.querySelector('[data-ng-key="x"]').value)), y: (r.querySelector('[data-ng-key="y"]').value.trim() === '' ? NaN : Number(r.querySelector('[data-ng-key="y"]').value)) }; });
      var check = editorRoot.querySelector('[data-ng-field="hubungkan"]'); g.hubungkan = !!(check && check.checked);
      Object.assign(g, readRange());
    } else {
      g.jenis = 'pertidaksamaan'; g.pertidaksamaan = val('pertidaksamaan'); Object.assign(g, readRange());
    }
    return g;
  }
  function drawEditorPreview() {
    if (!editorRoot) return;
    var preview = editorRoot.querySelector('#ng-preview');
    if (!preview) return;
    var g = readEditorForm();
    if (!g) { preview.innerHTML = '<p class="ng-empty">Aktifkan grafik untuk melihat pratinjau.</p>'; return; }
    var err = validation(g);
    if (err) {
      preview.innerHTML = '<div class="ng-gagal">' + esc(err) + '</div>';
      return;
    }
    preview.innerHTML = graphHTML(g);
    renderAll(preview);
  }
  function renderEditor() {
    if (!editorRoot) return;
    var mode = editorRoot.querySelector('[data-ng-mode]');
    var typeSelect = editorRoot.querySelector('[data-ng-type]');
    mode.value = editorMode;
    editorRoot.querySelector('[data-ng-config]').hidden = editorMode !== 'on';
    if (editorMode !== 'on') {
      editorRoot.querySelector('#ng-controls').innerHTML = '';
      editorRoot.querySelector('#ng-preview').innerHTML = '<p class="ng-empty">Belum ada grafik. Pilih "Tambah grafik" untuk memulai.</p>';
      return;
    }
    var type = typeFromGraph(draft);
    typeSelect.value = type;
    editorRoot.querySelector('#ng-controls').innerHTML = renderControls(draft, type);
    drawEditorPreview();
  }
  function mutateRows(action, index) {
    var g = readEditorForm(), type = editorRoot.querySelector('[data-ng-type]').value;
    if (type === 'bar' || type === 'pie') {
      if (action === 'add-kategori') g.kategori.push({ nama: 'Kategori ' + (g.kategori.length + 1), nilai: 1 });
      if (action === 'remove-' + type) g.kategori.splice(index, 1);
    } else if (type === 'line') {
      if (action === 'add-category') {
        g.kategori.push('Titik ' + (g.kategori.length + 1));
        g.datasets.forEach(function (d) { d.nilai.push(0); });
      }
      if (action === 'remove-category') {
        g.kategori.splice(index, 1);
        g.datasets.forEach(function (d) { d.nilai.splice(index, 1); });
      }
      if (action === 'add-dataset') g.datasets.push({ nama: 'Dataset ' + (g.datasets.length + 1), nilai: g.kategori.map(function () { return 0; }) });
      if (action === 'remove-dataset') g.datasets.splice(index, 1);
    } else if (type.indexOf('fungsi-') === 0) {
      if (action === 'add-fungsi') g.fungsi.push({ nama: 'g(x)', persamaan: 'x' });
      if (action === 'remove-fungsi') g.fungsi.splice(index, 1);
    } else if (type === 'koordinat') {
      if (action === 'add-titik') g.titik.push({ nama: String.fromCharCode(65 + g.titik.length), x: 0, y: 0 });
      if (action === 'remove-titik') g.titik.splice(index, 1);
    }
    draft = g;
    renderEditor();
  }
  function initEditor(root) {
    editorRoot = root;
    if (!editorRoot) return;
    editorRoot.innerHTML = '<div class="ng-head"><div><h3>Grafik &amp; Visualisasi</h3><p class="muted">Tambahkan visual yang akan muncul bersama teks soal.</p></div><label class="ng-field ng-mode-field"><span>Visualisasi soal</span><select class="input" data-ng-mode><option value="off">Tanpa grafik</option><option value="on">Tambahkan grafik</option></select></label></div>'
      + '<div class="ng-actions"><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="enable">+ Tambah grafik</button><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="delete">Hapus grafik</button><button type="button" class="btn btn-secondary btn-kecil" data-ng-action="reset">Reset grafik</button></div>'
      + '<div data-ng-config hidden><label class="ng-field"><span>Jenis visualisasi</span><select class="input" data-ng-type><option value="bar">Grafik batang</option><option value="line">Grafik garis</option><option value="pie">Diagram lingkaran</option><option value="fungsi-linear">Grafik fungsi linear</option><option value="fungsi-kuadrat">Grafik fungsi kuadrat</option><option value="fungsi-eksponen">Grafik fungsi eksponen</option><option value="fungsi-lainnya">Grafik fungsi lainnya</option><option value="koordinat">Grafik koordinat Kartesius</option><option value="pertidaksamaan">Grafik pertidaksamaan</option></select></label>'
      + '<div class="ng-editor-layout"><div class="ng-editor-fields" id="ng-controls"></div><div class="ng-preview-wrap"><div class="ng-preview-heading">Pratinjau siswa</div><div id="ng-preview" class="ng-preview"><p class="ng-empty">Belum ada grafik.</p></div></div></div></div>';
    editorMode = 'off'; draft = null;
    editorRoot.addEventListener('change', function (e) {
      if (e.target.matches('[data-ng-mode]')) {
        editorMode = e.target.value;
        if (editorMode === 'on' && !draft) draft = blank(editorRoot.querySelector('[data-ng-type]').value);
        renderEditor();
      } else if (e.target.matches('[data-ng-type]')) {
        draft = blank(e.target.value);
        renderEditor();
      } else if (e.target.matches('[data-ng-field="hubungkan"]')) drawEditorPreview();
    });
    editorRoot.addEventListener('input', function (e) {
      if (e.target.matches('[data-ng-field]') && !e.target.matches('[data-ng-field="hubungkan"]')) drawEditorPreview();
    });
    editorRoot.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ng-action]');
      if (!b) return;
      var action = b.getAttribute('data-ng-action'), index = Number(b.getAttribute('data-index'));
      if (action === 'enable') {
        editorMode = 'on';
        if (!draft) draft = blank(editorRoot.querySelector('[data-ng-type]').value);
        renderEditor();
      } else if (action === 'delete') {
        editorMode = 'off'; draft = null; renderEditor();
      } else if (action === 'reset') {
        if (editorMode === 'off') { editorMode = 'on'; }
        draft = blank(editorRoot.querySelector('[data-ng-type]').value);
        renderEditor();
      } else if (action.indexOf('add-') === 0 || action.indexOf('remove-') === 0) {
        mutateRows(action, index);
      }
    });
    renderEditor();
  }
  function setEditorValue(g) {
    draft = normalize(g);
    editorMode = draft ? 'on' : 'off';
    renderEditor();
  }
  function getEditorValue() {
    if (editorMode !== 'on') return null;
    return normalize(readEditorForm());
  }
  function validateEditor() {
    if (editorMode !== 'on') return '';
    return validation(getEditorValue());
  }

  window.NalarineGraph = {
    graphHTML: graphHTML,
    renderAll: renderAll,
    initEditor: initEditor,
    setEditorValue: setEditorValue,
    getEditorValue: getEditorValue,
    validateEditor: validateEditor,
    validate: function (g) { return validation(normalize(g)); }
  };
})();
