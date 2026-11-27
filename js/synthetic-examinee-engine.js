/* Pytago Synthetic Examinee Engine
 * Isolated browser-only laboratory. Never reads/writes production response tables.
 * Synthetic item parameters are known ground truth; the diagnostic fit conditions on
 * generated theta values and is NOT the production MML-EM calibration.
 */
(function () {
  'use strict';
  if (window.PytagoSyntheticEngine) return;

  const CONFIG = Object.freeze({ examinees: 500, meanTheta: 0, sdTheta: 1, items: 12 });
  const randn = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const logistic = (z) => 1 / (1 + Math.exp(-Math.max(-35, Math.min(35, z))));
  const sigmoid = (z) => Math.max(1e-9, Math.min(1 - 1e-9, logistic(z)));
  const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const sd = (a) => {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
  };

  function generate() {
    const theta = Array.from({ length: CONFIG.examinees }, () => randn());
    const items = Array.from({ length: CONFIG.items }, (_, i) => ({
      id: 'SYN-' + String(i + 1).padStart(2, '0'),
      a: +(0.65 + Math.random() * 1.25).toFixed(3),
      b: +(-1.5 + Math.random() * 3).toFixed(3)
    }));
    const responses = theta.map((t) => items.map((it) => Math.random() < logistic(it.a * (t - it.b)) ? 1 : 0));
    return { schema: 'pytago.synthetic-examinee.v1', source: 'synthetic', generated_at: new Date().toISOString(),
      examinees: CONFIG.examinees, distribution: { type: 'normal', mean: 0, sd: 1 },
      model: '2PL', theta, items, responses };
  }

  // Conditional logistic fit using known synthetic theta; diagnostic only.
  function fitKnownTheta(theta, y) {
    let beta0 = 0, beta1 = 1;
    for (let iter = 0; iter < 80; iter++) {
      let g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
      for (let i = 0; i < theta.length; i++) {
        const p = sigmoid(beta0 + beta1 * theta[i]);
        const w = p * (1 - p);
        const e = y[i] - p;
        g0 += e; g1 += e * theta[i];
        h00 += w; h01 += w * theta[i]; h11 += w * theta[i] * theta[i];
      }
      const det = h00 * h11 - h01 * h01;
      if (Math.abs(det) < 1e-10) break;
      const d0 = (h11 * g0 - h01 * g1) / det;
      const d1 = (h00 * g1 - h01 * g0) / det;
      beta0 += Math.max(-1, Math.min(1, d0));
      beta1 += Math.max(-0.5, Math.min(0.5, d1));
      if (Math.abs(d0) + Math.abs(d1) < 1e-6) break;
      if (Math.abs(beta0) > 8 || Math.abs(beta1) > 8) break;
    }
    return beta1 > 0 ? { a: beta1, b: -beta0 / beta1 } : { a: null, b: null };
  }

  function diagnose(data) {
    const fitted = data.items.map((it, j) => {
      const y = data.responses.map((row) => row[j]);
      const fit = fitKnownTheta(data.theta, y);
      const p = mean(y);
      return { id: it.id, true_a: it.a, true_b: it.b, estimated_a: fit.a, estimated_b: fit.b,
        p_value: p, correct: y.reduce((s, x) => s + x, 0), incorrect: y.length - y.reduce((s, x) => s + x, 0),
        delta_a: fit.a === null ? null : fit.a - it.a, delta_b: fit.b === null ? null : fit.b - it.b };
    });
    const da = fitted.filter(x => x.delta_a !== null).map(x => x.delta_a);
    const db = fitted.filter(x => x.delta_b !== null).map(x => x.delta_b);
    return { fitted, summary: { n: data.examinees, item_count: data.items.length,
      theta_mean: mean(data.theta), theta_sd: sd(data.theta),
      mean_abs_error_a: mean(da.map(Math.abs)), mean_abs_error_b: mean(db.map(Math.abs)) } };
  }

  let latest = null;
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  function mount() {
    if (document.getElementById('pytago-synth-launcher')) return;
    let admin = false;
    try { admin = typeof ADMIN !== 'undefined' && ADMIN === true; } catch (_) {}
    if (!admin) return;
    const button = document.createElement('button');
    button.id = 'pytago-synth-launcher';
    button.type = 'button';
    button.textContent = 'Laboratorium IRT';
    button.setAttribute('aria-label', 'Buka Synthetic Examinee Engine');
    button.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:10020;border:0;border-radius:999px;padding:12px 18px;background:#243b72;color:#fff;font:600 13px inherit;box-shadow:0 5px 22px #0002;cursor:pointer';
    button.addEventListener('click', openPanel);
    document.body.appendChild(button);
  }

  function openPanel() {
    let root = document.getElementById('pytago-synth-panel');
    if (!root) {
      root = document.createElement('div');
      root.id = 'pytago-synth-panel';
      root.style.cssText = 'position:fixed;inset:0;z-index:10030;background:#10182799;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
      root.innerHTML = `
        <section role="dialog" aria-modal="true" aria-labelledby="pse-title" style="width:min(900px,100%);max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--text,#172033);border-radius:18px;padding:22px;box-shadow:0 18px 70px #0004">
          <header style="display:flex;justify-content:space-between;gap:16px;align-items:start"><div><small style="letter-spacing:.12em;color:var(--muted,#667085)">PYTAGO · LABORATORIUM INTERNAL</small><h2 id="pse-title" style="margin:6px 0">Synthetic Examinee Engine</h2><p style="margin:0;color:var(--muted,#667085)">500 peserta sintetis · θ ~ N(0,1) · model 2PL</p></div><button type="button" data-close aria-label="Tutup" class="btn btn-secondary">Tutup</button></header>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0">
            <div class="card"><small>Jumlah peserta</small><h2 style="margin:4px 0">500</h2><small>Data sintetis saja</small></div>
            <div class="card"><small>Distribusi kemampuan</small><h2 style="margin:4px 0">Normal</h2><small>Rerata 0 · SD 1</small></div>
            <div class="card"><small>Jumlah butir</small><h2 style="margin:4px 0">12</h2><small>Dikotomis 2PL</small></div>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px"><button type="button" class="btn btn-primary" id="pse-run">Jalankan simulasi</button><button type="button" class="btn btn-secondary" id="pse-export" disabled>Ekspor JSON sintetis</button></div>
          <p id="pse-status" class="pesan" role="status" aria-live="polite">Belum ada simulasi dijalankan.</p>
          <div id="pse-results"></div>
          <p style="font-size:12px;color:var(--muted,#667085);margin-top:18px">Pemisahan data: simulasi berlangsung di memori browser. Tidak mengirim respons ke Supabase, tidak mengubah paket/soal, dan tidak dapat digunakan sebagai kalibrasi empiris. Estimasi diagnostik memakai θ sintetis yang diketahui, bukan MML-EM produksi.</p>
        </section>`;
      document.body.appendChild(root);
      root.addEventListener('click', (e) => { if (e.target === root || e.target.closest('[data-close]')) root.remove(); });
      root.querySelector('#pse-run').addEventListener('click', run);
      root.querySelector('#pse-export').addEventListener('click', exportData);
    }
  }

  function run() {
    latest = generate();
    const d = diagnose(latest);
    const root = document.getElementById('pytago-synth-panel');
    const status = root.querySelector('#pse-status');
    const out = root.querySelector('#pse-results');
    root.querySelector('#pse-export').disabled = false;
    status.textContent = 'Simulasi selesai. 500 respons sintetis per peserta telah dibuat dan hanya tersimpan di memori browser.';
    status.className = 'pesan ok';
    const s = d.summary;
    out.innerHTML = `
      <div class="card" style="margin:12px 0"><h3>Ringkasan distribusi</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px"><div><small>Rerata θ</small><h3>${s.theta_mean.toFixed(3)}</h3></div><div><small>SD θ</small><h3>${s.theta_sd.toFixed(3)}</h3></div><div><small>MAE a</small><h3>${s.mean_abs_error_a.toFixed(3)}</h3></div><div><small>MAE b</small><h3>${s.mean_abs_error_b.toFixed(3)}</h3></div></div></div>
      <div class="card" style="overflow:auto"><h3>Parameter pembangkit vs estimasi diagnostik</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>Butir</th><th>a benar</th><th>a estimasi</th><th>b benar</th><th>b estimasi</th><th>p</th></tr></thead><tbody>${d.fitted.map(x => `<tr><td>${esc(x.id)}</td><td>${x.true_a.toFixed(3)}</td><td>${x.estimated_a === null ? '—' : x.estimated_a.toFixed(3)}</td><td>${x.true_b.toFixed(3)}</td><td>${x.estimated_b === null ? '—' : x.estimated_b.toFixed(3)}</td><td>${x.p_value.toFixed(3)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function exportData() {
    if (!latest) return;
    const blob = new Blob([JSON.stringify(latest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pytago-synthetic-500.json'; a.click();
    URL.revokeObjectURL(url);
  }

  window.PytagoSyntheticEngine = Object.freeze({ config: CONFIG, generate, diagnose, getLatest: () => latest });
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  mount();
})();