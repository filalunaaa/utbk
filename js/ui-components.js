
// ===== Nalarine UI: dropdown, combobox, dan date picker kustom (komponen bersama) =====
// Mengganti popup bawaan browser untuk <select>, <input list="..."> (datalist), dan <input type="date">.
// Elemen asli tetap ada di DOM (tersembunyi), jadi value, event, dan validasi lama tetap bekerja.
// Elemen yang dirender belakangan (onboarding, form profil, dll.) otomatis ikut diganti.
(function () {
  'use strict';
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  var BLN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  var HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];
  var IKON = {
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>',
    kiri: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    kanan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    kal: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>'
  };
  var esc = function (t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var mobile = function () { return !!(window.matchMedia && window.matchMedia('(max-width:640px)').matches); };
  var lihat = function (el) { if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); };

  // ---------- Popover: satu popup terbuka pada satu waktu ----------
  var cur = null;
  function posisi() {
    if (!cur || cur.sheet) return;
    var p = cur.pop, r = cur.jangkar.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    var lebar = Math.min(Math.max(cur.lebar === 'jangkar' ? r.width : cur.lebar, 200), vw - 16);
    p.style.width = lebar + 'px';
    p.style.left = Math.max(8, Math.min(r.left, vw - lebar - 8)) + 'px';
    var bawah = vh - r.bottom - 12, atas = r.top - 12, tinggi = p.scrollHeight + 2;
    var keAtas = bawah < Math.min(tinggi, 220) && atas > bawah;
    p.style.maxHeight = Math.max(140, Math.min(380, keAtas ? atas : bawah)) + 'px';
    if (keAtas) { p.style.top = 'auto'; p.style.bottom = (vh - r.top + 6) + 'px'; p.classList.add('nl-atas'); }
    else { p.style.bottom = 'auto'; p.style.top = (r.bottom + 6) + 'px'; p.classList.remove('nl-atas'); }
  }
  function tutup(balik) {
    if (!cur) return;
    var c = cur; cur = null;
    c.pop.classList.remove('buka'); if (c.dim) c.dim.classList.remove('buka');
    c.trigger.setAttribute('aria-expanded', 'false'); c.trigger.classList.remove('nl-aktif');
    c.trigger.removeAttribute('aria-activedescendant');
    setTimeout(function () { c.pop.remove(); if (c.dim) c.dim.remove(); }, 170);
    if (balik && c.fokus && c.fokus.focus) c.fokus.focus({ preventScroll: true });
  }
  function buka(o) {
    tutup(false);
    var host = (o.jangkar.closest && o.jangkar.closest('#onboarding')) || document.body; // tetap di dalam dialog agar fokus tidak lepas
    var pop = document.createElement('div');
    pop.className = 'nl-pop ' + (o.kelas || '');
    pop.setAttribute('role', o.role || 'dialog');
    var sheet = mobile() && !o.tanpaSheet, dim = null;
    if (sheet) {
      dim = document.createElement('div'); dim.className = 'nl-dim'; host.appendChild(dim);
      dim.addEventListener('click', function () { tutup(false); });
      pop.classList.add('nl-sheet');
    }
    host.appendChild(pop);
    pop.addEventListener('mousedown', function (e) { if (!(e.target.classList && e.target.classList.contains('nl-cari'))) e.preventDefault(); });
    cur = { pop: pop, dim: dim, jangkar: o.jangkar, trigger: o.trigger, fokus: o.fokus, lebar: o.lebar || 'jangkar', sheet: sheet };
    o.trigger.setAttribute('aria-expanded', 'true'); o.trigger.classList.add('nl-aktif');
    o.isi(pop);
    posisi();
    requestAnimationFrame(function () { pop.classList.add('buka'); if (dim) dim.classList.add('buka'); });
    return cur;
  }
  document.addEventListener('mousedown', function (e) { if (cur && !cur.pop.contains(e.target) && !cur.jangkar.contains(e.target)) tutup(false); }, true);
  document.addEventListener('keydown', function (e) { if (cur && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); tutup(true); } }, true);
  window.addEventListener('resize', function () { if (cur) { if (cur.sheet !== mobile()) tutup(false); else posisi(); } });
  window.addEventListener('scroll', function (e) { if (cur && !cur.pop.contains(e.target)) posisi(); }, true);

  // ---------- Utilitas pemasangan pada elemen asli ----------
  function buatTrigger(asli, ekstra, ikon) {
    var tr = document.createElement('button');
    tr.type = 'button';
    tr.className = ('nl-trigger ' + ekstra + ' ' + asli.className).replace(/\s+/g, ' ').trim();
    var lab = asli.getAttribute('aria-label');
    if (!lab && asli.id) { var l = document.querySelector('label[for="' + asli.id + '"]'); if (l) lab = l.textContent.trim(); }
    if (lab) tr.setAttribute('aria-label', lab);
    tr.innerHTML = '<span class="nl-teks"></span>' + ikon;
    asli.classList.add('nl-asli'); asli.tabIndex = -1; asli.setAttribute('aria-hidden', 'true');
    asli.parentNode.insertBefore(tr, asli.nextSibling);
    asli.addEventListener('focus', function () { tr.focus(); });
    return tr;
  }
  function pasang(asli, tr, perbarui) {
    var proto = asli.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    ['value', 'selectedIndex'].forEach(function (p) {
      var d = Object.getOwnPropertyDescriptor(proto, p);
      if (!d || !d.set) return;
      Object.defineProperty(asli, p, { configurable: true, get: function () { return d.get.call(asli); }, set: function (v) { d.set.call(asli, v); perbarui(); } });
    });
    var sinkron = function () { tr.disabled = asli.disabled; tr.hidden = asli.hidden || asli.style.display === 'none'; perbarui(); };
    new MutationObserver(sinkron).observe(asli, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style', 'min', 'max'] });
    asli.addEventListener('change', sinkron);
    sinkron();
  }
  var kirim = function (el) { el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); };

  // ---------- 1. Dropdown (pengganti <select>) ----------
  function sambungSelect(sel) {
    if (sel._nl || sel.multiple || sel.size > 1 || sel.dataset.nl === 'off') return;
    sel._nl = true;
    var tr = buatTrigger(sel, '', IKON.caret);
    tr.setAttribute('aria-haspopup', 'listbox'); tr.setAttribute('aria-expanded', 'false');
    var teks = tr.querySelector('.nl-teks');
    function perbarui() {
      var o = sel.options[sel.selectedIndex];
      teks.textContent = (o && o.text.trim()) || sel.getAttribute('data-placeholder') || 'Pilih';
      tr.classList.toggle('nl-ph', !o || o.value === '');
    }
    pasang(sel, tr, perbarui);

    var idx = -1, btns = [];
    var item = function (o) { return { v: o.value, t: o.text.trim(), dis: o.disabled || (o.parentNode.tagName === 'OPTGROUP' && o.parentNode.disabled), i: o.index, g: o.parentNode.tagName === 'OPTGROUP' ? o.parentNode.label : null }; };
    function sorot(n) {
      btns = [].slice.call(cur.pop.querySelectorAll('.nl-opsi:not(:disabled)'));
      if (!btns.length) { idx = -1; return; }
      idx = (n + btns.length) % btns.length;
      btns.forEach(function (b, k) { b.classList.toggle('aktif', k === idx); });
      lihat(btns[idx]);
      var f = cur.pop.querySelector('.nl-cari') || tr; f.setAttribute('aria-activedescendant', btns[idx].id);
    }
    function pilih(b) {
      var i = +b.dataset.i;
      if (sel.selectedIndex !== i) { sel.selectedIndex = i; kirim(sel); }
      tutup(true);
    }
    function tombol(e) {
      if (!cur || cur.trigger !== tr) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sorot(idx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sorot(idx - 1); }
      else if (e.key === 'Home') { e.preventDefault(); sorot(0); }
      else if (e.key === 'End') { e.preventDefault(); sorot(-1); }
      else if (e.key === 'Enter' || (e.key === ' ' && e.target === tr)) { e.preventDefault(); e.stopPropagation(); if (btns[idx]) pilih(btns[idx]); }
      else if (e.key === 'Tab') tutup(false);
    }
    function bukaDaftar() {
      var data = [].map.call(sel.querySelectorAll('option'), item);
      var cari = data.length >= 8 || sel.hasAttribute('data-nl-cari');
      buka({ jangkar: tr, trigger: tr, fokus: tr, kelas: 'nl-pilih', role: 'listbox', isi: function (pop) {
        pop.innerHTML = (cari ? '<div class="nl-cari-w"><input class="nl-cari" type="search" placeholder="Cari pilihan..." aria-label="Cari pilihan" autocomplete="off"></div>' : '') + '<div class="nl-daftar"></div>';
        var dft = pop.querySelector('.nl-daftar'), kolom = pop.querySelector('.nl-cari');
        function gambar(q) {
          var h = '', gTampil = null, n = 0; q = (q || '').toLowerCase();
          data.forEach(function (x, k) {
            if (q && x.t.toLowerCase().indexOf(q) < 0) return;
            if (x.g !== gTampil) { gTampil = x.g; if (x.g) h += '<div class="nl-grup" role="presentation">' + esc(x.g) + '</div>'; }
            n++;
            var dipilih = x.i === sel.selectedIndex;
            h += '<button type="button" role="option" id="nl-o' + k + '" class="nl-opsi' + (dipilih ? ' dipilih' : '') + '" data-i="' + x.i + '" aria-selected="' + dipilih + '"' + (x.dis ? ' disabled' : '') + '><span>' + esc(x.t) + '</span></button>';
          });
          dft.innerHTML = h || '<div class="nl-info">Tidak ada hasil untuk &ldquo;' + esc(q) + '&rdquo;.</div>';
          posisi();
        }
        gambar('');
        dft.addEventListener('click', function (e) { var b = e.target.closest('.nl-opsi'); if (b && !b.disabled) pilih(b); });
        var k0 = [].findIndex.call(dft.querySelectorAll('.nl-opsi:not(:disabled)'), function (b) { return b.classList.contains('dipilih'); });
        if (kolom) {
          kolom.addEventListener('input', function () { gambar(kolom.value.trim()); sorot(0); });
          kolom.addEventListener('keydown', tombol);
          setTimeout(function () { kolom.focus({ preventScroll: true }); }, 0);
        }
        sorot(k0 < 0 ? 0 : k0);
      } });
    }
    tr.addEventListener('click', function () { if (cur && cur.trigger === tr) tutup(false); else bukaDaftar(); });
    tr.addEventListener('keydown', function (e) {
      if (cur && cur.trigger === tr) return tombol(e);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); bukaDaftar(); }
    });
  }

  // ---------- 2. Combobox (pengganti <input list="..."> / datalist) ----------
  function sambungCombo(inp) {
    if (inp._nl || inp.dataset.nl === 'off') return;
    inp._nl = true;
    inp.dataset.nlList = inp.getAttribute('list'); inp.removeAttribute('list');
    inp.setAttribute('role', 'combobox'); inp.setAttribute('aria-autocomplete', 'list'); inp.setAttribute('aria-expanded', 'false'); inp.setAttribute('autocomplete', 'off');
    var idx = -1, btns = [];
    var semua = function () { var dl = document.getElementById(inp.dataset.nlList); return dl ? [].map.call(dl.options, function (o) { return o.value; }) : []; };
    var terbuka = function () { return cur && cur.trigger === inp; };
    function sorot(n) {
      btns = [].slice.call(cur.pop.querySelectorAll('.nl-opsi'));
      if (!btns.length) { idx = -1; return; }
      idx = (n + btns.length) % btns.length;
      btns.forEach(function (b, k) { b.classList.toggle('aktif', k === idx); });
      lihat(btns[idx]); inp.setAttribute('aria-activedescendant', btns[idx].id);
    }
    function isi() {
      if (!terbuka()) return;
      var q = inp.value.trim().toLowerCase(), data = semua();
      var cocok = data.filter(function (t) { return !q || t.toLowerCase().indexOf(q) > -1; });
      var dft = cur.pop.querySelector('.nl-daftar');
      dft.innerHTML = cocok.map(function (t, k) { var s = t.toLowerCase() === q; return '<button type="button" role="option" id="nl-c' + k + '" class="nl-opsi' + (s ? ' dipilih' : '') + '" data-v="' + esc(t) + '" aria-selected="' + s + '"><span>' + esc(t) + '</span></button>'; }).join('') +
        (q && !cocok.length ? '<div class="nl-info">Tidak ada saran untuk &ldquo;' + esc(inp.value.trim()) + '&rdquo;. Lanjutkan mengetik untuk memakai teks ini.</div>' : '');
      idx = -1; btns = []; posisi();
      if (!data.length || (!cocok.length && !q)) tutup(false);
    }
    function bukaCombo() {
      if (terbuka()) return isi();
      if (!semua().length) return;
      buka({ jangkar: inp, trigger: inp, fokus: inp, tanpaSheet: true, kelas: 'nl-pilih', role: 'listbox', isi: function (pop) {
        pop.innerHTML = '<div class="nl-daftar"></div>';
        pop.querySelector('.nl-daftar').addEventListener('click', function (e) {
          var b = e.target.closest('.nl-opsi'); if (!b) return;
          inp.value = b.dataset.v; inp.dispatchEvent(new Event('input', { bubbles: true })); tutup(true);
        });
      } });
      isi();
    }
    inp.addEventListener('click', bukaCombo);
    inp.addEventListener('input', bukaCombo);
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!terbuka()) bukaCombo(); if (terbuka()) sorot(e.key === 'ArrowDown' ? idx + 1 : (idx < 0 ? -1 : idx - 1)); }
      else if (e.key === 'Enter' && terbuka() && idx > -1) { e.preventDefault(); e.stopPropagation(); inp.value = btns[idx].dataset.v; inp.dispatchEvent(new Event('input', { bubbles: true })); tutup(true); }
      else if (e.key === 'Tab') tutup(false);
    });
  }

  // ---------- 3. Date picker (pengganti <input type="date">) ----------
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var iso = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };
  var urai = function (s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  var fmt = function (s) { var t = urai(s); return t ? t.d + ' ' + BULAN[t.m] + ' ' + t.y : ''; };
  var hariIni = function () { var n = new Date(); return iso(n.getFullYear(), n.getMonth(), n.getDate()); };
  var geser = function (s, hari) { var t = urai(s), d = new Date(t.y, t.m, t.d + hari); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };

  function sambungTanggal(inp) {
    if (inp._nl || inp.dataset.nl === 'off') return;
    inp._nl = true;
    var tr = buatTrigger(inp, 'nl-tgl', IKON.kal);
    tr.setAttribute('aria-haspopup', 'dialog'); tr.setAttribute('aria-expanded', 'false');
    var teks = tr.querySelector('.nl-teks');
    function perbarui() {
      teks.textContent = inp.value ? fmt(inp.value) : (inp.getAttribute('placeholder') || 'Pilih tanggal');
      tr.classList.toggle('nl-ph', !inp.value);
    }
    pasang(inp, tr, perbarui);

    function bukaKal() {
      var min = inp.getAttribute('min') || '', maks = inp.getAttribute('max') || '', hi = hariIni();
      var dalam = function (s) { return (!min || s >= min) && (!maks || s <= maks); };
      var awal = urai(inp.value) ? inp.value : (maks && maks < hi ? maks : (min && min > hi ? min : hi));
      var a = urai(awal), st = { y: a.y, m: a.m, mode: 'hari', f: awal, y0: Math.floor(a.y / 12) * 12 };
      var bulanAda = function (y, m) { var s = iso(y, m, 1), e = iso(y, m, new Date(y, m + 1, 0).getDate()); return (!min || e >= min) && (!maks || s <= maks); };
      var tahunAda = function (y) { return (!min || iso(y, 11, 31) >= min) && (!maks || iso(y, 0, 1) <= maks); };
      buka({ jangkar: tr, trigger: tr, fokus: tr, lebar: 304, kelas: 'nl-kal', role: 'dialog', isi: function (pop) {
        pop.setAttribute('aria-label', 'Pilih tanggal');
        function gambar(fokus) {
          var h = '', judul, sebelum, sesudah;
          if (st.mode === 'hari') {
            judul = BULAN[st.m] + ' ' + st.y;
            var pm = new Date(st.y, st.m - 1, 1), nm = new Date(st.y, st.m + 1, 1);
            sebelum = bulanAda(pm.getFullYear(), pm.getMonth()); sesudah = bulanAda(nm.getFullYear(), nm.getMonth());
          } else if (st.mode === 'bulan') { judul = String(st.y); sebelum = tahunAda(st.y - 1); sesudah = tahunAda(st.y + 1); }
          else { judul = st.y0 + ' &ndash; ' + (st.y0 + 11); sebelum = tahunAda(st.y0 - 1); sesudah = tahunAda(st.y0 + 12); }
          h += '<div class="nl-kal-kepala"><button type="button" class="nl-nav" data-a="prev" aria-label="Sebelumnya"' + (sebelum ? '' : ' disabled') + '>' + IKON.kiri + '</button>' +
            '<button type="button" class="nl-judul-kal" data-a="mode" aria-live="polite">' + judul + (st.mode === 'hari' ? IKON.caret : '') + '</button>' +
            '<button type="button" class="nl-nav" data-a="next" aria-label="Berikutnya"' + (sesudah ? '' : ' disabled') + '>' + IKON.kanan + '</button></div>';
          var terpilih = inp.value;
          if (st.mode === 'hari') {
            h += '<div class="nl-grid7" role="grid">' + HARI.map(function (x) { return '<span class="nl-hr">' + x + '</span>'; }).join('');
            var awalBln = new Date(st.y, st.m, 1), mulai = (awalBln.getDay() + 6) % 7;
            var fk = urai(st.f) && urai(st.f).y === st.y && urai(st.f).m === st.m ? st.f : iso(st.y, st.m, 1);
            for (var k = 0; k < 42; k++) {
              var d = new Date(st.y, st.m, 1 - mulai + k), s = iso(d.getFullYear(), d.getMonth(), d.getDate()), luar = d.getMonth() !== st.m;
              h += '<button type="button" class="nl-hari' + (luar ? ' luar' : '') + (s === hi ? ' hariini' : '') + (s === terpilih ? ' dipilih' : '') + '" data-t="' + s + '" tabindex="' + (s === fk ? 0 : -1) + '" aria-label="' + d.getDate() + ' ' + BULAN[d.getMonth()] + ' ' + d.getFullYear() + '"' + (s === terpilih ? ' aria-pressed="true"' : '') + (dalam(s) ? '' : ' disabled') + '>' + d.getDate() + '</button>';
            }
            h += '</div>';
          } else if (st.mode === 'bulan') {
            var tp = urai(terpilih), tgt = tp && tp.y === st.y ? tp.m : -1, ini = urai(hi);
            h += '<div class="nl-grid4">' + BLN_PENDEK.map(function (x, m) { return '<button type="button" class="nl-bln' + (m === tgt ? ' dipilih' : '') + (ini.y === st.y && ini.m === m ? ' hariini' : '') + '" data-m="' + m + '" tabindex="' + (m === (tgt > -1 ? tgt : st.m) ? 0 : -1) + '"' + (bulanAda(st.y, m) ? '' : ' disabled') + '>' + x + '</button>'; }).join('') + '</div>';
          } else {
            var tp2 = urai(terpilih), ini2 = urai(hi), acuan = tp2 ? tp2.y : st.y, ada = false;
            h += '<div class="nl-grid4">';
            for (var y = st.y0; y < st.y0 + 12; y++) { h += '<button type="button" class="nl-bln' + (tp2 && tp2.y === y ? ' dipilih' : '') + (ini2.y === y ? ' hariini' : '') + '" data-y="' + y + '" tabindex="' + (y === acuan || (!ada && y === st.y0 && (acuan < st.y0 || acuan > st.y0 + 11)) ? 0 : -1) + '"' + (tahunAda(y) ? '' : ' disabled') + '>' + y + '</button>'; }
            h += '</div>';
          }
          h += '<div class="nl-kal-kaki"><button type="button" class="nl-teks-btn" data-a="hariini"' + (dalam(hi) ? '' : ' disabled') + '>Hari ini</button>' + (inp.required ? '' : '<button type="button" class="nl-teks-btn" data-a="hapus">Hapus</button>') + '</div>';
          pop.innerHTML = h; posisi();
          var t = fokus === 'grid' ? pop.querySelector('[tabindex="0"]') : (fokus ? pop.querySelector('[data-a="' + fokus + '"]:not(:disabled)') : null);
          if (t) t.focus({ preventScroll: true });
        }
        function pilihTgl(s) { if (!dalam(s)) return; inp.value = s; kirim(inp); tutup(true); }
        function geserBulan(n) { var d = new Date(st.y, st.m + n, 1); st.y = d.getFullYear(); st.m = d.getMonth(); var ff = urai(st.f); st.f = iso(st.y, st.m, Math.min(ff.d, new Date(st.y, st.m + 1, 0).getDate())); }
        pop.addEventListener('click', function (e) {
          var b = e.target.closest('button'); if (!b || b.disabled) return;
          var ak = b.dataset.a;
          if (b.dataset.t) return pilihTgl(b.dataset.t);
          if (b.dataset.m) { st.m = +b.dataset.m; st.mode = 'hari'; st.f = iso(st.y, st.m, 1); return gambar('grid'); }
          if (b.dataset.y) { st.y = +b.dataset.y; st.mode = 'bulan'; return gambar('grid'); }
          if (ak === 'prev' || ak === 'next') {
            var n = ak === 'next' ? 1 : -1;
            if (st.mode === 'hari') geserBulan(n); else if (st.mode === 'bulan') st.y += n; else st.y0 += 12 * n;
            return gambar(ak);
          }
          if (ak === 'mode') { if (st.mode === 'hari') st.mode = 'bulan'; else if (st.mode === 'bulan') { st.mode = 'tahun'; st.y0 = Math.floor(st.y / 12) * 12; } else st.mode = 'hari'; return gambar('mode'); }
          if (ak === 'hariini') return pilihTgl(hi);
          if (ak === 'hapus') { inp.value = ''; kirim(inp); tutup(true); }
        });
        pop.addEventListener('keydown', function (e) {
          var t = e.target;
          if (t.dataset && t.dataset.t) {
            var map = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }, f = t.dataset.t;
            if (map[e.key] !== undefined) f = geser(f, map[e.key]);
            else if (e.key === 'Home') f = geser(f, -((new Date(urai(f).y, urai(f).m, urai(f).d).getDay() + 6) % 7));
            else if (e.key === 'End') f = geser(f, 6 - ((new Date(urai(f).y, urai(f).m, urai(f).d).getDay() + 6) % 7));
            else if (e.key === 'PageUp' || e.key === 'PageDown') { var u = urai(f), dd = new Date(u.y + (e.shiftKey ? (e.key === 'PageUp' ? -1 : 1) : 0), u.m + (e.shiftKey ? 0 : (e.key === 'PageUp' ? -1 : 1)), 1); f = iso(dd.getFullYear(), dd.getMonth(), Math.min(u.d, new Date(dd.getFullYear(), dd.getMonth() + 1, 0).getDate())); }
            else return;
            e.preventDefault();
            if (!dalam(f)) return;
            var uf = urai(f); st.f = f; st.y = uf.y; st.m = uf.m; gambar('grid');
            var c = pop.querySelector('[data-t="' + f + '"]'); if (c) c.focus({ preventScroll: true });
          } else if (t.dataset && (t.dataset.m || t.dataset.y) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) > -1) {
            e.preventDefault();
            var all = [].slice.call(pop.querySelectorAll('.nl-bln:not(:disabled)')), i = all.indexOf(t), d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -4, ArrowDown: 4 }[e.key];
            if (all[i + d]) all[i + d].focus({ preventScroll: true });
          }
        });
        gambar('grid');
      } });
    }
    tr.addEventListener('click', function () { if (cur && cur.trigger === tr) tutup(false); else bukaKal(); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown' && !(cur && cur.trigger === tr)) { e.preventDefault(); bukaKal(); } });
  }

  // ---------- Pemasangan otomatis ----------
  function pindai(root) {
    root = root || document;
    if (root.matches) {
      if (root.matches('select')) sambungSelect(root);
      else if (root.matches('input[type="date"]')) sambungTanggal(root);
      else if (root.matches('input[list]')) sambungCombo(root);
    }
    if (!root.querySelectorAll) return;
    [].forEach.call(root.querySelectorAll('select'), sambungSelect);
    [].forEach.call(root.querySelectorAll('input[type="date"]'), sambungTanggal);
    [].forEach.call(root.querySelectorAll('input[list]'), sambungCombo);
  }
  pindai(document);
  new MutationObserver(function (muts) {
    muts.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1 && !(n.classList && (n.classList.contains('nl-pop') || n.classList.contains('nl-dim')))) pindai(n); }); });
  }).observe(document.body, { childList: true, subtree: true });
  window.NalarineUI = { pindai: pindai, tutup: function () { tutup(false); } };
})();
