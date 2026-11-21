'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('../../.tools/node_modules/playwright-core');

async function main() {
 const base = process.argv[2] || 'http://127.0.0.1:8794';
 const output = path.resolve(process.argv[3] || path.join(__dirname, '../private/showcase-browser'));
 fs.mkdirSync(output, { recursive: true });
 const browser = await chromium.launch({
  executablePath: process.env.LENS_CHROMIUM || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true
 });
 const checks = [];
 const errors = [];
 const record = (name, data = {}) => checks.push({ name, ...data });
 const screenshot = (page, name) => page.screenshot({ path: path.join(output, name + '.png') });
 const watch = page => page.on('pageerror', error => errors.push(error.message));
 const business = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
 watch(business);
 const askInput = business.locator('#showcase-ask [name=question]');
 const answers = business.locator('#showcase-dialogue article');
 const floating = business.getByRole('dialog', { name: '调查助手' });
 const launcher = business.locator('#showcase-launcher');
 const sidebar = key => business.locator('#nav [data-page="'+key+'"]');
 async function ask(question) {
  const n = await answers.count();
  await askInput.fill(question);
  await business.locator('#showcase-ask [type=submit]').click();
  await answers.nth(n).waitFor();
  await business.waitForFunction(() => !document.querySelector('#showcase-ask [type=submit]').disabled);
  return answers.first();
 }
 async function login(page, username, password) {
  const result = await page.request.post(base + '/api/v1/login', {
   headers: { origin: base }, data: { username, password }
  });
  assert.equal(result.status(), 200);
 }

 try {
  await business.goto(base);
  await business.getByRole('heading', { name: '购买订单商品金额下降 12.3%' }).waitFor();
  const response = await business.request.get(base + '/api/v1/showcase/overview');
  assert.equal(response.status(), 200);
  const data = await response.json();
  assert.equal(data.real.metrics.before.purchase_item_amount_cents, 25895540);
  assert.equal(data.real.metrics.after.purchase_item_amount_cents, 22711315);
  assert.deepEqual(await business.locator('.cockpit-comparison meter').evaluateAll(els => els.map(m => m.value)),[25895540,22711315]);
  const trend=business.locator('.bi-trend');
  await trend.getByRole('heading',{name:'周度经营趋势'}).waitFor();
  const amountPane=trend.locator('[data-bi-view=purchase_item_amount_cents]');
  assert.deepEqual(await amountPane.locator('meter').evaluateAll(els=>els.map(m=>m.value)),
   data.real.trend.map(p=>p.purchase_item_amount_cents));
  await amountPane.locator('.bi-column').first().press('Enter');
  assert.equal(await amountPane.locator('strong[data-bi-number]').innerText(),'R$183,152.45');
  await trend.locator('select').selectOption('purchase_orders');
  const orderPane=trend.locator('[data-bi-view=purchase_orders]');
  assert.equal(await amountPane.isVisible(),false);
  assert.equal(await orderPane.locator('strong[data-bi-number]').innerText(),'1,633 单');
  await trend.locator('select').selectOption('purchase_item_amount_cents');
  await amountPane.locator('.bi-column').last().click();
  assert.equal(await business.locator('#content #showcase-simulation').count(), 0);
  record('cockpit trend reconciles all weekly totals; keyboard drill-down and measure switch', { version: data.real.version });
  await screenshot(business,'cockpit-desktop');

  await business.getByRole('button', { name: '查看异常监控 →' }).click();
  await business.getByRole('heading', { name: '历史窗口规则告警' }).waitFor();
  assert.equal(await business.locator('.monitor-events .event-card').count(),3);
  assert.match(await business.locator('#showcase-real-scope').innerText(), /110 个下滑/);
  const contribution=business.locator('.bi-contribution');
  const negatives=contribution.locator('[data-bi-view=decline]');
  const offsets=contribution.locator('[data-bi-view=offset]');
  const scale=await negatives.locator('meter').first().getAttribute('max');
  await contribution.locator('select').selectOption('offset');
  assert.equal(await offsets.isVisible(),true);
  assert.equal(await negatives.isVisible(),false);
  assert.equal(await offsets.locator('meter').first().getAttribute('max'),scale);
  assert.equal(await offsets.locator('meter').first().getAttribute('value'),String(data.real.scope.offset_rank[0].delta_cents));
  await contribution.locator('select').selectOption('decline');
  await business.locator('.event-card summary').first().click();
  assert.match(await business.locator('.event-card').first().innerText(), /相对门槛/);
  record('monitor combines alert evidence and switchable contribution ranking on one defined scale');
  await screenshot(business,'monitor-desktop');

  await business.locator('[data-showcase-sku]').first().click();
  await business.getByRole('heading', { name: '选中商品的量价拆解' }).waitFor();
  assert.match(await business.locator('#showcase-real-sku').innerText(), /4,038\.76/);
  assert.match(await business.locator('#showcase-real-fulfillment').innerText(), /关联订单履约与评价/);
  record('monitoring drills into product decomposition and verified fulfillment');

  await business.locator('#showcase-tip-open').click();
  await floating.waitFor();
  await business.waitForFunction(() => document.activeElement?.name === 'question');
  let first = await ask('这个商品的销量和价格分别贡献多少？');
  assert.match(await first.innerText(), /4,038\.76.*64\.14/);
  await business.locator('#showcase-product-form select').selectOption(data.real.products[1].key);
  await business.locator('#showcase-product-form button').click();
  await business.waitForFunction(product => document.querySelector('#showcase-real-sku').innerText.includes(product),data.real.products[1].key);
  await first.getByRole('link', { name: /商品量价证据/ }).click();
  await business.waitForFunction(product => document.querySelector('#showcase-real-sku').innerText.includes(product),data.real.products[0].key);
  assert.equal(await floating.isVisible(),false);
  assert.equal(new URL(business.url()).hash,'#showcase-real-sku');
  record('assistant citation restores the originating product');

  await sidebar('drivers').click();
  await business.getByRole('heading',{name:'Olist 证据覆盖'}).waitFor();
  assert.equal(await business.locator('#content .directory-card').count(),5);
  const sections = [
   ['marketing','showcase-sim-chain-campaigns'],['traffic','showcase-sim-chain-traffic'],
   ['conversion','showcase-sim-chain-funnel'],['inventory','showcase-sim-chain-inventory'],['fulfillment','showcase-sim-chain-orders']
  ];
  for(const [key,id] of sections){
   await business.locator('.subnav [data-page="'+key+'"]').click();
   const evidence=business.locator('#'+id);
   await evidence.waitFor();
   assert.match(await business.locator('.sample-meta').innerText(),/独立模拟/);
   assert.equal(await sidebar('drivers').getAttribute('aria-current'),'page');
   if(key==='traffic') assert.match(await business.locator('.bi-panel').innerText(),/420/);
   if(key==='conversion'){
    const funnel=business.locator('.bi-funnel');
    await funnel.locator('select').selectOption('paid_search');
    const panel=funnel.locator('[data-bi-view=paid_search]');
    assert.equal(await panel.isVisible(),true);
    const paid=data.simulation.chain.channels.find(row=>row.channel==='paid_search');
    const counts=await panel.locator('meter').evaluateAll(els=>els.slice(-2).map(m=>m.value));
    assert.deepEqual(counts,[paid.before.totals.orders,paid.after.totals.orders]);
    assert.equal(await business.locator('#showcase-sim-chain-funnel details[open]').getAttribute('data-funnel-channel'),'paid_search');
    await screenshot(business,'funnel-desktop');
   }
   if(key==='fulfillment') assert.match(await business.locator('.bi-panel').first().innerText(),/487 \/ 1,849 单.*396 \/ 1,598 单/);
  }
  await business.locator('.subnav [data-page=replay]').click();
  await business.locator('#showcase-effect').waitFor();
  assert.match(await business.locator('#showcase-effect').innerText(), /24,710\.00.*45,570\.00/s);
  record('driver dashboards reconcile simulated channel and funnel values and real delivery denominators');

  await business.locator('[data-showcase-source=simulation]').click();
  await floating.waitFor();
  first = await ask('付费搜索流量有什么变化？');
  assert.match(await first.innerText(), /付费搜索访问 420 → 420/);
  first = await ask('那漏斗哪一环变差？');
  assert.match(await first.innerText(), /付费搜索.*下单\/到达转化/);
  await first.getByRole('link', { name: /渠道漏斗证据/ }).click();
  await business.waitForURL('**/#showcase-sim-chain-funnel');
  await business.locator('#showcase-sim-chain-funnel').waitFor();
  assert.equal(await floating.isVisible(),false);
  await screenshot(business,'drivers-desktop');
  record('simulated channel follow-up opens the matching grouped evidence page', {version:data.simulation.version});

  await launcher.click();
  await floating.waitFor();
  await business.waitForFunction(() => document.activeElement?.name === 'question');
  await business.keyboard.press('Escape');
  assert.equal(await launcher.getAttribute('aria-expanded'),'false');
  await launcher.click();
  await floating.getByText('那漏斗哪一环变差？',{exact:true}).waitFor();
  await sidebar('reports').click();
  await business.getByRole('heading',{name:'登录后进入工作区'}).waitFor();
  assert.equal(await floating.isVisible(),true);
  await screenshot(business,'assistant-desktop');
  record('floating assistant has keyboard close and retains conversation across pages');

  const users=await business.request.get(base+'/api/v1/users');
  assert.equal(users.status(),401);
  const admin=await browser.newPage({ viewport:{width:1440,height:1000} });
  watch(admin);
  await admin.goto(base+'/admin/');
  await admin.getByRole('heading',{name:'登录后进入工作区'}).waitFor();
  if(process.argv[4]){
   const {adminPassword,analystPassword}=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));
   await login(admin,'local-admin',adminPassword);
   await admin.goto(base+'/admin/');
   await admin.getByRole('heading',{name:'来源与接入状态'}).waitFor();
   assert.match(await admin.locator('#content').innerText(),/待授权/);
   await screenshot(admin,'admin-sources-desktop');
   await admin.locator('#nav [data-page=versions]').click();
   await admin.getByRole('heading',{name:'不可变版本记录'}).waitFor();
   await admin.locator('.subnav [data-page=quality]').click();
   await admin.getByRole('heading',{name:'已保存的质量结论'}).waitFor();
   await admin.locator('.subnav [data-page=rules]').click();
   await admin.getByRole('heading',{name:'保留正式计算口径'}).waitFor();
   await admin.locator('#nav [data-page=imports]').click();
   await admin.getByRole('heading',{name:'完整快照上传'}).waitFor();
   await admin.locator('#nav [data-page=model]').click();
   assert.equal(await admin.locator('#model-form [name=model]').inputValue(),'deepseek-flash');
   await admin.locator('#nav [data-page=users]').click();
   await admin.getByRole('cell',{name:'local-admin',exact:true}).waitFor();
   await admin.locator('#nav [data-page=audit]').click();
   await admin.getByRole('heading',{name:'服务端审计日志'}).waitFor();
   await admin.locator('#workspace').selectOption('scenario');
   await admin.locator('#nav [data-page=schedule]').click();
   await admin.getByRole('heading',{name:'调度记录'}).waitFor();
   record('administrator sees sources, version and quality tabs, imports, model, users, audit and replay history');

   await login(business,'local-analyst',analystPassword);
   const current=await business.request.get(base+'/api/v1/current',{headers:{'x-lens-workspace':'scenario'}});
   assert.equal((await current.json()).find(v=>v.source==='olist').version_id,data.simulation.verification.after_version);
   assert.equal((await business.request.get(base+'/api/v1/users')).status(),403);
   await business.goto(base);
   await sidebar('monitor').click();
   await business.locator('.monitor-events [data-evidence]').first().click();
   await business.getByRole('heading',{name:'异常调查证据'}).waitFor();
   await sidebar('sku').click();
   await business.getByRole('heading',{name:'全部商品排名'}).waitFor();
   await sidebar('tasks').click();
   await business.getByRole('heading',{name:'调查与行动记录'}).waitFor();
   await sidebar('reports').click();
   await business.locator('#content [data-report=xlsx]').waitFor();
   record('analyst sees tasks and report formats on unchanged published version; admin API stays denied');
  }

  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true});
  watch(mobile);
  await mobile.goto(base);
  await mobile.getByRole('heading',{name:'购买订单商品金额下降 12.3%'}).waitFor();
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
  await screenshot(mobile,'cockpit-mobile');
  await mobile.locator('.bi-trend').screenshot({path:path.join(output,'trend-mobile.png')});
  await mobile.locator('#menu-toggle').click();
  await mobile.locator('#nav [data-page=drivers]').click();
  await mobile.getByRole('heading',{name:'Olist 证据覆盖'}).waitFor();
  assert.equal(await mobile.locator('#menu-toggle').getAttribute('aria-expanded'),'false');
  await mobile.locator('#showcase-tip-dismiss').click();
  await mobile.locator('#showcase-launcher').click();
  const bounds=await mobile.getByRole('dialog',{name:'调查助手'}).boundingBox();
  assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),390);
  await screenshot(mobile,'assistant-mobile');
  await mobile.setViewportSize({width:320,height:800});
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth),320);
  record('mobile navigation, cockpit and floating assistant fit the viewport');

  assert.deepEqual(errors,[]);
 } finally {
  await browser.close();
  fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({checks,browser_errors:errors},null,2));
 }
 console.log(JSON.stringify({passed:checks.length,output}));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
