'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture,files}=require('./operations-fixture.cjs'),{analyze}=require('../scripts/operations.cjs'),O=require('../cloud/dist/operations.js');
const evaluate=async(f=fixture())=>(await analyze(files(f.rows),f.manifest)).operations;
test('SYNTHETIC: purchase vs delivered, status exclusions, multi-item/review fanout, all dimensions reconcile',async()=>{
 const f=fixture(),r=await analyze(files(f.rows),f.manifest),o=r.operations;
 assert.equal(o.status,'verified');assert.equal(r.metrics.amount_cents,6500);assert.equal(o.metrics.before.purchase_item_amount_cents,2500);assert.equal(o.metrics.after.purchase_item_amount_cents,6700);assert.equal(o.metrics.before.purchase_orders,1);assert.equal(o.metrics.after.item_units,4);assert.equal(o.delta_cents,4200);assert(o.verification.passed);assert(o.is_synthetic);
 for(const rows of Object.values(o.dimensions))assert.equal(rows.reduce((s,p)=>s+p.delta_cents,0),4200);
 const p=o.dimensions.product.find(p=>p.key==='P1');assert.equal(p.quantity_effect.value_cents,1500);assert.equal(p.price_effect.value_cents,2500);assert.equal(o.dimensions.product.find(p=>p.key==='OLD').assortment_effect_cents,-500);assert.equal(o.dimensions.product.find(p=>p.key==='NEW').price_effect,null);
 assert.equal(o.metrics.after.late_rate,null);assert.equal(o.alerts.length,1);assert.equal(o.alerts[0].status,'pending_review');assert.equal(o.detection.baseline.changes,3);
});
test('SYNTHETIC: exact rational identity across fractional unit averages and near-safe large amounts',()=>{
 for(let q0=1;q0<13;q0++)for(let q1=1;q1<13;q1++)for(const [s0,s1]of [[100,299],[0,7],[999999999999,899999999999]]){const r=O.decompose({units:q0,amount_cents:s0},{units:q1,amount_cents:s1}),a=r.quantity_effect,b=r.price_effect;assert.equal(BigInt(a.numerator)*BigInt(b.denominator)+BigInt(b.numerator)*BigInt(a.denominator),BigInt(s1-s0)*BigInt(a.denominator)*BigInt(b.denominator));}
});
test('SYNTHETIC: identical reruns keep identity; duplicate rows and extra reviews never multiply amounts',async()=>{
 const f=fixture(),a=await evaluate(f),b=await evaluate(f);assert.equal(a.id,b.id);assert.equal(a.evidence_hash,b.evidence_hash);f.rows.order_items.push([...f.rows.order_items[4]]);f.rows.order_reviews.push(['R3','B1','2','2020-02-06 00:00:00','2020-02-06 09:00:00']);const c=await evaluate(f);assert.equal(c.delta_cents,a.delta_cents);assert.notEqual(c.id,a.id);assert(c.quality.legacy.summary.some(s=>s.code==='exact_duplicate'));
});
test('SYNTHETIC: missing shipped item blocks only v2 while old fulfillment still computes',async()=>{
 const f=fixture();f.rows.order_items=f.rows.order_items.filter(i=>i[0]!=='A1');const r=await analyze(files(f.rows),f.manifest);assert.equal(r.verification.status,'通过');assert.equal(r.operations.status,'blocked');assert(r.operations.gates.includes('purchase_order_missing_items'));assert.equal(r.operations.alerts.length,0);
});
test('SYNTHETIC: primary key conflict and invalid source data block all new conclusions',async()=>{
 const f=fixture();f.rows.order_items.push([...f.rows.order_items[0]]);f.rows.order_items.at(-1)[5]='11.00';const r=await analyze(files(f.rows),f.manifest);assert.equal(r.status,'blocked');assert.equal(r.operations.alerts.length,0);
});
test('SYNTHETIC: completeness, period comparability and invalid thresholds fail closed',async()=>{
 const mutations=[m=>delete m.operations,m=>m.operations.complete_through='2020-02-15',m=>m.operations.completion_evidence='',m=>m.operations.after.end='2020-02-16',m=>m.operations.before.end='2020-02-09',m=>m.operations.after.start='2020-02-03',m=>m.operations.thresholds.absolute_cents=-1,m=>m.operations.thresholds='bad',m=>m.operations.baseline_periods=0,m=>m.operations.complete_through='2026-11-14'];
 for(const mutate of mutations){const f=fixture();mutate(f.manifest);const o=await evaluate(f);assert.equal(o.status,'blocked');assert.equal(o.alerts.length,0);}
});
test('SYNTHETIC: missing product retains unknown amount but suppresses alert; missing optional dimensions disclosed',async()=>{
 const f=fixture();const i=f.rows.order_items.find(x=>x[0]==='A1');i[2]='';i[3]='';i[4]='';f.rows.orders.find(x=>x[0]==='A1')[2]='';const o=await evaluate(f);assert.equal(o.status,'insufficient_evidence');assert.equal(o.delta_cents,4200);assert.equal(o.alerts.length,0);assert(o.detection.reasons.includes('missing_product_id'));assert(o.quality.coverage.every(c=>c.period!=='after'||c.missing_units>0));
});
test('SYNTHETIC: low samples and short history suppress alerts without inventing baseline',async()=>{
 const f=fixture();f.manifest.operations.min_orders=30;let o=await evaluate(f);assert.equal(o.alerts.length,0);assert(o.detection.reasons.includes('low_sample'));f.manifest.operations.min_orders=1;f.manifest.coverage_start='2020-01-13';f.rows.orders=f.rows.orders.filter(r=>r[0]!=='H2020-01-06');f.rows.order_items=f.rows.order_items.filter(r=>r[0]!=='H2020-01-06');o=await evaluate(f);assert.equal(o.alerts.length,0);assert(o.detection.reasons.includes('insufficient_historical_coverage'));
});
test('SYNTHETIC: total delta zero returns null contribution; zero baseline and empty periods are not percentage drops',async()=>{
 const f=fixture();f.rows.order_items=f.rows.order_items.filter(i=>i[0]!=='A1');f.rows.order_items.push(['A1','1','NEW','S1','cat','25.00','0']);let o=await evaluate(f);assert.equal(o.delta_cents,0);assert(o.dimensions.product.every(p=>p.delta_contribution_share===null));assert.equal(o.alerts.length,0);
 f.rows.order_items.filter(i=>i[0]==='B1').forEach(i=>i[5]='0.00');o=await evaluate(f);assert.equal(o.detection.relative_change,null);assert.equal(o.alerts.length,0);
 f.rows.orders=f.rows.orders.filter(i=>i[0]!=='B1');f.rows.order_items=f.rows.order_items.filter(i=>i[0]!=='B1');f.rows.order_reviews=[];o=await evaluate(f);assert.equal(o.metrics.before.avg_order_item_amount_cents,null);assert.equal(o.alerts.length,0);
});
test('SYNTHETIC: configuration changes invalidate run and candidate identity',async()=>{
 const f=fixture(),a=await analyze(files(f.rows),f.manifest);f.manifest.operations.thresholds.absolute_cents=100000;const b=await analyze(files(f.rows),f.manifest);assert.notEqual(a.id,b.id);assert.notEqual(a.operations.id,b.operations.id);assert.equal(b.operations.alerts.length,0);
});
test('SYNTHETIC: SQL mutation is caught by independent JS verification',async()=>{
 const d=path.resolve(__dirname,'../cloud/dist'),C=require(d+'/core.js'),P=require(d+'/vendor/papaparse.min.js'),SQL=await require(d+'/vendor/sql-wasm.js')({locateFile:f=>d+'/vendor/'+f}),f=fixture();const r=await O.run({validated:C.validate(files(f.rows),f.manifest,P),SQL,Core:C,legacySQL:fs.readFileSync(d+'/analysis.sql','utf8'),operationsSQL:fs.readFileSync(d+'/operations.sql','utf8').replace('SUM(price_cents) amount_cents','SUM(price_cents)+1 amount_cents'),context:{dataset_id:'synthetic-mutation',file_hashes:Object.fromEntries(Object.keys(C.fields).map(k=>[k+'.csv','synthetic-hash'])),code_sha256:'synthetic-code'}});assert.equal(r.status,'blocked');assert(r.gates.includes('independent_verification_failed'));assert.equal(r.alerts.length,0);
});
test('SYNTHETIC: AI adapter says evidence insufficient for missing facts, and binds answer and human action to version',async()=>{
 const o=await evaluate();for(const q of ['广告效果如何','自然搜索下降原因','退款后净 GMV','库存不足吗','利润提升多少','what caused revenue change'])assert.match(O.answer(o,q).answer,/证据不足/);
 assert.match(O.answer({status:'blocked'},'商品变化').answer,/证据不足/);const draft=O.answer(o,'商品金额变化');assert.equal(draft.mode,'deterministic_evidence_only');assert.equal(O.validateDraft(draft,o).semantic_review,'required');assert.throws(()=>O.action(o,null,{owner:'test',task:'check'}));assert.throws(()=>O.validateDraft({...draft,evidence_ids:['invented']},o));assert.throws(()=>O.validateDraft({...draft,answer:'收益提高了 20%'},o));assert.throws(()=>O.validateDraft({...draft,evidence_hash:'tampered'},o));
 assert.throws(()=>O.validateDraft({...draft,confirmed_observations:[{revenue:9999}]},o));assert.throws(()=>O.validateDraft({...draft,invented_revenue:9999},o));
 const review=O.review(o,draft,{reviewer:'Synthetic reviewer',decision:'confirmed',note:'Synthetic manual review test only'});assert.equal(O.action(o,review,{owner:'Synthetic owner',task:'Verify raw pricing evidence'}).business_outcome,'unverified');assert.throws(()=>O.action({...o,run_id:'different'},review,{owner:'x',task:'y'}));
});
test('SYNTHETIC: variable historical changes use median/MAD; current period never trains the baseline',async()=>{
 const f=fixture();const prices=['10.00','20.00','10.00','20.00'];f.rows.order_items.filter(i=>i[0].startsWith('H')).forEach((i,n)=>i[5]=prices[n]);let o=await evaluate(f);assert.equal(o.detection.baseline.median_change_cents,1000);assert.equal(o.detection.baseline.mad_cents,0);const baseline=o.detection.baseline;f.rows.order_items.filter(i=>i[0]==='A1').forEach(i=>i[5]='900.00');o=await evaluate(f);assert.equal(o.detection.baseline.median_change_cents,baseline.median_change_cents);assert.equal(o.detection.baseline.mad_cents,baseline.mad_cents);
 const g=fixture();['10.00','20.00','40.00','70.00'].forEach((p,n)=>g.rows.order_items[n][5]=p);const v=await evaluate(g);assert.equal(v.detection.baseline.median_change_cents,2000);assert.equal(v.detection.baseline.mad_cents,1000);assert.equal(v.alerts.length,0);
});
test('SYNTHETIC: product movement across categories is flagged and dimensions stay additive',async()=>{
 const f=fixture();f.rows.order_items.filter(i=>i[0]==='A1').forEach(i=>{i[3]='S2';i[4]='changed';});f.rows.orders.find(o=>o[0]==='A1')[2]='RJ';const o=await evaluate(f);assert(o.dimensions.product.find(p=>p.key==='P1').flags.includes('multiple_categories'));for(const dimension of ['category','seller','state']){assert.equal(o.dimensions[dimension].length,2);assert.equal(o.dimensions[dimension].reduce((n,p)=>n+p.delta_cents,0),4200);}
});
test('SYNTHETIC: extraction watermark respects source timezone and conservatively handles unknown timezone',async()=>{
 for(const zone of ['source_local_unknown','America/Sao_Paulo']){const f=fixture();f.manifest.source_timezone=zone;f.manifest.extracted_at='2020-02-17T01:00:00Z';const o=await evaluate(f);assert.equal(o.status,'blocked');assert(o.gates.includes('completeness_after_extraction'));}
 const f=fixture();f.manifest.source_timezone='Asia/Shanghai';f.manifest.extracted_at='2020-02-17T01:00:00Z';assert.equal((await evaluate(f)).status,'verified');
});
