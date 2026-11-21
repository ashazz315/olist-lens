'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Cloud,Sessions,check,HttpError}=require('./lib/cloud.cjs');
const {Baseline}=require('./lib/baseline.cjs');
const {Imports,ImmutableFiles,computeExisting}=require('./lib/imports.cjs');
const {CloudFiles}=require('./lib/blob-cloud.cjs');
const Config=require('./lib/model-config.cjs'),W=require('../lib/investigation.cjs');
const {now}=require('../lib/util.cjs');
const Scenario=require('./lib/scenario.cjs'),Rules=require('./lib/rule-investigation.cjs');
const Agent=require('./lib/investigation-agent.cjs');
function createServer({env=process.env,cloud=new Cloud(env),repo:realRepo=cloud,scenarioRepo=new Scenario.ScenarioRepo(env),sessions=new Sessions(cloud),baseline=new Baseline(),files=env.LENS_DATABASE_TOKEN?new CloudFiles(cloud):new ImmutableFiles(env.LENS_BLOB_DIR||path.join(__dirname,'private/files')),compute,fetchFn=fetch,localReplay=false,scenarioFiles}={}){
 const importer=new Imports(realRepo,files),simFiles=scenarioFiles||(env.LENS_DATABASE_TOKEN?new CloudFiles(cloud):new ImmutableFiles(path.join(__dirname,'private/simulated/files')));if(simFiles.bucket)simFiles.bucket='olist-v21-simulated';const simImporter=new Scenario.ScenarioImports(scenarioRepo,simFiles),jobs=new Set(),models=new Set();
 const connected=()=>localReplay||!!env.LENS_DATABASE_TOKEN;
 const showcase=require('./lib/showcase.cjs').createShowcase(baseline);
 const run=async(id,actor,simulated=false)=>{check(!jobs.has(id),'Task is already executing',409);jobs.add(id);try{return await (simulated?simImporter:importer).run(id,actor,simulated?Scenario.computeIsolated:compute||((input)=>computeExisting(input,path.join(__dirname,'private/scratch'))));}finally{jobs.delete(id);}};
 const schedule=require('./lib/replay-schedule.cjs').create({repo:realRepo,scenarioRepo,importer:simImporter,run,enabled:localReplay});
 const origins=new Set((env.LENS_PUBLIC_ORIGIN||'').split(',').filter(Boolean));
 const loginAttempts=new Map(),agentRuns=new Set();
 const server=http.createServer(async(req,res)=>{
  const send=(status,value,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers});res.end(JSON.stringify(value));};
  try{
   const host=req.headers.host||'',local=/^(127\.0\.0\.1|localhost):\d+$/.test(host),origin=local?'http://'+host:env.LENS_PUBLIC_ORIGIN;
   check(local||origins.has('https://'+host),'Host not allowed',403);check(!req.headers.origin||req.headers.origin===origin,'Origin not allowed',403);
   const url=new URL(req.url,origin),route=url.pathname,mutating=['POST','PUT','PATCH','DELETE'].includes(req.method);
   const localShowcase=local&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)&&(localReplay||!connected());
   const demoAsk=route==='/api/v1/showcase/ask'&&req.method==='POST';
   const agentAsk=route==='/api/v1/showcase/agent'&&req.method==='POST';
   if(route.startsWith('/api/v1/showcase/'))check(localShowcase,'Not found',404);
   if(mutating){check(req.headers.origin===origin,'Same-origin header required',403);check((req.headers['content-type']||'').startsWith('application/json'),'JSON required',415);}
   const workspace=req.headers['x-lens-workspace']||'real';check(['real','scenario'].includes(workspace),'Unknown workspace');const simulated=workspace==='scenario',repo=simulated?scenarioRepo:realRepo;
   const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('lens_session='))?.slice(13);
   let preSession=null;
   if(mutating&&route!=='/api/v1/login'&&!demoAsk){preSession=await sessions.get(cookie);check(req.headers['x-csrf-token']===preSession.csrf,'CSRF token required',403);if(['/api/v1/imports','/api/v1/raw-files'].includes(route))check(preSession.member.role==='admin','Administrator permission required',403);}
   let body={};if(mutating){const limit=['/api/v1/imports','/api/v1/raw-files'].includes(route)?140*1024*1024:agentAsk?16384:route==='/api/v1/login'||demoAsk?4096:1024*1024;check(!req.headers['content-length']||Number(req.headers['content-length'])<=limit,'Request too large',413);let bytes=0,parts=[];for await(const p of req){bytes+=p.length;check(bytes<=limit,'Request too large',413);parts.push(p);}try{body=JSON.parse(Buffer.concat(parts).toString('utf8')||'{}');}catch{throw new HttpError(400,'Invalid JSON');}}
   if(route==='/api/v1/showcase/overview'&&req.method==='GET')return send(200,showcase.overview());
   if(route==='/api/v1/showcase/sku'&&req.method==='GET')return send(200,showcase.sku(url.searchParams.get('product')));
   if(demoAsk)return send(200,showcase.ask(body));
   if(route==='/api/v1/health')return send(200,{version:'2.1-M2',database:localReplay?'local_postgresql':connected()?'configured_not_probed':'not_configured',mode:'historical_replay',scheduler:connected()?'local_replay_worker':'disabled',engine_stability:'separate_acceptance_item'});
   if(route==='/api/v1/login'&&req.method==='POST'){const key=req.socket.remoteAddress,limit=loginAttempts.get(key)||{n:0,until:Date.now()+600000};if(limit.until<Date.now()){limit.n=0;limit.until=Date.now()+600000;}check(limit.n<10,'Too many login attempts',429);limit.n++;loginAttempts.set(key,limit);const value=await sessions.login(body.username,body.password);loginAttempts.delete(key);return send(200,{member:value.member,csrf:value.csrf},{'set-cookie':`lens_session=${value.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600${local?'':'; Secure'}`});}
   if(route==='/api/v1/session'&&req.method==='GET'){let session=null;if(cookie)try{session=await sessions.get(cookie);}catch{}return send(200,{member:session?.member||null,csrf:session?.csrf||null,storage:localReplay?'local_postgresql':connected()?'cloudbase_postgresql':'read_only_verified_baseline',write_available:connected()&&!!session,local_showcase:localShowcase,mode:'historical_replay',model:'not_connected_until_success',ga4:'authorization_required'});}
   if(route==='/api/v1/logout'&&req.method==='POST'){const s=await sessions.get(cookie);check(req.headers['x-csrf-token']===s.csrf,'CSRF token required',403);sessions.revoke(cookie);return send(200,{signed_out:true},{'set-cookie':'lens_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
   // Only the explicit baseline routes are accessible without sign-in on localhost.
   const preview=!connected()&&local&&req.method==='GET';
   if(localReplay&&mutating&&!simulated&&!agentAsk&&!['/api/v1/model','/api/v1/model/test'].includes(route))check(false,'本机真实历史快照为只读，请切换到模拟工作区',403);
   let session=preSession; if(route.startsWith('/api/v1/')){if(!preview){session ||=await sessions.get(cookie);if(mutating)check(req.headers['x-csrf-token']===session.csrf,'CSRF token required',403);}}
   const admin=()=>{check(session?.member.role==='admin','Administrator permission required',403);check(connected(),'Database credential not configured',503);};
   const actor=()=>{check(session?.member,'Authentication required',401);return session.member.subject;};
   const settings=async()=>Object.fromEntries((await realRepo.read('settings')).map(s=>[s.key,s.value]));
   if(agentAsk){
    const who=actor();
    const context=Agent.prepare(showcase,body);
    const config=(await settings()).model;
    check(config?.provider==='deepseek'&&config.secret&&config.connection_test?.success,'请在管理后台保存 DeepSeek API Key 并通过连接测试',409);
    check(!agentRuns.has(who)&&agentRuns.size<3,'正在进行调查，请等待当前请求完成',429);
    const cancel=new AbortController();
    res.once('close',()=>cancel.abort());
    const emit=event=>{if(!res.destroyed)res.write(JSON.stringify(event)+'\n');};
    agentRuns.add(who);
    res.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
    try{
     emit({type:'progress',text:'DeepSeek 正在选择本轮调查证据…'});
     const answer=await Agent.investigate({context,showcase,config,env,fetchFn,signal:cancel.signal,emit});
     emit({type:'answer',answer});
    }catch(error){emit({type:'error',error:error instanceof HttpError?error.message:'调查未完成，请检查模型配置或重试。'});}
    finally{agentRuns.delete(who);res.end();}
    return;
   }
   const currentVersion=async(source='olist')=>{const c=(await repo.read('current')).find(r=>r.source===source);return c?(await repo.read('versions',c.version_id))[0]:null;};
   const dataset=async(versionId=null)=>{if(localReplay&&!simulated){check(!versionId||versionId===baseline.load().version.id,'Unknown historical version',404);return baseline;}if(preview){check(!simulated,'模拟工作区需登录并连接数据库',401);return baseline;}const v=versionId?(await repo.read('versions',versionId))[0]:await currentVersion();if(versionId)check((await repo.read('jobs')).some(j=>j.version_id===versionId&&j.status==='succeeded'),'Version is not published',404);check(v,simulated?'尚无模拟版本，请在管理后台导入独立场景':'No published Olist version',404);const snapshot=await repo.read('snapshots',v.id);check(snapshot,'Missing metric snapshot',409);const b=new Baseline();b.loaded={version:v.content,analysis:snapshot.result};b.skuFile='';if(simulated)b.publishedEvents=(await repo.read('alerts',v.id)).map(r=>r.event);return b;};
   if(route==='/api/v1/scenario-template'&&req.method==='GET'){check(!preview,'Sign in required',401);return send(200,Scenario.fixture(url.searchParams.get('phase')||'decline'));}
   if(route==='/api/v1/products'&&req.method==='GET')return send(200,(await dataset()).products({page:url.searchParams.get('page')||1,limit:url.searchParams.get('limit')||50,query:url.searchParams.get('query')||'',sort:url.searchParams.get('sort')||'delta'}));
   if(route==='/api/v1/current'&&req.method==='GET'){check(!preview,'Sign in required',401);return send(200,await repo.read('current'));}
   if(route==='/api/v1/diagnostics'&&req.method==='GET'){const d=await dataset();return send(200,url.searchParams.get('product')?d.sku(url.searchParams.get('product')):d.diagnostics());}
   if(route==='/api/v1/overview'&&req.method==='GET')return send(200,(await dataset()).overview());
   if(route==='/api/v1/sku'&&req.method==='GET')return send(200,(await dataset()).sku(url.searchParams.get('product')));
   if(route==='/api/v1/evidence'&&req.method==='GET')return send(200,(await dataset(url.searchParams.get('version'))).evidence(url.searchParams.get('event'),url.searchParams.get('product')));
   if(route==='/api/v1/sources'&&req.method==='GET')return send(200,simulated?[{id:'independent_simulation',config:{is_synthetic:true,scenario_id:Scenario.ID,join_olist:false}}]:preview?[{id:'olist',config:{mode:'historical_replay',update:'manual_upload'}},{id:'inventory',config:{mode:'independent_retail',join_olist:false}},{id:'advertising',config:{mode:'independent_advertising',join_olist:false}},{id:'ga4',config:{status:'authorization_required',connected:false}}]:await repo.read('sources'));
   if(route==='/api/v1/external'&&req.method==='GET'){
    check(!simulated,'模拟维度请读取 diagnostics，不能混用独立真实来源');const source=url.searchParams.get('source');check(['inventory','advertising'].includes(source),'Unknown source');let v;
    if(preview){const root=path.resolve(__dirname,'../runtime/v');const candidates=fs.readdirSync(root).map(d=>{try{return JSON.parse(fs.readFileSync(path.join(root,d,'version.json'),'utf8'));}catch{return null;}}).filter(v=>v?.source===source);v=candidates.sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];}else v=(await currentVersion(source))?.content;
    check(v,'Source not imported',404);const kind=url.searchParams.get('kind')||source;check(source==='inventory'?['inventory','sales'].includes(kind):kind==='advertising','Source namespace mismatch');
    const A=require('../lib/adapters.cjs');return send(200,{version:v.id,source,summary:v.summary,join_olist:false,...A.browse(v,kind,{limit:40,product:url.searchParams.get('product')||undefined,negative:url.searchParams.get('negative')==='true'})});
   }
   if(route==='/api/v1/versions'&&req.method==='GET')return send(200,preview?[{id:baseline.load().version.id,source:'olist',quality:'verified',manifest:baseline.load().version.manifest,basis:'previously_verified_local_result'}]:(await repo.read('versions')).map(({content,...v})=>v));
   if(route==='/api/v1/raw-files'&&req.method==='POST'){admin();check(!localReplay,'本机验收仅允许模拟导入',403);check(!simulated,'Real raw files cannot enter simulation');return send(201,await require('./lib/raw-olist.cjs').upload(body,files,realRepo));}
   if(route==='/api/v1/imports'&&req.method==='POST'){admin();check(!localReplay||simulated,'本机验收仅允许模拟导入',403);return send(202,await (simulated?simImporter:importer).submit(body,actor()));}
   if(route==='/api/v1/jobs'&&req.method==='GET'){admin();return send(200,await repo.read('jobs'));}
   const jr=route.match(/^\/api\/v1\/jobs\/([\w-]+)\/(run|retry|cancel|publish|logs)$/);
   if(jr){admin();const [,id,op]=jr;if(op==='logs'&&req.method==='GET')return send(200,await repo.read('logs',id));check(req.method==='POST','POST required',405);if(op==='retry')return send(202,await (simulated?simImporter:importer).retry(id,actor()));if(op==='run'){run(id,actor(),simulated).catch(()=>{});return send(202,{id,status:'execution_requested'});}return send(200,await repo.command(op,{id,expected_current:body.expected_current??null},actor()));}
   if(route==='/api/v1/recover'&&req.method==='POST'){admin();return send(200,await repo.command('recover',{},actor()));}
   if(route==='/api/v1/restore'&&req.method==='POST'){admin();return send(200,await repo.command('restore',body,actor()));}
   if(route==='/api/v1/tasks'&&req.method==='GET')return send(200,preview?[]:await repo.read('tasks'));
   if(route==='/api/v1/tasks'&&req.method==='POST'){const b=await dataset(),pack=b.evidence(body.event_id,body.product_id);check(body.version===pack.version,'Version changed',409);const task=W.create(pack,{owner:body.owner||actor(),priority:body.priority||'normal'});task.identity=localReplay?'local_postgresql_role':'cloudbase_verified_subject';return send(201,await repo.command('task',{task},actor()));}
   const tr=route.match(/^\/api\/v1\/tasks\/([\w-]+)(?:\/(change|investigate|verify))?$/);
   if(tr){check(!preview,'Sign in to access investigations',401);const [,id,op]=tr,task=(await repo.read('tasks',id))[0];check(task,'Task not found',404);if(req.method==='GET'&&!op)return send(200,task);check(req.method==='POST','POST required',405);const who=actor();let next;
    if(op==='change')next=(simulated?Scenario.advance:W.advance)(task,{...body,actor:who});
    else if(op==='investigate'){check(!models.has(id),'Investigation already running',409);check(typeof body.question==='string'&&body.question.trim()&&body.question.length<=2000,'Question required');models.add(id);try{const cfg=(await settings()).model;const live=task.evidence.cards.some(c=>c.id==='E7')?(await dataset(task.version)).evidence(task.event_id,task.evidence.cards[2].value.product_id):task.evidence;check(live.hash===task.evidence_hash,'Investigation evidence hash mismatch',409);const report=body.mode==='rules'?Rules.investigate(live,body.question,{previous:task.reports.at(-1)?.query_context,channel:body.channel||null}):await Config.investigate(task.evidence,body.question,task.reports.map(r=>({question:r.question,answer:r.result})),cfg,env,fetchFn);next=structuredClone(task);next.reports.push(report);next.revision++;next.history.push({kind:'model_report',actor:who,report_id:report.id,at:now(),status:'pending_human_review'});}finally{models.delete(id);}}
    else if(op==='verify'){check(body.expected_revision===task.revision&&body.note?.trim(),'Revision and note required',409);const before=(await repo.read('versions',task.version))[0],after=await currentVersion(),bs=await repo.read('snapshots',before.id),as=after?await repo.read('snapshots',after.id):null;next=structuredClone(task);next.verification=(simulated?Scenario.verify:W.verify)(task,before.content,bs.result,after?.content,as?.result);next.revision++;next.history.push({kind:'verification',actor:who,note:body.note,at:now(),verification:next.verification});}
    else throw new HttpError(404,'Unknown task operation');return send(200,await repo.command('task',{task:next,expected_revision:task.revision},who));
   }
   if(route==='/api/v1/model'&&req.method==='GET'){return send(200,preview?Config.publicConfig(null):Config.publicConfig((await settings()).model));}
   if(route==='/api/v1/model'&&req.method==='POST'){admin();const previous=(await settings()).model;const value=Config.configure(body,env,previous);await realRepo.command('setting',{key:'model',value},actor());return send(200,Config.publicConfig(value));}
   if(route==='/api/v1/model/test'&&req.method==='POST'){admin();const value=(await settings()).model;const connection_test=await Config.testConnection(value,env,fetchFn);const latest=(await settings()).model;check(JSON.stringify(latest)===JSON.stringify(value),'Model configuration changed during test; retry',409);await realRepo.command('setting',{key:'model',value:{...value,connection_test}},actor());return send(200,connection_test);}
   if(route==='/api/v1/users'&&req.method==='GET'){admin();return send(200,await realRepo.read('users'));}
   if(route==='/api/v1/users'&&req.method==='POST'){admin();check(typeof body.subject==='string'&&body.subject.trim()&&['admin','analyst'].includes(body.role)&&typeof body.enabled==='boolean'&&body.display_name?.trim(),'Invalid membership');return send(200,await realRepo.command('user',body,actor()));}
   if(route==='/api/v1/audit'&&req.method==='GET'){admin();return send(200,await repo.read('audit'));}
   if(route==='/api/v1/schedule'){admin();check(localReplay,'请使用本机 PostgreSQL 回放入口',409);check(simulated,'调度仅用于模拟工作区',403);if(req.method==='GET')return send(200,await schedule.status());if(req.method==='POST')return send(200,await schedule.configure(body,actor()));}
   if(route==='/api/v1/report'&&req.method==='GET'){check(!preview,'Sign in to export',401);const Reports=require('./lib/reports.cjs'),taskId=url.searchParams.get('task'),task=taskId?(await repo.read('tasks',taskId))[0]:null;check(!taskId||task,'Unknown task',404);const b=await dataset(task?.version??null);check(url.searchParams.get('version')===b.load().version.id,'Published version changed; refresh before exporting',409);const format=url.searchParams.get('format'),value=Reports.bundle(b,task?[task]:await repo.read('tasks'));const {output}=await Reports.generate(value,format,env);res.writeHead(200,{'content-type':format==='html'?'text/html; charset=utf-8':format==='pdf'?'application/pdf':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','cache-control':'no-store','x-content-type-options':'nosniff','x-lens-version':value.version,'x-lens-snapshot':value.snapshot_sha256,'content-disposition':'attachment; filename="olist-'+value.version.slice(0,16)+'.'+format+'"'});fs.createReadStream(output).pipe(res);return;}
   if(route==='/api/v1/export'&&req.method==='GET'){check(!preview,'Sign in to export private investigation records',401);const b=await dataset();return send(200,{workspace,is_synthetic:simulated,version:b.load().version.id,overview:b.overview(),tasks:await repo.read('tasks'),exported_at:now(),causal_effect_confirmed:false},{'content-disposition':'attachment; filename="olist-investigations.json"'});}
   if(route.startsWith('/api/'))return send(404,{error:'Unknown endpoint'});
   check(req.method==='GET','Method not allowed',405);const relative=route==='/'?'index.html':route==='/admin/'?'admin.html':route.slice(1);
   check(['index.html','admin.html','app.js','m2.js','replay.js','showcase.js','style.css'].includes(relative),'Not found',404);const target=path.join(__dirname,'public',relative);
   res.writeHead(200,{'content-type':{'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}[path.extname(target)],'cache-control':'no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});fs.createReadStream(target).pipe(res);
  }catch(e){send(e.status||400,{error:e.message});}
 });
 server.once('listening',()=>schedule.start());
 server.once('close',()=>{void schedule.stop();});
 return {server,run,importer,close:async()=>{await schedule.stop();await new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeAllConnections();});}};
}
module.exports={createServer};
if(require.main===module){const app=createServer();app.server.listen(Number(process.env.LENS_PLATFORM_PORT||8792),'127.0.0.1',()=>console.log('Olist platform: http://127.0.0.1:'+(process.env.LENS_PLATFORM_PORT||8792)+' /admin/; historical baseline; no auto calculation'));}
