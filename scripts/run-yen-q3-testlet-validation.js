'use strict';
const fs = require('node:fs');
const path = require('node:path');

global.window = global;
global.ADMIN = false;
global.document = { documentElement: {}, getElementById() { return null; } };
global.MutationObserver = class { constructor() {} observe() {} };

let seed = Number(process.env.SIM_SEED || 20261129) >>> 0;
Math.random = function seededRandom() {
  seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
const randn = () => {
  let u=0,v=0; while(!u)u=Math.random(); while(!v)v=Math.random();
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
};
const logistic = z => z>35?1:z< -35?0:1/(1+Math.exp(-z));
const mean = xs => xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const quantile = (values,p) => {
  const xs=values.filter(Number.isFinite).slice().sort((a,b)=>a-b);
  if(!xs.length)return null;
  const pos=(xs.length-1)*p,lo=Math.floor(pos),hi=Math.ceil(pos);
  return xs[lo]+(xs[hi]-xs[lo])*(pos-lo);
};
const wilson = (success,total) => {
  if(!total)return null;
  const z=1.959963984540054,p=success/total,z2=z*z,den=1+z2/total;
  const center=(p+z2/(2*total))/den;
  const half=z*Math.sqrt(p*(1-p)/total+z2/(4*total*total))/den;
  return [Math.max(0,center-half),Math.min(1,center+half)];
};
require(path.resolve(__dirname,'../js/synthetic-examinee-engine.js'));
const engine=global.PytagoSyntheticEngine;
if(!engine||typeof engine.computeYenQ3!=='function')throw new Error('Yen Q3 API unavailable');

const repetitions=Math.max(20,Number(process.env.SIM_REPS||100));
const examinees=Math.max(100,Number(process.env.SIM_N||500));
const strengths=(process.env.SIM_STRENGTHS||'0.35,0.70').split(',').map(Number);
const items=Array.from({length:engine.config.items},(_,i)=>({
  id:'YQ3-'+String(i+1).padStart(2,'0'),
  a:+(.65+Math.random()*1.25).toFixed(3),
  b:+(-1.5+Math.random()*3).toFixed(3)
}));
const groups=Array.from({length:Math.ceil(items.length/4)},(_,g)=>
  Array.from({length:4},(_,j)=>g*4+j).filter(i=>i<items.length));
function generate(tau) {
  const theta=Array.from({length:examinees},randn);
  const responses=theta.map(t=>{
    const effects=groups.map(()=>randn());
    return items.map((item,j)=>{
      const p=logistic(item.a*(t-item.b)+tau*effects[Math.floor(j/4)]);
      return Math.random()<p?1:0;
    });
  });
  return responses;
}
async function fitOne(tau) {
  const responses=generate(tau);
  const fit=engine.estimateMML2PL(responses);
  if(!fit.converged)return {converged:false,iterations:fit.iterations,reason:fit.failure?.reason||'not_converged'};
  const q3=engine.computeYenQ3(responses,fit.items);
  return {converged:true,iterations:fit.iterations,raw_max_abs:q3.max_abs_raw_q3,
    centered_max_abs:q3.max_abs_adjusted_q3,mean_raw_q3:q3.mean_raw_q3,
    mean_centered_q3:q3.mean_adjusted_q3};
}
(async()=>{
  const calibration=[],validation=[],alternatives={};
  for(let i=0;i<repetitions;i++)calibration.push({replication:i+1,...await fitOne(0)});
  const validCalibration=calibration.filter(x=>x.converged);
  if(validCalibration.length<Math.ceil(repetitions*.9))throw new Error('Insufficient calibration convergence.');
  const rawCutoff=quantile(validCalibration.map(x=>x.raw_max_abs),.95);
  const centeredCutoff=quantile(validCalibration.map(x=>x.centered_max_abs),.95);
  for(let i=0;i<repetitions;i++)validation.push({replication:i+1,...await fitOne(0)});
  for(const tau of strengths){
    if(!Number.isFinite(tau)||tau<=0||tau>1.5)throw new Error('Invalid testlet strength.');
    alternatives[String(tau)]=[];
    for(let i=0;i<repetitions;i++)alternatives[String(tau)].push({replication:i+1,...await fitOne(tau)});
  }
  const summarize=(runs,key,cutoff)=>{
    const valid=runs.filter(x=>x.converged&&Number.isFinite(x[key]));
    const exceed=valid.filter(x=>x[key]>cutoff).length;
    return {requested:runs.length,converged:valid.length,failed:runs.length-valid.length,
      convergence_rate:valid.length/runs.length,exceedances:exceed,
      rate:valid.length?exceed/valid.length:null,wilson_95:valid.length?wilson(exceed,valid.length):null,
      mean:mean(valid.map(x=>x[key])),median:quantile(valid.map(x=>x[key]),.5)};
  };
  const report=(runs)=>({
    raw_q3_max_abs:summarize(runs,'raw_max_abs',rawCutoff),
    centered_q3_max_abs:summarize(runs,'centered_max_abs',centeredCutoff),
    mean_raw_q3:mean(runs.filter(x=>x.converged).map(x=>x.mean_raw_q3)),
    mean_centered_q3:mean(runs.filter(x=>x.converged).map(x=>x.mean_centered_q3))
  });
  const result={
    schema:'pytago.irt.yen-q3-testlet-validation.v1',source:'synthetic_only',
    design:'fixed_item_bank_independent_null_calibration_validation_and_testlet_alternatives',
    estimator:'MML-EM 2PL unidimensional',
    q3_method:'Pearson correlation across persons of residuals X_ij - P_ij(theta_EAP), theta_EAP estimated under fitted 2PL',
    centered_method:'adjusted Q3 = raw pairwise Q3 minus grand mean of all off-diagonal raw Q3 values',
    examinees,item_count:items.length,testlet_groups:groups.map(g=>g.map(i=>items[i].id)),
    repetitions_per_condition:repetitions,strengths,
    calibration:{requested:repetitions,converged:validCalibration.length,raw_q3_max_abs_cutoff_95:rawCutoff,
      centered_q3_max_abs_cutoff_95:centeredCutoff,summary:report(calibration)},
    null_validation:report(validation),
    alternatives:Object.fromEntries(Object.entries(alternatives).map(([tau,runs])=>[tau,report(runs)])),
    runs:{calibration, null_validation:validation, alternatives},
    true_items:items,generated_at:new Date().toISOString(),
    limitations:'Synthetic pilot only. Q3 uses EAP theta estimated from the same response vector, so finite-sample dependence and estimation effects remain. The centered statistic is grand-mean adjusted Q3, not a pair-specific inferential test. Cutoffs are conditional on this fixed bank, N, generator, estimator, and calibration sample; no production use.'
  };
  const outDir=path.resolve(__dirname,'../artifacts');fs.mkdirSync(outDir,{recursive:true});
  const outFile=path.join(outDir,'pytago-yen-q3-testlet-validation-v1.json');
  fs.writeFileSync(outFile,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({status:'completed',schema:result.schema,examinees,item_count:items.length,
    repetitions_per_condition:repetitions,calibration:result.calibration,null_validation:result.null_validation,
    alternatives:result.alternatives,artifact:outFile},null,2));
})().catch(error=>{console.error(error&&error.stack?error.stack:String(error));process.exitCode=1;});
