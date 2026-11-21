'use strict';

window.Showcase = (() => {
 const names = { category: '品类', seller: '卖家', state: '地区', missing: '维度缺失' };
 const layouts = { broad: '较广泛下滑', concentrated: '集中下滑', mixed: '下滑分布混合', not_classified: '当前无可分类净下滑' };
 const prompts = {
  olist: ['全店金额为什么下滑，主要集中在少数商品吗？', '选中商品的销量和价格分别贡献多少？', '选中商品有延迟、低评分或退款吗？'],
  simulation: ['自然搜索和付费搜索各变化多少？', '活动结束了吗，还是商品退出了？', '流量稳定时，漏斗哪一环变差？', '有缺货、发货异常或退款记录吗？', '证据在哪里，还有哪些解释没有排除？']
 };
 const topics = {
  metrics: '经营指标', scope: '商品分布', product: '商品量价', fulfillment: '履约与评价',
  traffic: '渠道流量', campaigns: '活动关系', funnel: '渠道漏斗', inventory: '库存',
  orders: '订单事件', limits: '证据边界', verification: '模拟处理复核'
 };
 const pretty = p => p ? p.start + ' 至 ' + p.end + '（不含）' : '未记录';
 const windows = ps => ps.map(pretty).join(' ／ ');
 const showButton = (id, label = id) => `<button type="button" class="secondary id" data-showcase-sku="${esc(id)}">${esc(label)}</button>`;
 const period = p => p.period === 'before' ? '基期' : '当期';
 let storedData;
 let activeRequest;
 let widget, view, conversation;
 let identity, lastWorkspace;
 const evidencePages = {
  '#showcase-real-metrics':'overview','#showcase-real-scope':'monitor','#showcase-real-sku':'sku',
  '#showcase-real-fulfillment':'sku','#showcase-real-limits':'drivers','#showcase-sim-chain-limits':'replay',
  '#showcase-sim-chain-scope':'replay','#showcase-effect':'replay','#showcase-sim-chain-traffic':'traffic',
  '#showcase-sim-chain-campaigns':'marketing','#showcase-sim-chain-funnel':'conversion',
  '#showcase-sim-chain-inventory':'inventory','#showcase-sim-chain-orders':'fulfillment'
 };

 async function request(name, body) {
  const response = await fetch('/api/v1/showcase/' + name, body === undefined ? {} : {
   method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const value = await response.json();
  if (!response.ok) throw Error(value.error || '读取演示证据失败');
  return value;
 }

 async function runAgent(input, signal, onEvent) {
  const response = await fetch('/api/v1/showcase/agent', {
   method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrf || '' },
   body: JSON.stringify(input), signal
  });
  if (!response.ok) throw Error((await response.json()).error || 'DeepSeek 调查请求失败');
  let buffer = '';
  for await (const chunk of response.body.pipeThrough(new TextDecoderStream())) {
   buffer += chunk;
   let boundary;
   while ((boundary = buffer.indexOf('\n')) !== -1) {
    const value = JSON.parse(buffer.slice(0, boundary));
    buffer = buffer.slice(boundary + 1);
    if (value.type === 'error') throw Error(value.error);
    if (value.type === 'answer') return value.answer;
    onEvent(value);
   }
  }
  throw Error('连接中断，未收到完整的 DeepSeek 回答。');
 }

 function contribution(real) {
  const s = real.scope;
  return `<section class="panel" id="showcase-real-scope">
   <div class="panel-heading"><h2>下滑范围与主要贡献</h2><span class="badge">${layouts[s.classification]}</span></div>
   <p>两期均有销量的 ${num(s.comparable)} 个商品中，${num(s.down)} 个下滑、${num(s.up)} 个上涨、${num(s.flat)} 个持平。另有 ${num(s.new_or_disappeared)} 个商品仅在一期有销量。</p>
   <p>负向贡献 ${money(s.negative_cents)}，正向抵消 ${money(s.positive_cents)}。首位商品占全部负向金额 ${M2.percent(s.top_share_of_gross_decline)}。商品金额差额合计${real.reconciled ? '已与' : '待与'}全店变化核对。</p>
   ${M2.bi.contributions(real,true)}
   <details><summary>查看正向抵消与品类、卖家、地区贡献</summary>
   <h3>正向抵消前五</h3>${table([['商品 ID', r => showButton(r.product, r.product.slice(0, 12) + '…'), true], ['金额变化', r => money(r.delta_cents)]], s.offset_rank.slice(0, 5))}
   ${Object.entries(real.dimensions).map(([k, rows]) => `<h3>${names[k]}负向贡献前三</h3>${table([[names[k], r => r.key || '未记录'], ['基期金额', r => money(r.before.amount_cents)], ['当期金额', r => money(r.after.amount_cents)], ['变化', r => money(r.delta_cents)]], rows)}`).join('')}
   </details>
   <div class="actions"><button class="secondary" data-page="sku">打开商品诊断 →</button></div>
   <details><summary>统计与证据口径</summary><p>${esc(s.definition)} 当前窗口保存了 ${num(real.event_count)} 条规则告警。履约以已交付且有有效交付日期的订单为分母。</p><p class="id">证据 ${esc(real.evidence_id)}<br>版本 ${esc(real.version)}<br>计算 ${esc(real.engine.operations)} / ${esc(real.engine.monitoring)}</p><p class="muted">Olist Brazilian E-Commerce Public Dataset · CC BY-NC-SA 4.0 · 既有验证快照。购买订单商品金额未计运费及退款调整。</p></details>
  </section>`;
 }

 function productPicker(real, title) {
  return `<section class="panel product-picker"><h2>${title}</h2><form id="showcase-product-form">
   <label>商品<select name="product">${real.products.map(r => `<option value="${esc(r.key)}">${esc(r.key)} · ${money(r.delta_cents)}</option>`).join('')}</select></label>
   <button type="submit">查看</button></form></section><div id="showcase-real-sku" aria-live="polite"></div>`;
 }

 function factorHome(data) {
  return `<section class="panel" id="showcase-real-limits"><div class="panel-heading"><h2>Olist 证据覆盖</h2><span class="badge">真实历史</span></div>
   <p>配送、取消和关联订单评价可查。营销、流量、转化和库存缺少与 Olist 商品关联的数据；各页会标明独立模拟样例。</p></section>`
   + driverIndex() + (data.simulation ? `<section class="panel replay-link"><div><h2>查看独立模拟回放</h2><p>按同一案例查看流量、订单事件，以及处理前后的模拟指标。</p></div><button class="secondary" data-page="replay">打开模拟回放 →</button></section>` : '');
 }

 function factorExample(sim, page) {
  const sections = { marketing:'campaigns', traffic:'traffic', conversion:'funnel', inventory:'inventory', fulfillment:'orders' };
  const note = {
   marketing:'缺少可与 Olist 商品匹配的投放活动记录。', traffic:'GA4 未授权，缺少可关联的渠道流量。',
   conversion:'缺少曝光、访问和加购事件，不能用订单量推算转化率。',
   inventory:'独立库存数据缺少与 Olist 商品匹配的业务主键。', fulfillment:'真实数据可查历史配送与评价。以下取消、退货和退款事件来自模拟样例。'
  };
  const section = `<section class="panel factor-coverage"><div class="row"><span class="badge ${page==='fulfillment'?'':'caution'}">Olist 证据</span><p>${note[page]}</p></div></section>`;
  if (!sim) return section;
  const template = document.createElement('template');
  template.innerHTML = Replay.chain(sim.chain).replace(/id="chain-/g, 'id="showcase-sim-chain-');
  const sample = template.content.querySelector('#showcase-sim-chain-' + sections[page]);
  if (sample && page==='conversion') sample.querySelector('details')?.setAttribute('open','');
  const chart = page==='traffic' ? M2.bi.pair('渠道访问量',sim.chain.channels.map(c=>({
   label:Replay.channels[c.channel],before:c.before.totals.visits,after:c.after.totals.visits
  })),{ note:'模拟到达访问次数 · 各渠道共用同一比例尺' })
   : page==='conversion' ? M2.bi.funnel(sim.chain.channels)
   : '';
  return section + `<div class="showcase-sim-chain" role="region" aria-label="独立模拟诊断">
   <p class="sample-meta"><span class="badge caution">独立模拟</span> ${esc(sim.chain.product)} · ${esc(windows(sim.periods))}</p>
   ${chart?`<section class="panel bi-panel">${chart}</section>`:''}
   ${sample?.outerHTML || ''}${page==='marketing'?marketingExample(sim):''}
   <div class="actions"><button class="secondary" data-showcase-source="simulation">向助手询问这个样例 →</button><button class="secondary" data-page="replay">查看回放与复核</button></div></div>`;
 }

 function sku(d, onlyFulfillment = false) {
  const r = d.contribution;
  const f = d.dimensions.fulfillment;
  return `<section class="panel">${onlyFulfillment ? '' : `<div class="row"><h2>选中商品的量价拆解</h2><span class="badge">Olist 真实历史</span></div>
   <p class="id">${esc(d.product_id)}</p>${M2.decomposition(d)}
   ${r.flags.includes('low_sample') ? '<p class="muted">样本量偏低。金额分解可以核对，业务原因还需要更多样本。</p>' : ''}
   <p class="id">商品证据 ${esc(r.evidence_id)}</p>`}
   <div id="showcase-real-fulfillment"><h2>关联订单履约与评价</h2><p class="id">商品 ${esc(d.product_id)}</p>
   ${f.periods?.length ? table([['周期', period], ['关联订单', p => p.distinct_orders], ['交运记录', p => p.carrier_recorded], ['延迟 / 有效已交付', p => p.late_orders + ' / ' + p.delivery_eligible + ' · ' + M2.percent(p.late_rate)], ['取消', p => p.canceled], ['不可用', p => p.unavailable], ['低评分 / 关联订单评价', p => p.related_order_low_score_count + ' / ' + p.related_order_review_count]], f.periods) : `<p>${esc(f.reason || '缺少该商品已核验的履约补充。')}</p>`}
   <p class="muted">相同商品的关联订单去重统计。评分对应订单，低评分、取消和退款是不同事件。</p>
   ${f.evidence_sha256 ? `<details><summary>履约补充哈希</summary><p class="id">${esc(f.evidence_sha256)}</p></details>` : ''}</div></section>`;
 }

 function assistant(simulation) {
  return `<section class="panel showcase-assistant" id="showcase-assistant">
   <div class="row"><h2>调查 Agent</h2><span id="showcase-agent-badge" class="badge">规则查询可用</span></div>
   <p>DeepSeek Agent 可针对问题选择证据、继续查证并给出调查建议。结果采用所选快照与商品数据。</p>
   <p id="showcase-agent-note" class="muted"></p>
   <form id="showcase-ask">
    <div class="showcase-controls"><label>调查方式<select name="mode"><option value="rules">规则查询</option><option value="agent" disabled>DeepSeek Agent</option></select></label><label>调查数据<select name="source"><option value="olist">Olist 真实历史</option>${simulation ? '<option value="simulation">独立模拟场景</option>' : ''}</select></label>
    <label hidden>渠道上下文<select name="channel"><option value="">全部渠道</option>${Object.entries(Replay.channels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label></div>
    <p id="showcase-context" class="muted id"></p>
    <div id="showcase-prompts" class="actions" aria-label="示例问题"></div>
    <label>你的问题<input name="question" placeholder="例如：选中商品的销量和价格分别贡献多少？" required maxlength="600"></label>
    <button type="submit">查询证据并回答</button> <button type="button" id="showcase-stop" class="secondary" hidden>停止调查</button>
    <p id="showcase-query-status" role="status" class="muted"></p>
   </form>
   <div id="showcase-dialogue" role="log" aria-label="调查问答" aria-live="polite"></div>
  </section>`;
 }

 function marketingExample(sim) {
  if (!sim.marketing?.length) return '';
  const [base,current] = ['before','after'].map(p=>sim.marketing.find(r=>r.period===p));
  return `<section class="panel"><h2>模拟广告投入与归因</h2>
    ${base&&current?M2.bi.pair('归因订单数',[{label:'归因订单',before:base.conversions,after:current.conversions}],{note:'独立模拟 · 归因订单来自已保存的渠道快照'}):''}
    ${table([['周期', period], ['广告曝光', r => num(r.impressions)], ['广告点击', r => num(r.clicks)], ['花费', r => money(r.spend_cents)], ['归因订单', r => num(r.conversions)], ['CTR', r => M2.percent(r.ctr)], ['ROAS', r => num(r.roas)]], sim.marketing)}
    <p class="muted">广告指标来自模拟广告字段。CTR 使用广告点击 / 广告曝光，ROAS 使用归因收入 / 花费；活动归因尚未验证增量效果。</p></section>`;
 }

 function simulated(sim) {
  const v = sim.verification;
  return `<section class="panel showcase-simulation" id="showcase-simulation">
   <span class="badge">独立模拟 · 非 Olist 经营实绩</span>
   <h2>较广泛下滑调查演练</h2>
   <p>模拟商品 ${esc(sim.chain.product)} · ${esc(windows(sim.periods))}</p>
   <p>全场景购买订单商品金额 ${money(sim.metrics.before.purchase_item_amount_cents)} → ${money(sim.metrics.after.purchase_item_amount_cents)}。可比商品 ${sim.scope.comparable} 个，${sim.scope.down} 个下滑；正向抵消 ${money(sim.scope.positive_cents)}。</p>
   <div id="showcase-sim-chain-scope"><p>先核对渠道访问变化，再看活动与分渠道漏斗。该场景包含访问相对稳定、下单率下降及订单事件的证据。</p></div>
   <div class="actions"><button type="button" class="secondary" data-showcase-source="simulation">向助手询问这个模拟商品</button><button class="secondary" data-page="traffic">查看模拟流量 →</button></div>
   <details><summary>模拟场景版本与证据</summary><p class="id">来源 ${esc(sim.source)}<br>版本 ${esc(sim.version)}<br>证据 ${esc(sim.evidence_hash)}<br>快照 ${esc(sim.snapshot_sha256)}</p></details>
  </section>
  <section class="panel showcase-simulation" id="showcase-effect"><h2>模拟处理后复核</h2>
  ${v ? `<p>已保存一项完成人工审核、行动记录与复核的模拟任务。比较执行前后两个不同快照。</p>
   ${M2.bi.pair('购买订单商品金额',[{label:'BRL',before:v.before.purchase_item_amount_cents,after:v.after.purchase_item_amount_cents}],
    {format:money,labels:['处理前','后续窗口']})}
   ${table([['指标', r => r[0]], ['处理前', r => r[1]], ['后续窗口', r => r[2]]], [
    ['比较窗口', pretty(sim.periods.at(-1)), pretty(v.after_period)],
    ['购买订单商品金额', money(v.before.purchase_item_amount_cents), money(v.after.purchase_item_amount_cents)],
    ['购买订单量', num(v.before.purchase_orders), num(v.after.purchase_orders)],
    ['商品件数', num(v.before.item_units), num(v.after.item_units)],
    ['配送延迟率', M2.percent(v.before.late_rate), M2.percent(v.after.late_rate)]
   ])}<p>观察到金额变化 ${money(v.delta_cents)}。这些变化只来自模拟回放，措施与变化之间没有因果验证。</p>
   <details><summary>处理前与后续版本</summary><p class="id">处理前 ${esc(v.before_version)}<br>后续 ${esc(v.after_version)}</p></details>` : '<p>当前没有已验证的后续模拟版本。状态为未复核。</p>'}
  </section>`;
 }

 function createConversation(data) {
  const template = document.createElement('template');
  template.innerHTML = assistant(data.simulation);
  const target = template.content.firstElementChild;
  const isCurrent = () => conversation?.panel === target;
  const form = target.querySelector('#showcase-ask');
  const status = target.querySelector('#showcase-query-status');
  const chat = target.querySelector('#showcase-dialogue');
  const stop = target.querySelector('#showcase-stop');
  const note = target.querySelector('#showcase-agent-note');
  const badge = target.querySelector('#showcase-agent-badge');
  let selected = data.real.products[0]?.key;
  const context = { olist: null, simulation: null };
  const history = { olist: [], simulation: [] };
  stop.onclick = () => activeRequest?.abort();
  if (!session.member) {
   note.innerHTML = '<button type="button" class="secondary" id="showcase-login-agent">登录使用 DeepSeek Agent</button> 规则查询可直接使用。';
   note.querySelector('button').onclick = () => {
    closeWidget(false);
    $('#login').hidden = false;
    $('#login-form [name=username]').focus();
   };
  } else {
   api('model').then(model => {
    if (!isCurrent()) return;
    if (model.provider === 'deepseek' && model.connected) {
     badge.textContent = 'DeepSeek 已连接 · ' + model.model;
     note.textContent = '使用 DeepSeek 时，本轮问题、近期追问与所选快照的查询摘要会发送到 DeepSeek。';
     form.elements.mode.querySelector('[value=agent]').disabled = false;
     form.elements.mode.value = 'agent';
    } else {
     badge.textContent = model.key_configured ? 'DeepSeek 待连接验证' : 'DeepSeek API Key 待配置';
     note.innerHTML = session.member.role === 'admin'
      ? '在<a href="/admin/#model">管理后台配置并测试 DeepSeek</a>，即可使用 Agent。'
      : '管理员通过 DeepSeek 连接测试后，业务账号即可使用 Agent。';
    }
   }).catch(() => { if (isCurrent()) note.textContent = '暂时无法核对模型状态，可继续使用规则查询。'; });
  }
  function refreshContext() {
   const source = form.elements.source.value;
   const sim = source === 'simulation';
   form.elements.channel.closest('label').hidden = !sim;
   form.elements.channel.value = context[source]?.channel || '';
   target.querySelector('#showcase-context').textContent = sim ? data.simulation.chain.product + ' · 模拟场景' : (selected || '等待商品证据') + ' · Olist 历史';
   target.querySelector('#showcase-prompts').innerHTML = prompts[source].map(q => `<button type="button" class="secondary" data-showcase-question="${esc(q)}">${esc(q)}</button>`).join('');
  }
  function selectProduct(id) {
   if (selected === id) return;
   selected = id;
   context.olist = null;
   history.olist = [];
   refreshContext();
  }
  form.elements.source.addEventListener('change', refreshContext);
  form.elements.channel.addEventListener('change', () => {
   context.simulation = { ...context.simulation, channel: form.elements.channel.value };
  });
  target.querySelector('#showcase-prompts').addEventListener('click', event => {
   const button = event.target.closest('[data-showcase-question]');
   if (!button) return;
   form.elements.question.value = button.dataset.showcaseQuestion;
   form.requestSubmit();
  });
  let busy = false;
  function showLatestReply() {
   if (!widget || widget.dialog.hidden || !widget.body.contains(chat)) return;
   const latest = chat.firstElementChild?.getBoundingClientRect();
   const viewport = widget.body.getBoundingClientRect();
   if (latest && latest.bottom > viewport.bottom) widget.body.scrollBy(0, latest.top - viewport.top - 12);
  }
  const cite = (fact, product) => `<a href="#${esc(fact.anchor)}" data-answer-product="${esc(product)}">${esc(fact.id ? fact.id + ' · ' + topics[fact.topic] : topics[fact.topic])}证据 ↗</a>`;
  const factHTML = (fact, product) => `<p>${esc(fact.text)} ${cite(fact, product)}</p>`;
  function summaryHTML(answer) {
   if (!answer.summary) return '<p class="muted">模型总结未通过引用检查，保留已核对的数据证据。</p>';
   const labels = { answer: '调查结论', uncertainty: '待验证与证据缺口', next_steps: '建议人工核查' };
   return Object.entries(labels).map(([key, label]) => answer.summary[key].length ? `<h3>${label}</h3>${answer.summary[key].map(row =>
    `<p>${esc(row.text)} ${row.refs.map(ref => cite(answer.facts.find(f => f.id === ref), answer.product)).join(' ')}</p>`).join('')}` : '').join('');
  }
  form.addEventListener('submit', async event => {
   event.preventDefault();
   event.stopPropagation();
   if (busy) return;
   const source = form.elements.source.value;
   const sim = source === 'simulation';
   const product = sim ? data.simulation.chain.product : selected;
   const question = form.elements.question.value.trim();
   if (!product) { status.textContent = '请先选择商品并等待读取证据。'; return; }
   if (!question) return;
   const agent = form.elements.mode.value === 'agent';
   const periods = sim ? data.simulation.periods : data.real.periods;
   let card, controller;
   busy = true;
   form.querySelector('[type="submit"]').disabled = true;
   status.textContent = '查询两期快照证据…';
   try {
    const payload = {
     source, question, product, version: sim ? data.simulation.version : data.real.version,
     channel: form.elements.channel.value, previous: context[source]
    };
    if (agent) {
     controller = new AbortController();
     activeRequest = controller;
     stop.hidden = false;
     chat.insertAdjacentHTML('afterbegin', `<article class="showcase-response">
      <p class="showcase-question">${esc(question)}</p><p class="muted agent-context">${sim ? '独立模拟' : 'Olist 真实历史'} · DeepSeek 调查中 · ${esc(product)}<br>${esc(windows(periods))}</p>
      <div class="agent-summary"></div><div class="agent-evidence"></div>
     </article>`);
     card = chat.firstElementChild;
    }
    const answer = agent ? await runAgent({ ...payload, previous_questions: history[source].slice(-4) }, controller.signal, event => {
     if (!isCurrent()) return;
     if (event.type === 'progress') status.textContent = event.text;
     if (event.type === 'evidence') card.querySelector('.agent-evidence').insertAdjacentHTML('beforeend', factHTML(event.fact, product));
    }) : await request('ask', payload);
    if (!isCurrent()) return;
    if (sim || selected === product) {
     context[source] = { topic: answer.topic, channel: answer.channel, product };
     history[source] = [...history[source].slice(-3), question];
    }
    const citations = `<details><summary>数据版本与引用</summary><p class="id">${esc(answer.version)}<br>${[...new Set(answer.facts.map(f => f.ref))].map(esc).join('<br>')}</p></details>`;
    if (agent) {
     card.querySelector('.agent-context').innerHTML = `${sim ? '独立模拟' : 'Olist 真实历史'} · DeepSeek Agent · ${esc(answer.model)} · ${esc(product)}<br>${esc(windows(answer.periods))}`;
     card.querySelector('.agent-summary').innerHTML = summaryHTML(answer);
     card.insertAdjacentHTML('beforeend', citations);
    } else chat.insertAdjacentHTML('afterbegin', `<article class="showcase-response">
     <p class="showcase-question">${esc(question)}</p><p class="muted">${sim ? '独立模拟' : 'Olist 真实历史'} · 规则查询 · ${esc(answer.product)}<br>${esc(windows(answer.periods))}</p>
     ${answer.facts.map(f => factHTML(f, product)).join('')}
     ${citations}
    </article>`);
    if (form.elements.question.value.trim() === question) form.elements.question.value = '';
    if (form.elements.source.value === source) refreshContext();
    status.textContent = '已返回引用，可继续追问。';
    showLatestReply();
   } catch (error) {
    if (!isCurrent()) return;
    status.textContent = controller?.signal.aborted ? '已停止调查。' : error.message;
    if (card) {
     card.querySelector('.agent-context').innerHTML = `${sim ? '独立模拟' : 'Olist 真实历史'} · DeepSeek 调查未完成 · ${esc(product)}<br>${esc(windows(periods))}`;
     card.querySelector('.agent-summary').textContent = '已返回的证据仍可点开。';
     showLatestReply();
    }
   } finally {
    if (activeRequest === controller) activeRequest = null;
    stop.hidden = true;
    busy = false;
    form.querySelector('[type="submit"]').disabled = false;
   }
  });
  chat.addEventListener('click', async event => {
   const link = event.target.closest('[data-answer-product]');
   if (!link) return;
   event.preventDefault();
   const hash = link.hash;
   closeWidget(false);
   try {
    const targetPage = evidencePages[hash] || 'drivers';
    if (!document.getElementById(hash.slice(1))) {
     if (workspace === 'real') await render(targetPage, {evidencePreview:true});
     else await switchWorkspace('real', targetPage, {evidencePreview:true});
    }
    if (/^#showcase-real-(sku|fulfillment)$/.test(hash)) await view?.choose(link.dataset.answerProduct, false);
    const section = document.getElementById(hash.slice(1));
    if (!section) throw Error('证据页暂时无法打开。');
    location.hash = hash;
    section.scrollIntoView({ block: 'start' });
    section.tabIndex = -1;
    section.focus({ preventScroll: true });
   } catch (error) {
    $('#message').textContent = error.message;
   }
  });
  refreshContext();
  return {
   panel: target,
   selectProduct,
   product: () => selected,
   selectSource(source) {
    if (form.elements.source.querySelector('[value="' + source + '"]')) {
     form.elements.source.value = source;
     refreshContext();
    }
   },
   focus: () => form.elements.question.focus()
  };
 }

 async function getData() {
  if (!storedData) storedData = request('overview').catch(error => { storedData = null; throw error; });
  return storedData;
 }

 function placeConversation() {
  if (!conversation) return;
  const home = view?.home;
  const destination = !widget.dialog.hidden || !home?.isConnected ? widget.body : home;
  if (conversation.panel.parentElement !== destination) destination.replaceChildren(conversation.panel);
 }

 function dismissTip() {
  widget.tip.hidden = true;
  sessionStorage.setItem('lens-assistant-tip-seen', '1');
 }

 async function openWidget(source) {
  dismissTip();
  widget.dialog.hidden = false;
  widget.button.setAttribute('aria-expanded', 'true');
  widget.close.focus();
  try {
   if (!conversation) widget.body.textContent = '正在读取可用的调查快照…';
   const data = await getData();
   if (widget.dialog.hidden) return;
   if (!conversation) {
    conversation = createConversation(data);
    conversation.selectSource(workspace === 'scenario' ? 'simulation' : 'olist');
   }
   if (source) conversation.selectSource(source);
   placeConversation();
   conversation.focus();
  } catch (error) {
   if (!widget.dialog.hidden) widget.body.textContent = error.message;
  }
 }

 function closeWidget(restoreFocus = true) {
  if (!widget || widget.dialog.hidden) return;
  widget.dialog.hidden = true;
  widget.button.setAttribute('aria-expanded', 'false');
  placeConversation();
  if (restoreFocus) widget.button.focus();
 }

 function pageChanged({ keepSource = false } = {}) {
  if (!widget) {
   const root = $('#showcase-widget');
   if (!root) return;
   widget = {
    root, tip: $('#showcase-widget-tip'), dialog: $('#showcase-float'), body: $('#showcase-float-content'),
    button: $('#showcase-launcher'), close: $('#showcase-float-close')
   };
   widget.button.onclick = () => widget.dialog.hidden ? openWidget() : closeWidget();
   widget.close.onclick = () => closeWidget();
   $('#showcase-tip-open').onclick = () => openWidget();
   $('#showcase-tip-dismiss').onclick = () => { dismissTip(); widget.button.focus(); };
   document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !event.defaultPrevented && !widget.dialog.hidden) { event.preventDefault(); closeWidget(); }
   });
  }
  widget.root.hidden = !session.local_showcase;
  widget.tip.hidden = widget.root.hidden || !widget.dialog.hidden || sessionStorage.getItem('lens-assistant-tip-seen') === '1';
  view = null;
  const currentIdentity = session.member?.subject || '';
  if (identity !== currentIdentity) {
   activeRequest?.abort();
   conversation?.panel.remove();
   conversation = null;
   closeWidget(false);
   identity = currentIdentity;
  }
  if (lastWorkspace !== workspace) {
   if (!keepSource) conversation?.selectSource(workspace === 'scenario' ? 'simulation' : 'olist');
   lastWorkspace = workspace;
  }
  placeConversation();
 }

 async function mount(target, isCurrent, page) {
  const data = await getData();
  if (!isCurrent()) return;
  const { real, simulation } = data;
  let html;
  if (page === 'overview') html = cockpit(real);
  else if (page === 'ai') html = '<div id="showcase-assistant-home"></div>';
  else if (page === 'monitor') html = monitorEvents(real.events || [], '历史窗口规则告警', {readOnly:true}) + contribution(real);
  else if (page === 'sku') html = productPicker(real, '从负向贡献商品开始');
  else if (page === 'drivers') html = factorHome(data);
  else if (page === 'replay') html = simulation ? simulated(simulation) +
   '<section id="showcase-sim-chain-limits" class="panel"><h2>证据缺口</h2><p>'+esc(simulation.chain.limits)+'</p></section>'
   : unavailable('模拟回放未就绪','当前本机没有可用的模拟快照。');
  else html = (page==='fulfillment' ? `<section class="panel bi-panel"><span class="badge">Olist 历史快照</span>
   ${M2.bi.fulfillment([real.metrics.before,real.metrics.after])}</section>`+productPicker(real,'查看 Olist 商品的关联订单') : '') + factorExample(simulation,page);
  target.innerHTML = (isDriver(page) ? driverTabs(page,true) : '') + html;

  conversation ||= createConversation(data);
  const slot = target.querySelector('#showcase-real-sku');
  const form = target.querySelector('#showcase-product-form');
  let selection = 0;
  async function choose(id, scroll) {
   if (!slot) { conversation.selectProduct(id); return; }
   const ticket = ++selection;
   slot.innerHTML = '<p class="muted">读取商品履约与量价证据…</p>';
   try {
    const evidence = await request('sku?product=' + encodeURIComponent(id));
    if (!isCurrent() || ticket !== selection) return;
    conversation.selectProduct(id);
    const select=form.elements.product;
    if (!Array.from(select.options).some(option=>option.value===id)) select.add(new Option(id,id));
    select.value=id;
    slot.innerHTML = sku(evidence,page==='fulfillment');
    if (scroll) slot.scrollIntoView({ block: 'start' });
   } catch (error) {
    if (isCurrent() && ticket === selection) slot.textContent = error.message;
   }
  }
  view = { home:target.querySelector('#showcase-assistant-home'), choose };
  placeConversation();
  if (form) form.addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();void choose(form.elements.product.value,false);});
  target.querySelectorAll('[data-showcase-sku]').forEach(b => b.onclick = async () => {
   const id=b.dataset.showcaseSku;
   conversation.selectProduct(id);
   await render('sku');
  });
  target.querySelectorAll('[data-showcase-source]').forEach(b=>b.onclick=()=>openWidget(b.dataset.showcaseSource));
  if (slot && conversation.product()) await choose(conversation.product(),false);
  if (isCurrent() && page==='ai' && widget.dialog.hidden) conversation.focus();
 }

 return { mount, pageChanged, selectProduct: id => conversation?.selectProduct(id) };
})();
