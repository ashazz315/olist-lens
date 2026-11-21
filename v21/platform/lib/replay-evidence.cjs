'use strict';
const {check}=require('./cloud.cjs');
const CHANNELS=['organic_search','paid_search','other'];
const STAGES=['impressions','clicks','visits','view_item','add_to_cart','checkout','orders'];
const CHANNEL_NAMES={organic_search:'自然搜索',paid_search:'付费搜索',other:'其他渠道'};
const shift=(date,days)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const rate=(n,d)=>d===0?null:n/d;

function scope(rows){
 const comparable=rows.filter(r=>r.before.units>0&&r.after.units>0);
 const down=comparable.filter(r=>r.delta_cents<0),up=comparable.filter(r=>r.delta_cents>0);
 const deficits=rows.filter(r=>r.delta_cents<0).sort((a,b)=>a.delta_cents-b.delta_cents);
 const offsets=rows.filter(r=>r.delta_cents>0).sort((a,b)=>b.delta_cents-a.delta_cents);
 const negative=deficits.reduce((sum,r)=>sum-r.delta_cents,0),positive=offsets.reduce((sum,r)=>sum+r.delta_cents,0);
 const topShare=rate(-(deficits[0]?.delta_cents??0),negative);
 const breadth=rate(down.length,comparable.length);
 const classification=breadth===null||negative<=positive?'not_classified':breadth>0.5?'broad':topShare>=0.6?'concentrated':'mixed';
 const brief=r=>({product:r.key,delta_cents:r.delta_cents,evidence_id:r.evidence_id});
 return {classification,comparable:comparable.length,new_or_disappeared:rows.length-comparable.length,up:up.length,flat:comparable.length-up.length-down.length,down:down.length,breadth,top_share_of_gross_decline:topShare,negative_cents:-negative,positive_cents:positive,net_cents:positive-negative,negative_rank:deficits.slice(0,12).map(brief),offset_rank:offsets.slice(0,12).map(brief),definition:'两期均有正销量的商品纳入分布。下滑占比超过一半为较广泛下滑；否则首位占全部负向金额至少 60% 为集中下滑。仅用于描述分布。'};
}

function channelRows(rows,periods){
 return CHANNELS.map((channel,index)=>{
  const pairs=periods.map(p=>{
   const totals=Object.fromEntries(STAGES.map(k=>[k,0]));
   let totalVisits=0;
   for(const r of rows.filter(r=>r.date>=p.start&&r.date<p.end)){
    const v=[r.organic_visits,r.paid_visits,r.other_visits][index];
    const click=v+20, detail=v-5;
    const orders=index===0?Math.floor(r.orders/2):index===1?Math.floor(r.orders/3):r.orders-Math.floor(r.orders/2)-Math.floor(r.orders/3);
    const values=[click*5,click,v,detail,orders+4,orders+2,orders];
    STAGES.forEach((k,i)=>totals[k]+=values[i]);
    totalVisits+=r.visits;
   }
   const ratios={ctr:{numerator:totals.clicks,denominator:totals.impressions},arrival:{numerator:totals.visits,denominator:totals.clicks},detail_rate:{numerator:totals.view_item,denominator:totals.visits},order_conversion:{numerator:totals.orders,denominator:totals.visits}};
   for(const item of Object.values(ratios))item.value=rate(item.numerator,item.denominator);
   return {...p,totals,share:rate(totals.visits,totalVisits),share_denominator:totalVisits,ratios};
  });
  const [before,after]=pairs;
  return {channel,before,after,delta:Object.fromEntries(STAGES.map(k=>[k,after.totals[k]-before.totals[k]])),share_delta_pp:before.share===null||after.share===null?null:(after.share-before.share)*100,unit:'渠道归因的合成嵌套访问机会计数；非 PV、独立访客或真实会话'};
 });
}

function productEvidence(rows,periods,manifest){
 const product=rows[0].product_id,cutoff=manifest.coverage_end,drop='2026-09-07';
 const campaign_id=rows[0].campaign_id;
 const ended=manifest.replay_config==='concentrated'&&product==='SIM-COFFEE';
 const exited=manifest.replay_config==='concentrated'&&product==='SIM-MUG';
 const campaigns=[{campaign_id,channel:'paid_search',start:'2026-07-06',end:ended?drop:'2026-10-01',status:ended?'ended':'active',joined_at:'2026-07-06',left_at:ended||exited?drop:null,exit_reason:ended?'campaign_ended':exited?'product_exited':null,listing_status:'listed',source:'synthetic://gmv-drop-lab-v1/activity'}];
 const sampled=rows.find(r=>r.date===drop);
 const orders=[];
 if(sampled&&sampled.delayed_orders>0&&manifest.replay_config==='broad'){
  const id=product+'-'+sampled.date+'-0';
  orders.push({order_id:id,events:[
   {type:'ordered',at:sampled.date+'T08:00:00Z'},
   {type:'dispatch_delayed',at:shift(sampled.date,2)+'T08:00:00Z'},
   {type:'delivered',at:shift(sampled.date,3)+'T12:00:00Z'},
   {type:'returned',at:shift(sampled.date,4)+'T10:00:00Z'},
   {type:'refunded',at:shift(sampled.date,5)+'T10:00:00Z',amount_cents:sampled.price_cents}
  ]});
  orders.push({order_id:product+'-'+sampled.date+'-cancel',events:[
   {type:'ordered',at:sampled.date+'T08:00:00Z'},
   {type:'dispatch_delayed',at:shift(sampled.date,2)+'T08:00:00Z'},
   {type:'canceled',at:shift(sampled.date,2)+'T15:00:00Z'}
  ]});
 }
 return {is_synthetic:true,product,periods,cutoff,channels:channelRows(rows,periods),campaigns,orders:orders.map(o=>({...o,source:'synthetic://gmv-drop-lab-v1/order-events',events:o.events.filter(e=>e.at.slice(0,10)<=cutoff)})),missing:['真实归因和业务观测','取消订单是否已付款及退款没有记录'],limits:'付费搜索为渠道合计，覆盖活动关系记录之外的访问。按事件记录区分取消、退货和退款，购买订单商品金额保持原口径。所有关联和变化均为模拟。'};
}

function answer(question,chain,previous,selectedChannel){
 const channel=/自然/.test(question)?'organic_search':/付费/.test(question)?'paid_search':/其他渠道/.test(question)?'other':selectedChannel||previous?.channel||null;
 check(channel===null||CHANNELS.includes(channel),'Unknown channel');
 const topics=[];
 if(/集中|多数|范围|大多数|分布|贡献/.test(question))topics.push('scope');
 if(/流量|搜索|访问量|渠道/.test(question))topics.push('traffic');
 if(/活动|退出|下架/.test(question))topics.push('campaigns');
 if(/漏斗|转化|点击|加购/.test(question))topics.push('funnel');
 if(/库存|缺货|可售/.test(question))topics.push('inventory');
 if(/发货|履约|取消|退单|退款|退货|订单/.test(question))topics.push('orders');
 if(/证据|排除|解释/.test(question))topics.push('limits');
 if(!topics.length)topics.push(previous?.topic||'scope');
 const channels=chain.channels.filter(x=>!channel||x.channel===channel||/自然.*付费|付费.*自然/.test(question));
 const answers={scope:chain.scope,traffic:channels.map(x=>({channel:x.channel,unit:x.unit,before:x.before.totals.visits,after:x.after.totals.visits,delta:x.delta.visits,before_share:x.before.share,after_share:x.after.share,share_delta_pp:x.share_delta_pp})),campaigns:chain.campaigns,funnel:channels,inventory:chain.inventory,orders:chain.orders,limits:{missing:chain.missing,limits:chain.limits,open_explanations:['价格与商品组合变化','活动记录与渠道变化的时间先后','漏斗、库存和履约变化可同时存在']}};
 const percent=value=>value==null?'不适用':(value*100).toFixed(2)+'%';
 const descriptions={
  scope:()=>`全店变化 ${chain.scope.net_cents} 分。可比商品 ${chain.scope.comparable} 件，其中 ${chain.scope.down} 件下滑；首位贡献占负向金额 ${percent(chain.scope.top_share_of_gross_decline)}。正向抵消 ${chain.scope.positive_cents} 分。`,
  traffic:()=>answers.traffic.map(c=>`${CHANNEL_NAMES[c.channel]}访问 ${c.before} → ${c.after}（变化 ${c.delta}），份额 ${percent(c.before_share)} → ${percent(c.after_share)}`).join('；'),
  campaigns:()=>chain.campaigns.map(c=>`${c.campaign_id} ${c.start} 至 ${c.end}；${c.exit_reason==='campaign_ended'?'活动整体结束':c.exit_reason==='product_exited'?'活动继续、商品退出':'无退出记录'}${c.left_at?'，事件日期 '+c.left_at:''}，${c.listing_status==='listed'?'商品在售':'商品下架'}`).join('；')||'缺少活动关系记录。',
  funnel:()=>channels.map(c=>`${CHANNEL_NAMES[c.channel]}到达访问 ${c.before.totals.visits} → ${c.after.totals.visits}，加购 ${c.before.totals.add_to_cart} → ${c.after.totals.add_to_cart}，下单 ${c.before.totals.orders} → ${c.after.totals.orders}；下单/到达转化 ${percent(c.before.ratios.order_conversion.value)} → ${percent(c.after.ratios.order_conversion.value)}`).join('；'),
  inventory:()=>chain.inventory.map(s=>`${s.date} 在手库存 ${s.on_hand}，覆盖天数 ${s.coverage_days==null?'不适用':s.coverage_days.toFixed(2)}`).join('；')||'缺少库存记录。',
  orders:()=>chain.orders.length?`关联订单事件 ${chain.orders.length} 单；`+chain.orders.map(o=>`${o.order_id} ${o.events.filter(e=>['dispatch_delayed','returned','canceled','refunded'].includes(e.type)).map(e=>({dispatch_delayed:'发货异常',returned:'退货',canceled:'取消',refunded:'退款'}[e.type]+' '+e.at)).join('、')}`).join('；'):'缺少订单级取消、退货与退款记录。',
  limits:()=>answers.limits.open_explanations.join('；')+'。尚缺 '+chain.missing.join('、')+'。'
 };
 return {channel,topic:topics.at(-1),facts:topics.map(topic=>({topic,text:descriptions[topic](),value:answers[topic],evidence_id:'E7',anchor:'chain-'+topic}))};
}
module.exports={scope,productEvidence,answer};
