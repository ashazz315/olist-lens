'use strict';
// ALL input observations in this file are explicitly SYNTHETIC.
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture,files}=require('./operations-fixture.cjs'),{analyze}=require('../scripts/operations.cjs'),M=require('../cloud/dist/monitoring.js'),S=require('../cloud/dist/monitor-store.js');
const evaluate=async(f=fixture())=>(await analyze(files(f.rows),f.manifest)).monitoring;
function stage(s,p,id='job'){S.createJob(s,{job_id:id,submitted_at:new Date().toISOString()});for(const status of ['validating','computing','awaiting_confirmation','publishing'])S.transition(s,id,status);return S.publish(s,id,p);}
test('SYNTHETIC: four scopes have independent baselines and traceable metric snapshots',async()=>{
 const p=await evaluate();assert.equal(p.status,'verified');assert.equal(p.mode,'historical_replay');assert.equal(p.is_synthetic,true);
 for(const scope of ['shop','product','category','seller'])assert(p.events.some(e=>e.scope_type===scope&&e.metric_id==='amount_cents'));
 const shop=p.evaluations.find(e=>e.scope_type==='shop'&&e.metric_id==='amount_cents'),prod=p.evaluations.find(e=>e.scope_type==='product'&&e.entity_id==='P1'&&e.metric_id==='amount_cents');assert.equal(shop.absolute_change,4200);assert.equal(prod.absolute_change,4000);assert.deepEqual(prod.baseline.values,[1000,1000,1000,1000]);
 for(const e of p.events){assert(e.source_ref.file_hashes['order_items.csv']);assert(e.evidence_ids.includes(e.evidence.id));assert.equal(e.evidence.independent_verification.passed,true);assert.equal(e.before,e.metric_id==='aov_cents'?e.evidence.before.amount_cents/e.evidence.before.orders:e.evidence.before[e.metric_id]);assert(e.evidence.history_windows.every(w=>w.end<=p.comparison.before.start));}
 assert(p.evaluations.find(e=>e.metric_id==='late_rate').suppressed_reasons.includes('missing_mature_cohort_evidence'));
 assert(p.negative_products.every(r=>r.delta_cents<0));assert.equal(p.negative_products[0].key,'OLD');
});
test('SYNTHETIC: canonical data version ignores row order and exact duplicates, rules create separate runs',async()=>{
 const f=fixture(),a=await evaluate(f);f.rows.order_items.reverse();f.rows.order_items.push([...f.rows.order_items[0]]);f.rows.orders.reverse();const b=await evaluate(f);assert.equal(a.dataset_version,b.dataset_version);assert.equal(a.run_id,b.run_id);assert.deepEqual(a.events.map(e=>e.event_id),b.events.map(e=>e.event_id));
 f.manifest.monitoring={thresholds:{amount_cents:{absolute:999999,relative:0.5}}};const c=await evaluate(f);assert.equal(c.dataset_version,b.dataset_version);assert.notEqual(c.run_id,b.run_id);assert(!c.events.some(e=>e.metric_id==='amount_cents'));
});
test('SYNTHETIC: low samples, zero bases, missing dimensions and incomplete history suppress rather than normalize',async()=>{
 for(const mutate of [f=>f.manifest.monitoring={min_orders:30},f=>f.manifest.operations.baseline_periods=8,f=>f.rows.order_items.forEach(r=>r[2]='')]){const f=fixture();mutate(f);const p=await evaluate(f);assert(p.evaluations.some(e=>e.suppressed_reasons.length));assert(!p.events.some(e=>e.scope_type==='shop'));}
 const p=await evaluate();const e=p.evaluations.find(e=>e.entity_id==='NEW'&&e.metric_id==='amount_cents');assert.equal(e.relative_change,null);assert(e.suppressed_reasons.includes('zero_baseline'));assert.equal(e.fired,false);
});
test('SYNTHETIC: incomplete or invalid monitoring config blocks every new business conclusion',async()=>{
 for(const mutate of [f=>f.manifest.operations.complete_through='2020-02-15',f=>f.manifest.monitoring={mode:'live_source'},f=>f.manifest.monitoring={thresholds:{amount_cents:{absolute:-1,relative:0.1}}},f=>f.manifest.monitoring={thresholds:null}]){const f=fixture();mutate(f);const p=await evaluate(f);assert.equal(p.status,'blocked');assert.equal(p.events.length,0);const state=S.fresh();assert.throws(()=>stage(state,p),/门禁/);assert.equal(Object.keys(state.datasets).length,0);}
});
test('SYNTHETIC: mature fulfillment uses valid order denominator and calendar dates, not item/review fanout',async()=>{
 const f=fixture(),row=f.rows.orders.find(r=>r[0]==='A1');row[3]='delivered';row[5]='2020-02-11 08:00:00';f.manifest.monitoring={fulfillment:{finalized_cohorts:true,observed_through:'2020-03-01',evidence:'SYNTHETIC generator finalized all cohorts'}};
 const p=await evaluate(f),e=p.events.find(e=>e.event_type==='fulfillment');assert(e);assert.equal(e.before,0);assert.equal(e.after,1);assert.deepEqual(e.denominators,{before:1,after:1});assert.equal(e.percentage_point_change,100);assert.equal(e.relative_change,null);
 row[5]='';const q=await evaluate(f);assert(!q.events.some(e=>e.event_type==='fulfillment'));assert(q.evaluations.find(e=>e.metric_id==='late_rate').suppressed_reasons.includes('immature_or_missing_delivery_cohort'));
});
test('SYNTHETIC: historical volatility and absolute thresholds suppress noise; baseline excludes present',()=>{
 const c={min_orders:1,baseline_periods:4,mad_multiplier:3,thresholds:{amount_cents:{absolute:100,relative:0.1}}},r=amount_cents=>({amount_cents,orders:5});
 const e=M.evaluate(r(1000),r(1600),[1000,2000,1000,1300].map(r),'amount_cents',c);assert(!e.fired);assert.equal(e.baseline.median_change,300);
 const z=M.evaluate(r(1000),r(1000),[1000,1000,1000,1000].map(r),'amount_cents',c);assert(!z.fired);assert.equal(z.baseline.zero_mad,true);
});
test('SYNTHETIC: duplicate publication preserves manual closure and immutable audit history',async()=>{
 const p=await evaluate(),s=S.fresh();stage(s,p);const e=p.events[0];assert.throws(()=>S.changeStatus(s,e.event_id,{status:'closed',actor:'QA',note:''}),/依据/);assert.throws(()=>S.changeStatus(s,e.event_id,{status:'closed',actor:'QA',note:'reviewed',resolution_code:'investigated'}),/证据/);
 S.changeStatus(s,e.event_id,{status:'in_progress',actor:'QA',note:'synthetic review'});S.changeStatus(s,e.event_id,{status:'closed',actor:'QA',note:'synthetic evidence checked; no claimed outcome',resolution_code:'investigated',evidence_ref:e.evidence_id});const n=Object.keys(s.events).length;stage(s,p,'retry');assert.equal(Object.keys(s.events).length,n);assert.equal(s.events[e.event_id].status,'closed');assert.equal(s.event_history.length,2);assert.equal(s.jobs.retry.status,'duplicate');assert.equal(Object.keys(s.runs).length,1);
 S.changeStatus(s,e.event_id,{status:'pending',actor:'QA',note:'explicitly reopen'});assert.equal(s.event_history.length,3);
});
test('SYNTHETIC: revised historical batch retains old version, evidence and processing state',async()=>{
 const f=fixture(),p=await evaluate(f),s=S.fresh();stage(s,p);f.rows.order_items.find(i=>i[0]==='A1')[5]='21.00';const revision=await evaluate(f);stage(s,revision,'revision');assert.notEqual(p.dataset_version,revision.dataset_version);assert.equal(s.datasets[revision.dataset_version].revision_of,p.dataset_version);assert.equal(s.runs[p.run_id].events[0].after,p.events[0].after);assert.equal(Object.keys(s.runs).length,2);
});
test('SYNTHETIC: state machine rejects premature publication and quality event dedup preserves accepted datasets',async()=>{
 const p=await evaluate(),s=S.fresh();S.createJob(s,{job_id:'q',submitted_at:'2020-01-01'});assert.throws(()=>S.publish(s,'q',p),/确认/);assert.throws(()=>S.transition(s,'q','succeeded'),/非法/);S.transition(s,'q','failed');const e={event_id:'bad-batch',event_type:'data_quality',dataset_version:null,status:'pending'};S.qualityEvent(s,'q',e);S.qualityEvent(s,'q',e);assert.equal(Object.keys(s.events).length,1);assert.equal(s.events[e.event_id].attempts.length,1);assert.equal(Object.keys(s.datasets).length,0);
});
test('SYNTHETIC: pending publication can be recovered idempotently from a saved verified pack',async()=>{
 const p=await evaluate(),s=S.fresh();S.createJob(s,{job_id:'recover',submitted_at:'2020-01-01'});for(const status of ['validating','computing','awaiting_confirmation','publishing','publication_pending'])S.transition(s,'recover',status);S.publish(s,'recover',p);assert.equal(s.jobs.recover.status,'succeeded');assert.equal(s.snapshot_runs[p.v1_snapshot_id],p.run_id);
});
