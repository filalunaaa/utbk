/* Pytago Synthetic Examinee Engine: isolated MML-EM 2PL parameter recovery. */
(function () {
  'use strict';
  if (window.PytagoSyntheticEngine) return;
  const CFG = { examinees:500, items:20, maxIterations:300, tolerance:1e-4, step:0.15 };
  const NODES = Array.from({length:61}, (_,i) => -4.5 + i * CFG.step);
  const SQRT_2PI = Math.sqrt(2 * Math.PI);
  const randn = () => {
    let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random();
    return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
  };
  const logistic = z => z>35 ? 1 : z< -35 ? 0 : 1/(1+Math.exp(-z));
  const clamp = (x,lo,hi) => Math.max(lo,Math.min(hi,x));
  const mean = xs => xs.length ? xs.reduce((s,x)=>s+x,0)/xs.length : null;
  const fmt = x => x===null || !Number.isFinite(x) ? '—' : x.toFixed(4);
  function logSumExp(xs) {
    const m=Math.max(...xs); if(!Number.isFinite(m))return m;
    return m+Math.log(xs.reduce((s,x)=>s+Math.exp(x-m),0));
  }
  function solve2(a,b,c,d,x,y) {
    const det=a*d-b*c; if(!Number.isFinite(det)||Math.abs(det)<1e-12)return null;
    return [(d*x-b*y)/det,(a*y-c*x)/det];
  }
  function priorWeights() {
    const w=NODES.map(t=>Math.exp(-.5*t*t)/SQRT_2PI*CFG.step), z=w.reduce((a,b)=>a+b,0);
    return w.map(x=>x/z);
  }
  const prob=(item,t)=>logistic(item.a*(t-item.b));

  function generate() {
    const theta=Array.from({length:CFG.examinees},randn);
    const items=Array.from({length:CFG.items},(_,i)=>({
      id:'SYN-'+String(i+1).padStart(2,'0'),
      a:+(.65+Math.random()*1.25).toFixed(3),
      b:+(-1.5+Math.random()*3).toFixed(3)
    }));
    const responses=theta.map(t=>items.map(it=>Math.random()<prob(it,t)?1:0));
    return {schema:'pytago.parameter-recovery.v2',source:'synthetic_only',
      generated_at:new Date().toISOString(),examinees:CFG.examinees,
      true_theta:theta,true_items:items,responses};
  }

  // Estimation function accepts response matrix only, never true theta or true item parameters.
  function posterior(row,items,prior) {
    const logs=NODES.map((t,q)=>{
      let v=Math.log(prior[q]);
      for(let j=0;j<items.length;j++){
        const y=row[j]; if(y===null)continue;
        const p=clamp(prob(items[j],t),1e-12,1-1e-12);
        v+=y===1?Math.log(p):Math.log1p(-p);
      }
      return v;
    });
    const norm=logSumExp(logs);
    return logs.map(v=>Math.exp(v-norm));
  }
  function maximizeItem(rc,tc,initial) {
    let slope=initial.a, intercept=-initial.a*initial.b;
    for(let it=0;it<60;it++){
      let g0=0,g1=0,i00=1e-7,i01=0,i11=1e-7;
      for(let q=0;q<NODES.length;q++){
        const n=tc[q]; if(n<=1e-12)continue;
        const t=NODES[q],p=logistic(intercept+slope*t),w=Math.max(1e-12,p*(1-p));
        const r=rc[q]-n*p; g0+=r; g1+=r*t;
        const info=n*w; i00+=info; i01+=info*t; i11+=info*t*t;
      }
      const d=solve2(i00,i01,i01,i11,g0,g1); if(!d)break;
      const ni=clamp(intercept+d[0],-20,20), ns=clamp(slope+d[1],.05,5);
      const change=Math.max(Math.abs(ni-intercept),Math.abs(ns-slope));
      intercept=ni;slope=ns;if(change<1e-7)break;
    }
    return {a:slope,b:-intercept/slope};
  }
  function logLikelihood(rows,items,prior) {
    let ll=0;
    for(const row of rows){
      const logs=NODES.map((t,q)=>{
        let v=Math.log(prior[q]);
        for(let j=0;j<items.length;j++){
          const y=row[j];if(y===null)continue;
          const p=clamp(prob(items[j],t),1e-12,1-1e-12);
          v+=y===1?Math.log(p):Math.log1p(-p);
        }
        return v;
      });
      ll+=logSumExp(logs);
    }
    return ll;
  }
  function estimateMML2PL(responses) {
    const rows=responses.map(r=>r.slice()), count=rows[0]?rows[0].length:0;
    const prior=priorWeights(), items=Array.from({length:count},()=>({a:1,b:0}));
    let converged=false,iterations=0,ll=-Infinity;
    const history=[];
    for(let iteration=1;iteration<=CFG.maxIterations;iteration++){
      const posts=rows.map(row=>posterior(row,items,prior));
      const next=items.map((current,j)=>{
        const rc=Array(NODES.length).fill(0),tc=Array(NODES.length).fill(0);
        for(let r=0;r<rows.length;r++){
          const y=rows[r][j];if(y===null)continue;
          for(let q=0;q<NODES.length;q++){
            tc[q]+=posts[r][q];if(y===1)rc[q]+=posts[r][q];
          }
        }
        return maximizeItem(rc,tc,current);
      });
      let maxChange=0;
      for(let j=0;j<count;j++){
        maxChange=Math.max(maxChange,Math.abs(next[j].a-items[j].a),Math.abs(next[j].b-items[j].b));
        items[j]=next[j];
      }
      ll=logLikelihood(rows,items,prior);iterations=iteration;
      if(iteration===1||iteration%10===0)history.push({iteration:iteration,logLikelihood:ll,maxParameterChange:maxChange});
      if(maxChange<CFG.tolerance){converged=true;break;}
    }
    return {items:items,converged:converged,iterations:iterations,logLikelihood:ll,history:history};
  }
  function metric(errors) {
    return {bias:mean(errors),mae:mean(errors.map(Math.abs)),
      rmse:errors.length?Math.sqrt(mean(errors.map(x=>x*x))):null};
  }
  function evaluate(data,est) {
    const fitted=est.items.map((x,j)=>{
      const truth=data.true_items[j], correct=data.responses.reduce((s,r)=>s+r[j],0);
      return {id:truth.id,true_a:truth.a,estimated_a:x.a,delta_a:x.a-truth.a,
        true_b:truth.b,estimated_b:x.b,delta_b:x.b-truth.b,
        p_value:correct/data.examinees,correct:correct,incorrect:data.examinees-correct};
    });
    const tm=mean(data.true_theta),ts=Math.sqrt(mean(data.true_theta.map(x=>(x-tm)*(x-tm))));
    return {fitted:fitted,summary:{examinees:data.examinees,item_count:fitted.length,
      theta_mean:tm,theta_sd:ts,a:metric(fitted.map(x=>x.delta_a)),b:metric(fitted.map(x=>x.delta_b)),
      converged:est.converged,iterations:est.iterations,log_likelihood:est.logLikelihood}};
  }
  let latest=null;
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function mount() {
    if(document.getElementById('pytago-synth-launcher'))return;
    let admin=false;try{admin=typeof ADMIN!=='undefined'&&ADMIN===true;}catch(_){}
    if(!admin)return;
    const b=document.createElement('button');b.id='pytago-synth-launcher';b.type='button';
    b.textContent='Laboratorium IRT';b.setAttribute('aria-label','Buka Laboratorium IRT');
    b.style.cssText='position:fixed;right:18px;bottom:18px;z-index:10020;border:0;border-radius:999px;padding:12px 18px;background:#243b72;color:#fff;font:600 13px inherit;box-shadow:0 5px 22px #0002;cursor:pointer';
    b.addEventListener('click',openPanel);document.body.appendChild(b);
  }
  function openPanel() {
    if(document.getElementById('pytago-synth-panel'))return;
    const root=document.createElement('div');root.id='pytago-synth-panel';
    root.style.cssText='position:fixed;inset:0;z-index:10030;background:#10182799;display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto';
    root.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="pse-title" style="width:min(1000px,100%);max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--text,#172033);border-radius:18px;padding:22px;box-shadow:0 18px 70px #0004">'+
      '<header style="display:flex;justify-content:space-between;gap:16px;align-items:start"><div><small>PYTAGO · LABORATORIUM INTERNAL</small><h2 id="pse-title">Parameter Recovery Test · IRT 2PL</h2><p>500 peserta sintetis · 20 butir · MML-EM · prior θ ~ N(0,1)</p></div><button type="button" data-close class="btn btn-secondary">Tutup</button></header>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:18px 0">'+
      '<div class="card"><small>Peserta</small><h2>500</h2><small>Data sintetis</small></div><div class="card"><small>Butir</small><h2>20</h2><small>PG dikotomis</small></div>'+
      '<div class="card"><small>Estimator</small><h2>MML-EM</h2><small>61 titik kuadratur</small></div><div class="card"><small>Iterasi maksimum</small><h2>300</h2><small>Toleransi 0,0001</small></div></div>'+
      '<div style="display:flex;gap:10px;margin-bottom:12px"><button type="button" class="btn btn-primary" id="pse-run">Jalankan Parameter Recovery</button><button type="button" class="btn btn-secondary" id="pse-export" disabled>Ekspor JSON</button></div>'+
      '<p id="pse-status" class="pesan" role="status" aria-live="polite">Siap. Estimator hanya menerima matriks respons, bukan θ atau parameter asli.</p><div id="pse-results"></div>'+
      '<p style="font-size:12px;color:var(--muted,#667085);margin-top:18px">Terisolasi: tidak membaca/menulis Supabase dan tidak mengubah paket produksi. Ini uji pemulihan pada data yang dibangkitkan dari model 2PL, bukan validasi model-fit pada peserta nyata.</p></section>';
    document.body.appendChild(root);
    root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-close]'))root.remove();});
    root.querySelector('#pse-run').addEventListener('click',run);
    root.querySelector('#pse-export').addEventListener('click',exportData);
  }
  function run() {
    const root=document.getElementById('pytago-synth-panel'),status=root.querySelector('#pse-status');
    const out=root.querySelector('#pse-results'),button=root.querySelector('#pse-run');
    button.disabled=true;root.querySelector('#pse-export').disabled=true;
    status.textContent='Membangkitkan respons dan menjalankan MML-EM. Proses dapat memerlukan beberapa saat...';
    out.innerHTML='';status.className='pesan';
    setTimeout(()=>{
      try{
        const data=generate();
        // Ground-truth values are intentionally not passed to the estimator.
        const estimated=estimateMML2PL(data.responses);
        const recovery=evaluate(data,estimated);
        latest={...data,estimator:'MML-EM',recovery:recovery,estimator_config:CFG};
        render(root,recovery,estimated);
        root.querySelector('#pse-export').disabled=false;
        status.textContent=estimated.converged?'Konvergensi tercapai pada iterasi '+estimated.iterations+'.':'Belum konvergen dalam batas iterasi. Jangan gunakan estimasi ini.';
        status.className=estimated.converged?'pesan ok':'pesan';
      }catch(err){status.textContent='Pengujian gagal: '+(err&&err.message?err.message:String(err));status.className='pesan error';}
      finally{button.disabled=false;}
    },30);
  }
  function render(root,result,est) {
    const s=result.summary;
    const card=(label,m)=>'<div class="card"><small>'+label+'</small><h3>'+fmt(m.mae)+'</h3><small>Bias '+fmt(m.bias)+' · RMSE '+fmt(m.rmse)+'</small></div>';
    const rows=result.fitted.map(x=>'<tr><td>'+esc(x.id)+'</td><td>'+fmt(x.true_a)+'</td><td>'+fmt(x.estimated_a)+'</td><td>'+fmt(x.delta_a)+'</td><td>'+fmt(x.true_b)+'</td><td>'+fmt(x.estimated_b)+'</td><td>'+fmt(x.delta_b)+'</td><td>'+fmt(x.p_value)+'</td></tr>').join('');
    root.querySelector('#pse-results').innerHTML='<div class="card" style="margin:12px 0"><h3>Hasil pemulihan parameter</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px">'+
      '<div><small>Konvergensi</small><h3>'+(est.converged?'Tercapai':'Belum')+'</h3></div><div><small>Iterasi</small><h3>'+s.iterations+'</h3></div>'+
      '<div><small>Rerata θ pembangkit</small><h3>'+fmt(s.theta_mean)+'</h3></div><div><small>SD θ pembangkit</small><h3>'+fmt(s.theta_sd)+'</h3></div>'+
      '<div><small>Log-likelihood</small><h3>'+fmt(s.log_likelihood)+'</h3></div></div></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:12px 0">'+card('Parameter a · MAE',s.a)+card('Parameter b · MAE',s.b)+'</div>'+
      '<div class="card" style="overflow:auto"><h3>Parameter asli vs estimasi MML-EM</h3><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>Butir</th><th>a asli</th><th>a estimasi</th><th>Δa</th><th>b asli</th><th>b estimasi</th><th>Δb</th><th>p benar</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p style="font-size:12px;color:var(--muted,#667085);margin-top:10px">MAE/RMSE mengukur selisih dari parameter pembangkit. Satu replikasi belum cukup untuk menyatakan algoritma tervalidasi; ulangi beberapa replikasi dan periksa kestabilan serta bias.</p>';
  }
  function exportData() {
    if(!latest)return;
    const blob=new Blob([JSON.stringify(latest,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='pytago-irt-2pl-parameter-recovery.json';a.click();URL.revokeObjectURL(url);
  }
  window.PytagoSyntheticEngine=Object.freeze({config:CFG,generate:generate,estimateMML2PL:estimateMML2PL,getLatest:()=>latest});
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  mount();
})();