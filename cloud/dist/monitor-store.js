/* Separate IndexedDB; all mutations read/write in one transaction (safe across tabs). */
globalThis.LensMonitorStore=(()=>{
'use strict';
const fresh=()=>({schema_version:1,jobs:{},datasets:{},runs:{},events:{},event_history:[],snapshot_runs:{}});
const terminal=new Set(['succeeded','duplicate','failed','canceled','interrupted']);
function createJob(state,job){if(Object.hasOwn(state.jobs,job.job_id))throw Error('任务编号已存在，不能覆盖执行历史');state.jobs[job.job_id]={...job,status:'queued',transitions:[{status:'queued',at:job.submitted_at}]};return state.jobs[job.job_id];}
const transitions={queued:['validating','failed','canceled','interrupted'],validating:['computing','failed','canceled','interrupted'],computing:['awaiting_confirmation','failed','canceled','interrupted'],awaiting_confirmation:['publishing','duplicate','canceled','interrupted'],publishing:['succeeded','duplicate','publication_pending','failed'],publication_pending:['publishing','canceled']};
function transition(state,id,status,extra={}){const job=state.jobs[id];if(!job)throw Error('更新任务不存在');if(job.status!==status&&!transitions[job.status]?.includes(status))throw Error('非法任务流转 '+job.status+' → '+status);Object.assign(job,extra,{status,updated_at:new Date().toISOString()});job.transitions.push({status,at:job.updated_at});if(terminal.has(status))job.finished_at=job.updated_at;return job;}
function publish(state,id,pack){
 const job=state.jobs[id];if(!job||!['publishing','publication_pending'].includes(job.status))throw Error('任务尚未确认发布');
 if(pack.status!=='verified'||pack.gates.length)throw Error('监控质量门禁未通过');
 for(const key of ['dataset_version','run_id','v1_snapshot_id'])if(!pack[key]||job[key]!==pack[key])throw Error('任务与证据包版本绑定不一致：'+key);
 if(!Array.isArray(pack.events)||pack.events.some(e=>e.dataset_version!==pack.dataset_version||e.analysis_run_id!==pack.run_id||e.v1_snapshot_id!==pack.v1_snapshot_id||e.rule_version!==pack.rule_set_version||e.metric_version!==pack.metric_version||!e.fired||!e.evidence?.independent_verification?.passed||!e.evidence_ids?.includes(e.evidence.id)))throw Error('异常事件与证据包版本不一致');
 const existing=state.runs[pack.run_id],m=pack.source_ref.manifest;
 const prior=Object.values(state.datasets).filter(d=>d.source===m.source_uri_or_description&&d.coverage_start===m.coverage_start&&d.coverage_end===m.coverage_end&&d.dataset_version!==pack.dataset_version).sort((a,b)=>b.published_at.localeCompare(a.published_at))[0];
 const now=new Date().toISOString();
 if(!state.datasets[pack.dataset_version])state.datasets[pack.dataset_version]={dataset_version:pack.dataset_version,source:m.source_uri_or_description,source_extracted_at:m.extracted_at,coverage_start:m.coverage_start,coverage_end:m.coverage_end,complete_through:pack.completeness.through,revision_of:prior?.dataset_version||null,revision_note:m.revision_note||'同来源同覆盖期的内容变化；业务修订原因待提供',published_at:now};
 if(!existing)state.runs[pack.run_id]={...pack,published_at:now};
 state.snapshot_runs[pack.v1_snapshot_id]=pack.run_id;
 for(const e of pack.events){if(state.events[e.event_id]){state.events[e.event_id].last_evaluated_at=now;continue;}
  const related=Object.values(state.events).filter(x=>x.event_type===e.event_type&&x.rule_id===e.rule_id&&x.scope_type===e.scope_type&&x.entity_id===e.entity_id&&x.source_ref?.manifest?.source_uri_or_description===m.source_uri_or_description).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
  state.events[e.event_id]={...e,related_event_id:related?.event_id||null};
 }
 if(job.status==='publication_pending')transition(state,id,'publishing');
 transition(state,id,existing?'duplicate':'succeeded',{dataset_version:pack.dataset_version,run_id:pack.run_id,v1_snapshot_id:pack.v1_snapshot_id,published_at:now});
 return {duplicate:!!existing,run_id:pack.run_id};
}
function qualityEvent(state,jobId,event){const job=state.jobs[jobId];if(!job)throw Error('更新任务不存在');if(!state.events[event.event_id])state.events[event.event_id]={...event,attempts:[]};const record=state.events[event.event_id];if(!record.attempts.includes(jobId))record.attempts.push(jobId);record.last_evaluated_at=new Date().toISOString();}
function changeStatus(state,id,{status,actor,note,resolution_code,evidence_ref}){
 const e=state.events[id];if(!e)throw Error('告警不存在');
 const allowed={pending:['in_progress','closed'],in_progress:['closed','pending'],closed:['pending']};
 if(!allowed[e.status]?.includes(status))throw Error('非法告警状态流转');
 if(!String(actor||'').trim()||!String(note||'').trim())throw Error('请填写处理人及处理依据');
 if(status==='closed'&&(!['investigated','data_corrected','accepted_risk','false_positive'].includes(resolution_code)||!String(evidence_ref||'').trim()))throw Error('关闭必须填写处理结论和证据引用');
 const entry={event_id:id,from:e.status,to:status,actor:actor.trim(),note:note.trim(),resolution_code:status==='closed'?resolution_code:null,evidence_ref:evidence_ref||null,at:new Date().toISOString(),identity:'self_reported_local_user'};
 state.event_history.push(entry);e.status=status;e.updated_at=entry.at;return entry;
}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('olist-lens-monitoring-v2',1);r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
let connection;
async function mutate(fn){const db=await(connection||(connection=open()));return new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite'),s=tx.objectStore('state'),r=s.get('main');let answer,error;r.onsuccess=()=>{try{const state=r.result||fresh();answer=fn(state);if(answer?.then)throw Error('事务内部不得等待异步操作');s.put(state,'main');}catch(e){error=e;tx.abort();}};tx.oncomplete=()=>resolve(answer);tx.onabort=()=>reject(error||tx.error||Error('监控保存中断'));tx.onerror=()=>{};});}
async function read(){const db=await(connection||(connection=open()));return new Promise((resolve,reject)=>{const r=db.transaction('state').objectStore('state').get('main');r.onsuccess=()=>resolve(r.result||fresh());r.onerror=()=>reject(r.error);});}
return {fresh,createJob,transition,publish,qualityEvent,changeStatus,mutate,read};
})();
if(typeof module!=='undefined')module.exports=globalThis.LensMonitorStore;
