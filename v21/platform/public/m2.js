'use strict';
window.M2={rank:{page:1,limit:25,query:'',sort:'delta'},
 chart(rows,key,label){const products=[...new Set(rows.map(r=>r.product_id).filter(Boolean))];if(products.length>1)return products.map(product=>M2.chart(rows.filter(r=>r.product_id===product),key,label+' / '+product)).join('');const valid=rows.filter(r=>Number.isFinite(r[key]));if(!valid.length)return '<p>没有可用趋势数据。</p>';const max=Math.max(...valid.map(r=>r[key]),1),points=valid.map((r,i)=>`${35+i*620/Math.max(1,valid.length-1)},${145-r[key]/max*115}`).join(' ');return `<figure class="trend"><figcaption>${esc(label)}</figcaption><svg role="img" aria-label="${esc(label)}" viewBox="0 0 700 185"><line x1="35" y1="145" x2="655" y2="145" stroke="#b8ccca"/><polyline points="${points}" fill="none" stroke="#17695c" stroke-width="3"/>${valid.map((r,i)=>`<circle cx="${35+i*620/Math.max(1,valid.length-1)}" cy="${145-r[key]/max*115}" r="4" fill="#17695c"><title>${esc(r.start||r.date||r.period)}：${esc(r[key])}</title></circle>`).join('')}<text x="35" y="175">${esc(valid[0].start||valid[0].date||valid[0].period)}</text><text x="530" y="175">${esc(valid.at(-1).start||valid.at(-1).date||valid.at(-1).period)}</text></svg></figure>`;},
 overview(o){return `<section class="panel"><h2>GMV 趋势与完整周期对比</h2><p class="muted">GMV 此处沿用购买订单商品金额口径，不含运费、退款调整。按保存的历史基线及完整相邻周比较。</p>${M2.chart(o.trend,'purchase_item_amount_cents','已验证商品金额（整数分）')}${table([['周期',r=>r.period],['起始日期',r=>r.start],['商品金额',r=>money(r.purchase_item_amount_cents)],['购买订单量',r=>num(r.purchase_orders)]],o.trend)}${detail(o.comparison,'比较边界：不把环比或基线比较写成同比')}</section>`;},
 async products(){const s=M2.rank,r=await api('products?'+new URLSearchParams(s));return `<section class="panel"><h2>全部商品排名</h2><form id="rank-form" class="row"><label>商品 ID 搜索<input name="query" value="${esc(s.query)}"></label><label>排序<select name="sort">${[['delta','负向金额贡献'],['sales','当期销售额'],['units','当期销量'],['price','当期均价']].map(([k,v])=>`<option value="${k}" ${s.sort===k?'selected':''}>${v}</option>`).join('')}</select></label><button>查询</button></form><p>共 ${r.total} 个商品 · 第 ${r.page} / ${Math.max(1,Math.ceil(r.total/r.limit))} 页 · 本页数据版本 <span class="id">${esc(r.version)}</span></p>${productTable(r.rows)}<div class="actions"><button data-rank-page="${r.page-1}" ${r.page===1?'disabled':''}>上一页</button><button data-rank-page="${r.page+1}" ${r.page*r.limit>=r.total?'disabled':''}>下一页</button></div></section>`;},
 decomposition(d){const r=d.contribution;return `<div class="grid"><article class="metric"><p>商品金额变化</p><strong>${money(r.delta_cents)}</strong></article><article class="metric"><p>销量效应</p><strong>${money(r.quantity_effect?.value_cents)}</strong></article><article class="metric"><p>价格效应</p><strong>${money(r.price_effect?.value_cents)}</strong></article><article class="metric"><p>新增/消失商品组合效应</p><strong>${money(r.assortment_effect_cents)}</strong></article></div><p class="muted">分解保留整数分/精确有理数证据；新增或消失商品不制造价格效应。</p>`;},
 dimension(key,d){if(!d)return unavailable('数据不足','缺少对应诊断维度');const titles={traffic:'自然与付费流量',marketing:'营销活动及前后比较',conversion:'完整转化漏斗',inventory:'库存状态与风险',fulfillment:'履约与关联订单评价'};let content='';
  if(d.status?.startsWith('simulated')){
   if(key==='traffic')content=table([['周期',r=>r.period],['自然访问',r=>num(r.organic)],['付费访问',r=>num(r.paid)],['总访问',r=>num(r.visits)],['付费占比',r=>M2.percent(r.paid_share)]],d.periods)+`<p>访问变化：${num(d.change_visits)}。${esc(d.anomaly)}</p>`+M2.chart(d.daily,'paid','逐日付费访问（模拟）');
   if(key==='marketing')content=table([['活动',r=>r.id],['商品',r=>r.product_id],['当前状态',r=>r.status]],d.campaigns)+table([['周期',r=>r.period],['曝光',r=>num(r.impressions)],['广告点击',r=>num(r.clicks)],['花费',r=>money(r.spend_cents)],['归因订单',r=>num(r.conversions)],['CTR',r=>M2.percent(r.ctr)],['CPC',r=>money(r.cpc_cents)],['ROAS',r=>num(r.roas)]],d.periods)+`<p class="muted">只比较相邻完整周期；不能证明活动带来增量。广告点击与全来源漏斗点击口径不同。</p>`;
   if(key==='conversion')content=`<p>${esc(d.cohort)}</p>`+d.periods.map(p=>`<h3>${esc(p.period)}</h3>${table([['阶段',r=>({impressions:'曝光',clicks:'点击',visits:'访问',view_item:'商品详情',add_to_cart:'加购',checkout:'结账',orders:'下单'}[r.key])],['数量（分子）',r=>num(r.count)],['上阶段分母',r=>num(r.denominator)],['阶段转化率',r=>M2.percent(r.conversion_from_previous)]],p.stages)}`).join('')+'<p>支付未提供，不用下单量冒充支付量。零分母显示不适用。</p>';
   if(key==='inventory')content=table([['商品',r=>r.product_id],['期末库存',r=>num(r.on_hand)],['最近七日日均销量',r=>num(r.average_daily_sales)],['覆盖天数',r=>num(r.coverage_days)],['风险状态',r=>r.risk]],d.stocks)+`<p>负库存记录 ${d.negative_records.length} 条；负库存是数据异常，不能直接确诊缺货。覆盖天数为期末非负库存 / 最近七日日均销售，零销量时不适用。</p>`+M2.chart(d.daily,'on_hand','库存快照趋势（模拟；不同商品应分别查看）')+detail(d.negative_records,'负库存原始行证据');
   if(key==='fulfillment')content=table([['周期',r=>r.period],['去重订单',r=>num(r.distinct_orders)],['准时发货率',r=>M2.percent(r.on_time_shipping_rate)],['配送延迟率',r=>M2.percent(r.delay_rate)],['关联订单评价',r=>num(r.related_order_reviews)],['低评分',r=>num(r.low_reviews)]],d.periods)+`<p>${esc(d.evaluation_scope)}。${esc(d.maturity)}</p>`;
  }else if(key==='fulfillment'&&d.status==='descriptive')content=table([['周期',r=>r.period],['订单',r=>num(r.distinct_orders??r.purchase_orders)],['延迟',r=>num(r.late_orders)],['可计算交付订单',r=>num(r.delivery_eligible)],['延迟率',r=>M2.percent(r.late_rate??(r.delivery_eligible?r.late_orders/r.delivery_eligible:null))],['关联订单评价',r=>num(r.related_order_review_count)]],d.periods||[])+`<p>${esc(d.maturity)}</p><p>缺少承诺发货截止时间，不能从交运时间推算准时发货率。</p>`;
  else content=`<p>${esc(d.reason||'证据不足')}</p>`;
  return `<section class="panel"><h2>${titles[key]}</h2><span class="badge">${d.status?.startsWith('simulated')?'独立模拟':esc(d.status)}</span>${M2.bi.dimension(key,d)}${content}${detail(d,'口径、来源及完整证据')}</section>`;
 },
 percent(value){return value==null?'不适用':num(value*100)+'%';},
 report(r){const labels={confirmed_facts:'已确认事实',possible_causes:'可能原因（待验证）',counter_evidence:'反向证据',missing_data:'缺失数据',hypotheses_to_falsify:'待验证假设',suggested_actions:'建议行动'};return `<article class="panel"><span class="badge">${r.mode==='deterministic_rules'?'规则诊断 · 非大模型':esc(r.mode)}</span><p>${esc(r.notice||'模型输出待人工审核')}</p><p class="id">版本 ${esc(r.version)} · 证据 ${esc(r.evidence_hash)}</p>${Object.entries(r.result).map(([key,rows])=>`<h3>${esc(labels[key]||key)}</h3>${rows.map(x=>`<p>${esc(x.text)} <span class="badge">${esc(x.evidence_ids.join(', '))}</span>${x.anchor&&/^chain-[a-z]+$/.test(x.anchor)?` <a href="#${esc(x.anchor)}">打开对应证据</a>`:''}</p>${x.values?detail(x.values,'引用快照中的数值'):''}`).join('')}`).join('')}</article>`;}
};

M2.bi = (() => {
 const compact = v => new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1}).format(v);
 const metrics = [
  { key: 'purchase_item_amount_cents', label: '商品金额', unit: 'BRL', format: v => money(v), axis: v => 'R$' + compact(v / 100) },
  { key: 'purchase_orders', label: '订单量', unit: '单', format: v => num(v), axis: compact },
  { key: 'item_units', label: '商品件数', unit: '件', format: v => num(v), axis: compact }
 ];
 const windowLabel = p => p.period === 'before' ? '基期' : p.period === 'after' ? '对比期' : '历史基线';
 const maxScale = value => {
  if (!(value > 0)) return 1;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
 };
 const chartData = value => Number.isFinite(value) && value >= 0;
 const fill = (value, max, kind = '') => chartData(value)
  ? `<meter class="bi-meter ${kind}" min="0" max="${max}" value="${value}" aria-hidden="true"></meter>`
  : '<span class="bi-missing" aria-hidden="true"></span>';
 const picker = (label, entries) => `<label class="bi-picker">${label}<select data-bi-view-picker>${entries.map(([id,text]) =>
  `<option value="${esc(id)}">${esc(text)}</option>`).join('')}</select></label>`;

 function trend(o) {
  const rows = (o.trend || []).filter(p => p.start && p.end);
  const available = metrics.filter(m => rows.some(p => chartData(p[m.key])));
  if (!available.length) return '';
  const panes = available.map(({key, label, unit, format, axis}, i) => {
   const max = maxScale(Math.max(...rows.filter(p=>chartData(p[key])).map(p=>p[key])));
   const focused = [...rows].reverse().find(p=>chartData(p[key]));
   return `<div data-bi-view="${key}"${i?' hidden':''}>
    <div class="bi-trend-summary" aria-live="polite"><strong data-bi-number>${format(focused[key])}${unit==='BRL'?'':' '+unit}</strong>
    <span data-bi-window>${esc(windowLabel(focused))} · ${esc(focused.start)} 至 ${esc(focused.end)}（不含）</span></div>
    <div class="bi-plot" role="group" aria-label="${label}周度柱状图">
     <div class="bi-axis" aria-hidden="true"><span>${axis(max)}</span><span>${axis(max / 2)}</span><span>0</span></div>
     <div class="bi-columns">${rows.map((p,index)=>{
      const value = chartData(p[key]) ? format(p[key])+(unit==='BRL'?'':' '+unit) : '暂无数据';
      const date = windowLabel(p)+' · '+p.start+' 至 '+p.end+'（不含）';
      return `<button class="bi-column" type="button" data-bi-number="${esc(value)}" data-bi-window="${esc(date)}"
       aria-label="${esc(date+' '+value)}" aria-pressed="${p===focused}" title="${esc(date+' '+value)}">
       <span class="bi-column-track">${fill(p[key],max,p.period==='before'?'before':p.period==='after'?'after':'history')}</span>
       <span class="bi-tick">${esc(rows.length<=7||index%2===0||index===rows.length-1?p.start.slice(5):'')}</span></button>`;
     }).join('')}</div>
    </div>
    <details class="bi-data"><summary>查看${label}逐周数据</summary>
    ${table([['周期',windowLabel],['起始日期',p=>p.start],['截止日（不含）',p=>p.end],[label,p=>chartData(p[key])?format(p[key]):'暂无数据']],rows)}</details>
   </div>`;
  }).join('');
  return `<section class="panel bi-board bi-trend">
   <div class="panel-heading"><div><h2>周度经营趋势</h2><p class="muted">${o.is_synthetic?'独立模拟':'Olist 历史快照'} · ${num(rows.length)} 个完整窗口</p></div>
   ${picker('指标',available.map(m=>[m.key,m.label]))}</div>
   ${panes}<div class="bi-legend"><span class="history">历史基线</span><span class="before">基期</span><span class="after">对比期</span></div></section>`;
 }

 function contributions(o, preview = false) {
  const scope = o.scope;
  if (!scope) return '';
  const groups = [
   ['decline','负向拖累',scope.negative_rank || [],'loss'],
   ['offset','正向抵消',scope.offset_rank || [],'after']
  ];
  const max = Math.max(1,...groups.flatMap(([, , rows]) => rows.slice(0,5).map(r=>Math.abs(r.delta_cents))));
  return `<div class="bi-board bi-contribution">
   <div class="panel-heading"><div><h3>商品贡献排行</h3><p class="muted">两期商品金额差额 · 每组前五 · 同一比例尺</p></div>
   ${picker('方向',groups.map(([id,label])=>[id,label]))}</div>
   <div class="bi-totals">${[['全部负向',scope.negative_cents,'down'],['全部正向',scope.positive_cents,'up'],['净变化',scope.net_cents,'']].map(([label,value,kind])=>
    `<div><span>${label}</span><strong class="${kind}">${money(value)}</strong></div>`).join('')}</div>
   ${groups.map(([id,label,rows,kind], i)=>`<div data-bi-view="${id}"${i?' hidden':''}>
    ${rows.length?rows.slice(0,5).map(r=>`<button type="button" class="bi-rank" ${preview?'data-showcase-sku':'data-product'}="${esc(r.product)}" aria-label="${esc(r.product+' · '+label+' '+money(r.delta_cents)+'，打开商品诊断')}">
     <span><code title="${esc(r.product)}">${esc(r.product)}</code><strong class="${kind==='loss'?'down':'up'}">${money(r.delta_cents)} <span aria-hidden="true">→</span></strong></span>
     ${fill(Math.abs(r.delta_cents),max,kind)}</button>`).join(''):'<p class="muted">当前窗口没有该方向的商品贡献。</p>'}</div>`).join('')}
   <p class="bi-foot">金额是商品对总变化的贡献。点击商品可核对销量、价格和履约。</p></div>`;
 }

 function pair(title, rows, { note='', format=num, max, labels=['基期','对比期'], tone='' } = {}) {
  if (!rows.length || !rows.some(r=>chartData(r.before)||chartData(r.after))) return '';
  const ceiling = max ?? Math.max(1,...rows.flatMap(r=>[r.before,r.after]).filter(chartData));
  const text = v => chartData(v) ? format(v) : '暂无数据';
  return `<div class="bi-pair ${tone}"><div class="panel-heading"><h3>${esc(title)}</h3>
   <div class="bi-legend"><span class="before">${esc(labels[0])}</span><span class="after">${esc(labels[1])}</span></div></div>
   ${rows.map(r=>`<div class="bi-pair-row"><strong>${esc(r.label)}</strong><div>
    <div class="bi-pair-bar">${fill(r.before,ceiling,'before')}<span aria-label="${esc(labels[0]+' '+text(r.before))}">${text(r.before)}</span></div>
    <div class="bi-pair-bar">${fill(r.after,ceiling,'after')}<span aria-label="${esc(labels[1]+' '+text(r.after))}">${text(r.after)}</span></div>
   </div></div>`).join('')}${note?`<p class="bi-foot">${esc(note)}</p>`:''}</div>`;
 }

 function funnel(channels) {
  if (!channels?.length) return '';
  return `<div class="bi-board bi-funnel"><div class="panel-heading"><div><h3>按渠道比较转化阶段</h3><p class="muted">独立模拟 · 同一渠道的事件数</p></div>
  ${picker('渠道',channels.map(c=>[c.channel,Replay.channels[c.channel]]))}</div>
  ${channels.map((c,i)=>{
   const before = c.before, after = c.after;
   const rows = ['visits','view_item','add_to_cart','checkout','orders'].map(k=>({label:Replay.stages[k],before:before.totals[k],after:after.totals[k]}));
   const rate = [before.ratios.order_conversion?.value, after.ratios.order_conversion?.value];
   return `<div data-bi-view="${esc(c.channel)}"${i?' hidden':''}>${pair(Replay.channels[c.channel],rows,
    {note:'下单率（下单数 / 到达访问数） '+M2.percent(rate[0])+' → '+M2.percent(rate[1])})}</div>`;
  }).join('')}</div>`;
 }

 function fulfillment(rows, subject = '全店') {
  const base = rows?.find(r=>r.period==='before'), current = rows?.find(r=>r.period==='after');
  if (!base || !current) return '';
  const rate = r => r.delivery_eligible > 0 ? r.late_rate ?? r.late_orders / r.delivery_eligible : null;
  const comparison = pair(subject+'晚交付率', [{label:'晚交付率',before:rate(base),after:rate(current)}], {
   max:1, format:M2.percent,
   note:`分母为可计算交付时效的已交付订单。基期 ${num(base.late_orders)} / ${num(base.delivery_eligible)} 单，对比期 ${num(current.late_orders)} / ${num(current.delivery_eligible)} 单。`
  });
  return comparison ? `<div class="bi-board">${comparison}</div>` : '';
 }

 function dimension(key, d) {
  if (key==='fulfillment' && d.status==='descriptive') return fulfillment(d.periods,'关联订单');
  if (!d.status?.startsWith('simulated')) return '';
  const [before,after] = ['before','after'].map(p=>d.periods?.find(r=>r.period===p));
  if (!before || !after) return '';
  const compare = (label, k) => ({label,before:before[k],after:after[k]});
  if (key==='traffic') return pair('渠道访问量',[compare('自然访问','organic'),compare('付费访问','paid')],
   {note:'独立模拟 · 到达访问次数'});
  if (key==='marketing') return pair('归因订单数',[compare('归因订单','conversions')],{note:'独立模拟 · 归因订单'});
  if (key==='conversion') return pair('两期转化阶段',before.stages.map(stage=>({
   label:Replay.stages[stage.key],before:stage.count,after:after.stages.find(a=>a.key===stage.key)?.count
  })),{note:'独立模拟 · 各阶段为事件数，分母与转化率详见下表'});
  if (key==='fulfillment') return pair('配送延迟率',[compare('配送延迟率','delay_rate')],{format:M2.percent,max:1,note:'独立模拟 · 分母为去重订单'});
  return '';
 }

 document.addEventListener('change', event => {
  const select = event.target.closest('[data-bi-view-picker]');
  if (!select) return;
  const board = select.closest('.bi-board');
  board.querySelectorAll('[data-bi-view]').forEach(view => { view.hidden = view.dataset.biView !== select.value; });
  if (board.classList.contains('bi-funnel')) {
   board.closest('.showcase-sim-chain')?.querySelectorAll('[data-funnel-channel]').forEach(details => {
    details.open = details.dataset.funnelChannel === select.value;
   });
  }
 });
 document.addEventListener('click', event => {
  const button = event.target.closest('.bi-column');
  if (!button) return;
  const view = button.closest('[data-bi-view]');
  view.querySelectorAll('.bi-column').forEach(point=>point.setAttribute('aria-pressed',String(point===button)));
  view.querySelector('[data-bi-number]').textContent = button.dataset.biNumber;
  view.querySelector('[data-bi-window]').textContent = button.dataset.biWindow;
 });

 return {trend, contributions, pair, funnel, fulfillment, dimension};
})();
