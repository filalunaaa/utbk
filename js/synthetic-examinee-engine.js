/* Pytago Synthetic Examinee Engine: isolated MML-EM 2PL parameter recovery. */
(function () {
  'use strict';
  if (window.PytagoSyntheticEngine) return;
  const CFG = { examinees:500, items:20, maxIterations:300, tolerance:1e-4, step:0.15, repetitions:30 };
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

  function generate(examinees=CFG.examinees, fixedItems=null) {
    const theta=Array.from({length:examinees},randn);
    const items=fixedItems||Array.from({length:CFG.items},(_,i)=>({
      id:'SYN-'+String(i+1).padStart(2,'0'),
      a:+(.65+Math.random()*1.25).toFixed(3),
      b:+(-1.5+Math.random()*3).toFixed(3)
    }));
    const responses=theta.map(t=>items.map(it=>Math.random()<prob(it,t)?1:0));
    return {schema:'pytago.parameter-recovery.v2',source:'synthetic_only',
      generated_at:new Date().toISOString(),examinees:examinees,
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
  function expectedCompleteLogLikelihood(rc,tc,intercept,slope) {
    let qValue=0;
    for(let q=0;q<NODES.length;q++){
      const n=tc[q],r=rc[q];
      if(n<=1e-12)continue;
      const eta=intercept+slope*NODES[q];
      const p=clamp(logistic(eta),1e-12,1-1e-12);
      qValue+=r*Math.log(p)+(n-r)*Math.log1p(-p);
    }
    return qValue;
  }
  function maximizeItem(rc,tc,initial) {
    let slope=initial.a, intercept=-initial.a*initial.b;
    let converged=false, iterations=0, projectedGradient=Infinity;
    for(let it=0;it<80;it++){
      let g0=0,g1=0,i00=1e-8,i01=0,i11=1e-8;
      for(let q=0;q<NODES.length;q++){
        const n=tc[q]; if(n<=1e-12)continue;
        const t=NODES[q],p=logistic(intercept+slope*t),w=Math.max(1e-12,p*(1-p));
        const residual=rc[q]-n*p;
        g0+=residual;g1+=residual*t;
        const info=n*w;i00+=info;i01+=info*t;i11+=info*t*t;
      }
      const pg0=(intercept>=20-1e-10&&g0>0)||(intercept<=-20+1e-10&&g0<0)?0:g0;
      const pg1=(slope>=5-1e-10&&g1>0)||(slope<=.05+1e-10&&g1<0)?0:g1;
      projectedGradient=Math.max(Math.abs(pg0),Math.abs(pg1));
      if(projectedGradient<1e-6){converged=true;iterations=it;break;}
      const delta=solve2(i00,i01,i01,i11,g0,g1);
      if(!delta)return {a:slope,b:-intercept/slope,converged:false,iterations:it,reason:'singular_information'};
      const currentQ=expectedCompleteLogLikelihood(rc,tc,intercept,slope);
      let accepted=false,scale=1;
      for(let ls=0;ls<24;ls++,scale*=.5){
        const ni=clamp(intercept+scale*delta[0],-20,20);
        const ns=clamp(slope+scale*delta[1],.05,5);
        if(ni===intercept&&ns===slope)continue;
        const candidateQ=expectedCompleteLogLikelihood(rc,tc,ni,ns);
        if(Number.isFinite(candidateQ)&&candidateQ>=currentQ-1e-10){
          intercept=ni;slope=ns;accepted=true;break;
        }
      }
      iterations=it+1;
      if(!accepted){
        // A stalled Newton step is acceptable only when the constrained
        // score is already negligible; otherwise this M-step has failed.
        if(projectedGradient<1e-5){converged=true;break;}
        return {a:slope,b:-intercept/slope,converged:false,iterations,reason:'line_search_failed'};
      }
    }
    if(!converged){
      let g0=0,g1=0;
      for(let q=0;q<NODES.length;q++){
        const n=tc[q];if(n<=1e-12)continue;
        const t=NODES[q],p=logistic(intercept+slope*t),r=rc[q]-n*p;
        g0+=r;g1+=r*t;
      }
      const pg0=(intercept>=20-1e-10&&g0>0)||(intercept<=-20+1e-10&&g0<0)?0:g0;
      const pg1=(slope>=5-1e-10&&g1>0)||(slope<=.05+1e-10&&g1<0)?0:g1;
      projectedGradient=Math.max(Math.abs(pg0),Math.abs(pg1));
      converged=projectedGradient<1e-5;
    }
    return {a:slope,b:-intercept/slope,converged,iterations,projectedGradient,
      atBoundary:intercept<=-20+1e-8||intercept>=20-1e-8||slope<=.05+1e-8||slope>=5-1e-8};
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


  function isPositiveDefinite(matrix) {
    const n=matrix.length,L=Array.from({length:n},()=>Array(n).fill(0));
    const scale=Math.max(...matrix.map((row,i)=>Math.abs(row[i])));
    if(!Number.isFinite(scale)||scale<=0)return false;
    for(let i=0;i<n;i++)for(let j=0;j<=i;j++){
      let value=matrix[i][j];for(let k=0;k<j;k++)value-=L[i][k]*L[j][k];
      if(i===j){if(!Number.isFinite(value)||value<=scale*1e-12)return false;L[i][j]=Math.sqrt(value);}
      else L[i][j]=value/L[j][j];
    }
    return true;
  }

  function invertInformationMatrix(matrix) {
    const n=matrix.length,a=matrix.map(row=>row.slice()),inverse=Array.from({length:n},(_,i)=>Array.from({length:n},(_,j)=>i===j?1:0));
    const scale=Math.max(...a.map((row,i)=>Math.abs(row[i])));if(!Number.isFinite(scale)||scale<=0)return null;
    let minPivot=Infinity;
    for(let col=0;col<n;col++){
      let pivotRow=col;for(let r=col+1;r<n;r++)if(Math.abs(a[r][col])>Math.abs(a[pivotRow][col]))pivotRow=r;
      const pivot=Math.abs(a[pivotRow][col]);if(!Number.isFinite(pivot)||pivot<scale*1e-12)return null;
      minPivot=Math.min(minPivot,pivot/scale);
      if(pivotRow!==col){[a[col],a[pivotRow]]=[a[pivotRow],a[col]];[inverse[col],inverse[pivotRow]]=[inverse[pivotRow],inverse[col]];}
      const divisor=a[col][col];for(let j=0;j<n;j++){a[col][j]/=divisor;inverse[col][j]/=divisor;}
      for(let r=0;r<n;r++){if(r===col)continue;const factor=a[r][col];if(!factor)continue;for(let j=0;j<n;j++){a[r][j]-=factor*a[col][j];inverse[r][j]-=factor*inverse[col][j];}}
    }
    return {inverse,minPivot};
  }
  // Louis' identity: E[complete information|Y] - Cov(complete score|Y), jointly across items.
  function estimateJointObservedSE(rows,items,prior) {
    const itemCount=items.length,dimension=2*itemCount,work=rows.length*NODES.length*dimension*dimension;
    if(!itemCount)return {status:'unavailable',reason:'no_items',items:[]};
    if(dimension>80||work>80000000)return {status:'unavailable',reason:'computational_budget_exceeded',work,items:[]};
    const information=Array.from({length:dimension},()=>Array(dimension).fill(0));
    for(const row of rows){
      const weights=posterior(row,items,prior),meanScore=new Float64Array(dimension);
      const second=Array.from({length:dimension},()=>new Float64Array(dimension));
      for(let q=0;q<NODES.length;q++){
        const theta=NODES[q],weight=weights[q];if(weight<=0)continue;
        const score=new Float64Array(dimension);
        for(let j=0;j<itemCount;j++){
          const y=row[j];if(y===null)continue;
          const p=clamp(prob(items[j],theta),1e-12,1-1e-12),residual=y-p,x=2*j;
          score[x]=residual;score[x+1]=residual*theta;
          const h=weight*p*(1-p);
          information[x][x]+=h;information[x][x+1]+=h*theta;information[x+1][x]+=h*theta;information[x+1][x+1]+=h*theta*theta;
        }
        for(let i=0;i<dimension;i++){const si=score[i];meanScore[i]+=weight*si;if(si===0)continue;for(let k=0;k<dimension;k++)second[i][k]+=weight*si*score[k];}
      }
      for(let i=0;i<dimension;i++)for(let k=0;k<dimension;k++)information[i][k]-=second[i][k]-meanScore[i]*meanScore[k];
    }
    for(let i=0;i<dimension;i++)for(let k=i+1;k<dimension;k++){const v=(information[i][k]+information[k][i])/2;information[i][k]=v;information[k][i]=v;}
    if(!isPositiveDefinite(information))return {status:'unavailable',reason:'joint_observed_information_not_positive_definite',work,items:[]};
    const inverted=invertInformationMatrix(information);if(!inverted)return {status:'unavailable',reason:'joint_observed_information_singular',work,items:[]};
    const covariance=inverted.inverse;
    const estimates=items.map((item,j)=>{
      const c=2*j,d=c+1;if(item.a<=.050001||item.a>=4.999999||Math.abs(item.a*item.b)>=19.999)return {se_a:null,se_b:null,status:'boundary_parameter'};
      const varA=covariance[d][d],g0=-1/item.a,g1=-item.b/item.a;
      const varB=g0*g0*covariance[c][c]+2*g0*g1*covariance[c][d]+g1*g1*covariance[d][d];
      if(!Number.isFinite(varA)||!Number.isFinite(varB)||varA<=0||varB<=0)return {se_a:null,se_b:null,status:'non_positive_variance'};
      return {se_a:Math.sqrt(varA),se_b:Math.sqrt(varB),status:'computed'};
    });
    return {status:estimates.every(x=>x.status==='computed')?'computed':'partial',method:'louis_identity_full_joint_observed_information',
      parameterization:'intercept_slope',matrix_dimension:dimension,min_pivot_ratio:inverted.minPivot,work,items:estimates};
  }

  function estimateMML2PL(responses,options={}) {
    const rows=responses.map(r=>r.slice()), count=rows[0]?rows[0].length:0;
    const prior=priorWeights(), items=Array.from({length:count},()=>({a:1,b:0}));
    let converged=false,iterations=0,ll=logLikelihood(rows,items,prior),failure=null;
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
      const failed=next.findIndex(x=>!x.converged);
      if(failed>=0){failure={stage:'m_step',item_index:failed,reason:next[failed].reason||'inner_optimizer_not_converged'};break;}
      const previousItems=items.map(x=>({...x}));
      const maxChange=items.reduce((m,x,j)=>Math.max(m,Math.abs(next[j].a-x.a),Math.abs(next[j].b-x.b)),0);
      for(let j=0;j<count;j++)items[j]={a:next[j].a,b:next[j].b};
      const nextLL=logLikelihood(rows,items,prior);
      const llDrop=nextLL-ll;
      if(!Number.isFinite(nextLL)||llDrop < -1e-7){
        for(let j=0;j<count;j++)items[j]=previousItems[j];
        failure={stage:'em',reason:'observed_log_likelihood_decreased',log_likelihood_change:llDrop};
        break;
      }
      ll=nextLL;iterations=iteration;
      const perResponseLLChange=Math.abs(llDrop)/Math.max(1,rows.length);
      history.push({iteration,logLikelihood:ll,logLikelihoodChange:llDrop,
        perResponseLogLikelihoodChange:perResponseLLChange,maxParameterChange:maxChange,
        allMStepsConverged:true});
      if(maxChange<CFG.tolerance&&perResponseLLChange<CFG.tolerance){
        converged=true;break;
      }
    }
    const standardErrors=converged&&options.standardErrors===true?estimateJointObservedSE(rows,items,prior):{status:'not_requested',items:[]};
    return {items:items,converged:converged,iterations:iterations,logLikelihood:ll,history:history,failure:failure,standard_errors:standardErrors};
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
        se_a:est.standard_errors?.items?.[j]?.se_a??null,se_b:est.standard_errors?.items?.[j]?.se_b??null,
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
      '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px"><button type="button" class="btn btn-primary" id="pse-run">Jalankan 1 Replikasi</button><button type="button" class="btn btn-primary" id="pse-repeat">Jalankan 30 Replikasi</button><button type="button" class="btn btn-primary" id="pse-sensitivity">Uji Ukuran Sampel · 300/500/1.000</button><button type="button" class="btn btn-primary" id="pse-misspec">Uji Model Misspecification</button><button type="button" class="btn btn-primary" id="pse-se-calibration">Uji Kalibrasi SE · 100 Replikasi</button><button type="button" class="btn btn-primary" id="pse-local-dependence" disabled>Diagnostik Ketergantungan Lokal</button><button type="button" class="btn btn-primary" id="pse-local-null">Validasi Null Ketergantungan Lokal · 100 Replikasi</button><button type="button" class="btn btn-secondary" id="pse-export" disabled>Ekspor JSON</button></div>'+
      '<p id="pse-status" class="pesan" role="status" aria-live="polite">Siap. Estimator hanya menerima matriks respons, bukan θ atau parameter asli.</p><div id="pse-results"></div>'+
      '<p style="font-size:12px;color:var(--muted,#667085);margin-top:18px">Terisolasi: tidak membaca/menulis Supabase dan tidak mengubah paket produksi. Ini uji pemulihan pada data yang dibangkitkan dari model 2PL, bukan validasi model-fit pada peserta nyata.</p></section>';
    document.body.appendChild(root);
    root.addEventListener('click',e=>{if(e.target===root||e.target.closest('[data-close]'))root.remove();});
    root.querySelector('#pse-run').addEventListener('click',run);
    root.querySelector('#pse-repeat').addEventListener('click',runRepeated);
    root.querySelector('#pse-sensitivity').addEventListener('click',runSampleSensitivity);
    root.querySelector('#pse-misspec').addEventListener('click',runMisspecification);
    root.querySelector('#pse-se-calibration').addEventListener('click',runSECalibration);
    root.querySelector('#pse-local-dependence').addEventListener('click',runLocalDependenceDiagnostic);
    root.querySelector('#pse-local-null').addEventListener('click',runLocalDependenceNullValidation);
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
        const estimated=estimateMML2PL(data.responses,{standardErrors:true});
        const recovery=evaluate(data,estimated);
        latest={...data,estimator:'MML-EM',recovery:recovery,estimator_config:CFG,estimated_items:estimated.items};
        render(root,recovery,estimated);
         root.querySelector('#pse-local-dependence').disabled=!estimated.converged;
        root.querySelector('#pse-export').disabled=false;
        status.textContent=estimated.converged?'Konvergensi tercapai pada iterasi '+estimated.iterations+'.':'Estimasi ditolak: '+(estimated.failure?(estimated.failure.reason||'optimasi tidak konvergen'):'batas iterasi tercapai')+'. Jangan gunakan estimasi ini.';
        status.className=estimated.converged?'pesan ok':'pesan';
      }catch(err){status.textContent='Pengujian gagal: '+(err&&err.message?err.message:String(err));status.className='pesan error';}
      finally{button.disabled=false;}
    },30);
  }
  // Efficient leave-two-out posterior-predictive pair statistic.
  // Item likelihood contributions are cached so each pair only removes two terms.
  function computePosteriorPredictivePairwise(responses,estimated) {
    const prior=priorWeights(),n=responses.length,k=estimated.length;
    const itemProb=estimated.map(item=>NODES.map(t=>clamp(prob(item,t),1e-12,1-1e-12)));
    const logP=itemProb.map(ps=>ps.map(Math.log));
    const logQ=itemProb.map(ps=>ps.map(p=>Math.log1p(-p)));
    const sums=Array.from({length:k},()=>Array.from({length:k},()=>({adjusted:0,varJ:0,varM:0,valid:0})));
    for(let r=0;r<n;r++){
      const row=responses[r],contrib=Array.from({length:k},(_,j)=>{
        const y=row[j];return y===null?null:(y===1?logP[j]:logQ[j]);
      });
      const baseLogs=NODES.map((_,q)=>{
        let value=Math.log(prior[q]);
        for(let j=0;j<k;j++)if(contrib[j])value+=contrib[j][q];
        return value;
      });
      for(let j=0;j<k;j++)for(let m=j+1;m<k;m++){
        if(row[j]===null||row[m]===null)continue;
        const logs=NODES.map((_,q)=>baseLogs[q]-contrib[j][q]-contrib[m][q]);
        const norm=logSumExp(logs);
        let pj=0,pm=0,pjpm=0;
        for(let q=0;q<NODES.length;q++){
          const w=Math.exp(logs[q]-norm),a=itemProb[j][q],b=itemProb[m][q];
          pj+=w*a;pm+=w*b;pjpm+=w*a*b;
        }
        const posteriorCov=pjpm-pj*pm;
        const predictiveVarJ=pj*(1-pj),predictiveVarM=pm*(1-pm);
        const adjusted=(row[j]-pj)*(row[m]-pm)-posteriorCov;
        if(Number.isFinite(adjusted)&&predictiveVarJ>0&&predictiveVarM>0){
          const acc=sums[j][m];acc.adjusted+=adjusted;acc.varJ+=predictiveVarJ;acc.varM+=predictiveVarM;acc.valid++;
        }
      }
    }
    const pairs=[];
    for(let j=0;j<k;j++)for(let m=j+1;m<k;m++){
      const x=sums[j][m];if(!x.valid)continue;
      const covariance=x.adjusted/x.valid,scale=Math.sqrt((x.varJ/x.valid)*(x.varM/x.valid));
      pairs.push({item_1:estimated[j].id||('Item '+(j+1)),item_2:estimated[m].id||('Item '+(m+1)),
        adjusted_covariance:covariance,standardized_statistic:scale>0?covariance/scale:null,valid_n:x.valid});
    }
    const values=pairs.map(x=>x.standardized_statistic).filter(Number.isFinite);
    return {pairs,mean_adjusted_covariance:mean(pairs.map(x=>x.adjusted_covariance)),
      mean_abs_standardized_statistic:mean(values.map(Math.abs)),
      max_abs_standardized_statistic:values.length?Math.max(...values.map(Math.abs)):null};
  }
  async function runLocalDependenceDiagnostic() {
    const root=document.getElementById('pytago-synth-panel');if(!root||!latest?.responses)return;
    const status=root.querySelector('#pse-status'),out=root.querySelector('#pse-results');
    const button=root.querySelector('#pse-local-dependence'),exportButton=root.querySelector('#pse-export');
    const estimated=latest.estimated_items;
    if(!estimated||!latest.responses.length){status.textContent='Jalankan satu replikasi MML-EM terlebih dahulu.';return;}
    button.disabled=true;exportButton.disabled=true;status.className='pesan';out.innerHTML='';
    try {
      const diagnostic=computePosteriorPredictivePairwise(latest.responses,estimated);
      const sorted=diagnostic.pairs.slice().sort((a,b)=>Math.abs(b.standardized_statistic||0)-Math.abs(a.standardized_statistic||0));
      latest.local_dependence={method:'pairwise_leave_two_out_posterior_predictive_covariance_adjustment',
        ...diagnostic,note:'Statistik eksploratif; distribusi nol, cutoff, dan tingkat kesalahan belum dikalibrasi.'};
      out.innerHTML='<div class="card" style="margin:12px 0"><h3>Ketergantungan Lokal · Posterior-Predictive Pairwise Diagnostic</h3><p>Untuk setiap pasangan, sistem menghitung posterior kemampuan dari butir lain, lalu mengintegrasikan probabilitas respons pada seluruh titik kuadratur. Kovarians prediktif yang memang diharapkan akibat ketidakpastian kemampuan dikurangkan dari hasil kali residual teramati.</p><p><b>Pasangan valid:</b> '+diagnostic.pairs.length+' · <b>Rerata kovarians residual terkoreksi:</b> '+fmt(diagnostic.mean_adjusted_covariance)+' · <b>Max |statistik terstandar|:</b> '+fmt(diagnostic.max_abs_standardized_statistic)+'</p><div style="overflow:auto;max-height:360px"><table style="width:100%;font-size:12px"><thead><tr><th>Butir 1</th><th>Butir 2</th><th>Kovarians terkoreksi</th><th>Statistik terstandar</th><th>N</th></tr></thead><tbody>'+sorted.map(x=>'<tr><td>'+esc(x.item_1)+'</td><td>'+esc(x.item_2)+'</td><td>'+fmt(x.adjusted_covariance)+'</td><td>'+fmt(x.standardized_statistic)+'</td><td>'+x.valid_n+'</td></tr>').join('')+'</tbody></table></div><p><b>Batasan:</b> ini statistik eksploratif, bukan Q3 dan bukan uji signifikansi. Statistik terstandar bukan Z-score. Cutoff keputusan memerlukan simulasi nol independen dan validasi tingkat kesalahan.</p></div>';
      exportButton.disabled=false;status.textContent='Selesai: '+diagnostic.pairs.length+' pasangan dianalisis.';status.className='pesan ok';
    }catch(err){status.textContent='Diagnostik gagal: '+(err?.message||String(err));status.className='pesan error';}
    finally{button.disabled=false;}
  }
  async function runLocalDependenceNullValidation(options={}) {
    const root=document.getElementById('pytago-synth-panel');if(!root)return;
    const status=root.querySelector('#pse-status'),out=root.querySelector('#pse-results');
    const button=root.querySelector('#pse-local-null'),exportButton=root.querySelector('#pse-export');
    const controls=['#pse-run','#pse-repeat','#pse-sensitivity','#pse-misspec','#pse-se-calibration','#pse-local-dependence','#pse-local-null'].map(sel=>root.querySelector(sel)).filter(Boolean);
    controls.forEach(x=>x.disabled=true);exportButton.disabled=true;out.innerHTML='';status.className='pesan';
    const repetitions=Math.max(2,Math.floor(options.repetitions??100)),examinees=Math.max(100,Math.floor(options.examinees??500));
    const fixedItems=Array.from({length:CFG.items},(_,i)=>({id:'LD0-'+String(i+1).padStart(2,'0'),
      a:+(.65+Math.random()*1.25).toFixed(3),b:+(-1.5+Math.random()*3).toFixed(3)}));
    const runs=[],failures=[];
    try {
      for(let rep=0;rep<repetitions;rep++){
        status.textContent='Validasi null ketergantungan lokal · replikasi '+(rep+1)+'/'+repetitions+' · 500 peserta × 20 butir.';
        await delay(20);
        const data=generate(examinees,fixedItems);
        const est=estimateMML2PL(data.responses);
        if(!est.converged){
          failures.push({repetition:rep+1,reason:est.failure?.reason||'not_converged'});
          runs.push({repetition:rep+1,converged:false,iterations:est.iterations});
          continue;
        }
        const diag=computePosteriorPredictivePairwise(data.responses,est.items);
        runs.push({repetition:rep+1,converged:true,iterations:est.iterations,
          mean_adjusted_covariance:diag.mean_adjusted_covariance,
          mean_abs_standardized_statistic:diag.mean_abs_standardized_statistic,
          max_abs_standardized_statistic:diag.max_abs_standardized_statistic,
          valid_pairs:diag.pairs.length});
      }
      const valid=runs.filter(x=>x.converged);
      const maxStats=valid.map(x=>x.max_abs_standardized_statistic).filter(Number.isFinite);
      const meanCov=valid.map(x=>x.mean_adjusted_covariance).filter(Number.isFinite);
      const meanAbs=valid.map(x=>x.mean_abs_standardized_statistic).filter(Number.isFinite);
      const sampleSD=xs=>xs.length>1?Math.sqrt(xs.reduce((sum,x)=>sum+(x-mean(xs))**2,0)/(xs.length-1)):null;
      const summary={
        requested_repetitions:repetitions,successful_repetitions:valid.length,failed_repetitions:failures.length,
        convergence_rate:valid.length/repetitions,mean_iterations:mean(valid.map(x=>x.iterations)),
        mean_of_replication_mean_covariance:mean(meanCov),sd_of_replication_mean_covariance:sampleSD(meanCov),
        empirical_95_interval_mean_covariance:meanCov.length?[quantile(meanCov,.025),quantile(meanCov,.975)]:null,
        mean_of_replication_mean_abs_statistic:mean(meanAbs),
        mean_max_abs_statistic:mean(maxStats),sd_max_abs_statistic:sampleSD(maxStats),
        empirical_null_quantile_90_max_abs:quantile(maxStats,.90),
        empirical_null_quantile_95_max_abs:quantile(maxStats,.95),
        empirical_null_quantile_99_max_abs:quantile(maxStats,.99),
        observed_max_max_abs_statistic:maxStats.length?Math.max(...maxStats):null
      };
      latest={schema:'pytago.irt.local-dependence-null-monte-carlo.v1',source:'synthetic_only',
        estimator:'MML-EM 2PL',design:'fixed_20_item_parameters_across_100_independent_samples',
        data_generating_model:'unidimensional_2PL_with_conditional_local_independence',
        examinees,repetitions_requested:repetitions,true_items:fixedItems,summary,runs,failed_runs:failures,
        interpretation:'Null-distribution pilot only. Quantiles are descriptive calibration candidates, not validated operational cutoffs. No false-positive rate is estimated because an independent validation set has not yet been run.',
        generated_at:new Date().toISOString()};
      const rows=[
        ['Rerata kovarians residual',fmt(summary.mean_of_replication_mean_covariance),fmt(summary.sd_of_replication_mean_covariance)],
        ['Rerata mean |statistik|',fmt(summary.mean_of_replication_mean_abs_statistic),'—'],
        ['Rerata maksimum |statistik|',fmt(summary.mean_max_abs_statistic),fmt(summary.sd_max_abs_statistic)],
        ['Kuantil 90% maksimum',fmt(summary.empirical_null_quantile_90_max_abs),'—'],
        ['Kuantil 95% maksimum',fmt(summary.empirical_null_quantile_95_max_abs),'—'],
        ['Kuantil 99% maksimum',fmt(summary.empirical_null_quantile_99_max_abs),'—']
      ].map(x=>'<tr><td>'+x[0]+'</td><td>'+x[1]+'</td><td>'+x[2]+'</td></tr>').join('');
      out.innerHTML='<div class="card" style="margin:12px 0"><h3>Posterior-Predictive Pairwise Diagnostic · Null Monte Carlo</h3><p>100 replikasi independen · 500 peserta × 20 butir. Seluruh respons dibangkitkan dari model 2PL unidimensional dengan independensi lokal bersyarat. Parameter 20 butir ditahan tetap antarreplikasi; peserta dan respons dibangkitkan ulang.</p><p><b>Konvergensi:</b> '+valid.length+'/100 · <b>Gagal:</b> '+failures.length+'/100 · <b>Rerata iterasi:</b> '+fmt(summary.mean_iterations)+'</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr><th>Statistik ringkasan</th><th>Estimasi</th><th>SD antarreplikasi</th></tr></thead><tbody>'+rows+'</tbody></table></div><p><b>Interval empiris 95% rerata kovarians per replikasi:</b> '+(summary.empirical_95_interval_mean_covariance?fmt(summary.empirical_95_interval_mean_covariance[0])+' sampai '+fmt(summary.empirical_95_interval_mean_covariance[1]):'—')+'</p></div><div class="card"><h3>Interpretasi dan batasan</h3><p>Distribusi maksimum |statistik terstandar| menggambarkan perilaku diagnostik ketika asumsi independensi lokal benar pada kondisi simulasi ini. Kuantil 95% adalah kandidat ambang kalibrasi, bukan cutoff produksi.</p><p>Karena belum ada kumpulan validasi independen, pengujian ini belum mengukur false-positive rate secara independen. Tahap berikutnya—jika hasil stabil—adalah mengunci kandidat cutoff dari sebagian replikasi dan mengukurnya pada replikasi 2PL baru.</p><p>Statistik terstandar tetap bukan Z-score. Seluruh kesimpulan hanya berlaku untuk konfigurasi N=500, 20 butir, distribusi parameter yang digunakan, kuadratur dan implementasi estimator ini.</p></div><div class="card" style="overflow:auto"><h3>Hasil per replikasi</h3><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>Rep</th><th>Konvergen</th><th>Iterasi</th><th>Rerata kovarians</th><th>Mean |statistik|</th><th>Max |statistik|</th><th>Pasangan valid</th></tr></thead><tbody>'+runs.map(x=>'<tr><td>'+x.repetition+'</td><td>'+(x.converged?'Ya':'Tidak')+'</td><td>'+x.iterations+'</td><td>'+fmt(x.mean_adjusted_covariance)+'</td><td>'+fmt(x.mean_abs_standardized_statistic)+'</td><td>'+fmt(x.max_abs_standardized_statistic)+'</td><td>'+(x.valid_pairs??'—')+'</td></tr>').join('')+'</tbody></table></div>';
      exportButton.disabled=false;
      status.textContent='Selesai: '+valid.length+'/100 replikasi konvergen. Distribusi null berhasil dihitung; belum ada validasi false-positive independen.';
      status.className=valid.length===100?'pesan ok':'pesan';
    }catch(err){status.textContent='Validasi null gagal: '+(err?.message||String(err));status.className='pesan error';}
    finally{controls.forEach(x=>x.disabled=false);}
  }

  // Controlled testlet alternative pilot. Each four-item testlet shares a
  // person-level N(0,1) effect; tau=0 is the local-independence null.
  async function runLocalDependenceAlternativePilot(options={}) {
    const repetitions=Math.max(4,Math.floor(options.repetitions??20));
    const examinees=Math.max(100,Math.floor(options.examinees??500));
    const strengths=(options.strengths||[0.35,0.70]).map(Number);
    if(!strengths.length||strengths.some(x=>!Number.isFinite(x)||x<=0||x>1.5))
      throw new Error('Testlet strengths must be finite values in (0, 1.5].');
    const fixedItems=Array.from({length:CFG.items},(_,i)=>({
      id:'LD1-'+String(i+1).padStart(2,'0'),
      a:+(.65+Math.random()*1.25).toFixed(3),
      b:+(-1.5+Math.random()*3).toFixed(3)
    }));
    const groups=Array.from({length:Math.ceil(CFG.items/4)},(_,g)=>
      Array.from({length:4},(_,j)=>g*4+j).filter(i=>i<CFG.items));
    const generateCondition=(tau)=>{
      const theta=Array.from({length:examinees},randn);
      const responses=theta.map(t=>{
        const testlet=groups.map(()=>randn());
        return fixedItems.map((item,j)=>{
          const group=Math.floor(j/4);
          const p=logistic(item.a*(t-item.b)+tau*testlet[group]);
          return Math.random()<p?1:0;
        });
      });
      return {responses};
    };
    const fitOne=async(tau)=>{
      const data=generateCondition(tau);
      const est=estimateMML2PL(data.responses);
      if(!est.converged)return {converged:false,iterations:est.iterations,
        failure:est.failure?.reason||'not_converged'};
      const diagnostic=computePosteriorPredictivePairwise(data.responses,est.items);
      return {converged:true,iterations:est.iterations,
        max_abs_statistic:diagnostic.max_abs_standardized_statistic,
        mean_abs_statistic:diagnostic.mean_abs_standardized_statistic};
    };
    const calibration=[],nullValidation=[],alternatives={};
    for(let rep=0;rep<repetitions;rep++){
      calibration.push({replication:rep+1,...await fitOne(0)});
    }
    const cutoff=quantile(calibration.filter(x=>x.converged).map(x=>x.max_abs_statistic).filter(Number.isFinite),.95);
    if(!Number.isFinite(cutoff))throw new Error('Calibration did not produce a finite null cutoff.');
    for(let rep=0;rep<repetitions;rep++)
      nullValidation.push({replication:rep+1,...await fitOne(0)});
    for(const tau of strengths){
      const key=String(tau);
      alternatives[key]=[];
      for(let rep=0;rep<repetitions;rep++)
        alternatives[key].push({replication:rep+1,...await fitOne(tau)});
    }
    const wilson=(success,total)=>{
      if(!total)return null;
      const z=1.959963984540054,p=success/total,z2=z*z,den=1+z2/total;
      const center=(p+z2/(2*total))/den;
      const half=z*Math.sqrt((p*(1-p)/total)+z2/(4*total*total))/den;
      return [Math.max(0,center-half),Math.min(1,center+half)];
    };
    const summarize=(runs)=>{
      const valid=runs.filter(x=>x.converged&&Number.isFinite(x.max_abs_statistic));
      const detected=valid.filter(x=>x.max_abs_statistic>cutoff).length;
      const operational=runs.filter(x=>x.converged&&Number.isFinite(x.max_abs_statistic)&&x.max_abs_statistic>cutoff).length;
      return {requested:runs.length,converged:valid.length,failed:runs.length-valid.length,
        convergence_rate:valid.length/runs.length,exceedances:detected,
        detection_rate_conditional:valid.length?detected/valid.length:null,
        detection_rate_operational:operational/runs.length,
        wilson_95_conditional:valid.length?wilson(detected,valid.length):null,
        mean_max_abs_statistic:mean(valid.map(x=>x.max_abs_statistic)),
        median_max_abs_statistic:quantile(valid.map(x=>x.max_abs_statistic),.5)};
    };
    const calibrationValid=calibration.filter(x=>x.converged&&Number.isFinite(x.max_abs_statistic));
    const result={
      schema:'pytago.irt.local-dependence-testlet-pilot.v1',
      source:'synthetic_only',
      design:'fixed_20_item_bank_independent_calibration_and_validation_with_person_testlet_random_effect',
      estimator:'MML-EM 2PL unidimensional (deliberately omits testlet effect)',
      examinees,item_count:fixedItems.length,testlet_groups:groups.map(g=>g.map(i=>fixedItems[i].id)),
      testlet_effect:'u_person,testlet ~ N(0,1); linear predictor adds tau*u to items in same four-item testlet',
      strengths,cutoff_method:'empirical 95th percentile of calibration null max absolute statistic',
      calibration:{...summarize(calibration),quantile_95:cutoff,
        max_abs_statistics:calibrationValid.map(x=>x.max_abs_statistic)},
      null_validation:summarize(nullValidation),
      alternatives:Object.fromEntries(Object.entries(alternatives).map(([tau,runs])=>[tau,summarize(runs)])),
      runs:{calibration,null_validation:nullValidation,alternatives},
      true_items:fixedItems,generated_at:new Date().toISOString(),
      interpretation:'Exploratory pilot only. Small calibration/validation counts make cutoff and rates imprecise. The diagnostic is not Yen Q3 or a validated significance test; testlet effects are an intentionally controlled alternative.'
    };
    latest=result;
    return result;
  }
  const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
  async function runRepeated() {
    const root=document.getElementById('pytago-synth-panel');
    if(!root)return;
    const status=root.querySelector('#pse-status'),out=root.querySelector('#pse-results');
    const single=root.querySelector('#pse-run'),repeat=root.querySelector('#pse-repeat'),exportButton=root.querySelector('#pse-export');
    single.disabled=true;repeat.disabled=true;exportButton.disabled=true;
    out.innerHTML='';status.className='pesan';
    const runs=[],allA=[],allB=[];
    let convergedCount=0;
    try {
      for(let i=0;i<CFG.repetitions;i++){
        status.textContent='Replikasi '+(i+1)+' dari '+CFG.repetitions+' · membangkitkan data dan menjalankan MML-EM...';
        await delay(20);
        const data=generate();
        const estimated=estimateMML2PL(data.responses);
        const recovery=evaluate(data,estimated);
        if(estimated.converged)convergedCount++;
        for(const item of recovery.fitted){allA.push(item.delta_a);allB.push(item.delta_b);}
        runs.push({
          repetition:i+1,
          converged:estimated.converged,
          iterations:estimated.iterations,
          log_likelihood:estimated.logLikelihood,
          theta_mean:recovery.summary.theta_mean,
          theta_sd:recovery.summary.theta_sd,
          a:recovery.summary.a,
          b:recovery.summary.b,
          items:recovery.fitted
        });
      }
      const aggregate={
        repetitions:CFG.repetitions,
        converged_count:convergedCount,
        convergence_rate:convergedCount/CFG.repetitions,
        mean_iterations:mean(runs.map(x=>x.iterations)),
        mean_log_likelihood:mean(runs.map(x=>x.log_likelihood)),
        pooled_a:metric(allA),
        pooled_b:metric(allB),
        mean_run_mae_a:mean(runs.map(x=>x.a.mae)),
        mean_run_mae_b:mean(runs.map(x=>x.b.mae))
      };
      latest={
        schema:'pytago.parameter-recovery.repeated.v1',
        source:'synthetic_only',
        generated_at:new Date().toISOString(),
        estimator:'MML-EM',
        estimator_config:CFG,
        aggregate:aggregate,
        repetitions:runs
      };
      renderRepeated(root,aggregate,runs);
      exportButton.disabled=false;
      status.textContent='Selesai: '+convergedCount+'/'+CFG.repetitions+' replikasi konvergen.';
      status.className=convergedCount===CFG.repetitions?'pesan ok':'pesan';
    } catch(err) {
      status.textContent='Pengujian berulang gagal: '+(err&&err.message?err.message:String(err));
      status.className='pesan error';
    } finally {
      single.disabled=false;repeat.disabled=false;
    }
  }
  function generateScenario(kind,examinees=1000,options={}) {
    const theta=Array.from({length:examinees},randn);
    const theta2=kind==='2D'?Array.from({length:examinees},randn):null;
    const items=Array.from({length:CFG.items},(_,i)=>{
      const baseA=+.65+Math.random()*1.25;
      const a=kind==='1PL'?1:+baseA.toFixed(3);
      const b=+(-1.5+Math.random()*3).toFixed(3);
      return {id:'SYN-'+String(i+1).padStart(2,'0'),a,b,
        c:kind==='3PL'?(options.guessing??.15):0,
        a2:kind==='2D'?(Math.random()<.5?-1:1)*a*(options.secondary_loading??.45):0};
    });
    const responses=theta.map((t,r)=>items.map(it=>{
      let p;
      if(kind==='3PL')p=it.c+(1-it.c)*logistic(it.a*(t-it.b));
      else if(kind==='2D')p=logistic(it.a*t+it.a2*theta2[r]-it.a*it.b);
      else p=logistic(it.a*(t-it.b));
      return Math.random()<p?1:0;
    }));
    return {examinees,theta,theta2,items,responses};
  }
  function eapTheta(row,items,prior) {
    const post=posterior(row,items,prior);
    return mean(post.map((w,q)=>w*NODES[q]));
  }
  function correlation(x,y) {
    const mx=mean(x),my=mean(y);
    let num=0,dx=0,dy=0;
    for(let i=0;i<x.length;i++){const a=x[i]-mx,b=y[i]-my;num+=a*b;dx+=a*a;dy+=b*b;}
    return dx>0&&dy>0?num/Math.sqrt(dx*dy):null;
  }
  function residualDiagnostics(responses,estimatedItems) {
    const prior=priorWeights(),n=responses.length,k=estimatedItems.length;
    const scores=responses.map(row=>eapTheta(row,estimatedItems,prior));
    const order=scores.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
    const bins=Array.from({length:5},()=>[]);
    order.forEach((x,i)=>bins[Math.min(4,Math.floor(i*5/n))].push(x.i));
    const residuals=Array.from({length:k},()=>Array(n).fill(0));
    let curveSq=0,curveCount=0;
    for(let j=0;j<k;j++){
      for(let r=0;r<n;r++)residuals[j][r]=responses[r][j]-prob(estimatedItems[j],scores[r]);
      for(const group of bins){
        if(!group.length)continue;
        const observed=mean(group.map(r=>responses[r][j]));
        const expected=mean(group.map(r=>prob(estimatedItems[j],scores[r])));
        curveSq+=(observed-expected)*(observed-expected);curveCount++;
      }
    }
    const absQ3=[];
    for(let j=0;j<k;j++)for(let m=j+1;m<k;m++)absQ3.push(Math.abs(correlation(residuals[j],residuals[m])));
    return {mean_abs_q3:mean(absQ3),max_abs_q3:Math.max(...absQ3),
      item_curve_rms:Math.sqrt(curveSq/Math.max(1,curveCount))};
  }
  const quantile = (values,p) => {
    const xs=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
    if(!xs.length)return null;
    const pos=(xs.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);
    return xs[lo]+(xs[hi]-xs[lo])*(pos-lo);
  };
  async function runMisspecification() {
    const root=document.getElementById('pytago-synth-panel');if(!root)return;
    const status=root.querySelector('#pse-status'),out=root.querySelector('#pse-results');
    const buttons=['#pse-run','#pse-repeat','#pse-sensitivity','#pse-misspec'].map(sel=>root.querySelector(sel));
    const exportButton=root.querySelector('#pse-export');
    buttons.forEach(b=>b.disabled=true);exportButton.disabled=true;
    out.innerHTML='';status.className='pesan';
    const sampleSizes=[500,1000,2000],repetitions=100,results=[];
    const primaryStatistic='max_abs_q3';
    const conditions=[
      {id:'2PL',role:'kalibrasi',label:'2PL null · kalibrasi'},
      {id:'2PL',role:'validasi_nol',label:'2PL null · validasi'},
      {id:'1PL',role:'benchmark',label:'Rasch benchmark · equal discrimination'},
      {id:'3PL',role:'misspecification',label:'3PL · c=0,05',options:{guessing:.05}},
      {id:'3PL',role:'misspecification',label:'3PL · c=0,15',options:{guessing:.15}},
      {id:'3PL',role:'misspecification',label:'3PL · c=0,25',options:{guessing:.25}},
      {id:'2D',role:'misspecification',label:'2D · loading sekunder 0,25',options:{secondary_loading:.25}},
      {id:'2D',role:'misspecification',label:'2D · loading sekunder 0,45',options:{secondary_loading:.45}},
      {id:'2D',role:'misspecification',label:'2D · loading sekunder 0,70',options:{secondary_loading:.70}}
    ];
    const totalFits=sampleSizes.length*conditions.length*repetitions;
    try {
      for(const n of sampleSizes){
        for(const condition of conditions){
          const runs=[];let converged=0;
          for(let rep=0;rep<repetitions;rep++){
            const completed=results.reduce((sum,x)=>sum+x.runs.length,0)+rep+1;
            status.textContent='N='+n+' · '+condition.label+' · replikasi '+(rep+1)+'/'+repetitions+' · '+completed+'/'+totalFits;
            await delay(10);
            const data=generateScenario(condition.id,n,condition.options||{});
            const est=estimateMML2PL(data.responses);
            const diag=est.converged?residualDiagnostics(data.responses,est.items):null;
            if(est.converged)converged++;
            runs.push({repetition:rep+1,converged:est.converged,iterations:est.iterations,
              log_likelihood:est.logLikelihood,
              mean_abs_q3:diag?.mean_abs_q3??null,max_abs_q3:diag?.max_abs_q3??null,
              item_curve_rms:diag?.item_curve_rms??null});
          }
          const finiteMean=key=>mean(runs.map(x=>x[key]).filter(Number.isFinite));
          results.push({scenario:condition.id,role:condition.role,label:condition.label,
            examinees:n,repetitions,options:condition.options||{},
            convergence_rate:converged/repetitions,converged_count:converged,
            mean_iterations:finiteMean('iterations'),mean_abs_q3:finiteMean('mean_abs_q3'),
            max_abs_q3:finiteMean('max_abs_q3'),mean_item_curve_rms:finiteMean('item_curve_rms'),runs});
        }
      }
      const calibrations={};
      for(const n of sampleSizes){
        const atN=results.filter(x=>x.examinees===n);
        const calibration=atN.find(x=>x.role==='kalibrasi');
        const validation=atN.find(x=>x.role==='validasi_nol');
        const calibrationValues=calibration.runs.filter(x=>x.converged&&Number.isFinite(x[primaryStatistic])).map(x=>x[primaryStatistic]);
        if(calibrationValues.length<80)throw new Error('N='+n+': hanya '+calibrationValues.length+'/100 fit kalibrasi konvergen; cutoff tidak cukup stabil.');
        const cutoff=quantile(calibrationValues,.95);
        const summarize=runs=>{
          const valid=runs.filter(x=>x.converged&&Number.isFinite(x[primaryStatistic]));
          const positives=valid.filter(x=>x[primaryStatistic]>cutoff).length;
          const operational=positives/runs.length,conditional=valid.length?positives/valid.length:null;
          return {exceedance_count:positives,valid_diagnostic_count:valid.length,
            failed_or_unavailable_count:runs.length-valid.length,
            operational_rate:operational,conditional_rate:conditional,
            operational_wilson_95:wilsonInterval(positives,runs.length),
            conditional_wilson_95:wilsonInterval(positives,valid.length),
            operational_mcse:Math.sqrt(operational*(1-operational)/runs.length),
            conditional_mcse:valid.length?Math.sqrt(conditional*(1-conditional)/valid.length):null};
        };
        const nullSummary=summarize(validation.runs);
        calibrations[n]={cutoff_95:cutoff,calibration_repetitions:repetitions,
          calibration_valid_diagnostics:calibrationValues.length,
          validation_repetitions:repetitions,validation_false_positives:nullSummary.exceedance_count,
          validation_false_positive_rate:nullSummary.operational_rate,
          validation_conditional_false_positive_rate:nullSummary.conditional_rate,
          validation_operational_wilson_95:nullSummary.operational_wilson_95,
          validation_conditional_wilson_95:nullSummary.conditional_wilson_95,
          validation_operational_mcse:nullSummary.operational_mcse,
          validation_conditional_mcse:nullSummary.conditional_mcse};
        for(const scenario of atN){
          const summary=summarize(scenario.runs);
          scenario.primary_statistic=primaryStatistic;
          scenario.empirical_null_cutoff_95=cutoff;
          scenario.exceedance_count=summary.exceedance_count;
          scenario.valid_diagnostic_count=summary.valid_diagnostic_count;
          scenario.failed_or_unavailable_count=summary.failed_or_unavailable_count;
          scenario.empirical_detection_rate=scenario.role==='benchmark'?null:summary.operational_rate;
          scenario.benchmark_exceedance_rate=scenario.role==='benchmark'?summary.operational_rate:null;
          scenario.conditional_detection_rate=summary.conditional_rate;
          scenario.operational_wilson_95=summary.operational_wilson_95;
          scenario.conditional_wilson_95=summary.conditional_wilson_95;
          scenario.operational_mcse=summary.operational_mcse;
          scenario.conditional_mcse=summary.conditional_mcse;
          scenario.empirical_false_positive_rate=scenario.role==='validasi_nol'?summary.operational_rate:null;
        }
      }
      latest={schema:'pytago.irt.model-fit-monte-carlo.v5',source:'synthetic_only',
        estimator:'MML-EM 2PL',sample_sizes:sampleSizes,repetitions_per_condition:repetitions,
        item_count:CFG.items,total_fits:totalFits,primary_statistic:primaryStatistic,
        design:'sample_size_stratified_independent_null_calibration_and_validation',
        calibration_by_sample_size:calibrations,
        diagnostics_note:'Pada setiap N, cutoff Max |Q3| dikalibrasi dari 100 replikasi 2PL dan diuji pada 100 replikasi 2PL independen. Alternatif power mencakup 3PL dengan c=0,05/0,15/0,25 dan 2D dengan loading sekunder 0,25/0,45/0,70. Rasch/1PL dilaporkan sebagai benchmark, bukan power karena Q3 tidak menguji kesamaan diskriminasi. Rate operasional memakai seluruh replikasi; kegagalan konvergensi dihitung sebagai kegagalan deteksi. Rate kondisional hanya memakai fit konvergen. Wilson CI dan MCSE mengukur ketidakpastian Monte Carlo per kondisi, belum ketidakpastian cutoff kalibrasi.',
        interpretation_limits:'Power/detection rate adalah estimasi untuk generator sintetis dan konfigurasi item/distribusi yang ditentukan, bukan power universal atau validasi data empiris. N=500/1000/2000; 20 butir; 100 replikasi per kondisi.',
        scenarios:results,generated_at:new Date().toISOString()};
      renderMisspecification(root,results,calibrations);
      exportButton.disabled=false;
      const totalConverged=results.reduce((sum,x)=>sum+x.converged_count,0);
      status.textContent='Selesai: '+totalConverged+'/'+totalFits+' estimasi konvergen · 3 ukuran sampel · 27 kondisi.';
      status.className=totalConverged===totalFits?'pesan ok':'pesan';
    } catch(err) {
      status.textContent='Uji Monte Carlo model-fit gagal: '+(err&&err.message?err.message:String(err));
      status.className='pesan error';
    } finally {buttons.forEach(b=>b.disabled=false);}
  }
  function wilsonInterval(successes,total,z=1.96) {
    if(!total)return {lower:null,upper:null};
    const p=successes/total,den=1+z*z/total;
    const center=(p+z*z/(2*total))/den;
    const half=z*Math.sqrt(p*(1-p)/total+z*z/(4*total*total))/den;
    return {lower:center-half,upper:center+half};
  }
  async function runSECalibration() {
    const root=document.getElementById('pytago-synth-panel');if(!root)return;
    const status=root.querySelector('#pse-status'),out=root.querySelector('#pse-results');
    const buttons=['#pse-run','#pse-repeat','#pse-sensitivity','#pse-misspec','#pse-se-calibration'].map(sel=>root.querySelector(sel));
    const exportButton=root.querySelector('#pse-export');
    buttons.forEach(b=>b.disabled=true);exportButton.disabled=true;
    out.innerHTML='';status.className='pesan';
    const repetitions=100,examinees=500;
    const fixedItems=Array.from({length:CFG.items},(_,i)=>({
      id:'SE-'+String(i+1).padStart(2,'0'),
      a:+(.65+Math.random()*1.25).toFixed(3),
      b:+(-1.5+Math.random()*3).toFixed(3)
    }));
    const records=Array.from({length:CFG.items},()=>({a:[],b:[],seA:[],seB:[],coverA:0,coverB:0,validA:0,validB:0}));
    const failures=[];
    let converged=0,seAvailable=0;
    try {
      for(let rep=0;rep<repetitions;rep++){
        status.textContent='Kalibrasi SE · replikasi '+(rep+1)+'/'+repetitions+' · 500 peserta × 20 butir. Perhitungan informasi bersama dapat memerlukan waktu.';
        await delay(25);
        const data=generate(examinees,fixedItems);
        const est=estimateMML2PL(data.responses,{standardErrors:true});
        if(!est.converged){failures.push({repetition:rep+1,reason:est.failure?.reason||'not_converged'});continue;}
        converged++;
        if(est.standard_errors?.status==='computed'||est.standard_errors?.status==='partial')seAvailable++;
        for(let j=0;j<CFG.items;j++){
          const truth=fixedItems[j],fit=est.items[j],se=est.standard_errors?.items?.[j];
          const r=records[j];
          if(se&&Number.isFinite(se.se_a)&&se.se_a>0){
            const error=fit.a-truth.a;r.a.push(error);r.seA.push(se.se_a);r.validA++;
            if(Math.abs(error)<=1.96*se.se_a)r.coverA++;
          }
          if(se&&Number.isFinite(se.se_b)&&se.se_b>0){
            const error=fit.b-truth.b;r.b.push(error);r.seB.push(se.se_b);r.validB++;
            if(Math.abs(error)<=1.96*se.se_b)r.coverB++;
          }
        }
      }
      const summarize=key=>{
        const valid=records.flatMap(x=>x[key]);
        const ses=records.flatMap(x=>x[key==='a'?'seA':'seB']);
        const n=valid.length,avg=mean(ses),bias=mean(valid);
        const empiricalSD=n?Math.sqrt(mean(valid.map(x=>(x-bias)*(x-bias)))):null;
        return {valid_item_replications:n,mean_se:avg,empirical_sd:empiricalSD,
          mean_se_to_empirical_sd:avg&&empiricalSD?avg/empiricalSD:null,
          pooled_error_bias:bias,pooled_error_rmse:n?Math.sqrt(mean(valid.map(x=>x*x))):null};
      };
      const coverage=(param,coverKey,validKey)=>{
        const total=records.reduce((sum,x)=>sum+x[validKey],0);
        const covered=records.reduce((sum,x)=>sum+x[coverKey],0);
        const ci=wilsonInterval(covered,total);
        return {covered,total,rate:total?covered/total:null,wilson_95:ci};
      };
      const summaryA=summarize('a'),summaryB=summarize('b');
      const coverageA=coverage('a','coverA','validA'),coverageB=coverage('b','coverB','validB');
      latest={schema:'pytago.irt.standard-error-calibration.v1',source:'synthetic_only',
        design:'fixed_20_item_parameters_across_100_independent_samples',estimator:'MML-EM 2PL',
        examinees,repetitions_requested:repetitions,repetitions_converged:converged,
        se_matrix_available_repetitions:seAvailable,true_items:fixedItems,
        parameter_a:{...summaryA,coverage_95:coverageA},
        parameter_b:{...summaryB,coverage_95:coverageB},
        item_diagnostics:records.map((r,j)=>({item_id:fixedItems[j].id,
          a:{valid:r.validA,coverage:r.validA?r.coverA/r.validA:null,mean_se:mean(r.seA)},
          b:{valid:r.validB,coverage:r.validB?r.coverB/r.validB:null,mean_se:mean(r.seB)}})),
        failed_repetitions:failures,generated_at:new Date().toISOString(),
        interpretation:'Pilot Monte Carlo khusus kondisi sintetis 2PL. Coverage 95% dievaluasi dengan interval Wald; hasil tidak membuktikan validitas pada data peserta nyata.'};
      const fmtCoverage=x=>x.rate===null?'—':fmt(x.rate*100)+'%';
      const rows=[
        ['Parameter a',summaryA,coverageA],
        ['Parameter b',summaryB,coverageB]
      ].map(([label,m,c])=>'<tr><td>'+label+'</td><td>'+fmtCoverage(c)+'</td><td>'+c.covered+'/'+c.total+'</td><td>'+fmt(c.wilson_95.lower*100)+'% – '+fmt(c.wilson_95.upper*100)+'%</td><td>'+fmt(m.mean_se)+'</td><td>'+fmt(m.empirical_sd)+'</td><td>'+fmt(m.mean_se_to_empirical_sd)+'</td><td>'+fmt(m.pooled_error_bias)+'</td></tr>').join('');
      out.innerHTML='<div class="card" style="margin:12px 0"><h3>Standard Error Calibration · Monte Carlo</h3><p>100 replikasi independen · 500 peserta per replikasi · 20 butir. Parameter butir ditahan tetap antarreplikasi agar variasi estimasi dapat dibandingkan pada parameter yang sama.</p><p><b>Konvergensi:</b> '+converged+'/100 · <b>SE tersedia:</b> '+seAvailable+'/100 · <b>Replikasi gagal:</b> '+failures.length+'</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>Parameter</th><th>Coverage CI 95%</th><th>Jumlah tercakup</th><th>Wilson CI 95%</th><th>Mean SE</th><th>Empirical SD</th><th>Rasio SE/SD</th><th>Bias</th></tr></thead><tbody>'+rows+'</tbody></table></div></div><div class="card"><h3>Interpretasi dan batasan</h3><p>Coverage mendekati 95% dan rasio mean SE/empirical SD mendekati 1 merupakan indikasi kalibrasi yang baik. Interval Wilson menunjukkan ketidakpastian Monte Carlo pada estimasi coverage.</p><p>Pengujian ini hanya memeriksa data yang dibangkitkan dari 2PL dengan konfigurasi simulasi ini. Ia bukan bukti bahwa SE valid ketika model 2PL tidak cocok atau pada data peserta nyata.</p><p><b>Catatan:</b> hasil agregat dihitung dari estimasi butir-replikasi yang SE-nya berhasil tersedia. Replikasi gagal atau SE yang tidak tersedia tidak dihitung sebagai coverage.</p></div>';
      exportButton.disabled=false;
      status.textContent='Selesai: '+converged+'/100 estimasi konvergen; SE tersedia pada '+seAvailable+'/100 replikasi.';
      status.className=converged===100&&seAvailable===100?'pesan ok':'pesan';
    } catch(err) {
      status.textContent='Uji kalibrasi SE gagal: '+(err&&err.message?err.message:String(err));
      status.className='pesan error';
    } finally {buttons.forEach(b=>b.disabled=false);}
  }
  function renderMisspecification(root,results,calibrations) {
    const rows=results.map(s=>{
      const rate=s.role==='kalibrasi'?'Kalibrasi cutoff':s.role==='benchmark'?'Benchmark: '+s.exceedance_count+'/'+s.repetitions+' ('+fmt(s.benchmark_exceedance_rate*100)+'%)':s.exceedance_count+'/'+s.repetitions+' ('+fmt(s.empirical_detection_rate*100)+'%)';
      const ci=s.operational_wilson_95;
      return '<tr><td>'+s.examinees+'</td><td>'+esc(s.label)+'</td><td>'+s.converged_count+'/'+s.repetitions+' ('+fmt(s.convergence_rate*100)+'%)</td><td>'+fmt(s.mean_abs_q3)+'</td><td>'+fmt(s.max_abs_q3)+'</td><td>'+rate+'</td><td>'+(s.role==='kalibrasi'?'—':fmt(ci.lower*100)+'–'+fmt(ci.upper*100)+'%')+'</td></tr>';
    }).join('');
    const calibrationCards=Object.entries(calibrations).map(([n,x])=>
      '<div class="card" style="margin:8px 0"><b>N='+n+'</b><p>Cutoff Max |Q3|: '+fmt(x.cutoff_95)+' · valid calibration '+x.calibration_valid_diagnostics+'/'+x.calibration_repetitions+'</p><p>False positive operasional: '+x.validation_false_positives+'/'+x.validation_repetitions+' ('+fmt(x.validation_false_positive_rate*100)+'%) · Wilson 95% '+fmt(x.validation_operational_wilson_95.lower*100)+'–'+fmt(x.validation_operational_wilson_95.upper*100)+'%</p><p>False positive kondisional: '+fmt(x.validation_conditional_false_positive_rate*100)+'% · MCSE '+fmt(x.validation_conditional_mcse*100)+' percentage points</p></div>'
    ).join('');
    root.querySelector('#pse-results').innerHTML=
      '<div class="card" style="margin:12px 0"><h3>Power Analysis · desain multi-N</h3><p>27 kondisi × 100 replikasi = 2.700 estimasi MML-EM 2PL. Kondisi Rasch ditampilkan sebagai benchmark, bukan alternatif power berbasis Q3. Ukuran sampel 500, 1.000, dan 2.000; 20 butir. Cutoff null dikalibrasi dan divalidasi secara independen pada setiap ukuran sampel.</p><p>Alternatif untuk estimasi detection/power: 3PL dengan c=0,05, 0,15, 0,25; dan 2D dengan loading sekunder 0,25, 0,45, 0,70. Rasch/1PL adalah benchmark karena Q3 menguji dependensi residual, bukan restriksi kesamaan diskriminasi.</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>N</th><th>Kondisi</th><th>Konvergensi</th><th>Mean |Q3|</th><th>Rerata Max |Q3|</th><th>Detection / benchmark exceedance</th><th>Wilson 95%</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
      '<div class="card" style="margin:12px 0"><h3>Kalibrasi false-positive per ukuran sampel</h3>'+calibrationCards+'</div>'+
      '<div class="card" style="margin:12px 0"><h3>Batas interpretasi</h3><p>Rate operasional menghitung kegagalan konvergensi sebagai kegagalan deteksi; rate kondisional hanya memakai fit konvergen. Wilson CI/MCSE mengukur ketidakpastian Monte Carlo dari replikasi pengujian, tetapi belum memasukkan ketidakpastian cutoff yang berasal dari 100 replikasi kalibrasi.</p><p>Hasil ini adalah estimasi power sintetis untuk generator dan parameter yang ditentukan, bukan power universal atau bukti validitas pada data peserta Pytago. Untuk laporan final, jumlah replikasi dan kalibrasi cutoff perlu ditingkatkan.</p></div>';
  }
  async function runSampleSensitivity() {
    const root=document.getElementById('pytago-synth-panel');
    if(!root)return;
    const status=root.querySelector('#pse-status'),out=root.querySelector('#pse-results');
    const buttons=['#pse-run','#pse-repeat','#pse-sensitivity'].map(sel=>root.querySelector(sel));
    const exportButton=root.querySelector('#pse-export');
    buttons.forEach(b=>b.disabled=true);exportButton.disabled=true;
    out.innerHTML='';status.className='pesan';
    const sampleSizes=[300,500,1000],repetitions=CFG.repetitions;
    const results=Object.fromEntries(sampleSizes.map(n=>[n,{runs:[],allA:[],allB:[],converged:0}]));
    try {
      for(let rep=0;rep<repetitions;rep++){
        status.textContent='Replikasi '+(rep+1)+'/'+repetitions+' · membangkitkan satu populasi 1.000 peserta untuk desain sampel bertingkat...';
        await delay(25);
        const population=generate(1000);
        for(const n of sampleSizes){
          status.textContent='Replikasi '+(rep+1)+'/'+repetitions+' · mengestimasi ukuran sampel '+n+' ('+(sampleSizes.indexOf(n)+1)+'/3)...';
          await delay(15);
          const data={
            examinees:n,
            true_theta:population.true_theta.slice(0,n),
            true_items:population.true_items,
            responses:population.responses.slice(0,n)
          };
          // The estimator receives responses only. Ground truth is reserved for evaluation.
          const estimated=estimateMML2PL(data.responses);
          const recovery=evaluate(data,estimated),bucket=results[n];
          if(estimated.converged)bucket.converged++;
          for(const item of recovery.fitted){bucket.allA.push(item.delta_a);bucket.allB.push(item.delta_b);}
          bucket.runs.push({
            repetition:rep+1,
            converged:estimated.converged,
            iterations:estimated.iterations,
            log_likelihood:estimated.logLikelihood,
            theta_mean:recovery.summary.theta_mean,
            theta_sd:recovery.summary.theta_sd,
            a:recovery.summary.a,
            b:recovery.summary.b
          });
        }
      }
      const summaries=sampleSizes.map(n=>{
        const x=results[n];
        return {
          examinees:n,
          repetitions:repetitions,
          converged_count:x.converged,
          convergence_rate:x.converged/repetitions,
          mean_iterations:mean(x.runs.map(r=>r.iterations)),
          mean_log_likelihood:mean(x.runs.map(r=>r.log_likelihood)),
          pooled_a:metric(x.allA),
          pooled_b:metric(x.allB),
          mean_run_mae_a:mean(x.runs.map(r=>r.a.mae)),
          mean_run_mae_b:mean(x.runs.map(r=>r.b.mae)),
          runs:x.runs
        };
      });
      latest={
        schema:'pytago.irt.sample-size-sensitivity.v1',
        source:'synthetic_only',
        design:'paired_nested_samples_same_item_parameters_and_population_per_replication',
        generated_at:new Date().toISOString(),
        estimator:'MML-EM',
        estimator_config:CFG,
        sample_sizes:summaries
      };
      renderSampleSensitivity(root,summaries);
      exportButton.disabled=false;
      const totalConverged=summaries.reduce((sum,x)=>sum+x.converged_count,0);
      status.textContent='Selesai: '+totalConverged+'/'+(sampleSizes.length*repetitions)+' estimasi konvergen.';
      status.className=totalConverged===sampleSizes.length*repetitions?'pesan ok':'pesan';
    } catch(err) {
      status.textContent='Uji ukuran sampel gagal: '+(err&&err.message?err.message:String(err));
      status.className='pesan error';
    } finally {
      buttons.forEach(b=>b.disabled=false);
    }
  }
  function renderSampleSensitivity(root,summaries) {
    const rows=summaries.map(s=>'<tr><td>'+s.examinees+'</td><td>'+s.converged_count+'/'+s.repetitions+' ('+fmt(s.convergence_rate*100)+'%)</td><td>'+fmt(s.mean_iterations)+'</td><td>'+fmt(s.pooled_a.mae)+'</td><td>'+fmt(s.pooled_a.rmse)+'</td><td>'+fmt(s.pooled_a.bias)+'</td><td>'+fmt(s.pooled_b.mae)+'</td><td>'+fmt(s.pooled_b.rmse)+'</td><td>'+fmt(s.pooled_b.bias)+'</td><td>'+fmt(s.mean_log_likelihood)+'</td></tr>').join('');
    root.querySelector('#pse-results').innerHTML=
      '<div class="card" style="margin:12px 0"><h3>Sample Size Sensitivity Test · 30 Replikasi</h3><p>Setiap replikasi membangkitkan satu populasi 1.000 peserta dan satu set 20 parameter butir. Sampel 300 dan 500 menggunakan peserta awal dari populasi yang sama (nested/paired design), sehingga parameter butir tetap identik dalam satu replikasi.</p><div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>N peserta</th><th>Konvergensi</th><th>Rerata iterasi</th><th>MAE a</th><th>RMSE a</th><th>Bias a</th><th>MAE b</th><th>RMSE b</th><th>Bias b</th><th>Rerata log-likelihood</th></tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
      '<div class="card" style="margin:12px 0"><h3>Interpretasi metodologis</h3><p>Bandingkan MAE, RMSE, bias, dan tingkat konvergensi antarukuran sampel. Log-likelihood ditampilkan sebagai diagnostik, tetapi nilainya tidak boleh dibandingkan sebagai ukuran kualitas lintas N secara langsung karena jumlah respons berbeda.</p><p>Data sintetis dibangkitkan dari 2PL. Hasil ini menguji pemulihan parameter ketika asumsi model benar, bukan model-fit pada respons peserta nyata.</p></div>'+
      summaries.map(s=>'<div class="card" style="margin:10px 0;overflow:auto"><h4>Diagnostik N = '+s.examinees+'</h4><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>Rep</th><th>Konvergen</th><th>Iterasi</th><th>MAE a</th><th>MAE b</th><th>Bias a</th><th>Bias b</th></tr></thead><tbody>'+s.runs.map(r=>'<tr><td>'+r.repetition+'</td><td>'+(r.converged?'Ya':'Tidak')+'</td><td>'+r.iterations+'</td><td>'+fmt(r.a.mae)+'</td><td>'+fmt(r.b.mae)+'</td><td>'+fmt(r.a.bias)+'</td><td>'+fmt(r.b.bias)+'</td></tr>').join('')+'</tbody></table></div>').join('');
  }
  function renderRepeated(root,s,runs) {
    const card=(label,value,sub='')=>'<div class="card"><small>'+label+'</small><h3>'+value+'</h3><small>'+sub+'</small></div>';
    const rows=runs.map(x=>'<tr><td>'+x.repetition+'</td><td>'+(x.converged?'Ya':'Tidak')+'</td><td>'+x.iterations+'</td><td>'+fmt(x.a.mae)+'</td><td>'+fmt(x.a.rmse)+'</td><td>'+fmt(x.a.bias)+'</td><td>'+fmt(x.b.mae)+'</td><td>'+fmt(x.b.rmse)+'</td><td>'+fmt(x.b.bias)+'</td><td>'+fmt(x.log_likelihood)+'</td></tr>').join('');
    root.querySelector('#pse-results').innerHTML=
      '<div class="card" style="margin:12px 0"><h3>Ringkasan 30 Replikasi Independen</h3><p>Setiap baris berasal dari dataset baru: 500 peserta sintetis × 20 butir. Metrik pooled dihitung dari seluruh selisih parameter pada seluruh replikasi.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px">'+
      card('Tingkat konvergensi',fmt(s.convergence_rate*100)+'% ',s.converged_count+'/'+s.repetitions+' replikasi')+
      card('Rerata iterasi',fmt(s.mean_iterations),'Per replikasi')+
      card('Rerata log-likelihood',fmt(s.mean_log_likelihood),'Per replikasi')+
      card('Parameter a · pooled MAE',fmt(s.pooled_a.mae),'RMSE '+fmt(s.pooled_a.rmse)+' · Bias '+fmt(s.pooled_a.bias))+
      card('Parameter b · pooled MAE',fmt(s.pooled_b.mae),'RMSE '+fmt(s.pooled_b.rmse)+' · Bias '+fmt(s.pooled_b.bias))+
      card('Rerata MAE a per replikasi',fmt(s.mean_run_mae_a),'Rerata dari 30 MAE')+
      card('Rerata MAE b per replikasi',fmt(s.mean_run_mae_b),'Rerata dari 30 MAE')+
      '</div></div><div class="card" style="overflow:auto"><h3>Diagnostik setiap replikasi</h3><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>Replikasi</th><th>Konvergen</th><th>Iterasi</th><th>MAE a</th><th>RMSE a</th><th>Bias a</th><th>MAE b</th><th>RMSE b</th><th>Bias b</th><th>Log-likelihood</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p style="font-size:12px;color:var(--muted,#667085);margin-top:10px">Interpretasi: gunakan pooled MAE/RMSE/bias untuk mengukur pemulihan keseluruhan; convergence rate untuk kestabilan numerik. Hasil ini hanya menguji data yang memang dibangkitkan dari 2PL, bukan kecocokan model pada data peserta nyata.</p>';
  }
  function render(root,result,est) {
    const s=result.summary;
    const card=(label,m)=>'<div class="card"><small>'+label+'</small><h3>'+fmt(m.mae)+'</h3><small>Bias '+fmt(m.bias)+' · RMSE '+fmt(m.rmse)+'</small></div>';
    const rows=result.fitted.map(x=>'<tr><td>'+esc(x.id)+'</td><td>'+fmt(x.true_a)+'</td><td>'+fmt(x.estimated_a)+'</td><td>'+fmt(x.delta_a)+'</td><td>'+fmt(x.true_b)+'</td><td>'+fmt(x.estimated_b)+'</td><td>'+fmt(x.delta_b)+'</td><td>'+fmt(x.p_value)+'</td><td>'+fmt(x.se_a)+'</td><td>'+fmt(x.se_b)+'</td></tr>').join('');
    root.querySelector('#pse-results').innerHTML='<div class="card" style="margin:12px 0"><h3>Hasil pemulihan parameter</h3><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px">'+
      '<div><small>Konvergensi</small><h3>'+(est.converged?'Tercapai':'Belum')+'</h3></div><div><small>Iterasi</small><h3>'+s.iterations+'</h3></div>'+
      '<div><small>Rerata θ pembangkit</small><h3>'+fmt(s.theta_mean)+'</h3></div><div><small>SD θ pembangkit</small><h3>'+fmt(s.theta_sd)+'</h3></div>'+
      '<div><small>Log-likelihood</small><h3>'+fmt(s.log_likelihood)+'</h3></div></div></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:12px 0">'+card('Parameter a · MAE',s.a)+card('Parameter b · MAE',s.b)+'</div>'+
      '<div class="card" style="overflow:auto"><h3>Parameter asli vs estimasi MML-EM</h3><table style="width:100%;border-collapse:collapse;font-size:12px;white-space:nowrap"><thead><tr><th>Butir</th><th>a asli</th><th>a estimasi</th><th>Δa</th><th>b asli</th><th>b estimasi</th><th>Δb</th><th>p benar</th><th>SE a</th><th>SE b</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
      '<p style="font-size:12px;color:var(--muted,#667085);margin-top:10px">MAE/RMSE mengukur selisih dari parameter pembangkit. Satu replikasi belum cukup untuk menyatakan algoritma tervalidasi; ulangi beberapa replikasi dan periksa kestabilan serta bias.</p>';
  }
  function exportData() {
    if(!latest)return;
    const blob=new Blob([JSON.stringify(latest,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=(latest.schema||'pytago-irt-results').replace(/[^a-z0-9.-]+/gi,'-')+'.json';a.click();URL.revokeObjectURL(url);
  }
  window.PytagoSyntheticEngine=Object.freeze({config:CFG,generate:generate,estimateMML2PL:estimateMML2PL,estimateJointObservedSE:estimateJointObservedSE,runMisspecification:runMisspecification,runLocalDependenceNullValidation:runLocalDependenceNullValidation,runLocalDependenceAlternativePilot:runLocalDependenceAlternativePilot,getLatest:()=>latest});
  new MutationObserver(mount).observe(document.documentElement,{childList:true,subtree:true,attributes:true});
  mount();
})();