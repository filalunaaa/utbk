(function () {
  'use strict';
  if (window.PytagoTryoutSimulator) return;
  const N = 500;
  const randn = () => { let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const prob = (theta,a,b) => 1/(1+Math.exp(-clamp(a*(theta-b),-30,30)));
  const isIsian = s => ['isian','isian_bilangan_cacah'].includes(String(s.tipe||'').toLowerCase());
  const isKompleks = s => ['kompleks','pg_kompleks'].includes(String(s.tipe||'').toLowerCase());
  const keyArray = s => Array.isArray(s.jawaban) ? s.jawaban.map(Number) : [Number(s.jawaban)];
  const score = (s, answer) => {
    if (typeof skorJawaban !== 'function') throw new Error('Mesin penilaian Pytago tidak tersedia.');
    return skorJawaban(s, answer);
  };
  const wrongAnswer = s => {
    if (isIsian(s)) {
      const k=Number(s.jawaban); return Number.isFinite(k) ? (k===0?1:k+1) : 0;
    }
    const opts=Array.isArray(s.opsi)?s.opsi:[];
    const keys=keyArray(s);
    const wrong=opts.map((_,i)=>i).filter(i=>!keys.includes(i));
    if (!wrong.length) return isKompleks(s)?[]:(keys[0]===0?1:0);
    if (!isKompleks(s)) return wrong[Math.floor(Math.random()*wrong.length)];
    const pick=wrong[Math.floor(Math.random()*wrong.length)];
    return Math.random()<0.5 ? [pick] : keys.filter((_,i)=>i>0).concat(pick);
  };
  const simulate = (questions) => {
    const items=questions.map((s,i)=>({id:s.id,number:i+1, a:+(0.7+Math.random()*1.1).toFixed(3), b:+(-1.5+Math.random()*3).toFixed(3), question:s}));
    const participants=Array.from({length:N},(_,i)=>{
      const theta=randn();
      const answers=items.map(it=>{
        const p=prob(theta,it.a,it.b);
        const correct=Math.random()<p;
        return correct ? (isKompleks(it.question)?keyArray(it.question):it.question.jawaban) : wrongAnswer(it.question);
      });
      const scores=items.map((it,j)=>score(it.question,answers[j]));
      const total=scores.reduce((a,b)=>a+b,0);
      return {synthetic_id:'SYN-'+String(i+1).padStart(4,'0'),theta:+theta.toFixed(4),answers,total_score:+total.toFixed(3),correct_count:scores.filter(x=>x===1).length};
    });
    const itemStats=items.map((it,j)=>{
      const vals=participants.map(p=>score(it.question,p.answers[j]));
      return {question_id:it.id,number:it.number,correct_rate:+(vals.reduce((a,b)=>a+b,0)/N).toFixed(4),correct:vals.filter(x=>x===1).length,incorrect:vals.filter(x=>x===0).length};
    });
    const scores=participants.map(p=>p.total_score);
    return {schema:'pytago.tryout-simulation.v1',source:'synthetic',persisted:false,generated_at:new Date().toISOString(),package:{id:window.__pytagoSimPackage.id,name:window.__pytagoSimPackage.name},participants_count:N,theta_distribution:{type:'normal',mean:0,sd:1},simulation:'local-dry-run-no-http-submissions',participants,summary:{mean_score:+(scores.reduce((a,b)=>a+b,0)/N).toFixed(3),min_score:Math.min(...scores),max_score:Math.max(...scores),mean_theta:+(participants.reduce((a,p)=>a+p.theta,0)/N).toFixed(3)},item_stats:itemStats};
  };
  const el=(tag,attrs={},html='')=>{const n=document.createElement(tag);Object.entries(attrs).forEach(([k,v])=>n.setAttribute(k,v));n.innerHTML=html;return n;};
  function mount(){
    if(!ADMIN || document.getElementById('pytago-to-sim-launcher'))return;
    const b=el('button',{id:'pytago-to-sim-launcher',type:'button'},'Simulasi Peserta TO');
    b.style.cssText='position:fixed;right:18px;bottom:72px;z-index:10020;border:0;border-radius:999px;padding:12px 18px;background:#155e55;color:white;font:600 13px inherit;box-shadow:0 5px 22px #0002;cursor:pointer';
    b.addEventListener('click',open);document.body.appendChild(b);
  }
  async function open(){
    let root=document.getElementById('pytago-to-sim-panel');
    if(root){root.remove();return;}
    root=el('div',{id:'pytago-to-sim-panel'},`
      <section role="dialog" aria-modal="true" aria-labelledby="pts-title" style="position:relative;z-index:1;width:min(900px,100%);max-height:none;overflow:visible;background:var(--card,#fff);color:var(--text,#172033);border-radius:18px;padding:22px;box-shadow:0 18px 70px #0004">
      <header style="display:flex;justify-content:space-between;gap:12px"><div><small style="letter-spacing:.1em;color:var(--muted,#667085)">PYTAGO · ADMIN TEST LAB</small><h2 id="pts-title" style="margin:6px 0">Automated Tryout Simulation</h2><p style="margin:0;color:var(--muted,#667085)">500 peserta virtual · respons sintetis · dry-run</p></div><button type="button" class="btn btn-secondary" data-close>Tutup</button></header>
      <div class="card" style="margin:16px 0"><p><strong>Mode aman:</strong> paket dan soal dibaca dari database; pengerjaan, jawaban, serta hasil dibuat di memori browser. Tidak ada POST ke tryout_hasil dan tidak ada akun peserta sintetis dibuat.</p><p style="font-size:12px;color:var(--muted,#667085)">Ini menguji pembacaan paket dan logika penilaian lokal, bukan beban server atau alur autentikasi peserta.</p></div>
      <label for="pts-package">Pilih paket tryout</label><select id="pts-package" class="input" style="position:relative;z-index:2147483001;display:block;margin:8px 0 14px;width:100%;min-height:44px"><option value="">Memuat paket...</option></select>
      <button type="button" class="btn btn-primary" id="pts-run">Jalankan 500 peserta virtual</button>
      <button type="button" class="btn btn-secondary" id="pts-export" disabled>Ekspor hasil JSON</button>
      <p id="pts-status" class="pesan" role="status" aria-live="polite">Pilih paket untuk memulai.</p><div id="pts-output"></div>
      </section>`);
    root.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#10182799;display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;overscroll-behavior:contain';
    root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-close]'))root.remove();});
    document.body.appendChild(root);
    try{
      const packs=await rest('tryout_paket?select=id,nama,status&order=dibuat_pada.desc');
      const select=root.querySelector('#pts-package');
      select.innerHTML='<option value="">— Pilih paket —</option>'+packs.filter(p=>p.status==='published'||ADMIN).map(p=>'<option value="'+String(p.id).replace(/"/g,'&quot;')+'">'+String(p.nama||'Paket').replace(/[&<>"]/g,'')+(p.status==='published'?'':' · Draft')+'</option>').join('');
      root.querySelector('#pts-run').addEventListener('click',()=>run(root));
      root.querySelector('#pts-export').addEventListener('click',()=>exportResult(root));
    }catch(err){root.querySelector('#pts-status').textContent='Gagal memuat paket: '+err.message;}
  }
  async function run(root){
    const id=root.querySelector('#pts-package').value;
    if(!id){root.querySelector('#pts-status').textContent='Pilih paket terlebih dahulu.';return;}
    const btn=root.querySelector('#pts-run');btn.disabled=true;
    try{
      const packs=await rest('tryout_paket?select=id,nama&id=eq.'+encodeURIComponent(id));
      const rows=await rest('tryout_soal?select=id,nomor_soal,kategori,tipe_soal,data&paket_id=eq.'+encodeURIComponent(id)+'&order=nomor_soal.asc');
      if(!Array.isArray(rows)||!rows.length)throw new Error('Paket belum memiliki soal.');
      const questions=rows.map(r=>{const d=typeof r.data==='string'?JSON.parse(r.data):(r.data||{});const t=String(d.tipe||r.tipe_soal||'pg').toLowerCase();return {...d,id:String(r.id),tipe:['isian','isian_bilangan_cacah'].includes(t)?'isian':(['kompleks','pg_kompleks'].includes(t)?'kompleks':'pg')};});
      if(questions.some(q=>q.jawaban===undefined||q.jawaban===null))throw new Error('Ada soal tanpa kunci jawaban. Perbaiki paket sebelum simulasi.');
      window.__pytagoSimPackage={id,name:packs?.[0]?.nama||'Paket'};
      const result=simulate(questions);window.__pytagoTryoutSimulation=result;
      root.querySelector('#pts-export').disabled=false;
      root.querySelector('#pts-status').textContent='Simulasi selesai: 500 peserta virtual × '+questions.length+' soal. Tidak ada data yang dikirim ke database.';
      const s=result.summary;
      root.querySelector('#pts-output').innerHTML='<div class="card" style="margin:12px 0"><h3>Ringkasan hasil</h3><p>Rata-rata skor: <strong>'+s.mean_score+'</strong> · Rentang: '+s.min_score+'–'+s.max_score+' · Rerata θ: '+s.mean_theta+'</p><p>Respons sintetis: <strong>'+(N*questions.length).toLocaleString('id-ID')+'</strong></p></div><div class="card" style="overflow:auto"><h3>Statistik per soal</h3><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th>No.</th><th>ID soal</th><th>Benar</th><th>Salah</th><th>Proporsi benar</th></tr></thead><tbody>'+safetable(result.item_stats)+'</tbody></table></div>';
    }catch(err){root.querySelector('#pts-status').textContent='Simulasi gagal: '+err.message;}
    finally{btn.disabled=false;}
  }
  function safetable(rows){return rows.map(x=>'<tr><td>'+x.number+'</td><td>'+String(x.question_id).replace(/[&<>"]/g,'')+'</td><td>'+x.correct+'</td><td>'+x.incorrect+'</td><td>'+x.correct_rate+'</td></tr>').join('');}
  function exportResult(root){
    const data=window.__pytagoTryoutSimulation;if(!data)return;
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='pytago-tryout-simulation-500.json';a.click();URL.revokeObjectURL(url);
  }
  window.PytagoTryoutSimulator=Object.freeze({participants: N,mode:'local-dry-run',simulate});
  const observer=new MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true});mount();
})();