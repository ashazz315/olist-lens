/* Browser analysis engine. No network or persistence; caller supplies CSV parser and SQLite. */
globalThis.LensCore=(()=>{
'use strict';
const VERSION='1.0.0',METRIC_VERSION='1.0.0';
const fields={orders:['order_id','customer_id','customer_state','order_status','purchased_at','delivered_at','estimated_delivery_at'],order_items:['order_id','order_item_id','product_id','seller_id','category','price','freight_value'],order_reviews:['review_id','order_id','review_score','review_created_at','review_answered_at']};
const required={orders:['order_id','customer_id','order_status','purchased_at'],order_items:['order_id','order_item_id','price'],order_reviews:['review_id','order_id']};
const statuses=['created','approved','invoiced','processing','shipped','delivered','unavailable','canceled'];
const stableJSON=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
function dateOK(s,dateOnly=false){const re=dateOnly?/^(\d{4})-(\d{2})-(\d{2})$/:/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;const m=re.exec(s||'');if(!m||+m[1]<1900||+m[1]>2200)return false;const a=m.slice(1).map(Number);if(a[1]<1||a[1]>12||a[2]<1||a[2]>new Date(Date.UTC(a[0],a[1],0)).getUTCDate())return false;return dateOnly||a[3]<24&&a[4]<60&&a[5]<60;}
function cents(s){if(s===null)return null;if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error('金额须非负、小数最多两位');const [a,b='']=s.split('.');const n=Number(a)*100+Number(b.padEnd(2,'0'));if(!Number.isSafeInteger(n)||n>1e12)throw Error('金额超出单行上限');return n;}
function parseSQL(text){const p={};for(const block of text.split('-- @').slice(1)){const n=block.indexOf('\n');p[block.slice(0,n).trim()]=block.slice(n+1).trim();}return p;}
function validate(files,manifest,Papa){
 const q={status:'未执行',errors:0,warnings:0,issues:[],summary:[],profiles:[],rules_version:VERSION};const totals=new Map();
 function issue(severity,code,file,row,field,message,count=1){q[severity==='error'?'errors':'warnings']+=count;const key=severity+'|'+code+'|'+file+'|'+field;let entry=totals.get(key);if(!entry){entry={severity,code,file,field,count:0,message};totals.set(key,entry);}entry.count+=count;if(q.issues.length<1000)q.issues.push({severity,code,file,row,field,message,count});}
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))manifest={};
 for(const k of ['dataset_name','source_uri_or_description','extracted_at','coverage_start','coverage_end','currency','source_timezone','license_or_usage_notes'])if(typeof manifest[k]!=='string'||!manifest[k].trim())issue('error','metadata','dataset_manifest.json',1,k,'必填元信息缺失');
 if(manifest.schema_version!==VERSION)issue('error','version','dataset_manifest.json',1,'schema_version','仅支持结构版本 '+VERSION);
 if(manifest.import_mode!=='full_snapshot')issue('error','mode','dataset_manifest.json',1,'import_mode','仅支持完整快照 full_snapshot');
 if(!dateOK(manifest.coverage_start,true)||!dateOK(manifest.coverage_end,true)||manifest.coverage_start>manifest.coverage_end)issue('error','coverage','dataset_manifest.json',1,'coverage_start','覆盖范围须为有效、顺序正确的日期');
 if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(manifest.extracted_at||'')||!dateOK((manifest.extracted_at||'').slice(0,19).replace('T',' '))||!Number.isFinite(Date.parse(manifest.extracted_at)))issue('error','extraction_time','dataset_manifest.json',1,'extracted_at','提取时间须为有效且带时区偏移的 ISO 8601 时间');
 if(!/^[A-Z]{3}$/.test(manifest.currency||''))issue('error','currency','dataset_manifest.json',1,'currency','币种须为三个大写字母');
 if(manifest.source_timezone==='source_local_unknown')issue('warning','timezone_unknown','dataset_manifest.json',1,'source_timezone','来源本地时区未注明：仅作同来源日期比较，不进行跨时区合并');
 else try{new Intl.DateTimeFormat('en',{timeZone:manifest.source_timezone}).format();}catch{issue('error','timezone','dataset_manifest.json',1,'source_timezone','需有效 IANA 时区或 source_local_unknown');}
 const tables={};
 for(const [name,cols] of Object.entries(fields)){
  const file=name+'.csv',text=files[file];tables[name]=[];
  if(typeof text!=='string'){issue('error','missing_file',file,1,'','缺少必需文件');continue;}
  const parsed=Papa.parse(text.replace(/^\uFEFF/,''),{header:false,delimiter:',',skipEmptyLines:true});
  for(const e of parsed.errors)issue('error','csv_parse',file,(e.row||0)+1,'',e.message);
  const [header,...rows]=parsed.data;
  if(!header||header.length!==cols.length||new Set(header).size!==header.length||cols.some(x=>!header.includes(x))){issue('error','headers',file,1,'','表头缺列、重复或包含未知列；请使用标准模板');continue;}
  if(rows.length>400000){issue('error','row_limit',file,1,'','单表最多 400000 行');continue;}
  const seen=new Map();const missing=Object.fromEntries(cols.map(k=>[k,0]));
  for(let j=0;j<rows.length;j++){
   const values=rows[j];const row=j+2;if(values.length!==cols.length){issue('error','row_width',file,row,'','字段数量与表头不一致');continue;}
   const record=Object.fromEntries(header.map((k,i)=>[k,values[i]===''?null:values[i]]));let bad=false;
   for(const k of cols){const v=record[k];if(v===null)missing[k]++;if(required[name].includes(k)&&(v===null||!v.trim())){issue('error','required',file,row,k,'必填字段为空');bad=true;}if(v!==null&&v!==v.trim()){issue('error','whitespace',file,row,k,'首尾空白须在源文件中修正');bad=true;}}
   for(const k of cols.filter(x=>x.endsWith('_at'))){if(record[k]!==null&&!dateOK(record[k])){issue('error','timestamp',file,row,k,'无效日期，须 YYYY-MM-DD HH:MM:SS');bad=true;}}
   if(name==='orders'){
    if(!statuses.includes(record.order_status)){issue('error','status',file,row,'order_status','未知订单状态，需先明确映射');bad=true;}
    if(record.delivered_at&&record.purchased_at&&record.delivered_at<record.purchased_at){issue('error','date_order',file,row,'delivered_at','交付早于购买');bad=true;}
    if(record.estimated_delivery_at&&record.purchased_at&&record.estimated_delivery_at.slice(0,10)<record.purchased_at.slice(0,10)){issue('error','date_order',file,row,'estimated_delivery_at','预计交付日期早于购买日期');bad=true;}
    if(record.purchased_at&&(record.purchased_at.slice(0,10)<manifest.coverage_start||record.purchased_at.slice(0,10)>manifest.coverage_end)){issue('error','outside_coverage',file,row,'purchased_at','购买日期超出声明范围');bad=true;}
   }
   if(name==='order_items'){
    if(!/^\d+$/.test(record.order_item_id||'')||+record.order_item_id<1||!Number.isSafeInteger(+record.order_item_id)){issue('error','integer',file,row,'order_item_id','须为正整数');bad=true;}else record.order_item_id=+record.order_item_id;
    for(const k of ['price','freight_value'])try{record[k==='price'?'price_cents':'freight_cents']=cents(record[k]);}catch(e){issue('error','money',file,row,k,e.message);bad=true;}
   }
   if(name==='order_reviews'&&record.review_score!==null){if(!/^[1-5]$/.test(record.review_score)){issue('error','rating',file,row,'review_score','评分须为 1–5 整数或空白');bad=true;}else record.review_score=+record.review_score;}
   const key=name==='orders'?record.order_id:JSON.stringify(name==='order_items'?[record.order_id,record.order_item_id]:[record.review_id,record.order_id]);
   const fingerprint=JSON.stringify(cols.map(k=>record[k]));if(seen.has(key)){if(seen.get(key)===fingerprint)issue('warning','exact_duplicate',file,row,'','完全相同的记录按明确规则去重，计入日志');else issue('error','conflict_key',file,row,'','同一记录键内容冲突');continue;}
   seen.set(key,fingerprint);if(!bad)tables[name].push(record);
  }
  q.profiles.push({file,input_rows:rows.length,accepted_rows:tables[name].length,missing});
 }
 const orders=new Map(tables.orders.map(r=>[r.order_id,r])),hasItems=new Set();let totalMoney=0;
 for(const r of tables.order_items){if(!orders.has(r.order_id))issue('error','orphan','order_items.csv',null,'order_id','商品明细的订单不存在');hasItems.add(r.order_id);totalMoney+=r.price_cents;}
 if(!Number.isSafeInteger(totalMoney))issue('error','sum_overflow','order_items.csv',null,'price','合计超出精确整数范围');
 for(const r of tables.order_reviews)if(!orders.has(r.order_id))issue('error','orphan','order_reviews.csv',null,'order_id','评价的订单不存在');
 const missingItems=tables.orders.filter(r=>r.order_status==='delivered'&&!hasItems.has(r.order_id)).length;
 if(missingItems)issue('error','missing_items','orders.csv',null,'order_id','已交付订单缺少商品明细，金额无法核对',missingItems);
 const missingDates=tables.orders.filter(r=>r.order_status==='delivered'&&(!r.delivered_at||!r.estimated_delivery_at)).length;
 if(missingDates)issue('warning','missing_dates','orders.csv',null,'delivered_at','缺履约日期的已交付订单排除延迟率，其他有效指标保留',missingDates);
 const statusDates=tables.orders.filter(r=>r.order_status!=='delivered'&&r.delivered_at).length;if(statusDates)issue('warning','status_dates','orders.csv',null,'order_status','未交付状态但有实际交付日期：按明确状态口径排除已交付指标，需来源核查',statusDates);
 for(const p of q.profiles)for(const [k,n] of Object.entries(p.missing))if(n&&!['delivered_at','estimated_delivery_at'].includes(k))issue('warning','missing_optional',p.file,null,k,'空值保留，相关指标或分组披露覆盖率',n);
 if(!tables.orders.length||!tables.order_items.length)issue('error','empty_dataset','orders.csv',1,'','订单与商品明细必须有业务数据，不能导入空白模板');
 if(!tables.order_reviews.length)issue('warning','no_reviews','order_reviews.csv',1,'','无评价，评分指标不适用');
 const reviewed=new Set(tables.order_reviews.map(r=>r.order_id));const noReviews=tables.orders.filter(r=>r.order_status==='delivered'&&!reviewed.has(r.order_id)).length;
 if(noReviews)issue('warning','unreviewed','order_reviews.csv',null,'order_id','已交付但无评价的订单不进入评分分母',noReviews);
 const mult=new Map();for(const r of tables.order_reviews)mult.set(r.order_id,(mult.get(r.order_id)||0)+1);const many=[...mult.values()].filter(n=>n>1).length;if(many)issue('warning','multiple_reviews','order_reviews.csv',null,'order_id','同订单多评价按最新回答、创建时间及评价 ID 取一条',many);
 issue('warning','period_boundary','orders.csv',null,'purchased_at','边界月份与历史覆盖不代表完整经营期间，不能将末期下降直接解释为业务下滑');
 q.summary=[...totals.values()];q.status=q.errors?'不通过':q.warnings?'需说明':'通过';q.details_truncated=q.issues.length>=1000;return {tables,quality:q,manifest};
}
function independent(tables){
 const money=new Map(),reviews=new Map();for(const r of tables.order_items)money.set(r.order_id,(money.get(r.order_id)||0)+r.price_cents);
 const orderKey=r=>[r.review_answered_at||'',r.review_created_at||'',r.review_id];
 const newer=(a,b)=>{const x=orderKey(a),y=orderKey(b);for(let i=0;i<3;i++){if(x[i]>y[i])return true;if(x[i]<y[i])return false;}return false;};
 for(const r of tables.order_reviews){const old=reviews.get(r.order_id);if(!old||newer(r,old))reviews.set(r.order_id,r);}
 const m={total_orders:tables.orders.length,delivered_orders:0,amount_cents:0,delivery_eligible:0,late_orders:0,review_eligible:0,low_reviews:0};
 for(const r of tables.orders){if(r.order_status!=='delivered')continue;m.delivered_orders++;m.amount_cents+=money.get(r.order_id)||0;if(r.delivered_at&&r.estimated_delivery_at){m.delivery_eligible++;m.late_orders+=+(r.delivered_at.slice(0,10)>r.estimated_delivery_at.slice(0,10));}const score=reviews.get(r.order_id)?.review_score;if(score!==null&&score!==undefined){m.review_eligible++;m.low_reviews+=+(score<=2);}}
 return m;
}
function enrich(result){
 const rate=(a,b)=>b?a/b:null;
 for(const group of [result.metrics,...result.monthly,...result.states]){group.late_rate=rate(group.late_orders,group.delivery_eligible);group.low_rate=rate(group.low_reviews,group.review_eligible);}
 result.association.forEach(g=>g.rate=rate(g.low,g.n));for(const a of [...result.seller,...result.category])a.late_rate=rate(a.late_orders,a.delivery_eligible);
 const strata=new Map();for(const r of result.strata){const key=r.month+'|'+r.state;if(!strata.has(key))strata.set(key,{});strata.get(key)[r.late]=r;}
 let weight=0,delta=0,count=0;for(const p of strata.values())if(p[0]?.n>=30&&p[1]?.n>=30){const w=p[0].n+p[1].n;weight+=w;delta+=w*(p[1].low/p[1].n-p[0].low/p[0].n);count++;}
 result.stratified={dimensions:'购买月份 × 客户州',min_per_group:30,strata:count,orders:weight,weighted_difference:weight?delta/weight:null,coverage:rate(weight,result.association.reduce((a,b)=>a+b.n,0)),note:'仅包含两组各至少 30 单的共同分层，按分层总样本量加权；探索性关联，不证明因果，未控制品类等全部混杂'};
 return result;
}
function analyze(validated,SQL,sqlText){
 const {tables,quality,manifest}=validated;if(quality.errors)return {quality};const sql=parseSQL(sqlText);const db=new SQL.Database();
 try{
  db.run(sql.schema);db.run('BEGIN');
  const insert=(name,cols,rows)=>{const stmt=db.prepare(`INSERT INTO ${name} VALUES (${cols.map(()=>'?').join(',')})`);try{for(const row of rows)stmt.run(cols.map(k=>row[k]??null));}finally{stmt.free();}};
  insert('orders',fields.orders,tables.orders);insert('order_items',['order_id','order_item_id','product_id','seller_id','category','price_cents','freight_cents'],tables.order_items);insert('order_reviews',fields.order_reviews,tables.order_reviews);db.run('COMMIT');db.run(sql.views);
  const query=s=>{const a=db.exec(s)[0];return a?a.values.map(v=>Object.fromEntries(a.columns.map((k,i)=>[k,v[i]]))):[];};
  const result={app_version:VERSION,metric_version:METRIC_VERSION,manifest,quality,generated_at:new Date().toISOString()};for(const name of ['metrics','monthly','states','association','strata','statuses','samples','seller','category'])result[name]=name==='metrics'?query(sql[name])[0]:query(sql[name]);
  const js=independent(tables);const comparisons=Object.keys(js).map(k=>({metric:k,sql:result.metrics[k],independent:js[k],passed:result.metrics[k]===js[k]}));
  const rawSum=tables.order_items.reduce((s,r)=>s+r.price_cents,0);comparisons.push({metric:'all_item_cents',sql:query('SELECT SUM(price_cents) n FROM order_items')[0].n,independent:rawSum,passed:query('SELECT SUM(price_cents) n FROM order_items')[0].n===rawSum});
  result.verification={status:comparisons.every(x=>x.passed)?'通过':'不通过',engines:'SQLite (WebAssembly) / 独立 JavaScript',comparisons};
  if(result.verification.status!=='通过')throw Error('独立复算不一致，不能切换版本');return enrich(result);
 }finally{db.close();}
}
return {VERSION,METRIC_VERSION,fields,dateOK,cents,parseSQL,validate,analyze,independent,enrich,stableJSON};
})();
if(typeof module!=='undefined')module.exports=globalThis.LensCore;
