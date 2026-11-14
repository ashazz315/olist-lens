/* Additive operations contract. No network, storage or timers; caller supplies validated v1 inputs. */
globalThis.LensOperations=(()=>{
'use strict';
const VERSION='operations-2.0.0',CALC_VERSION='2.0.0-preview.1';
const INCLUDED=['approved','invoiced','processing','shipped','delivered'];
const DIMENSIONS={product:'product_id',category:'category',seller:'seller_id',state:'customer_state'};
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const clone=x=>JSON.parse(JSON.stringify(x));
const ratio=(a,b)=>b?a/b:null;
const hash=async x=>Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(typeof x==='string'?x:canonical(x))))).map(b=>b.toString(16).padStart(2,'0')).join('');
const day=s=>Date.parse(s+'T00:00:00Z')/86400000; // Calendar arithmetic only; source timestamps are never converted.
const iso=n=>new Date(n*86400000).toISOString().slice(0,10);
function validDate(s){return typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(day(s))&&iso(day(s))===s;}
const gcd=(a,b)=>{a=a<0n?-a:a;while(b){const t=a%b;a=b;b=t;}return a||1n;};
function rational(n,d=1n){if(d<=0n)throw Error('Invalid rational denominator');const g=gcd(n,d);return {numerator:String(n/g),denominator:String(d/g),value_cents:Number(n)/Number(d)};}
function decompose(a,b){
 const delta=b.amount_cents-a.amount_cents;
 if(!a.units||!b.units)return {status:a.units?'discontinued':'new',quantity_effect:null,price_effect:null,assortment_effect_cents:delta};
 const q0=BigInt(a.units),q1=BigInt(b.units),s0=BigInt(a.amount_cents),s1=BigInt(b.amount_cents),den=2n*q0*q1;
 return {status:'continuing',quantity_effect:rational((q1-q0)*(s1*q0+s0*q1),den),price_effect:rational((s1*q0-s0*q1)*(q1+q0),den),assortment_effect_cents:0};
}
function configuration(manifest){
 const c=manifest.operations,errors=[];
 if(!c||typeof c!=='object')return {errors:['missing_operations_config']};
 if(c.thresholds!==undefined&&(!c.thresholds||typeof c.thresholds!=='object'||Array.isArray(c.thresholds)))errors.push('invalid_thresholds');
 for(const p of ['before','after'])if(!c[p]||!validDate(c[p].start)||!validDate(c[p].end)||c[p].start>=c[p].end)errors.push('invalid_'+p+'_window');
 if(errors.length)return {errors};
 const days=day(c.before.end)-day(c.before.start);
 if(days!==day(c.after.end)-day(c.after.start)||c.before.end!==c.after.start||days%7!==0||days<7||days>364)errors.push('non_comparable_windows');
 if(!validDate(c.complete_through)||typeof c.completion_evidence!=='string'||!c.completion_evidence.trim())errors.push('missing_completeness_evidence');
 if(c.after.end>iso(day(manifest.coverage_end)+1)||c.before.start<manifest.coverage_start||validDate(c.complete_through)&&c.after.end>iso(day(c.complete_through)+1))errors.push('incomplete_period');
 // The extraction instant has an offset. For unknown source timezone use UTC-12,
 // the earliest possible local calendar date, without converting any order dates.
 const extracted=Date.parse(manifest.extracted_at);
 let lastCompleteDay;
 if(manifest.source_timezone==='source_local_unknown')lastCompleteDay=Math.floor((extracted-12*3600000)/86400000)-1;
 else {const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:manifest.source_timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(extracted)).map(p=>[p.type,p.value]));lastCompleteDay=day(`${parts.year}-${parts.month}-${parts.day}`)-1;}
 if(validDate(c.complete_through)&&day(c.complete_through)>lastCompleteDay)errors.push('completeness_after_extraction');
 const config={before:c.before,after:c.after,complete_through:c.complete_through,completion_evidence:c.completion_evidence,min_orders:c.min_orders??30,min_product_orders:c.min_product_orders??30,baseline_periods:c.baseline_periods??8,thresholds:{absolute_cents:10000,relative:0.1,mad_multiplier:3,...c.thresholds}};
 for(const k of ['min_orders','min_product_orders'])if(!Number.isSafeInteger(config[k])||config[k]<1)errors.push('invalid_'+k);
 if(!Number.isInteger(config.baseline_periods)||config.baseline_periods<4||config.baseline_periods>52)errors.push('invalid_baseline_periods');
 for(const k of ['absolute_cents','relative','mad_multiplier'])if(!Number.isFinite(config.thresholds[k])||config.thresholds[k]<0)errors.push('invalid_threshold_'+k);
 if(!Number.isSafeInteger(config.thresholds.absolute_cents)||config.thresholds.relative>1||config.thresholds.mad_multiplier===0)errors.push('invalid_threshold_range');
 if(errors.length)return {errors};
 const history=Array.from({length:config.baseline_periods},(_,i)=>({period:'history_'+String(i).padStart(2,'0'),start:iso(day(c.before.start)-(config.baseline_periods-i)*days),end:iso(day(c.before.start)-(config.baseline_periods-i-1)*days)}));
 return {errors,config,days,history,periods:[...history.filter(p=>p.start>=manifest.coverage_start),{period:'before',...c.before},{period:'after',...c.after}]};
}
function aggregateJS(tables,periods){
 const totals=[],groups=[],excluded=[];
 const itemMap=new Map();for(const i of tables.order_items){if(!itemMap.has(i.order_id))itemMap.set(i.order_id,[]);itemMap.get(i.order_id).push(i);}
 for(const p of periods){
  const m={period:p.period,purchase_orders:0,item_units:0,purchase_item_amount_cents:0,delivery_eligible:0,late_orders:0},g=new Map(),ex=new Map();
  for(const o of tables.orders){const date=o.purchased_at.slice(0,10);if(date<p.start||date>=p.end)continue;const items=itemMap.get(o.order_id)||[];
   if(!INCLUDED.includes(o.order_status)){if(!ex.has(o.order_status))ex.set(o.order_status,{period:p.period,status:o.order_status,orders:0,amount_cents:0});const x=ex.get(o.order_status);x.orders++;x.amount_cents+=items.reduce((s,i)=>s+i.price_cents,0);continue;}
   m.purchase_orders++;
   if(o.order_status==='delivered'&&o.delivered_at&&o.estimated_delivery_at){m.delivery_eligible++;if(o.delivered_at.slice(0,10)>o.estimated_delivery_at.slice(0,10))m.late_orders++;}
   for(const i of items){m.item_units++;m.purchase_item_amount_cents+=i.price_cents;
    for(const [dimension,field]of Object.entries(DIMENSIONS)){const key=dimension==='state'?o[field]:i[field],id=canonical([dimension,key]);if(!g.has(id))g.set(id,{period:p.period,dimension,key,amount_cents:0,units:0,orderSet:new Set()});const row=g.get(id);row.amount_cents+=i.price_cents;row.units++;row.orderSet.add(o.order_id);}
   }
  }
  totals.push(m);groups.push(...[...g.values()].map(({orderSet,...r})=>({...r,orders:orderSet.size})));excluded.push(...ex.values());
 }
 return {totals,groups,excluded};
}
function sqlAggregate(valid,periods,SQL,legacySQL,operationsSQL,Core){
 const db=new SQL.Database(),sql=Core.parseSQL(operationsSQL);
 try{
  db.run(Core.parseSQL(legacySQL).schema);db.run('BEGIN');
  for(const [table,cols]of Object.entries({orders:Core.fields.orders,order_items:['order_id','order_item_id','product_id','seller_id','category','price_cents','freight_cents']})){
   const stmt=db.prepare(`INSERT INTO ${table} VALUES (${cols.map(()=>'?').join(',')})`);try{for(const row of valid.tables[table])stmt.run(cols.map(k=>row[k]??null));}finally{stmt.free();}
  }
  db.run('COMMIT');db.run(sql.views);const stmt=db.prepare('INSERT INTO periods VALUES (?,?,?)');try{for(const p of periods)stmt.run([p.period,p.start,p.end]);}finally{stmt.free();}
  const query=s=>{const r=db.exec(s)[0];return r?r.values.map(v=>Object.fromEntries(r.columns.map((k,i)=>[k,v[i]]))):[];};
  return {totals:query(sql.totals),groups:query(sql.groups)};
 }finally{db.close();}
}
const sorted=rows=>rows.map(canonical).sort();
function comparison(groups,dimension,beforeTotal,afterTotal,min){
 const all=groups.filter(g=>g.dimension===dimension&&['before','after'].includes(g.period)),keys=new Map();
 for(const r of all){const id=canonical(r.key);if(!keys.has(id))keys.set(id,{key:r.key});keys.get(id)[r.period]=r;}
 const empty={amount_cents:0,units:0,orders:0},delta=afterTotal-beforeTotal;
 return [...keys.values()].map(r=>{const a=r.before||empty,b=r.after||empty;return {key:r.key,before:{...a,avg_unit_price_cents:ratio(a.amount_cents,a.units),sales_share:ratio(a.amount_cents,beforeTotal)},after:{...b,avg_unit_price_cents:ratio(b.amount_cents,b.units),sales_share:ratio(b.amount_cents,afterTotal)},delta_cents:b.amount_cents-a.amount_cents,delta_contribution_share:ratio(b.amount_cents-a.amount_cents,delta),flags:[...(Math.min(a.orders,b.orders)<min?['low_sample']:[]),...(r.key===null?['missing_dimension']:[])],...(dimension==='product'?decompose(a,b):{})};}).sort((a,b)=>Math.abs(b.delta_cents)-Math.abs(a.delta_cents)||canonical(a.key).localeCompare(canonical(b.key)));
}
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;};
function detect(metrics,history,config,reasons){
 const delta=metrics.after.purchase_item_amount_cents-metrics.before.purchase_item_amount_cents,relative=ratio(delta,metrics.before.purchase_item_amount_cents);
 const changes=history.slice(1).map((m,i)=>m.purchase_item_amount_cents-history[i].purchase_item_amount_cents);
 if(history.length<config.baseline_periods)reasons.push('insufficient_historical_coverage');
 if(history.some(m=>m.purchase_orders<config.min_orders))reasons.push('low_historical_sample');
 if(relative===null)reasons.push('zero_baseline_amount');
 const center=changes.length?median(changes):null,mad=center===null?null:median(changes.map(x=>Math.abs(x-center)));
 const deviation=center===null?null:Math.abs(delta-center),limit=mad===null?null:config.thresholds.mad_multiplier*1.4826*mad;
 const fired=!reasons.length&&delta!==0&&Math.abs(delta)>=config.thresholds.absolute_cents&&Math.abs(relative)>=config.thresholds.relative&&deviation>limit;
 return {fired,reasons:[...new Set(reasons)],delta_cents:delta,relative_change:relative,baseline:{kind:'prior_period_changes_median_mad',periods:history.length,changes:changes.length,median_change_cents:center,mad_cents:mad,deviation_cents:deviation,limit_cents:limit,zero_mad:mad===0},thresholds:config.thresholds};
}
async function run({validated,SQL,legacySQL,operationsSQL,Core,context}){
 const manifest=validated.manifest,configResult=validated.quality.errors?{errors:[]}:configuration(manifest);
 const identity={dataset_id:context.dataset_id,file_hashes:context.file_hashes,code_sha256:context.code_sha256,metric_version:VERSION,calculation_version:CALC_VERSION,manifest};
 const id=await hash(identity),base={id,run_id:id,metric_version:VERSION,calculation_version:CALC_VERSION,generated_at:new Date().toISOString(),is_synthetic:manifest.is_synthetic===true?true:manifest.is_synthetic===false?false:'unknown',source:identity,status:'blocked',alerts:[],metric_snapshots:[],gates:[],verification:{passed:false}};
 if(!context.dataset_id||!context.code_sha256||!context.file_hashes||Object.keys(Core.fields).some(k=>!context.file_hashes[k+'.csv']))base.gates.push('missing_provenance');
 if(validated.quality.errors)base.gates.push('legacy_quality_failed');
 base.gates.push(...configResult.errors);
 if(base.gates.length)return base;
 const {config,periods,history}=configResult;Object.assign(base,{config,periods,quality:{legacy:validated.quality,coverage:[]}});
 const itemsByOrder=new Set(validated.tables.order_items.map(x=>x.order_id));
 const scoped=validated.tables.orders.filter(o=>INCLUDED.includes(o.order_status)&&periods.some(p=>o.purchased_at.slice(0,10)>=p.start&&o.purchased_at.slice(0,10)<p.end));
 if(scoped.some(o=>!itemsByOrder.has(o.order_id))){base.gates.push('purchase_order_missing_items');return base;}
 let sql,js;
 try{sql=sqlAggregate(validated,periods,SQL,legacySQL,operationsSQL,Core);js=aggregateJS(validated.tables,periods);}catch(e){base.gates.push('calculation_failed');base.error=e.message;return base;}
 const totalsMatch=canonical(sorted(sql.totals))===canonical(sorted(js.totals)),groupsMatch=canonical(sorted(sql.groups))===canonical(sorted(js.groups));
 base.verification={passed:totalsMatch&&groupsMatch,engines:'SQLite / independent JavaScript',totals_match:totalsMatch,groups_match:groupsMatch,groups_checked:js.groups.length};
 if(!base.verification.passed){base.gates.push('independent_verification_failed');return base;}
 const metrics=Object.fromEntries(sql.totals.filter(x=>['before','after'].includes(x.period)).map(m=>[m.period,{...m,avg_order_item_amount_cents:ratio(m.purchase_item_amount_cents,m.purchase_orders),late_rate:ratio(m.late_orders,m.delivery_eligible)}]));
 const dimensions=Object.fromEntries(Object.keys(DIMENSIONS).map(d=>[d,comparison(sql.groups,d,metrics.before.purchase_item_amount_cents,metrics.after.purchase_item_amount_cents,config.min_product_orders)]));
 const delta=metrics.after.purchase_item_amount_cents-metrics.before.purchase_item_amount_cents;
 for(const [dim,rows]of Object.entries(dimensions))if(rows.reduce((s,r)=>s+r.delta_cents,0)!==delta)base.gates.push('reconciliation_failed_'+dim);
 if(base.gates.length)return base;
 const limitations=['历史最终状态，不代表当时实时付款或实际净 GMV。','金额不含运费；缺退款、广告、自然搜索、库存、成本和干预结果。','平均单价变化可能受商品规格、卖家与促销构成影响；分解不是因果。','完整性来自批次提供者声明，无法仅凭交易文件验证没有漏单。','整周窗口只控制星期构成，未控制节假日、季节性及多重比较。'];
 if(manifest.source_timezone==='source_local_unknown')limitations.push('来源时区未知，仅作同批本地日期比较。');
 for(const [dim,rows]of Object.entries(dimensions))for(const period of ['before','after']){const missing=rows.filter(r=>r.key===null).reduce((s,r)=>s+r[period].units,0);base.quality.coverage.push({dimension:dim,period,known_units:metrics[period].item_units-missing,total_units:metrics[period].item_units,missing_units:missing});}
 const productCategories=new Map();const scopeIds=new Set(scoped.map(o=>o.order_id));for(const i of validated.tables.order_items){if(!scopeIds.has(i.order_id))continue;if(!productCategories.has(i.product_id))productCategories.set(i.product_id,new Set());productCategories.get(i.product_id).add(i.category);}
 for(const row of dimensions.product)if(productCategories.get(row.key)?.size>1)row.flags.push('multiple_categories');
 const reasons=[];if(metrics.before.purchase_orders<config.min_orders||metrics.after.purchase_orders<config.min_orders)reasons.push('low_sample');
 if(dimensions.product.some(r=>r.key===null))reasons.push('missing_product_id');
 const hist=history.map(p=>sql.totals.find(t=>t.period===p.period)).filter(Boolean),detection=detect(metrics,hist,config,reasons);
 const evidence=[];const add=(kind,value,query,scope)=>{const evidence_id=id+':E'+(evidence.length+1);evidence.push({id:evidence_id,kind,query,scope,value});return evidence_id;};
 const totalsRef=add('period_comparison',{metrics,delta_cents:delta},'operations.sql @totals',{before:config.before,after:config.after,statuses:INCLUDED});
 for(const [dim,rows]of Object.entries(dimensions))for(const r of rows)r.evidence_id=add('dimension_comparison',{dimension:dim,...clone(r)},'operations.sql @groups',{dimension:dim,key:r.key,periods:['before','after']});
 const baselineRef=add('historical_baseline',{detection,history:hist},'operations.sql @totals',history);
 const boundaryRef=add('limitations',{limitations,coverage:base.quality.coverage,exclusions:js.excluded,completeness:{through:config.complete_through,evidence:config.completion_evidence}},'manifest.operations / quality',{});
 base.status=detection.reasons.length?'insufficient_evidence':'verified';
 Object.assign(base,{metrics,dimensions,delta_cents:delta,detection,limitations,evidence,confirmed_observations:[{kind:'arithmetic_change',evidence_ids:[totalsRef],root_cause_confirmed:false}],possible_explanations:[],missing_data:['advertising','organic_search','inventory','refunds','cost','intervention_outcomes'],hypotheses_to_falsify:[{hypothesis:'平均单价差异可能来自卖家或商品构成变化',status:'unverified',evidence_ids:[totalsRef,boundaryRef],required_data:'规格、促销记录与逐订单价格明细复查'}]});
 base.metric_snapshots=sql.totals.map(m=>({...m,run_id:id,dataset_id:context.dataset_id,metric_version:VERSION}));
 // Expose only the cube already reconciled against the independent JS path.
 base.verified_cube={totals:sql.totals,groups:sql.groups};
 if(detection.fired)base.alerts=[{id:id+':amount',run_id:id,metric_id:'purchase_item_amount_cents',before:metrics.before.purchase_item_amount_cents,after:metrics.after.purchase_item_amount_cents,delta_cents:delta,affected_products:dimensions.product.filter(r=>r.delta_cents!==0).map(r=>({product_id:r.key,delta_cents:r.delta_cents,evidence_id:r.evidence_id,flags:r.flags})),source:identity,calculation_version:CALC_VERSION,metric_version:VERSION,rule:detection,status:'pending_review',evidence_ids:[totalsRef,baselineRef,boundaryRef]}];
 base.evidence_hash=await hash({source:identity,config,evidence});return base;
}
// Deterministic evidence adapter, deliberately NOT an LLM integration.
function answer(pack,question){
 const audit={run_id:pack?.run_id??null,evidence_hash:pack?.evidence_hash??null,metric_version:pack?.metric_version??null,calculation_version:pack?.calculation_version??null,mode:'deterministic_evidence_only',review_status:'pending_review'};
 const missing=['广告','搜索','流量','库存','退款','GMV','利润','收入','原因','导致','提升','收益','转化','渠道','广告','ad','search','traffic','stock','refund','profit','cause','revenue'];
 if(pack?.status!=='verified'||!pack.verification?.passed||typeof question!=='string'||missing.some(s=>question.toLowerCase().includes(s.toLowerCase())))return {...audit,status:'insufficient_evidence',answer:'证据不足：当前证据不能确认所问业务事实或原因。',confirmed_observations:[],possible_explanations:[],missing_data:pack?.missing_data||['verified_complete_periods'],hypotheses_to_falsify:[],evidence_ids:[]};
 if(!/商品|订单|金额|件数|单价|变化|异常|product|order|amount|price|change/i.test(question))return {...audit,status:'insufficient_evidence',answer:'证据不足：该问题超出已验证指标范围。',confirmed_observations:[],possible_explanations:[],missing_data:['question_specific_evidence'],hypotheses_to_falsify:[],evidence_ids:[]};
 const ids=[pack.evidence[0].id,...pack.dimensions.product.slice(0,5).map(p=>p.evidence_id)];
 return {...audit,status:'evidence_available',answer:'已验证两期算术变化，具体数值请核对引用证据；异常根因仍需人工复核。',confirmed_observations:pack.confirmed_observations,possible_explanations:[],missing_data:pack.missing_data,hypotheses_to_falsify:pack.hypotheses_to_falsify,evidence_ids:ids};
}
function validateDraft(draft,pack){
 if(pack?.status!=='verified'||!pack.verification?.passed)throw Error('证据不足');
 if(!draft||typeof draft!=='object'||draft.status!=='evidence_available')throw Error('没有可审核的证据回答');
 if(draft.run_id!==pack.run_id||draft.evidence_hash!==pack.evidence_hash||draft.metric_version!==pack.metric_version||draft.calculation_version!==pack.calculation_version)throw Error('证据版本不匹配');
 const allowed=new Set(pack.evidence.map(e=>e.id));
 if(!Array.isArray(draft.evidence_ids)||!draft.evidence_ids.length||draft.evidence_ids.some(id=>!allowed.has(id)))throw Error('无效证据引用');
 // First-round adapter accepts only reference-bound structured observations. A future LLM
 // must use a dedicated schema and semantic review; it cannot smuggle new numeric facts here.
 if(canonical(draft.confirmed_observations)!==canonical(pack.confirmed_observations)||canonical(draft.missing_data)!==canonical(pack.missing_data)||canonical(draft.hypotheses_to_falsify)!==canonical(pack.hypotheses_to_falsify)||!Array.isArray(draft.possible_explanations)||draft.possible_explanations.length)throw Error('回答包含未绑定的结构化事实');
 const supportedKeys=['run_id','evidence_hash','metric_version','calculation_version','mode','review_status','status','answer','confirmed_observations','possible_explanations','missing_data','hypotheses_to_falsify','evidence_ids'];
 if(Object.keys(draft).some(k=>!supportedKeys.includes(k))||draft.mode!=='deterministic_evidence_only')throw Error('不支持的诊断接口字段或模式');
 // All numerical facts must be rendered from the pack, never accepted from free model text.
 const texts=[draft.answer,...(draft.possible_explanations||[]).map(x=>x.text)];
 if(texts.some(s=>typeof s!=='string'||/\p{Decimal_Number}/u.test(s)))throw Error('自由文本包含未绑定数值或格式错误');
 return {structural:true,semantic_review:'required'};
}
function review(pack,draft,{reviewer,decision,note}){
 validateDraft(draft,pack);
 if(!reviewer?.trim()||!note?.trim()||!['confirmed','dismissed'].includes(decision))throw Error('需要人工审阅人、审核说明和决定');
 return {run_id:pack.run_id,evidence_hash:pack.evidence_hash,draft:clone(draft),decision,reviewer,note,reviewed_at:new Date().toISOString(),identity_assurance:'local_self_reported'};
}
function action(pack,reviewRecord,{owner,task}){
 if(!reviewRecord||reviewRecord.decision!=='confirmed'||!reviewRecord.reviewer?.trim()||!reviewRecord.note?.trim()||!reviewRecord.reviewed_at||reviewRecord.run_id!==pack.run_id||reviewRecord.evidence_hash!==pack.evidence_hash)throw Error('正式行动单需要本版本人工审核确认');
 validateDraft(reviewRecord.draft,pack);if(!owner?.trim()||!task?.trim())throw Error('行动单需要负责人及任务');
 return {run_id:pack.run_id,evidence_hash:pack.evidence_hash,review:clone(reviewRecord),owner,task,status:'open',business_outcome:'unverified',created_at:new Date().toISOString()};
}
return {VERSION,CALC_VERSION,INCLUDED,canonical,hash,configuration,aggregateJS,decompose,run,answer,validateDraft,review,action};
})();
if(typeof module!=='undefined')module.exports=globalThis.LensOperations;
