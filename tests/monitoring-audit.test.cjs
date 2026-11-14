'use strict';
// All observations and mutations below are SYNTHETIC. No real business outcomes.
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,files}=require('./operations-fixture.cjs'),{analyze}=require('../scripts/operations.cjs'),M=require('../cloud/dist/monitoring.js'),S=require('../cloud/dist/monitor-store.js');
const evalFixture=async f=>analyze(files(f.rows),f.manifest);
function staged(p){const s=S.fresh();S.createJob(s,{job_id:'audit',submitted_at:'2026-11-14T00:00:00Z',dataset_version:p.dataset_version,run_id:p.run_id,v1_snapshot_id:p.v1_snapshot_id});for(const st of ['validating','computing','awaiting_confirmation','publishing'])S.transition(s,'audit',st);return s;}
test('SYNTHETIC audit: independent expected totals, distinct orders, four dimension reconciliation and exact effects',async()=>{
 const f=fixture();f.rows.orders.push(['B2','C-B2','RJ','delivered','2020-02-04 08:00:00','2020-02-04 18:00:00','2020-02-04 00:00:00'],['A2','C-A2','RJ','shipped','2020-02-11 08:00:00','','2020-02-12 00:00:00']);f.rows.order_items.push(['B2','1','P1','S2','cat2','1.01','0'],['B2','2','P2','S2','cat2','2.02','0'],['A2','1','P2','S2','cat2','4.04','0']);for(let i=0;i<7;i++)f.rows.order_reviews.push(['QA'+i,'B2','5','2020-02-05 00:00:00','2020-02-06 00:00:00']);
 const r=await evalFixture(f),o=r.operations;assert.equal(o.metrics.before.purchase_item_amount_cents,2803);assert.equal(o.metrics.after.purchase_item_amount_cents,7104);assert.equal(o.delta_cents,4301);assert.equal(o.metrics.before.purchase_orders,2);assert.equal(o.metrics.after.purchase_orders,2);assert.equal(o.metrics.before.item_units,5);assert.equal(o.metrics.after.item_units,5);assert.equal(o.metrics.before.avg_order_item_amount_cents,1401.5);assert.equal(o.metrics.after.avg_order_item_amount_cents,3552);
 for(const dim of ['product','category','seller','state'])assert.equal(o.dimensions[dim].reduce((n,x)=>n+x.delta_cents,0),4301);
 for(const p of o.dimensions.product){if(!p.before.units||!p.after.units){assert.equal(p.price_effect,null);assert.equal(p.quantity_effect,null);assert.equal(p.assortment_effect_cents,p.delta_cents);}else{const q=p.quantity_effect,v=p.price_effect;assert.equal(BigInt(q.numerator)*BigInt(v.denominator)+BigInt(v.numerator)*BigInt(q.denominator),BigInt(p.delta_cents)*BigInt(q.denominator)*BigInt(v.denominator));}}
});
const row=(amount,orders=10)=>({amount_cents:amount,orders,units:orders,late_orders:0,delivery_eligible:orders});
const conf={min_orders:5,baseline_periods:4,mad_multiplier:3,thresholds:{amount_cents:{absolute:100,relative:0.1},late_rate:{absolute:0.1,relative:0}}};
test('SYNTHETIC audit: isolated absolute and relative threshold boundaries, stable history, zero MAD and flat period',()=>{
 for(const [after,absolute,relative,fired]of [[1099,100,0,false],[1100,100,0.1,true],[1100,101,0,false],[1100,100,0.10001,false],[1000,0,0,false],[900,100,0.1,true]]){const c={...conf,thresholds:{amount_cents:{absolute,relative}}};assert.equal(M.evaluate(row(1000),row(after),Array.from({length:4},()=>row(1000)),'amount_cents',c).fired,fired);}
 const volatile=[1000,1400,1200,1800].map(x=>row(x)),r=M.evaluate(row(1800),row(2000),volatile,'amount_cents',conf);assert.equal(r.baseline.median_change,400);assert.equal(r.baseline.mad,200);assert.equal(r.fired,false);
});
test('SYNTHETIC audit: separate suppression reasons for history/current sample, missing dimensions and zero base',()=>{
 const h=Array.from({length:4},()=>row(1000));for(const [a,b,history,reasons,expected]of [[row(1000),row(2000),h.slice(1),[],'insufficient_historical_coverage'],[row(1000),row(2000),[row(1000,1),...h.slice(1)],[],'low_historical_sample'],[row(1000),row(2000,1),h,[],'low_sample'],[row(0),row(2000),h,[],'zero_baseline'],[row(1000),row(2000),h,['missing_dimension'],'missing_dimension']]){const r=M.evaluate(a,b,history,'amount_cents',conf,reasons);assert.equal(r.fired,false);assert(r.suppressed_reasons.includes(expected));}
});
test('SYNTHETIC audit regression: percentage-point threshold equality must not be lost to floating subtraction',()=>{
 const before={...row(1000),late_orders:2},after={...row(1000),late_orders:3},h=Array.from({length:4},()=>({...before}));const e=M.evaluate(before,after,h,'late_rate',conf);assert.equal(e.fired,true,'20% → 30% must meet a 10 percentage point threshold');
});
test('SYNTHETIC audit: derived monetary means retain inspectable exact rational evidence',()=>{
 const c={...conf,min_orders:1,thresholds:{aov_cents:{absolute:1,relative:0.1}}},e=M.evaluate(row(100,3),row(200,7),Array.from({length:4},()=>row(100,3)),'aov_cents',c);
 assert.deepEqual(e.exact.before,{numerator:'100',denominator:'3'});assert.deepEqual(e.exact.after,{numerator:'200',denominator:'7'});assert.deepEqual(e.exact.absolute_change,{numerator:'-100',denominator:'21'});assert.equal(e.fired,true);
});
test('SYNTHETIC audit regression: malformed monitor configuration fails closed',()=>{
 for(const monitoring of [true,17,'bad',[],{fulfillment:{finalized_cohorts:true,observed_through:'2020-03-01',evidence:{claimed:true}}}])assert(M.configuration({...fixture().manifest,monitoring}).errors.length>0,JSON.stringify(monitoring));
});
test('SYNTHETIC audit regression: monitor calculation revision must have a new complete-snapshot identity',async()=>{
 const f=fixture(),a=await evalFixture(f),original=M.run;let b;try{M.run=(valid,result,hash)=>original(valid,result,hash+'-SYNTHETIC-revision');b=await evalFixture(f);}finally{M.run=original;}assert.equal(a.monitoring.dataset_version,b.monitoring.dataset_version);assert.notEqual(a.monitoring.run_id,b.monitoring.run_id);assert.notEqual(a.id,b.id);assert.equal(b.monitoring.v1_snapshot_id,b.id);assert(b.monitoring.events.every(e=>e.v1_snapshot_id===b.id));
});
test('SYNTHETIC audit regression: publication rejects wrong job/run/data/snapshot binding without mutations',async()=>{
 const p=(await evalFixture(fixture())).monitoring;for(const key of ['dataset_version','run_id','v1_snapshot_id']){const s=staged(p);s.jobs.audit[key]='wrong-'+key;const before=JSON.stringify(s);assert.throws(()=>S.publish(s,'audit',p),/版本|绑定|不一致/);assert.equal(JSON.stringify(s),before);}
});
test('SYNTHETIC audit regression: publication rejects cross-version event evidence despite verified pack label',async()=>{
 const p=(await evalFixture(fixture())).monitoring,s=staged(p),bad=structuredClone(p);bad.events[0].dataset_version='different';assert.throws(()=>S.publish(s,'audit',bad),/证据|版本|不一致/);assert.equal(Object.keys(s.events).length,0);
});
test('SYNTHETIC audit regression: duplicate job ID cannot replace a completed execution history',async()=>{
 const p=(await evalFixture(fixture())).monitoring,s=staged(p);S.publish(s,'audit',p);const before=JSON.stringify(s.jobs.audit);assert.throws(()=>S.createJob(s,{job_id:'audit',submitted_at:'later'}),/存在|重复/);assert.equal(JSON.stringify(s.jobs.audit),before);
});
test('SYNTHETIC audit: full lifecycle, evidence requirement, explicit reopen and quality gate',async()=>{
 const p=(await evalFixture(fixture())).monitoring,s=staged(p);S.publish(s,'audit',p);const id=p.events[0].event_id;S.changeStatus(s,id,{status:'in_progress',actor:'SYNTHETIC QA',note:'checking'});for(const fields of [{resolution_code:'',evidence_ref:'E1'},{resolution_code:'investigated',evidence_ref:' '}])assert.throws(()=>S.changeStatus(s,id,{status:'closed',actor:'QA',note:'checked',...fields}));S.changeStatus(s,id,{status:'closed',actor:'QA',note:'synthetic evidence verified',resolution_code:'investigated',evidence_ref:p.events[0].evidence_id});S.changeStatus(s,id,{status:'pending',actor:'QA',note:'new evidence requires explicit review'});assert.deepEqual(s.event_history.map(h=>h.to),['in_progress','closed','pending']);const bad={...p,status:'blocked',events:[]},blocked=staged(bad);assert.throws(()=>S.publish(blocked,'audit',bad));assert.equal(Object.keys(blocked.runs).length,0);
});
