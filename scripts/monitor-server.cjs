// Authenticated, disabled-by-default scheduler configuration interface. No polling timers.
'use strict';
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),path=require('node:path');
function handler({token,sources=['olist-manual'],repository,updateService=null}){
 if(typeof token!=='string'||token.length<32)throw Error('MONITOR_API_TOKEN must contain at least 32 characters');
 if(!repository)throw Error('Persistent schedule repository required');
 const authorized=req=>{const a=Buffer.from(req.headers.authorization||''),b=Buffer.from('Bearer '+token);return a.length===b.length&&crypto.timingSafeEqual(a,b);};
 return async(req,res)=>{
  const send=(code,body)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
  if(!authorized(req))return send(401,{error:'unauthorized'});
  try{const pathname=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&pathname==='/monitoring/capabilities')return send(200,{modes:['historical_replay','manual_snapshot'],scheduler_enabled:false,source_adapter_connected:false,durable_queue_connected:!!updateService,reason:'No sustainable source adapter or scheduler is installed',sources});
   if(pathname.startsWith('/schedules/')){
    const source=decodeURIComponent(pathname.slice('/schedules/'.length));if(!sources.includes(source))return send(404,{error:'unknown_source'});
    if(req.method==='GET')return send(200,repository.get(source)||{source_id:source,enabled:false,cron:'0 2 * * *',timezone:'Asia/Shanghai',version:0});
    if(req.method!=='PUT')return send(405,{error:'method_not_allowed'});
    const body=await readJSON(req);if(body.enabled!==false)return send(409,{error:'source_adapter_and_scheduler_not_connected'});
    if(Object.keys(body).some(k=>!['enabled','cron','timezone','expected_version'].includes(k)))return send(400,{error:'unknown_configuration_field'});
    // Narrow portable subset; only an interface contract, never advertised as a cron engine.
    const ranges=[59,23,31,12,6],parts=String(body.cron||'').split(' ');
    if(parts.length!==5||parts.some((p,i)=>p!=='*'&&(!/^\d+$/.test(p)||+p>(ranges[i])||+p<([2,3].includes(i)?1:0))))return send(400,{error:'invalid_cron_subset'});
    try{new Intl.DateTimeFormat('en',{timeZone:body.timezone}).format();if(typeof body.timezone!=='string')throw Error();}catch(_){return send(400,{error:'invalid_timezone'});}
    const existing=repository.get(source);if(body.expected_version!==(existing?.version||0))return send(409,{error:'configuration_version_conflict'});
    const config={source_id:source,enabled:false,cron:body.cron,timezone:body.timezone,version:(existing?.version||0)+1,updated_at:new Date().toISOString()};repository.put(source,config);return send(200,config);
   }
   if(pathname==='/update-jobs'&&req.method==='POST'){
    if(!updateService)return send(503,{error:'durable_update_service_not_connected',scheduler_enabled:false});
    const body=await readJSON(req);if(!sources.includes(body.source_id)||Object.keys(body).some(k=>!['source_id','batch_reference'].includes(k)))return send(400,{error:'invalid_source_or_fields'});
    const key=req.headers['idempotency-key'];if(!key||key.length>200)return send(400,{error:'idempotency_key_required'});
    return send(202,await updateService.submit({source_id:body.source_id,batch_reference:body.batch_reference,idempotency_key:key}));
   }
   const match=pathname.match(/^\/update-jobs\/([a-zA-Z0-9_-]+)(\/retry)?$/);
   if(match){if(!updateService)return send(503,{error:'durable_update_service_not_connected'});if(req.method==='GET'&&!match[2])return send(200,await updateService.get(match[1]));if(req.method==='POST'&&match[2])return send(202,await updateService.retry(match[1]));}
   send(404,{error:'not_found'});
  }catch(e){send(e.status||500,{error:e.status?e.message:'request_failed'});}
 };
}
async function readJSON(req){let n=0,parts=[];for await(const chunk of req){n+=chunk.length;if(n>16384)throw Object.assign(Error('body_too_large'),{status:413});parts.push(chunk);}try{return JSON.parse(Buffer.concat(parts).toString('utf8'));}catch(_){throw Object.assign(Error('invalid_json'),{status:400});}}
function fileRepository(file){let state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{};return {get:id=>state[id],put(id,value){const next={...state,[id]:value};fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,JSON.stringify(next,null,2));fs.renameSync(temp,file);state=next;}};}
module.exports={handler,fileRepository};
if(require.main===module){const repo=fileRepository(path.resolve(process.env.MONITOR_STATE_FILE||'tmp/monitor-schedules.json')),server=http.createServer(handler({token:process.env.MONITOR_API_TOKEN,repository:repo}));server.listen(Number(process.env.PORT||8788),'127.0.0.1',()=>console.log('Scheduler contract API on localhost; scheduler DISABLED; no source connected'));}
