'use strict';
const $=s=>document.querySelector(s),esc=x=>String(x??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n==null?'不适用':new Intl.NumberFormat('zh-CN',{style:'currency',currency:'BRL'}).format(n/100),num=n=>n==null?'不适用':new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(n);
const admin = document.body.dataset.portal === 'admin';
const driverLabels = { marketing:'营销', traffic:'流量', conversion:'转化', inventory:'库存', fulfillment:'履约' };
const labels = admin
 ? { sources:'数据源', imports:'导入与发布', schedule:'回放调度', versions:'版本与质量', quality:'质量记录', rules:'指标与规则', model:'模型连接', users:'用户与权限', audit:'审计日志' }
 : { overview:'经营驾驶舱', monitor:'异常监控', sku:'商品诊断', drivers:'经营因素', ...driverLabels, replay:'模拟回放', ai:'调查助手', tasks:'调查与处置', reports:'报告中心' };
const groups = admin
 ? [['数据接入',['sources','imports','schedule']],['数据治理',['versions']],['系统设置',['model','users','audit']]]
 : [['经营监测',['overview','monitor']],['诊断分析',['sku','drivers','ai']],['处置与复盘',['tasks','reports']]];
const glyphs = {overview:'◫',monitor:'◎',sku:'⋮',drivers:'≋',ai:'◇',tasks:'▤',reports:'▧',sources:'⊞',imports:'↥',schedule:'◷',versions:'▱',model:'◇',users:'◉',audit:'▤'};
const pageNotes = {
 overview:'对比两期表现，识别异常范围，找到下一步调查入口。',
 monitor:'查看已触发告警、商品贡献和规则依据。',
 sku:'从金额差异定位商品，再核对销量、均价和履约。',
 drivers:'按经营因素查证，并核对各项数据是否能关联 Olist。',
 ai:'围绕当前数据和商品提问，随时打开引用证据。',
 tasks:'记录人工核查、执行和后续版本复核。',
 reports:'从已发布版本导出指标与调查证据。',
 sources:'核对来源、适用范围和可用状态。',
 imports:'按批次上传、校验并确认发布。',
 schedule:'安排独立场景回放，检查执行记录。',
 versions:'查看已保存版本、质量记录和计算口径。',
 model:'维护 DeepSeek 等模型配置并验证连接。',
 users:'核对工作区角色和启用状态。',
 audit:'查阅服务端记录的关键操作。'
};
const isDriver = page => page === 'drivers' || page === 'replay' || Object.hasOwn(driverLabels,page);
const navRoot = page => isDriver(page) ? 'drivers' : ['versions','quality','rules'].includes(page) ? 'versions' : page === 'investigation' ? 'monitor' : page;
function subnav(items, active, label) {
 return `<div class="subnav" role="group" aria-label="${label}">${items.map(key => `<button type="button" data-page="${key}"${active===key?' aria-current="page"':''}>${labels[key]}</button>`).join('')}</div>`;
}
function setHeading(page) {
 const root = navRoot(page);
 const group = groups.find(([,pages]) => pages.includes(root));
 $('#section-name').textContent = (admin ? '管理后台' : '业务前台') + (group ? ' / ' + group[0] : '');
 $('#title').textContent = labels[page] || '异常调查';
 $('#page-description').textContent = pageNotes[root] || '';
 for (const button of document.querySelectorAll('#nav [data-page]')) {
  if (button.dataset.page === root) button.setAttribute('aria-current','page');
  else button.removeAttribute('aria-current');
 }
}
function driverTabs(page, includeReplay = false) {
 return subnav(['drivers',...Object.keys(driverLabels),...(includeReplay?['replay']:[])],page,'经营因素');
}
function driverIndex() {
 const real = workspace === 'real';
 const descriptions = {
  marketing:'核对广告活动、投入与商品参与记录。', traffic:'比较渠道访问量及流量来源变化。', conversion:'查看曝光、访问、加购到下单的分阶段数据。',
  inventory:'核对期末库存、销量和缺货信号。', fulfillment:'查阅关联订单、配送、评价及事件证据。'
 };
 return `<div class="directory-grid">${Object.entries(driverLabels).map(([key,label]) => `<article class="panel directory-card">
  <div class="row"><h2>${label}</h2><span class="badge ${real&&key!=='fulfillment'?'caution':''}">${real?(key==='fulfillment'?'有历史证据':'无关联 Olist 数据'):'独立模拟'}</span></div>
  <p>${descriptions[key]}</p><button class="secondary" data-page="${key}">查看${label} →</button></article>`).join('')}</div>`;
}
let workspace=sessionStorage.getItem('lens_workspace')||'real',templateInput=null;
let renderTicket=0;
let session={},currentPage=admin?(location.hash==='#model'?'model':'sources'):(location.hash==='#agent'?'ai':'overview'),overview,selected,activeTask;
const canWrite=()=>session.write_available===true,canAdmin=()=>canWrite()&&session.member?.role==='admin';
async function api(route,body){const r=await fetch('/api/v1/'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{'x-lens-workspace':workspace}:{'x-lens-workspace':workspace,'content-type':'application/json','x-csrf-token':session.csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw Object.assign(Error(data.error||'请求失败'),{status:r.status});return data;}
function detail(data,title='查看证据'){return `<details><summary>${esc(title)}</summary><pre>${esc(JSON.stringify(data,null,2))}</pre></details>`;}
// Only the dashboard refreshes. An open investigation stays pinned to its evidence version.
let refreshingDashboard=false;
setInterval(async()=>{
 if(admin||workspace!=='scenario'||currentPage!=='overview'||!canWrite()||refreshingDashboard)return;
 refreshingDashboard=true;
 try{
  const expected=renderTicket;
  const current=(await api('current')).find(v=>v.source==='olist')?.version_id;
  if(expected===renderTicket&&currentPage==='overview'&&current&&current!==overview?.version)await render('overview');
 }catch{/* Dashboard remains usable on a transient connection failure. */}
 finally{refreshingDashboard=false;}
},3000);
function table(columns,rows){return `<div class="table-wrap"><table><thead><tr>${columns.map(c=>`<th>${esc(c[0])}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${columns.map(c=>`<td>${c[2]?c[1](r):esc(c[1](r))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;}
function unavailable(title,text){return `<div class="panel"><span class="badge">证据不足 / 尚未接入</span><h2>${title}</h2><p class="muted">${text}</p></div>`;}
async function refreshSession(){session=await api('session');$('#login-toggle').textContent=session.member?'退出 · '+session.member.display_name:'登录';$('#session-note').textContent=session.member?`已登录 · ${session.member.display_name}（${session.member.role==='admin'?'管理员':'分析员'}）`:session.local_showcase&&!admin?'只读预览':'待登录' ;}
function cockpit(o) {
 const {before,after}=o.metrics, base=before.purchase_item_amount_cents, current=after.purchase_item_amount_cents;
 const delta=o.delta_cents, relative=base ? M2.percent(Math.abs(delta)/base) : '';
 const periods=o.periods.filter(p=>p.period==='before'||p.period==='after');
 const eventCount=o.event_count??o.events.length;
 const asMoney=v=>money(v);
 const cards=[
  {label:'购买订单商品金额', before:base, after:current, format:asMoney},
  {label:'购买订单量', before:before.purchase_orders, after:after.purchase_orders, format:num},
  {label:'商品件数', before:before.item_units, after:after.item_units, format:num},
  {label:'每单平均商品金额', before:before.avg_order_item_amount_cents, after:after.avg_order_item_amount_cents, format:asMoney}
 ];
 const status=o.is_synthetic?'独立模拟 · 已发布版本':'Olist 历史快照';
 const max=Math.max(base,current,1);
 const scope=o.scope;
 const trend=M2.bi.trend(o);
 return `<section class="cockpit-hero" id="showcase-real-metrics">
  <div><div class="row"><span class="cockpit-source" data-synthetic="${o.is_synthetic}">${status}</span></div>
   <h2>购买订单商品金额${delta<0?'下降':delta>0?'上涨':'持平'}${delta&&relative?' '+relative:''}</h2>
   <p class="cockpit-window">${periods.map((p,i)=>`<span>${i?'对比期':'基期'} <b>${esc(p.start)} 至 ${esc(p.end)}</b></span>`).join('')}</p>
   <div class="actions"><button data-page="monitor">查看异常监控 →</button><button class="secondary" data-page="sku">定位商品</button></div>
  </div>
  <figure class="cockpit-comparison">
   <figcaption>两期商品金额对比 <span>BRL</span></figcaption>
   ${[[base,'基期'],[current,'对比期']].map(([value,label],i)=>`<div class="comparison-value"><span>${label}</span><strong>${money(value)}</strong></div>
    <meter class="${i?'comparison-current':''}" value="${value}" max="${max}" aria-label="${label}购买订单商品金额"></meter>`).join('')}
   <p>净变化 <strong>${money(delta)}</strong></p>
  </figure>
 </section>
 <div class="grid cockpit-metrics">${cards.map(c=>{
  const d=c.after-c.before;
  return `<article class="metric"><p>${c.label}</p><strong>${c.format(c.after)}</strong><small>基期 ${c.format(c.before)} <span class="metric-change ${d<0?'down':d>0?'up':''}">${c.before?(d>0?'+':'')+M2.percent(d/c.before):'不适用'}</span></small></article>`;
 }).join('')}</div>
 <div class="cockpit-grid${trend?' with-trend':''}">
 ${trend}${trend?'<div class="cockpit-insights">':''}
 <section class="panel cockpit-range"><div class="panel-heading"><h2>异常范围</h2><button class="secondary" data-page="monitor">展开分析 →</button></div>
  <p>${num(scope.comparable)} 个两期均有销量的商品中，${num(scope.down)} 个下滑。首位商品占全部负向金额 ${M2.percent(scope.top_share_of_gross_decline)}。</p>
  <div class="distribution">${[['下滑',scope.down,'down'],['持平',scope.flat,''],['上涨',scope.up,'up']].map(([label,value,kind])=>`<div class="${kind}"><strong>${num(value)}</strong><span>${label}</span></div>`).join('')}</div>
 </section>
 <section class="panel cockpit-next"><div class="panel-heading"><h2>接下来查什么</h2><span class="badge">${num(eventCount)} 条规则告警</span></div>
  <button type="button" class="work-link" data-page="drivers"><span><strong>排查经营因素</strong><small>营销、流量、转化、库存与履约</small></span><span aria-hidden="true">→</span></button>
  <button type="button" class="work-link" data-page="ai"><span><strong>向调查助手提问</strong><small>查看数据引用与待核查项</small></span><span aria-hidden="true">→</span></button>
 </section>
 ${trend?'</div>':''}
 </div>
 <details class="panel snapshot-details"><summary>数据版本与统计口径</summary><p class="id">版本 ${esc(o.version)} · ${esc(o.engine?.operations)} / ${esc(o.engine?.monitoring)}</p>
 <p>期间截止日不纳入。金额不含运费与退款调整。商品贡献${o.reconciled?'已与全店变化核对':'待核对'}。</p></details>`;
}
function renderOverview(o) {
 return cockpit(o)+monitorEvents(o.events.slice(0,3),'近期比较窗口告警');
}
const taskStatuses={pending:'待调查',investigating:'调查中',action_pending:'待执行',executing:'执行中',verification_pending:'待复核',closed:'已关闭'};
const jobStatuses={queued:'待执行',running:'计算中',awaiting_confirmation:'待确认发布',succeeded:'已发布',failed:'失败',canceled:'已取消',interrupted:'已中断'};
const sourcesCopy={
 olist:['Olist 历史订单','人工导入','用于核对订单、商品金额、销量、配送与评价。'],
 inventory:['独立零售库存','独立数据','零售来源缺少与 Olist 匹配的商品主键。'],
 advertising:['独立广告样本','独立数据','样本暂缺已核实的曝光、点击与收入。'],
 ga4:['Google Analytics 4','待授权','当前没有关联 Olist 的渠道与转化事件。'],
 independent_simulation:['独立模拟场景','独立模拟','用于演练监控、调查、处置及复核。']
};
const eventStatuses={pending:'待处理',in_progress:'处理中',resolved:'已处理',closed:'已关闭'};
function monitorEvents(events, title='规则告警', { readOnly=false }={}) {
 const unit=(e,v)=>e.unit==='分'?money(v):e.unit==='比例'?M2.percent(v):num(v);
 return `<section class="panel monitor-events">
 <div class="panel-heading"><h2>${title}</h2><span class="badge">${num(events.length)} 条</span></div>
 ${events.length?`<div class="event-grid">${events.map(e=>`<article class="event-card">
 <div class="row"><span class="badge caution">${readOnly?'历史规则触发':esc(eventStatuses[e.status]||e.status||'已触发')}</span><span class="muted">${e.scope_type==='shop'?'全店':esc(e.entity_id)}</span></div>
 <h3>${esc(e.metric_label||e.metric_id)}</h3><strong class="${e.relative_change<0?'negative':''}">${M2.percent(e.relative_change)}</strong>
 <p>${unit(e,e.before)} → ${unit(e,e.after)}${e.unit!=='分'&&e.unit!=='比例'?' '+esc(e.unit):''}</p>
 <details><summary>规则与证据</summary><p>绝对变化门槛 ${unit(e,e.thresholds?.absolute)} · 相对门槛 ${M2.percent(e.thresholds?.relative)}</p>
 <p class="id">${esc(e.evidence?.id||e.evidence_id)} · ${esc(e.evidence?.query)}</p></details>
 ${readOnly?'':`<button type="button" class="secondary" data-evidence="${esc(e.event_id)}">查看异常证据 →</button>`}
 </article>`).join('')}</div>`:'<div class="empty">当前比较窗口没有触发规则的告警。</div>'}</section>`;
}
function productTable(rows){return table([['商品',r=>`<button class="secondary id" data-product="${esc(r.key)}">${esc(r.key.slice(0,16))}…</button>`,true],['基期金额',r=>money(r.before?.amount_cents)],['当期金额',r=>money(r.after?.amount_cents)],['金额变化',r=>money(r.delta_cents)],['件数',r=>`${r.before?.units??'—'} → ${r.after?.units??'—'}`],['均价',r=>`${money(r.before?.avg_unit_price_cents)} → ${money(r.after?.avg_unit_price_cents)}`],['变化贡献占比',r=>M2.percent(r.delta_contribution_share)]],rows);}
async function skuView(id){selected=id;const d=await api('sku?product='+encodeURIComponent(id));if(!admin&&workspace==='real'&&session.local_showcase)window.Showcase?.selectProduct(id);return `<div class="panel" id="product-detail"><h2>商品诊断</h2><p class="id">${esc(id)} · 版本 ${esc(d.version)}</p>${M2.decomposition(d)}${detail(d.contribution,'金额、数量与价格分解')}${detail(d.trend,'已保存的商品历史趋势')}</div>${d.replay?Replay.chain({...d.replay,inventory:d.dimensions.inventory.stocks}):''}<div class="grid two">${Object.entries(d.dimensions).map(([key,value])=>M2.dimension(key,value)).join('')}</div>`;}
async function render(page,{evidencePreview=false}={}){const ticket=++renderTicket;window.Showcase?.pageChanged({keepSource:evidencePreview});$('#message').textContent='';currentPage=page;setHeading(page);$('#content').innerHTML='<p class="muted">读取数据…</p>';let html='';
 if(!admin&&session.local_showcase&&workspace==='real'&&(['overview','ai','replay'].includes(page)||((!session.member||evidencePreview)&&(['monitor','sku'].includes(page)||isDriver(page))))){
  try{await Showcase.mount($('#content'),()=>ticket===renderTicket,page);}
  catch(error){if(ticket===renderTicket)$('#content').innerHTML=`<section class="panel"><h2>暂时无法读取历史快照</h2><p>${esc(error.message)}</p><button data-page="${page}">重试</button></section>`;}
  return;
 }
 if(!session.member&&session.storage==='local_postgresql'){
  $('#content').innerHTML='<section class="panel"><h2>登录后进入工作区</h2><p>登录后查看已发布版本、任务和报告。</p><button data-open-login>登录工作区</button></section>';
  return;
 }
 if(page==='overview'){overview=await api('overview');html=renderOverview(overview);}
 else if(page==='monitor'){overview=await api('overview');html=monitorEvents(overview.events)+`<section class="panel">${M2.bi.contributions(overview)}</section>`+Replay.scope(overview.scope)+M2.overview(overview);}
 else if(page==='drivers')html=driverIndex();
 else if(page==='sku'){html=await M2.products();if(selected)html+=await skuView(selected);}
 else if(page==='fulfillment'){overview ||=await api('overview');html=await skuView(selected||overview.products[0].key);}
 else if(workspace==='scenario'&&['marketing','inventory','traffic','conversion'].includes(page)){const d=await api('diagnostics'+(selected?'?product='+encodeURIComponent(selected):''));html='<div class=notice>独立模拟场景，非 Olist 实际店铺数据。当前范围：'+esc(selected||'全场景')+'</div>'+M2.dimension(page,d.dimensions[page]);}
 else if(page==='marketing'||page==='inventory'){const source=page==='marketing'?'advertising':'inventory';const d=await api('external?source='+source).catch(error=>{if(error.status!==404)throw error;return null;});const rows=d?.rows||d?.records||[];html=!d?unavailable('当前没有已发布的独立样本','此来源还未发布到当前工作区。'):`<div class="notice">独立${page==='marketing'?'广告':'零售库存'}数据，禁止与 Olist 商品直接关联。${page==='marketing'?'缺曝光、点击、收入；不计算 CTR、CPC、ROAS。':'负库存是数据记录异常，不能直接确诊缺货；成本未核验，不计算毛利。'}</div><section class="panel"><h2>${page==='marketing'?'活动记录':'库存记录'}</h2>${rows.length?table(Object.keys(rows[0]).filter(k=>!['reported_ctr','reported_roas'].includes(k)).slice(0,10).map(k=>[k,r=>r[k]]),rows):'<p>没有可展示记录</p>'}${detail(d.summary,'来源、覆盖和质量限制')}</section>`;}
 else if(page==='traffic')html=unavailable('流量接入状态','GA4 仍需 BigQuery 授权。自然搜索、付费搜索、商品浏览和来源占比没有可验证的 Olist 数据；不补造数值。');
 else if(page==='conversion')html=unavailable('曝光 → 点击 → 访问 → 加购 → 结账 → 下单','各事件数量与分母尚缺，转化率显示不适用。Olist 订单量不能替代流量分母。');
 else if(page==='ai'){overview ||=await api('overview');html=`<section class="panel"><h2>依据异常证据开展调查</h2><p>未连接模型时可使用明确标识的规则诊断，也可阅读结构化证据并人工调查。模型不能确认根因、自动执行行动或关闭任务。</p>${overview.events.map(e=>`<button data-evidence="${esc(e.event_id)}">查看异常证据</button>`).join('')}${detail(await api('model'),'模型连接状态')}</section>`;}
 else if(page==='tasks'){const tasks=await api('tasks');html=`<section class="panel"><h2>调查与行动记录</h2>${tasks.length?table([['任务',t=>`<button data-task="${esc(t.id)}">${esc(t.id.slice(0,12))}</button>`,true],['状态',t=>taskStatuses[t.status]||t.status],['负责人',t=>t.owner],['优先级',t=>t.priority]],tasks):'<div class="empty">暂无调查任务。请从真实异常的证据页创建；不会自动生成业务审核记录。</div>'}</section>`;}
 else if(page==='reports')html=`<section class="panel"><h2>调查记录导出</h2><p>按当前工作区的已发布版本导出。指定历史任务的报告可从该任务详情下载。</p>
  <div class="directory-grid">${[['html','网页','查看证据与完整纪要。'],['pdf','PDF','适合分享或存档。'],['xlsx','Excel','按指标、维度和证据分表。'],['json','JSON','保留结构化调查记录。']].map(([format,label,note])=>`<article class="panel directory-card"><h3>${label}</h3><p>${note}</p><button type="button" class="secondary" ${format==='json'?'id="export-records"':`data-report="${format}"`} ${canWrite()?'':'disabled'}>导出 ${label}</button></article>`).join('')}</div></section>`;
 else if(page==='sources'){
  const sources=await api('sources');
  html=`<section class="panel"><div class="panel-heading"><h2>来源与接入状态</h2><button data-page="imports">进入导入与发布 →</button></div>
  <div class="directory-grid">${sources.map(s=>{
   const [name,state,note]=sourcesCopy[s.id]||[s.id,'待核对',''];
   return `<article class="panel directory-card"><div class="row"><h3>${esc(name)}</h3><span class="badge ${s.id==='ga4'&&!s.config?.connected?'caution':''}">${s.id==='ga4'&&s.config?.connected?'已连接':state}</span></div>
   <p>${s.id==='ga4'&&s.config?.connected?'查看连接配置与数据覆盖。':note}</p>${detail(s.config,'查看来源配置')}</article>`;
  }).join('')}</div></section>`;
 }
 else if(page==='imports'){html=`<form id="import-form" class="panel"><h2>完整快照上传</h2>${workspace==='scenario'?`<div class="notice">仅导入独立模拟 CSV；与真实 Olist 版本及文件隔离。</div><div class="actions"><button type="button" data-template="decline">载入模拟下滑 CSV</button><button type="button" data-template="followup">载入模拟后续 CSV</button></div><p id="template-note"></p>`:''}<p class="muted">支持已审计 Olist 九表逐文件上传，或现有标准三表；此处不重跑原始表审计。同一数据集只有一个活跃任务，上传后需手动运行与确认发布。</p><label>数据集<select name="source"><option value="olist">${workspace==='scenario'?'独立模拟 scenario.csv':'Olist 标准三表 / 原始九表'}</option><option value="inventory">独立库存与销售</option><option value="advertising">独立广告</option></select></label><label>CSV 文件<input name="files" type="file" multiple accept=".csv" required></label><label>数据来源 manifest JSON<textarea name="manifest" required placeholder="粘贴该批次来源、提取时间、is_synthetic 标识及覆盖信息"></textarea></label><button ${canAdmin()?'':'disabled'}>上传并创建任务</button></form><section class="panel"><h2>数据更新任务</h2><button data-page="imports" type="button">刷新任务状态</button>${canAdmin()?table([['任务',j=>j.id],['数据集',j=>j.source],['状态',j=>j.cancel_requested&&j.status==='running'?'取消待执行进程确认':jobStatuses[j.status]||j.status],['操作',j=>`${j.status==='queued'?`<button data-job="${j.id}" data-op="run">执行</button>`:''}${['failed','interrupted','canceled'].includes(j.status)?`<button data-job="${j.id}" data-op="retry">重试</button>`:''}${['queued','running','awaiting_confirmation'].includes(j.status)?` <button data-job="${j.id}" data-op="cancel">取消</button>`:''}${j.status==='awaiting_confirmation'?` <button data-job="${j.id}" data-op="publish">确认发布</button>`:''} <button data-job="${j.id}" data-op="logs">日志</button>`,true]],await api('jobs')):'<p>管理员登录并配置数据库连接后可操作。</p>'}</section>`;}
 else if(page==='versions'||page==='quality'){
  const versions=await api('versions'),quality=page==='quality';
  html=`<section class="panel"><div class="panel-heading"><h2>${quality?'已保存的质量结论':'不可变版本记录'}</h2><span class="badge">${num(versions.length)} 个版本</span></div>
  ${versions.length?versions.map(v=>`<article class="event-card"><div class="row"><h3>${esc(sourcesCopy[v.source]?.[0]||v.source)}</h3><span class="badge ${v.quality==='verified'?'':'caution'}">${v.quality==='verified'?'已验证':'有限可用'}</span></div>
  <p class="id">${esc(v.id)}</p>${quality?`<p>覆盖 ${esc(v.manifest?.coverage_start)} 至 ${esc(v.manifest?.coverage_end)}</p>`:v.created_at?`<p class="muted">保存时间 ${esc(v.created_at)}</p>`:''}
  ${detail(v,quality?'覆盖、文件哈希与验收状态':'来源与版本标识')}</article>`).join(''):'<div class="empty">当前工作区没有入库版本记录。可在「导入与发布」查看候选批次。</div>'}</section>`;
 }
 else if(page==='rules')html=`<section class="panel"><h2>保留正式计算口径</h2><p>operations-2.0.0 / monitoring-2.0.1 默认阈值未修改。规则采用完整可比周期、历史中位数与 MAD、样本量和履约成熟度门禁。</p><p>修改规则的管理入口保持只读，避免把配置编辑误当作已验收的新规则版本。</p></section>`;
 else if(page==='model'){const c=await api('model');html=`<form id="model-form" class="panel"><h2>模型连接配置</h2><p>API Key 加密保存在服务端，浏览器不会读取已有密钥；必须真实调用成功才能确认连接。</p><div class="form-fields"><label>服务商<select name="provider"><option value="deepseek" ${c.provider==='deepseek'?'selected':''}>DeepSeek</option><option value="openai" ${c.provider==='openai'?'selected':''}>OpenAI</option><option value="openai_compatible" ${c.provider==='openai_compatible'?'selected':''}>OpenAI compatible</option></select></label><label>接口地址<input name="base_url" type="url" value="${esc(c.base_url||'https://api.deepseek.com')}" required></label><label>模型<input name="model" value="${esc(c.model||'deepseek-flash')}" required></label><label class="full">API Key（留空保留已有值）<input name="api_key" type="password" autocomplete="new-password"></label><label>Temperature<input name="temperature" type="number" min="0" max="1" step="0.1" value="${c.temperature??0}"></label><label>Max tokens<input name="max_tokens" type="number" min="256" max="8192" value="${c.max_tokens||2600}"></label><label>超时毫秒<input name="timeout_ms" type="number" min="1000" max="55000" value="${c.timeout_ms||50000}"></label></div><button ${canAdmin()?'':'disabled'}>保存配置</button><button type="button" id="test-model" ${canAdmin()?'':'disabled'}>测试已保存连接</button>${detail(c,'当前状态')}</form>`;}
 else if(page==='schedule')html=workspace==='scenario'&&canAdmin()?Replay.schedule(await api('schedule')):unavailable('模拟回放调度','管理员登录后切换到独立模拟工作区。');
 else if(page==='users')html=`<section class="panel"><h2>Olist 角色</h2><p>admin 管理数据与配置；analyst 调查、处理及导出。不会修改其他项目角色。</p>${canAdmin()?table([['用户',u=>u.display_name],['角色',u=>u.role],['启用',u=>u.enabled]],await api('users')):'<p>管理员登录后查看。</p>'}</section>`;
 else if(page==='audit')html=`<section class="panel"><h2>服务端审计日志</h2>${canAdmin()?detail(await api('audit'),'展开最近操作'):'<p>管理员登录后查看。</p>'}</section>`;
 if(ticket===renderTicket){
  const links=!admin&&isDriver(page)?driverTabs(page,session.local_showcase&&workspace==='real')
   :admin&&navRoot(page)==='versions'?subnav(['versions','quality','rules'],page,'版本与质量'):'';
  const sampleLink=!admin&&session.local_showcase&&workspace==='real'&&Object.hasOwn(driverLabels,page)?'<p class="actions"><button class="secondary" data-page="replay">查看独立模拟回放 →</button></p>':'';
  $('#content').innerHTML=links+html+sampleLink;
 }
}
async function showEvidence(event,product=null){currentPage='investigation';renderTicket++;setHeading('investigation');const requestedWorkspace=workspace;overview ||=await api('overview');const targetEvent=overview.events.find(e=>e.event_id===event);const targetProduct=product||(targetEvent?.scope_type==='product'?targetEvent.entity_id:selected||overview.products[0].key);const pack=await api('evidence?event='+encodeURIComponent(event)+'&product='+encodeURIComponent(targetProduct));if(requestedWorkspace!==workspace)return;$('#content').innerHTML=`<section class="panel"><h2>异常调查证据</h2><p class="id">版本 ${esc(pack.version)} · 证据 ${esc(pack.hash)}</p>${pack.cards.filter(c=>c.id!=='E7').map(c=>detail(c.value,c.id+' / '+c.label)).join('')}<button id="create-task" ${canWrite()?'':'disabled'}>创建人工调查任务</button></section>${pack.cards.some(c=>c.id==='E7')?`<form id="chain-product-form" class="panel" data-event="${esc(event)}"><label>本告警关联商品<select name="product">${overview.products.map(r=>`<option ${r.key===targetProduct?'selected':''}>${esc(r.key)}</option>`).join('')}</select></label><button>查看商品证据</button></form>`+Replay.chain(pack.cards.find(c=>c.id==='E7').value,overview.scope):''}`;$('#create-task').onclick=()=>guard(async()=>{const t=await api('tasks',{event_id:pack.event_id,product_id:pack.cards[2].value.product_id,version:pack.version,owner:session.member.subject});await showTask(t.id);});}
async function showTask(id){currentPage='tasks';renderTicket++;setHeading('tasks');const requestedWorkspace=workspace;$('#content').innerHTML='<p>正在读取调查记录…</p>';const loadedTask=await api('tasks/'+id);if(requestedWorkspace!==workspace)return;activeTask=loadedTask;const t=activeTask;$('#content').innerHTML=`<section class="panel"><h2>调查任务 · ${esc(taskStatuses[t.status]||t.status)}</h2><p class="id">${esc(id)} · revision ${t.revision}</p><p>负责人 ${esc(t.owner)} · 优先级 ${esc(t.priority)}</p>${detail(t.evidence,'绑定证据包')}${t.reports.map(r=>M2.report(r)).join('')}${detail(t.reports,'调查与追问原始记录')}${detail(t.verification,'效果复核（无后续数据则未验证）')}<form id="task-form"><label>操作<select name="kind"><option value="transition">推进状态</option><option value="review">人工审核</option><option value="action">制定行动</option><option value="execution">记录执行</option><option value="evidence">补充证据</option><option value="reject">驳回调查</option><option value="reopen">重新打开</option></select></label><label>目标状态<select name="to">${['investigating','action_pending','executing','verification_pending','closed'].map(s=>`<option>${s}</option>`).join('')}</select></label><label>处理依据<textarea name="note" required></textarea></label><label>审核结论<select name="decision"><option value="approved">通过</option><option value="rejected">驳回</option></select></label><label>原因说明 / 行动 / 执行凭证<input name="content"></label><label>证据 ID（逗号分隔）<input name="evidence_ids" placeholder="E1,E3"></label><label>复核时间<input name="due_at" type="datetime-local"></label><button>记录人工操作</button></form><form id="ask-form">${t.evidence.cards.some(c=>c.id==='E7')?Replay.channelField():''}<label>继续调查<textarea name="question" required></textarea></label><label>调查方式<select name="mode"><option value="rules">规则诊断（非大模型）</option><option value="llm">真实模型（需已连接）</option></select></label><button>生成调查报告</button></form><button id="verify-task" class="secondary">检查后续版本并复核（模拟结果明确标识）</button>${detail(t.history,'完整处理历史')}${Replay.links()}</section>${t.evidence.cards.some(c=>c.id==='E7')?Replay.chain(t.evidence.cards.find(c=>c.id==='E7').value,t.evidence.cards.find(c=>c.id==='E7').value.scope):''}`;}
async function guard(fn){try{await fn();}catch(e){$('#message').textContent=e.message;}}
$('#nav').innerHTML=groups.map(([group,pages])=>`<div class="nav-group"><p>${group}</p>${pages.map(key=>`<button data-page="${key}" disabled><span aria-hidden="true">${glyphs[key]}</span>${labels[key]}</button>`).join('')}</div>`).join('');
const menuButton=$('#menu-toggle');
menuButton.onclick=()=>menuButton.setAttribute('aria-expanded',String(menuButton.getAttribute('aria-expanded')!=='true'));
$('#nav').addEventListener('click',event=>{if(event.target.closest('[data-page]'))menuButton.setAttribute('aria-expanded','false');});
document.addEventListener('click',e=>guard(async()=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.template){templateInput=await api('scenario-template?phase='+b.dataset.template);const f=$('#import-form');f.elements.manifest.value=JSON.stringify(templateInput.manifest,null,2);f.elements.files.required=false;f.elements.source.value='olist';$('#template-note').textContent='已载入 scenario.csv（模拟） '+new Blob([templateInput.files['scenario.csv']]).size+' 字节；点击上传后才创建任务。';return;}if(b.dataset.rankPage){M2.rank.page=Number(b.dataset.rankPage);await render('sku');return;}if(b.dataset.page){window.scrollTo(0,0);await render(b.dataset.page);}if(b.dataset.product){selected=b.dataset.product;await render('sku');$('#product-detail')?.scrollIntoView({block:'start'});}if(b.dataset.evidence)await showEvidence(b.dataset.evidence);if(b.dataset.task)await showTask(b.dataset.task);if(b.hasAttribute('data-open-login')){$('#login').hidden=false;$('#login-form [name=username]').focus();return;}if(b.id==='login-toggle'){if(session.member){await api('logout',{});await refreshSession();await render(currentPage);}else $('#login').hidden=!$('#login').hidden;}if(b.id==='test-model'){await api('model/test',{});await render('model');$('#message').textContent='接口连接测试通过。';return;}if(b.dataset.report){const o=b.dataset.taskReport?{version:activeTask.version}:await api('overview');$('#message').textContent='正在生成同版本报告…';const r=await fetch('/api/v1/report?'+new URLSearchParams({format:b.dataset.report,version:o.version,...(b.dataset.taskReport?{task:activeTask.id}:{})}),{headers:{'x-lens-workspace':workspace}});if(!r.ok)throw Error((await r.json()).error);const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='olist-'+o.version.slice(0,16)+'.'+b.dataset.report;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#message').textContent='报告已导出，版本 '+o.version;return;}if(b.id==='export-records'){const data=await api('export'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='olist-investigation-records.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}if(b.dataset.job){const route='jobs/'+b.dataset.job+'/'+b.dataset.op;if(b.dataset.op==='logs')$('#content').insertAdjacentHTML('beforeend',`<section class="panel">${detail(await api(route),'任务执行日志')}</section>`);else{const body={};if(b.dataset.op==='publish'){const current=await api('current'),jobs=await api('jobs'),job=jobs.find(j=>j.id===b.dataset.job);if(!confirm('确认发布'+(workspace==='scenario'?'独立模拟':'当前来源')+'数据版本？'))return;body.expected_current=current.find(v=>v.source===job.source)?.version_id||null;}await api(route,body);await render('imports');}}if(b.id==='verify-task'){await api('tasks/'+activeTask.id+'/verify',{expected_revision:activeTask.revision,note:workspace==='scenario'?'人工请求模拟后续版本复核，不代表真实效果':'人工请求后续真实版本复核'});await showTask(activeTask.id);}}));
document.addEventListener('submit',e=>{e.preventDefault();guard(async()=>{const form=e.target,data=Object.fromEntries(new FormData(form));if(form.id==='schedule-form'){const enabled=e.submitter?.value==='yes';await api('schedule',{...data,enabled,due_at:enabled&&data.due_at?new Date(data.due_at).toISOString():null});await render('schedule');return;}if(form.id==='chain-product-form'){await showEvidence(form.dataset.event,data.product);return;}if(form.id==='login-form'){await api('login',data);form.reset();$('#login').hidden=true;await refreshSession();await render(currentPage);}if(form.id==='rank-form'){M2.rank={...M2.rank,page:1,query:data.query,sort:data.sort};await render('sku');}if(form.id==='import-form'){const chosen=[...form.elements.files.files];if(workspace==='real'&&data.source==='olist'&&chosen.some(f=>f.name.startsWith('olist_'))){const refs={};for(const f of chosen){$('#message').textContent='私有上传：'+f.name;const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(f);});refs[f.name]=await api('raw-files',{filename:f.name,base64});}await api('imports',{source:'olist',format:'olist_raw_nine_v2',manifest:JSON.parse(data.manifest),file_refs:refs});await render('imports');return;}const files={};for(const f of chosen)files[f.name]=await f.text();await api('imports',{source:data.source,manifest:JSON.parse(data.manifest),files:Object.keys(files).length?files:templateInput?.files});templateInput=null;await render('imports');}if(form.id==='model-form'){for(const k of ['temperature','max_tokens','timeout_ms'])data[k]=Number(data[k]);await api('model',data);form.elements.api_key.value='';$('#message').textContent='配置已保存；尚未通过真实调用验证。';}if(form.id==='task-form'){await api('tasks/'+activeTask.id+'/change',{...data,expected_revision:activeTask.revision,evidence_ids:data.evidence_ids.split(',').map(x=>x.trim()).filter(Boolean),cause:data.content,action:data.content,reference:data.content,due_at:data.due_at?new Date(data.due_at).toISOString():null});await showTask(activeTask.id);}if(form.id==='ask-form'){await api('tasks/'+activeTask.id+'/investigate',data);await showTask(activeTask.id);}});});
function workspaceLabel(){$('#workspace').value=workspace;$('#workspace-note').textContent=workspace==='scenario'?'使用独立模拟数据':'历史快照 · 数据不会实时更新';document.body.dataset.workspace=workspace;}async function switchWorkspace(next,page=currentPage,options){workspace=next;const ticket=++renderTicket;$('#content').innerHTML='<p>正在切换数据工作区…</p>';sessionStorage.setItem('lens_workspace',workspace);overview=null;selected=null;activeTask=null;templateInput=null;M2.rank.page=1;workspaceLabel();await refreshSession();if(ticket===renderTicket)await render(page,options);}$('#workspace').onchange=()=>guard(()=>switchWorkspace($('#workspace').value));workspaceLabel();guard(async()=>{try{await refreshSession();if(!admin&&session.local_showcase&&!session.member&&workspace==='scenario'){workspace='real';workspaceLabel();}await render(currentPage);}finally{document.querySelectorAll('#nav button').forEach(b=>b.disabled=false);}});
