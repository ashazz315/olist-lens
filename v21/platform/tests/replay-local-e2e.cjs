'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('../../.tools/node_modules/playwright-core'),{start}=require('../local-replay.cjs');
const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
process.env.LENS_PYTHON=path.join(runtime,'python/python.exe');
process.env.LENS_ARTIFACT_MODULE=path.join(runtime,'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs');
const root=path.resolve(__dirname,'../private/replay-acceptance');
const resume=process.argv[2];
assert(!resume||/^\d{4}-\d\d-\d\dT[0-9Z-]+$/.test(resume),'Use an existing replay acceptance directory name');
const dir=path.join(root,resume||new Date().toISOString().replace(/[:.]/g,'-'));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const checks=resume?JSON.parse(fs.readFileSync(path.join(dir,'receipt.json'),'utf8')).checks:[];
const record=(name,data={})=>{checks.push({name,...data});fs.writeFileSync(path.join(dir,'receipt.json'),JSON.stringify({checks},null,2));console.log(name);};
async function run(){
 let service=await start(dir,0),browser;
 try{
  const creds=JSON.parse(fs.readFileSync(path.join(dir,'local-accounts.json'),'utf8'));
  browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
  const adminContext=await browser.newContext({acceptDownloads:true}), analystContext=await browser.newContext({acceptDownloads:true});
  const admin=await adminContext.newPage(),business=await analystContext.newPage();
  const base=()=> 'http://127.0.0.1:'+service.port;
  const errs=[];for(const p of [admin,business])p.on('pageerror',e=>errs.push(e.message));
  async function login(page,user,password,route){
   await page.goto(base()+route);await page.locator('#login-toggle').click();
   await page.locator('[name=username]').fill(user);await page.locator('[name=password]').fill(password);
   await page.locator('#login-form button').click();
   await page.locator('#session-note').getByText(user,{exact:false}).waitFor();
   await page.locator('#workspace').selectOption('scenario');
  }
  async function api(page,route,body,expect=200){
   const session=await page.request.get(base()+'/api/v1/session');
   const {csrf}=await session.json();
   const r=await page.request.fetch(base()+'/api/v1/'+route,{method:body===undefined?'GET':'POST',headers:{origin:base(),'x-lens-workspace':'scenario','x-csrf-token':csrf||'','content-type':'application/json'},data:body});
   const result=await r.json();
   assert.equal(r.status(),expect,route+' '+JSON.stringify(result).slice(0,700));return result;
  }
  await login(admin,'local-admin',creds.adminPassword,'/admin/');
  await login(business,'local-analyst',creds.analystPassword,'/');
  async function persistAndExport({task:id,before,after,evidence},restarted){
   assert.equal((await api(business,'overview')).version,after);
   assert.equal((await api(business,'tasks/'+id)).status,'closed');
   const durable=await api(admin,'schedule');
   assert.equal(durable.enabled,false);
   assert(durable.history.some(r=>r.version_id===after&&r.status==='succeeded'));
   assert(durable.history.some(r=>r.status==='failed'));
   await business.reload();
   await business.locator('[data-page=tasks]').first().click();
   await business.locator('[data-task="'+id+'"]').click();
   record('restart, login and refresh persistence',{task:id,published:after,runs:durable.history.length,restarted});
   for(const format of ['html','pdf','xlsx']){
    const pending=business.waitForEvent('download',{timeout:60000});
    const response=business.waitForResponse(r=>r.url().includes('/api/v1/report?')&&r.url().includes('format='+format),{timeout:60000});
    await business.locator('[data-task-report][data-report='+format+']').click();
    const retrieved=await response;
    if(!retrieved.ok()){pending.catch(()=>{});throw Error(format+' export '+retrieved.status()+' '+await retrieved.text());}
    assert.equal(retrieved.headers()['x-lens-version'],before);
    const downloaded=await pending;
    await downloaded.saveAs(path.join(dir,'replay.'+format));
    assert.equal(await downloaded.failure(),null);
    record('browser download '+format,{file:'replay.'+format});
   }
   await business.screenshot({path:path.join(dir,'task-closed.png'),fullPage:true});
   assert.deepEqual(errs,[]);
   record('browser checks passed',{dir,task:id,evidence,before,after});
  }
  if(resume){
   const prior=checks.find(x=>x.name==='human review and simulated effect verification');
   const investigation=checks.find(x=>x.name==='six continuous evidence-backed queries and clickable details');
   await persistAndExport({...prior,evidence:investigation.evidence},'new service process and PostgreSQL reopened from disk');
   return;
  }
  await api(business,'schedule',{enabled:false},403);
  record('two browser entrances and PostgreSQL roles',{postgres:(await service.db.query('select version()')).rows[0].version});
  async function plan(config,phase,viaBrowser=false){
   const due=new Date(Date.now()+4500);
   if(viaBrowser){
    await admin.locator('[data-page=schedule]').first().click();
    await admin.locator('#schedule-form [name=config]').selectOption(config);
    await admin.locator('#schedule-form [name=phase]').selectOption(phase);
    const local=new Date(due.getTime()-due.getTimezoneOffset()*60000).toISOString().slice(0,19);
    await admin.locator('#schedule-form [name=due_at]').fill(local);
    await admin.locator('#schedule-form [value=yes]').click();
    await admin.getByText('已启用',{exact:false}).first().waitFor();
   }else await api(admin,'schedule',{enabled:true,config,phase,due_at:due.toISOString()});
   const state=await api(admin,'schedule');
   assert(state.next_run);return state;
  }
  async function waitCandidate(plan){
   let job,id=plan.id,retried=false;
   for(let i=0;i<70;i++){
    const state=await api(admin,'schedule');
    job=state.history.find(j=>j.id===id);
    if(job?.status==='awaiting_confirmation')break;
    if(job?.status==='failed'&&!retried&&/3221225477/.test(job.error?.message)){
     const original=id;
     const retry=await api(admin,'jobs/'+id+'/retry',{},202);
     assert.equal(retry.retry_of,original);
     id=retry.id;retried=true;
     await api(admin,'jobs/'+id+'/run',{},202);
     record('retried one failed replay with original immutable request',{original,retry:id,due_at:job.due_at});
     continue;
    }
    if(state.failure||['failed','interrupted'].includes(job?.status))throw Error(JSON.stringify(state.failure||job));
    await delay(300);
   }
   assert.equal(job?.status,'awaiting_confirmation');assert(Date.parse(job.started_at)>=Date.parse(plan.due_at));
   const rows=await service.db.scenarioRepo.read('alerts',job.version_id);assert.equal(rows.length,0);
   return job;
  }
  async function approve(job,previous){
   await api(business,'jobs/'+job.id+'/publish',{expected_current:previous},403);
   await admin.locator('[data-page=imports]').first().click();
   admin.once('dialog',d=>d.accept());
   await admin.locator('[data-job="'+job.id+'"][data-op="publish"]').click();
   for(let i=0;i<20;i++){
    const current=await api(admin,'current');
    if(current[0]?.version_id===job.version_id)break;
    await delay(200);
   }
   const o=await api(business,'overview');assert.equal(o.version,job.version_id);
   assert.equal((await api(admin,'current'))[0].version_id,o.version);
   return o;
  }
  const p1=await plan('concentrated','decline',true);
  const j1=await waitCandidate(p1);
  assert.deepEqual(await api(business,'current'),[]);
  const concentrated=await approve(j1,null);
  assert.equal(concentrated.scope.classification,'concentrated');
  assert.equal(concentrated.scope.down,1);assert(concentrated.scope.positive_cents>0);
  const first=(await api(business,'sku?product=SIM-COFFEE')).replay, second=(await api(business,'sku?product=SIM-MUG')).replay;
  assert.equal(first.campaigns[0].exit_reason,'campaign_ended');assert.equal(second.campaigns[0].exit_reason,'product_exited');
  assert(first.channels[1].delta.visits<0);assert(second.channels[1].delta.visits<0);
  assert(concentrated.events.some(e=>e.scope_type==='shop'&&e.metric_id==='amount_cents'));
  record('due trigger, invisible candidate, approval and automatic concentrated alerts',{job:j1,classification:concentrated.scope,alerts:concentrated.events.length});
  const p2=await plan('broad','decline'),j2=await waitCandidate(p2);
  assert.equal((await api(business,'overview')).version,j1.version_id);
  // A genuinely due slot is rejected while the validated candidate occupies its dataset.
  const failurePlan=await plan('concentrated','followup');
  for(let i=0;i<40;i++){if((await api(admin,'schedule')).failure)break;await delay(300);}
  const failed=await api(admin,'schedule');assert(failed.failure);
  assert.equal((await api(business,'overview')).version,j1.version_id);
  record('failed due slot retained effective version',{slot:failurePlan.id,failure:failed.failure});
  const broad=await approve(j2,j1.version_id),oldAlerts=(await service.db.scenarioRepo.read('alerts',broad.version)).length;
  await business.locator('#content').getByText('版本 '+broad.version,{exact:true}).first().waitFor();
  assert(oldAlerts>0);
  assert.equal(broad.scope.classification,'broad');assert.equal(broad.scope.down,4);
  await api(admin,'jobs/'+j2.id+'/publish',{expected_current:broad.version},400);
  assert.equal((await service.db.scenarioRepo.read('alerts',broad.version)).length,oldAlerts);
  const evt=broad.events.find(e=>e.scope_type==='shop'&&e.metric_id==='amount_cents');assert(evt);
  await business.locator('[data-evidence="'+evt.event_id+'"]').click();
  await business.locator('#chain-traffic').waitFor();
  await business.locator('#chain-product-form select').selectOption('SIM-COFFEE');
  await business.locator('#chain-product-form button').click();
  await business.locator('#chain-orders details').first().locator('summary').click();
  await business.getByText('退款',{exact:true}).first().waitFor();
  const pack=await api(business,'evidence?event='+evt.event_id+'&product=SIM-COFFEE');
  const chain=pack.cards.find(c=>c.id==='E7').value;
  assert(chain.channels.every(c=>c.delta.visits===0&&c.after.ratios.order_conversion.value<c.before.ratios.order_conversion.value));
  assert.deepEqual(new Set(chain.orders.flatMap(o=>o.events.map(e=>e.type))),new Set(['ordered','dispatch_delayed','delivered','returned','refunded','canceled']));
  assert.equal(chain.inventory[0].on_hand,0);
  await business.screenshot({path:path.join(dir,'investigation.png'),fullPage:true});
  record('broad scope, traffic, funnel, inventory, related-order events and publish idempotence',{version:broad.version,alert_count:oldAlerts,evidence:pack.hash,product:chain.product});
  await business.locator('#create-task').click();
  await business.locator('#ask-form').waitFor();
  let task=(await api(business,'tasks'))[0];assert.equal(task.evidence_hash,pack.hash);
  const id=task.id;
  const change=async request=>{task=await api(business,'tasks/'+id+'/change',{note:'人工模拟验收记录',expected_revision:task.revision,...request});};
  await change({kind:'transition',to:'investigating'});
  const questions=['这次下降是否较广泛，涉及多少商品？','自然搜索和付费搜索各减少多少？','对应活动结束了还是商品退出？','漏斗哪个环节变差？','有没有缺货、发货异常和退款？','还有哪些解释没有排除？'];
  for(const question of questions){
   task=await api(business,'tasks/'+id+'/investigate',{mode:'rules',question});
   const report=task.reports.at(-1);assert.equal(report.evidence_hash,pack.hash);assert.equal(report.query_context.product,'SIM-COFFEE');
   assert(report.result.confirmed_facts.every(f=>f.evidence_ids.includes('E7')&&f.anchor));
  }
  await business.locator('[data-page=tasks]').first().click();
  await business.locator('[data-task="'+id+'"]').click();
  await business.getByText('打开对应证据',{exact:true}).first().click();
  assert((await business.evaluate(()=>location.hash)).startsWith('#chain-'));
  record('six continuous evidence-backed queries and clickable details',{task:id,evidence:pack.hash,queries:task.reports.map(r=>r.query_context.topic),model_configured:(await api(business,'model')).key_configured});
  await api(business,'tasks/'+id+'/change',{kind:'transition',to:'action_pending',note:'test gate',expected_revision:task.revision},400);
  await change({kind:'review',decision:'approved',cause:'人工确认模拟观察，保留活动、转化、库存与履约的不同解释',evidence_ids:['E7']});
  await change({kind:'transition',to:'action_pending'});
  await change({kind:'action',action:'在独立模拟场景补货并检查履约',due_at:new Date(Date.now()+86400000).toISOString()});
  await change({kind:'transition',to:'executing'});
  await change({kind:'execution',reference:'SYNTHETIC-REPLAY-OPERATOR-RECEIPT'});
  await change({kind:'transition',to:'verification_pending'});
  task=await api(business,'tasks/'+id+'/verify',{expected_revision:task.revision,note:'核对更新前的状态'});
  assert.equal(task.verification.status,'unverified');
  const follow=await waitCandidate(await plan('broad','followup'));
  assert.equal((await api(business,'overview')).version,broad.version);
  await approve(follow,broad.version);
  task=await api(business,'tasks/'+id+'/verify',{expected_revision:task.revision,note:'基于后续模拟快照，不主张因果'});
  assert.equal(task.verification.status,'simulated_observation');assert.equal(task.verification.before_version,broad.version);assert.equal(task.verification.after_version,follow.version_id);
  await change({kind:'transition',to:'closed',evidence_ids:['E7']});
  await api(admin,'schedule',{enabled:false});
  record('human review and simulated effect verification',{task:id,before:broad.version,after:follow.version_id,status:task.status});
  // Close and reopen actual PostgreSQL from the same disk directory; sessions are re-authenticated.
  const port=service.port;await service.close();service=await start(dir,port);
  await adminContext.clearCookies();await analystContext.clearCookies();
  await login(admin,'local-admin',creds.adminPassword,'/admin/');
  await login(business,'local-analyst',creds.analystPassword,'/');
  await persistAndExport({task:id,evidence:pack.hash,before:broad.version,after:follow.version_id},'HTTP service and PostgreSQL reopened from disk');
 }catch(error){record('failure',{message:error.message,stack:error.stack});throw error;}
 finally{if(browser)await browser.close();await service.close();}
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
