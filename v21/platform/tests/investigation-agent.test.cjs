'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createServer } = require('../server.cjs');

// Synthetic test data and provider responses. No real model request or database write.
test('DeepSeek investigation queries evidence, streams it before the final answer, and respects roles', async t => {
 const env = { LENS_SECRET_KEY: 'a'.repeat(64) };
 const version = 'b'.repeat(64), product = 'c'.repeat(32);
 const row = {
  key: product, delta_cents: -100, before: { amount_cents: 200, units: 2 }, after: { amount_cents: 100, units: 1 },
  flags: [], assortment_effect_cents: 0, evidence_id: 'SYNTHETIC-SKU'
 };
 const baseline = {
  overview: () => ({
   version, is_synthetic: false, manifest: { dataset_name: 'SYNTHETIC TEST' }, periods: [],
   metrics: { before: { purchase_item_amount_cents: 200, purchase_orders: 2, item_units: 2 },
    after: { purchase_item_amount_cents: 100, purchase_orders: 1, item_units: 1 } },
   delta_cents: -100, products: [row], dimensions: {}, events: [], scope: {}
  }),
  sku: () => ({ product_id: product, version, contribution: row, dimensions: { fulfillment: { status: 'not_materialized' } } })
 };
 let settings;
 const repo = {
  read: async kind => kind === 'settings' && settings ? [{ key: 'model', value: settings }] : [],
  schedule: async () => null,
  async command(op, data) { assert.equal(op, 'setting'); settings = data.value; }
 };
 const sessions = {
  async get(cookie) {
   if (!['admin', 'analyst'].includes(cookie)) throw Object.assign(Error('Please sign in'), { status: 401 });
   return { member: { role: cookie, subject: cookie }, csrf: 'SYNTHETIC-CSRF' };
  }
 };
 const requests = [];
 const release = Promise.withResolvers();
 t.after(() => release.resolve());
 const fetchFn = async (url, options) => {
  assert.equal(url, 'https://api.deepseek.com/chat/completions');
  assert.equal(options.headers.authorization, 'Bearer SYNTHETIC-KEY');
  const data = JSON.parse(options.body);
  assert.equal(data.thinking.type, 'disabled');
  if (!data.tools) return Response.json({ choices: [{ message: { content: 'OK' } }] });
  requests.push(data);
  if (requests.length % 2 === 1) return Response.json({ choices: [{
   finish_reason: 'tool_calls', message: { tool_calls: [
    { id: 'forged', type: 'function', function: { name: 'write_database', arguments: '{}' } },
    { id: 'sku', type: 'function', function: { name: 'read_evidence', arguments: '{"topic":"product"}' } }
   ] }
  }] });
  const results = data.messages.filter(m => m.role === 'tool').map(m => JSON.parse(m.content));
  assert.equal(results[0].error, '只允许查询当前快照中已列出的只读证据主题。');
  assert.match(results[1].text, /R\$1\.00/);
  assert.equal(results[1].id, 'R1');
  await release.promise;
  return Response.json({ choices: [{
   finish_reason: 'stop', message: { content: JSON.stringify({
    answer: [{ text: requests.length === 2 ? '虚构营业额999' : '选中商品销量下降。', refs: ['R1'] }],
    uncertainty: [], next_steps: []
   }) }
  }] });
 };
 const app = createServer({ repo, sessions, baseline, env, fetchFn, localReplay: true });
 await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
 t.after(() => app.close());
 const base = 'http://127.0.0.1:' + app.server.address().port;
 const post = (route, body, role) => fetch(base + '/api/v1/' + route, {
  method: 'POST', headers: { origin: base, 'content-type': 'application/json',
   'x-csrf-token': 'SYNTHETIC-CSRF', ...(role ? { cookie: 'lens_session=' + role } : {}) }, body: JSON.stringify(body)
 });
 const payload = { source: 'olist', version, product, question: '为什么这个商品销售下降？', previous_questions: ['全店金额变化如何？'] };
 const model = { provider: 'deepseek', base_url: 'https://api.deepseek.com', model: 'deepseek-flash',
  api_key: 'SYNTHETIC-KEY', max_tokens: 512, temperature: 0, timeout_ms: 5000 };
 assert.equal((await post('showcase/agent', payload)).status, 401);
 assert.equal((await post('showcase/agent', payload, 'analyst')).status, 409);
 assert.equal((await post('model', model, 'analyst')).status, 403);
 const saved = await post('model', model, 'admin');
 assert.equal(saved.status, 200);
 assert.doesNotMatch(await saved.text(), /SYNTHETIC-KEY/);
 assert.doesNotMatch(JSON.stringify(settings), /SYNTHETIC-KEY/);
 assert.equal((await post('model/test', {}, 'admin')).status, 200);
 assert.equal((await post('showcase/agent', { ...payload, version: 'wrong' }, 'analyst')).status, 409);
 assert.equal(requests.length, 0);
 const stream = await post('showcase/agent', payload, 'analyst');
 assert.equal(stream.status, 200);
 assert.match(stream.headers.get('content-type'), /^application\/x-ndjson/);
 const reader = stream.body.pipeThrough(new TextDecoderStream()).getReader();
 let buffer = '';
 while (!buffer.includes('"type":"evidence"')) {
  const { value, done } = await reader.read();
  assert.equal(done, false);
  buffer += value;
 }
 assert.doesNotMatch(buffer, /"type":"answer"/);
 assert.match(buffer, /SYNTHETIC-SKU/);
 assert.equal((await post('showcase/agent', payload, 'analyst')).status, 429);
 release.resolve();
 for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  buffer += value;
 }
 const result = buffer.trim().split('\n').map(JSON.parse).at(-1);
 assert.equal(result.type, 'answer');
 assert.equal(result.answer.mode, 'deepseek_agent');
 assert.equal(result.answer.summary, null);
 assert.equal(result.answer.facts[0].ref, 'SYNTHETIC-SKU');
 assert.doesNotMatch(buffer, /999|SYNTHETIC-KEY/);
 const followup = await post('showcase/agent', { ...payload, question: '再看销量。' }, 'analyst');
 const valid = (await followup.text()).trim().split('\n').map(JSON.parse).at(-1);
 assert.equal(valid.answer.summary.answer[0].text, '选中商品销量下降。');
 assert.match(requests[2].messages[1].content, /全店金额变化如何/);
});
