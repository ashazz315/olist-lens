'use strict';
const crypto=require('node:crypto');
const {check}=require('./cloud.cjs');
const Scenario=require('./scenario.cjs');

function create({repo,scenarioRepo,importer,run,enabled,interval=1000,onError=console.error}){
 const load=()=>repo.schedule();
 const save=(value,actor)=>repo.schedule(value,actor);
 let work=Promise.resolve(),timer;
 const serialize=fn=>{const result=work.then(fn);work=result.catch(()=>{});return result;};
 function configure(input,actor){
  return serialize(async()=>{
   const previous=await load();
   check(typeof input.enabled==='boolean','请选择启用或停用');
   if(!input.enabled){await save({...previous,enabled:false},actor);return status();}
   check(Scenario.REPLAY_CONFIGS.includes(input.config)&&['decline','followup'].includes(input.phase),'无效回放配置');
   const time=Date.parse(input.due_at);
   check(Number.isFinite(time)&&time>Date.now(),'请选择未来的运行时间');
   const due_at=new Date(time).toISOString();
   const key=crypto.createHash('sha256').update(JSON.stringify([input.config,input.phase,due_at])).digest('hex');
   const id=key.slice(0,8)+'-'+key.slice(8,12)+'-'+key.slice(12,16)+'-'+key.slice(16,20)+'-'+key.slice(20,32);
   await save({enabled:true,config:input.config,phase:input.phase,due_at,id,actor,failures:previous.failures||[]},actor);
   return status();
  });
 }
 async function status(){
  const plan=await load();
  const history=(await scenarioRepo.read('jobs')).filter(j=>j.request?.manifest?.replay_scheduled_at).map(j=>({
   id:j.id,retry_of:j.retry_of,config:j.request.manifest.replay_config,phase:j.request.manifest.scenario_phase,
   due_at:j.request.manifest.replay_scheduled_at,started_at:j.started_at,completed_at:j.completed_at,
   data_cutoff:j.request.manifest.coverage_end,version_id:j.version_id,status:j.status,error:j.error
  }));
  history.push(...(plan.failures||[]));
  history.sort((a,b)=>b.due_at.localeCompare(a.due_at));
  return {...plan,history,last_run:history[0]||null,next_run:plan.enabled&&plan.id&&!history.some(j=>j.id===plan.id)&&!plan.failure?plan.due_at:null};
 }
 async function tick(){
  const plan=await load();
  if(!plan.enabled||!plan.id||plan.failure||Date.now()<Date.parse(plan.due_at))return;
  let job=(await scenarioRepo.read('jobs',plan.id))[0];
  if(!job){
   try{job=await importer.submit(Scenario.replay(plan.config,plan.phase,plan.due_at),plan.actor,{id:plan.id});}
   catch(error){
    // Another worker may already have created this exact slot.
    job=(await scenarioRepo.read('jobs',plan.id))[0];
    if(!job){
     const input=Scenario.replay(plan.config,plan.phase,plan.due_at);
     const failure={at:new Date().toISOString(),message:error.message};
     const run={id:plan.id,config:plan.config,phase:plan.phase,due_at:plan.due_at,started_at:failure.at,data_cutoff:input.manifest.coverage_end,status:'failed',error:failure};
     await save({...plan,failure,failures:[run,...(plan.failures||[])].slice(0,50)},plan.actor);
     return;
    }
   }
  }
  if(job.status==='queued')await run(job.id,plan.actor,true);
  else if(job.status==='running'&&Date.parse(job.lease_until)<Date.now())await scenarioRepo.command('recover',{},plan.actor);
 }
 return {configure,status,start(){if(enabled&&!timer){timer=setInterval(()=>serialize(tick).catch(onError),interval);timer.unref();}},async stop(){clearInterval(timer);timer=null;await work;}};
}
module.exports={create};
