/* Pure monitoring engine. No IO, scheduler, storage or model calls. */
globalThis.LensMonitoring=(()=>{
'use strict';
const O=typeof module!=='undefined'?require('./operations.js'):globalThis.LensOperations;
const VERSION='monitoring-2.0.1',METRICS={amount_cents:['购买订单商品金额','分'],orders:['购买订单量','单'],units:['商品件数','件'],aov_cents:['订单平均商品金额','分/单'],late_rate:['延迟率','比例']};
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n?n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2:null;};
const empty=()=>({amount_cents:0,orders:0,units:0,delivery_eligible:0,late_orders:0});
function configuration(manifest){
 const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
 if(manifest.monitoring!==undefined&&!object(manifest.monitoring))return {config:{mode:'historical_replay'},errors:['invalid_monitoring_config']};
 const c=manifest.monitoring||{},o=manifest.operations||{};
 const config={mode:c.mode||'historical_replay',min_orders:c.min_orders??o.min_orders??30,baseline_periods:o.baseline_periods??8,mad_multiplier:c.mad_multiplier??o.thresholds?.mad_multiplier??3,thresholds:{amount_cents:{absolute:o.thresholds?.absolute_cents??10000,relative:o.thresholds?.relative??0.1},orders:{absolute:10,relative:0.1},units:{absolute:10,relative:0.1},aov_cents:{absolute:1000,relative:0.1},late_rate:{absolute:0.05,relative:0},...c.thresholds},fulfillment:c.fulfillment||null};
 const errors=[];
 if(c.fulfillment!==undefined&&(!object(c.fulfillment)||typeof c.fulfillment.finalized_cohorts!=='boolean'||typeof c.fulfillment.observed_through!=='string'||typeof c.fulfillment.evidence!=='string'))errors.push('invalid_fulfillment_config');
 if(!['historical_replay','manual_snapshot'].includes(config.mode))errors.push('unsupported_mode');
 if(!Number.isSafeInteger(config.min_orders)||config.min_orders<1)errors.push('invalid_min_orders');
 if(!Number.isFinite(config.mad_multiplier)||config.mad_multiplier<=0)errors.push('invalid_mad_multiplier');
 if(!Number.isInteger(config.baseline_periods)||config.baseline_periods<4||config.baseline_periods>52)errors.push('invalid_baseline_periods');
 if(c.thresholds!==undefined&&(!c.thresholds||typeof c.thresholds!=='object'||Array.isArray(c.thresholds)))errors.push('invalid_thresholds');
 for(const [k,t]of Object.entries(config.thresholds))if(!METRICS[k]||!t||!Number.isFinite(t.absolute)||t.absolute<0||!Number.isFinite(t.relative)||t.relative<0||t.relative>1||k==='late_rate'&&t.absolute>1)errors.push('invalid_threshold_'+k);
 return {config,errors};
}
async function datasetIdentity(valid){
 const m=valid.manifest,semantics={};
 for(const k of ['schema_version','source_uri_or_description','coverage_start','coverage_end','currency','source_timezone','import_mode','is_synthetic'])semantics[k]=m[k]??null;
 // validate() has removed identical rows. Sorting makes CSV ordering immaterial.
 const tables=Object.fromEntries(Object.entries(valid.tables).map(([k,rows])=>[k,rows.map(O.canonical).sort()]));
 return O.hash({tables,semantics});
}
// Exact fractions also cover derived monetary means and rate threshold boundaries.
const abs=n=>n<0n?-n:n;
function fraction(n,d=1n){if(d===0n)return null;if(d<0n){n=-n;d=-d;}let a=abs(n),b=d;while(b){const t=a%b;a=b;b=t;}const g=a||1n;return {n:n/g,d:d/g};}
const subtract=(a,b)=>fraction(a.n*b.d-b.n*a.d,a.d*b.d),multiply=(a,b)=>fraction(a.n*b.n,a.d*b.d),absolute=a=>fraction(abs(a.n),a.d);
const compare=(a,b)=>{const v=a.n*b.d-b.n*a.d;return v<0n?-1:v>0n?1:0;};
const numeric=a=>a===null?null:Number(a.n)/Number(a.d),record=a=>a===null?null:{numerator:String(a.n),denominator:String(a.d)};
function decimal(x){const [mantissa,exp='0']=String(x).split(/e/i),parts=mantissa.split('.'),digits=BigInt(parts.join('')),power=Number(exp)-(parts[1]?.length||0);return power>=0?fraction(digits*10n**BigInt(power)):fraction(digits,10n**BigInt(-power));}
function medianFraction(values){if(!values.length)return null;const a=[...values].sort(compare),i=Math.floor(a.length/2);return a.length%2?a[i]:fraction(a[i-1].n*a[i].d+a[i].n*a[i-1].d,2n*a[i-1].d*a[i].d);}
function evaluate(before,after,history,metric,config,reasons=[]){
 const value=r=>metric==='aov_cents'?fraction(BigInt(r.amount_cents),BigInt(r.orders)):metric==='late_rate'?fraction(BigInt(r.late_orders),BigInt(r.delivery_eligible)):fraction(BigInt(r[metric]));
 const a=value(before),b=value(after),h=history.map(value),denom=r=>metric==='late_rate'?r.delivery_eligible:r.orders;
 reasons=[...reasons];
 if(Math.min(denom(before),denom(after))<config.min_orders)reasons.push('low_sample');
 if(history.length<config.baseline_periods)reasons.push('insufficient_historical_coverage');
 if(history.some(r=>denom(r)<config.min_orders))reasons.push('low_historical_sample');
 if(a===null||b===null||h.some(x=>x===null))reasons.push('missing_denominator');
 if(a?.n===0n&&metric!=='late_rate')reasons.push('zero_baseline');
 const delta=a===null||b===null?null:subtract(b,a),relative=a?.n&&delta?fraction(delta.n*a.d,delta.d*a.n):null;
 const changes=h.slice(1).map((v,i)=>v===null||h[i]===null?null:subtract(v,h[i])).filter(v=>v!==null),center=medianFraction(changes),mad=center===null?null:medianFraction(changes.map(v=>absolute(subtract(v,center)))),limit=mad===null?null:multiply(mad,multiply(decimal(config.mad_multiplier),decimal(1.4826)));
 const t=config.thresholds[metric],deviation=center===null||delta===null?null:absolute(subtract(delta,center));
 const fired=!reasons.length&&delta?.n!==0n&&delta!==null&&compare(absolute(delta),decimal(t.absolute))>=0&&(metric==='late_rate'||relative!==null&&compare(absolute(relative),decimal(t.relative))>=0)&&deviation!==null&&compare(deviation,limit)>0;
 return {metric_id:metric,metric_label:METRICS[metric][0],unit:METRICS[metric][1],before:numeric(a),after:numeric(b),absolute_change:numeric(delta),relative_change:numeric(relative),percentage_point_change:metric==='late_rate'&&delta!==null?numeric(multiply(delta,fraction(100n))):null,exact:{before:record(a),after:record(b),absolute_change:record(delta),relative_change:record(relative)},denominators:{before:denom(before),after:denom(after)},fired:!!fired,suppressed_reasons:[...new Set(reasons)],thresholds:t,baseline:{values:h.map(numeric),changes:changes.map(numeric),median_change:numeric(center),mad:numeric(mad),limit:numeric(limit),deviation:numeric(deviation),zero_mad:mad?.n===0n,exact:{median_change:record(center),mad:record(mad),limit:record(limit),deviation:record(deviation)}}};
}
function fulfillmentGate(valid,ops,config){
 const f=config.fulfillment;
 if(!f||f.finalized_cohorts!==true||!/^\d{4}-\d\d-\d\d$/.test(f.observed_through||'')||!String(f.evidence||'').trim())return ['missing_mature_cohort_evidence'];
 const n=Date.parse(f.observed_through+'T00:00:00Z');
 if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==f.observed_through||n>Date.parse(valid.manifest.extracted_at)-36*3600000)return ['invalid_observation_cutoff'];
 const rows=valid.tables.orders.filter(o=>O.INCLUDED.includes(o.order_status)&&ops.periods.some(p=>o.purchased_at.slice(0,10)>=p.start&&o.purchased_at.slice(0,10)<p.end));
 return rows.some(o=>o.order_status!=='delivered'||!o.delivered_at||!o.estimated_delivery_at||o.delivered_at.slice(0,10)>f.observed_through||o.estimated_delivery_at.slice(0,10)>f.observed_through)?['immature_or_missing_delivery_cohort']:[];
}
async function run(valid,result,code_sha256){
 const ops=result.operations;code_sha256=await O.hash({monitoring:code_sha256,operations:ops?.source?.code_sha256||null,legacy:result.code_sha256});const {config,errors}=configuration(valid.manifest),dataset_version=await datasetIdentity(valid),rule_set_version=await O.hash({VERSION,config,code_sha256});
 const run_id=await O.hash({dataset_version,rule_set_version,periods:ops?.config&&[ops.config.before,ops.config.after]});
 const base={run_id,dataset_version,v1_snapshot_id:result.id,rule_set_version,calculation_version:VERSION,metric_version:O.VERSION,code_sha256,generated_at:new Date().toISOString(),mode:config.mode,is_synthetic:valid.manifest.is_synthetic===true?true:valid.manifest.is_synthetic===false?false:'unknown',source_ref:{manifest:valid.manifest,file_hashes:result.file_hashes},config,status:'blocked',gates:[...errors],evaluations:[],events:[],metric_snapshots:[],negative_products:[]};
 if(valid.quality.errors||result.verification?.status!=='通过')base.gates.push('legacy_quality_failed');
 if(!ops?.verification?.passed||ops.status==='blocked'||!ops.verified_cube)base.gates.push(...(ops?.gates||[]),'operations_not_verified');
 if(base.gates.length)return base;
 base.periods=ops.periods;base.comparison={before:ops.config.before,after:ops.config.after};base.completeness={through:ops.config.complete_through,evidence:ops.config.completion_evidence};
 const history=ops.periods.filter(p=>p.period.startsWith('history_')).map(p=>p.period),cube=ops.verified_cube;
 const entities=[{scope:'shop',key:'all',rows:cube.totals.map(r=>({...r,amount_cents:r.purchase_item_amount_cents,orders:r.purchase_orders,units:r.item_units}))}];
 const grouped=new Map();for(const r of cube.groups){if(!['product','category','seller'].includes(r.dimension))continue;const id=O.canonical([r.dimension,r.key]);if(!grouped.has(id))grouped.set(id,{scope:r.dimension,key:r.key,rows:[],current:false});const entity=grouped.get(id);entity.rows.push(r);if(['before','after'].includes(r.period))entity.current=true;}entities.push(...[...grouped.values()].filter(e=>e.current));
 const missingDimensions=new Set(cube.groups.filter(r=>r.key===null).map(r=>r.dimension)),dimensionMissing=scope=>missingDimensions.has(scope);
 for(const entity of entities){
  const byPeriod=new Map(entity.rows.map(r=>[r.period,r])),a=byPeriod.get('before')||empty(),b=byPeriod.get('after')||empty(),h=history.map(p=>byPeriod.get(p)||empty());
  base.metric_snapshots.push({scope:entity.scope,entity_id:entity.key,periods:ops.periods.map(p=>({window:p,values:byPeriod.get(p.period)||empty()}))});
  for(const metric of Object.keys(METRICS)){
   if(metric==='late_rate'&&entity.scope!=='shop')continue;
   const reasons=[];if(entity.key===null||dimensionMissing(entity.scope==='shop'?'product':entity.scope))reasons.push('missing_dimension');
   if(metric==='late_rate')reasons.push(...fulfillmentGate(valid,ops,config));
   const evaluation=evaluate(a,b,h,metric,config,reasons),id=await O.hash({dataset_version,rule_set_version,metric,scope:entity.scope,key:entity.key,comparison:base.comparison});
   const evidence={id:id+':evidence',query:entity.scope==='shop'?'operations.sql @totals':'operations.sql @groups',independent_verification:ops.verification,metric_contract:{name:METRICS[metric][0],unit:METRICS[metric][1],included_statuses:O.INCLUDED,grain:entity.scope,definition:metric==='aov_cents'?'SUM(item price cents) / COUNT(DISTINCT order_id)':metric==='late_rate'?'late delivered orders / delivered orders with valid actual and estimated dates':'amount: SUM(item price cents); orders: COUNT(DISTINCT order_id); units: COUNT(item rows)',exclusions:'created/canceled/unavailable；运费、退款、广告、库存；多组订单数不可相加'},periods:base.comparison,before:a,after:b,history:h,history_windows:ops.periods.filter(p=>history.includes(p.period)),completeness:base.completeness,fulfillment:metric==='late_rate'?config.fulfillment:null};
   const row={...evaluation,scope_type:entity.scope,entity_id:entity.key,evidence_id:evidence.id,evidence};base.evaluations.push(row);
   if(row.fired)base.events.push({...row,event_id:id,event_type:metric==='late_rate'?'fulfillment':'business',rule_id:metric+'_change',rule_version:rule_set_version,metric_version:O.VERSION,calculation_version:VERSION,code_sha256,dataset_version,v1_snapshot_id:result.id,analysis_run_id:run_id,source_ref:base.source_ref,periods:base.comparison,status:'pending',severity:Math.abs(row.relative_change||0)>=0.5?'high':'medium',created_at:base.generated_at,updated_at:base.generated_at,evidence_ids:[evidence.id],causal_effect_confirmed:false});
  }
 }
 base.negative_products=ops.dimensions.product.filter(r=>r.delta_cents<0).sort((a,b)=>a.delta_cents-b.delta_cents).map(r=>({...r,evidence:ops.evidence.find(e=>e.id===r.evidence_id)}));
 base.status='verified';base.evidence_hash=await O.hash({dataset_version,rule_set_version,evaluations:base.evaluations});return base;
}
// Keep v1 snapshot identities unchanged. v2 snapshots also bind their monitoring calculation.
async function bindSnapshot(result){
 if(!result.manifest.operations||!result.monitoring)return result;
 result.operations_snapshot_id=result.operations_snapshot_id||result.id;
 result.id=(await O.hash({operations_snapshot_id:result.operations_snapshot_id,monitoring_run_id:result.monitoring.run_id})).slice(0,24);
 result.monitoring.v1_snapshot_id=result.id;for(const event of result.monitoring.events)event.v1_snapshot_id=result.id;
 return result;
}
function blockingQuality(result){
 const gates=(result.operations?.gates||[]).filter(g=>['independent_verification_failed','calculation_failed','operations_execution_failed'].includes(g)||g.startsWith('reconciliation_failed_'));
 if(!gates.length)return null;
 const issues=gates.map(code=>({severity:'error',code,file:'operations.sql',field:'',message:'经营计算或独立复算失败，禁止切换整个候选版本',count:1}));
 return {...result.quality,status:'阻断',errors:result.quality.errors+issues.length,summary:[...result.quality.summary,...issues],issues:[...result.quality.issues,...issues]};
}
return {VERSION,METRICS,configuration,datasetIdentity,evaluate,run,bindSnapshot,blockingQuality};
})();
if(typeof module!=='undefined')module.exports=globalThis.LensMonitoring;
