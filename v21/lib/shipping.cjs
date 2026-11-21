'use strict';
// Supplemental same-source order facts. Does not alter any core engine input/metric.
const {parse}=require('./adapters.cjs'),{need,sha}=require('./util.cjs');
const FILE='olist_orders_dataset.csv';
const EXPECTED='8df58ef3d2d7e9944010f7beecd9b75367f5588ec6e3c91cec19ae3345ef9ecf';
function validate(text,canonical){
 const r=parse(text),c=parse(canonical),by=new Map();
 for(const f of ['order_id','order_status','order_purchase_timestamp','order_delivered_carrier_date','order_approved_at','order_delivered_customer_date','order_estimated_delivery_date'])need(r.meta.fields.includes(f),'Missing raw shipping field '+f);
 for(const row of r.data){need(row.order_id&&!by.has(row.order_id),'Duplicate raw shipping order');by.set(row.order_id,row);}
 need(by.size===c.data.length,'Shipping order universe mismatch');
 for(const row of c.data){const raw=by.get(row.order_id);need(raw,'Orphan canonical order');for(const [a,b]of [['order_status','order_status'],['purchased_at','order_purchase_timestamp'],['delivered_at','order_delivered_customer_date'],['estimated_delivery_at','order_estimated_delivery_date']])need((row[a]||'')===(raw[b]||''),'Shipping revision conflict: '+a);}
 return {file:FILE,sha256:sha(text),rows:r.data.length,relationship:'one_to_one_order_id',matched:c.data.length,missing_carrier:r.data.filter(r=>!r.order_delivered_carrier_date).length,fields:['order_delivered_carrier_date','order_approved_at'],meaning:'historical final recorded timestamps; not as-of event availability'};
}
module.exports={FILE,EXPECTED,validate};
