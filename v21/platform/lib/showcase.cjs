'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { check } = require('./cloud.cjs');
const { answer: queryReplay } = require('./replay-evidence.cjs');
const { sha, stable } = require('../../lib/util.cjs');

const replayId = '1dee96c01e2c4e2964db90c44dde1b512b504538199a2abc4c5df8e9144ae398';
const replayFile = path.join(__dirname, '../private/replay-acceptance/2026-11-18T08-25-03-621Z/reports', replayId, 'report.json');
const brl = new Intl.NumberFormat('zh-CN', { currency: 'BRL', style: 'currency' });
const money = cents => cents == null ? '不适用' : brl.format(cents / 100);
const percent = value => value == null ? '不适用' : (value * 100).toFixed(2) + '%';
const comparison = periods => periods.filter(p => p.period === 'before' || p.period === 'after');
const dayMs = 86400000;

function followupPeriod(chain, diagnostics) {
 const previous = chain.periods.find(p => p.period === 'after');
 const start = Date.parse(previous.end);
 const duration = start - Date.parse(previous.start);
 const dates = new Set(diagnostics?.traffic?.daily?.map(r => r.date));
 const isoDate = ms => new Date(ms).toISOString().slice(0, 10);
 if (duration <= 0 || duration > 31 * dayMs || !Number.isFinite(duration)) return null;
 for (let ms = start; ms < start + duration; ms += dayMs) if (!dates.has(isoDate(ms))) return null;
 return { start: previous.end, end: isoDate(start + duration) };
}

function createShowcase(baseline) {
 let historical, simulation;

 function real() {
  if (historical) return historical;
  const o = baseline.overview();
  check(o.is_synthetic === false, '缺少已验证的 Olist 历史快照', 503);
  const { dataset_name, coverage_start, coverage_end, source_uri_or_description } = o.manifest;
  historical = {
   version: o.version, is_synthetic: false, periods: comparison(o.periods), metrics: o.metrics,
   delta_cents: o.delta_cents, scope: o.scope, product_count: o.product_count, reconciled: o.reconciled,
   trend: (o.trend || []).map(({ period, start, end, purchase_item_amount_cents, purchase_orders, item_units }) =>
    ({ period, start, end, purchase_item_amount_cents, purchase_orders, item_units })),
   engine: o.engine, event_count: o.events.length, evidence_id: o.events[0]?.evidence?.id ?? o.version,
   events: o.events.map(e => ({
    event_id:e.event_id, metric_label:e.metric_label, unit:e.unit, scope_type:e.scope_type,
    entity_id:e.entity_id, before:e.before, after:e.after, relative_change:e.relative_change,
    thresholds:e.thresholds, evidence:{id:e.evidence?.id, query:e.evidence?.query}
   })),
   source: { dataset_name, coverage_start, coverage_end, description: source_uri_or_description },
   products: o.products.filter(r => r.delta_cents < 0).slice(0, 12),
   dimensions: Object.fromEntries(Object.entries(o.dimensions).map(([key, rows]) =>
    [key, [...rows].sort((a, b) => a.delta_cents - b.delta_cents).slice(0, 3)]))
  };
  return historical;
 }

 function sku(product) {
  check(typeof product === 'string' && /^[a-f0-9]{32}$/.test(product), '请选择有效的 Olist 商品', 400);
  const data = baseline.sku(product);
  const supplement = data.dimensions.fulfillment;
  const fulfillment = {
   status: supplement.status, reason: supplement.reason, maturity: supplement.maturity,
   periods: supplement.periods?.map(p => ({
    period: p.period, distinct_orders: p.distinct_orders, delivery_eligible: p.delivery_eligible,
    late_orders: p.late_orders, late_rate: p.late_rate, carrier_recorded: p.carrier_recorded,
    canceled: p.canceled, unavailable: p.unavailable, related_order_review_count: p.related_order_review_count,
    related_order_low_score_count: p.related_order_low_score_count
   })),
   evidence_sha256: supplement.evidence?.sha256
  };
  return {
   version: data.version, product_id: data.product_id, contribution: data.contribution,
   dimensions: { ...data.dimensions, fulfillment }
  };
 }

 function simulated() {
  if (simulation) return simulation;
  if (!fs.existsSync(replayFile)) return null;
  const { report_id, ...report } = JSON.parse(fs.readFileSync(replayFile, 'utf8'));
  const { overview, evidence, source, snapshot_sha256, version } = report;
  const chain = evidence?.cards.find(c => c.id === 'E7')?.value;
  const marketing = evidence?.cards.find(c => c.id === 'E3')?.value.dimensions?.marketing;
  check(report_id === replayId && sha(stable(report)) === replayId && report.is_synthetic === true &&
   chain?.is_synthetic === true && version === evidence.version && version === overview.version &&
   source.source_uri_or_description === 'synthetic://gmv-drop-lab-v1',
   '模拟演示快照校验失败', 409);
  const result = report.tasks.find(task => task.status === 'closed' && task.version === version)?.verification;
  let verification = null;
  if (result?.status === 'simulated_observation' && result.is_synthetic === true && result.before_version === version) {
   verification = {
    status: result.status, before_version: result.before_version, after_version: result.after_version,
    before: result.before, after: result.after, delta_cents: result.delta_cents,
    after_period: followupPeriod(chain, result.after_diagnostics)
   };
  }
  simulation = {
   version, snapshot_sha256, evidence_hash: evidence.hash, is_synthetic: true, source: source.source_uri_or_description,
   periods: chain.periods, metrics: overview.metrics, scope: chain.scope, chain, marketing: marketing?.periods, verification
  };
  return simulation;
 }

 function overview() {
  const history = real();
  let replay = null, simulation_status = 'available';
  try { replay = simulated(); }
  catch { simulation_status = 'integrity_error'; }
  if (!replay && simulation_status === 'available') simulation_status = 'missing';
  return { real: history, simulation: replay, simulation_status };
 }

 function ask(input) {
  const { question, source, product, version, channel, previous } = input ?? {};
  check(typeof question === 'string' && question.trim() && question.length <= 600, '请输入 1 至 600 字的调查问题');
  if (source === 'simulation') {
   const replay = simulated();
   check(replay && replay.version === version && replay.chain.product === product, '模拟证据版本已变化，请刷新页面', 409);
   const allowedTopics = ['scope', 'traffic', 'campaigns', 'funnel', 'inventory', 'orders', 'limits'];
   const context = allowedTopics.includes(previous?.topic) ? { topic: previous.topic } : null;
   const response = queryReplay(question, replay.chain, context, channel || null);
   return {
    ...response, source, product, version, periods: replay.periods, mode: 'deterministic_rules',
    facts: response.facts.map(f => ({ topic: f.topic, text: f.text, anchor: 'showcase-sim-' + f.anchor, ref: replay.evidence_hash }))
   };
  }
  check(source === 'olist', '请选择调查的数据来源');
  const data = real();
  check(version === data.version, '历史证据版本已变化，请刷新页面', 409);
  const selected = sku(product);
  const { contribution: r, dimensions } = selected;
  const { before, after } = data.metrics;
  const scope = data.scope;
  const fulfillment = dimensions.fulfillment;
  const facts = [];
  const add = (topic, text, anchor, ref = data.evidence_id) => facts.push({ topic, text, anchor: 'showcase-' + anchor, ref });
  const metrics = () => add('metrics', `购买订单商品金额 ${money(before.purchase_item_amount_cents)} → ${money(after.purchase_item_amount_cents)}，变化 ${money(data.delta_cents)}（${percent(before.purchase_item_amount_cents ? data.delta_cents / before.purchase_item_amount_cents : null)}）。订单 ${before.purchase_orders} → ${after.purchase_orders}，件数 ${before.item_units} → ${after.item_units}。`, 'real-metrics');
  const distribution = () => {
   const top = scope.negative_rank[0];
   const ranking = top ? `负向第一为 ${top.product}，变化 ${money(top.delta_cents)}，占全部负向金额 ${percent(scope.top_share_of_gross_decline)}。` : '';
   add('scope', `${scope.comparable} 个可比商品中，${scope.down} 个下滑、${scope.up} 个上涨、${scope.flat} 个持平。${scope.new_or_disappeared} 个商品仅一侧有销量。下滑商品累计 ${money(scope.negative_cents)}，上涨商品抵消 ${money(scope.positive_cents)}。${ranking}`, 'real-scope');
  };
  const contribution = () => add('product', `选中商品贡献 ${money(r.delta_cents)}。件数 ${r.before.units} → ${r.after.units}，均价 ${money(r.before.avg_unit_price_cents)} → ${money(r.after.avg_unit_price_cents)}。数量效应 ${money(r.quantity_effect?.value_cents)}，价格效应 ${money(r.price_effect?.value_cents)}，组合效应 ${money(r.assortment_effect_cents)}。${r.flags.includes('low_sample') ? '样本量偏低。' : ''}`, 'real-sku', r.evidence_id);
  const delivery = () => {
   const text = fulfillment.periods?.map(p => `${p.period === 'before' ? '基期' : '当期'}延迟 ${p.late_orders}/${p.delivery_eligible} 单（${percent(p.late_rate)}），取消 ${p.canceled} 单，关联订单评价 ${p.related_order_review_count} 条，其中低评分 ${p.related_order_low_score_count} 条`).join('；');
   add('fulfillment', text ? text + '。评价属于订单层级；退款和退货缺少直接记录。' : fulfillment.reason || '证据不足：该商品没有已核验的履约补充。', 'real-fulfillment', fulfillment.evidence_sha256 || r.evidence_id);
  };
  const gaps = () => add('limits', '证据不足：Olist 没有可关联的渠道流量、商品活动、漏斗、库存、退货或退款观测，也没有后续处理快照。需求、价格、商品结构及覆盖变化仍需核查。页面上的模拟场景无法解释这起历史下滑。', 'real-limits');
  if (/整体|全店|GMV|订单量|多少金额/i.test(question)) metrics();
  if (/集中|多数|范围|分布|抵消|拖累|排名/.test(question)) distribution();
  if (/商品|SKU|销量|件数|均价|单价|价格|贡献/i.test(question) && !/集中|范围|分布|多数/.test(question)) contribution();
  if (/履约|发货|延迟|评价|取消|退款|退货|退单/.test(question)) delivery();
  if (/渠道|流量|搜索|广告|活动|转化|漏斗|库存|缺货|原因|效果|改善|证据|排除|解释|建议/.test(question)) gaps();
  if (!facts.length) {
   const continuation = { metrics, scope: distribution, product: contribution, fulfillment: delivery, limits: gaps };
   if (/继续|刚才|具体|详细|再说/.test(question) && Object.hasOwn(continuation, previous?.topic)) continuation[previous.topic]();
   else add('limits', '当前规则查询支持两期经营变化、商品贡献与量价、履约评价和证据缺口。请选一个指标或商品进一步查看。', 'real-limits');
  }
  return { source, product, version, periods: data.periods, mode: 'deterministic_rules', channel: null, topic: facts.at(-1).topic, facts };
 }

 function agentContext({ source, product, version }) {
  check(source === 'olist' || source === 'simulation', '请选择调查的数据来源');
  const data = source === 'olist' ? real() : simulated();
  check(data?.version === version && version, '证据版本已变化，请刷新页面', 409);
  if (source === 'olist') sku(product);
  else check(data.chain.product === product, '请选择当前模拟商品');
  return { source, product, version, periods: data.periods };
 }

 function lookup(context, topic, channel) {
  const queries = {
   metrics: '全店GMV和订单量', scope: '下滑范围', product: '销量和价格', fulfillment: '履约和评价',
   traffic: '渠道流量', campaigns: '活动', funnel: '漏斗', inventory: '库存', orders: '发货及退款', limits: '证据缺口'
  };
  if (context.source === 'simulation' && topic === 'verification') {
   const data = simulated();
   const v = data.verification;
   const range = v?.after_period ? v.after_period.start + ' 至 ' + v.after_period.end + '（不含）' : '未记录具体窗口';
   return {
    topic, anchor: 'showcase-effect', ref: data.evidence_hash,
    text: v ? `模拟处理前 ${money(v.before.purchase_item_amount_cents)}，后续 ${range} 为 ${money(v.after.purchase_item_amount_cents)}，变化 ${money(v.delta_cents)}。这是模拟前后快照观察，无法确认行动导致变化。` : '当前没有已核验的后续模拟快照。'
   };
  }
  return ask({ ...context, question: queries[topic], channel }).facts.find(fact => fact.topic === topic);
 }

 return { overview, sku, ask, agentContext, lookup };
}

module.exports = { createShowcase };
