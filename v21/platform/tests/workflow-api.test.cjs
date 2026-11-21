'use strict';
// SYNTHETIC IN-MEMORY API fixtures; no cloud writes or real business approvals.
const test=require('node:test'),assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');
test('API investigation binds authenticated actor, requires human review and keeps missing follow-up data unverified',async()=>{
 const version={id:'a'.repeat(64),source:'olist',manifest:{is_synthetic:false,source_uri_or_description:'synthetic://internal-test',currency:'BRL',extracted_at:'2020-01-01'}};
 const row={key:'synthetic-product',delta_cents:-100,before:{amount_cents:200,units:2},after:{amount_cents:100,units:1},evidence_id:'synthetic-evidence'};
 const analysis={operations:{verification:{passed:true},metric_version:'test',metrics:{before:{},after:{}},delta_cents:-100,periods:[],dimensions:{product:[row]},verified_cube:{totals:[],groups:[]}},monitoring:{status:'verified',dataset_version:'synthetic-facts',calculation_version:'test',events:[{event_id:'synthetic-event',evidence:{id:'synthetic-evidence'}}]}};
 const tasks=new Map();const repo={read:async(kind,id)=>kind==='current'?[{source:'olist',version_id:version.id}]:kind==='versions'?[{id:version.id,content:version}]:kind==='snapshots'?{result:analysis}:kind==='tasks'?(id?[tasks.get(id)].filter(Boolean):[...tasks.values()]):[],command:async(op,b)=>{assert.equal(op,'task');const old=tasks.get(b.task.id);if(old)assert.equal(b.expected_revision,old.revision);tasks.set(b.task.id,structuredClone(b.task));return b.task;}};
 const sessions={get:async()=>({member:{subject:'authenticated-analyst',role:'analyst'},csrf:'test'})};const app=createServer({repo,sessions,env:{LENS_DATABASE_TOKEN:'SYNTHETIC'}});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 async function post(route,b){const r=await fetch(base+'/api/v1/'+route,{method:'POST',headers:{origin:base,'content-type':'application/json','x-csrf-token':'test',cookie:'lens_session=test'},body:JSON.stringify(b)});return {status:r.status,body:await r.json()};}
 try{let r=await post('tasks',{event_id:'synthetic-event',product_id:'synthetic-product',version:version.id,owner:'SYNTHETIC TEST'});assert.equal(r.status,201);let task=r.body;const change=async b=>{const r=await post('tasks/'+task.id+'/change',{...b,expected_revision:task.revision,actor:'FORGED ACTOR',note:'SYNTHETIC TEST ONLY'});if(r.status===200)task=r.body;return r;};
 assert.equal((await change({kind:'transition',to:'investigating'})).status,200);assert.equal(task.history.at(-1).actor,'authenticated-analyst');assert.equal((await change({kind:'transition',to:'action_pending'})).status,400);
 assert.equal((await change({kind:'review',decision:'approved',cause:'Synthetic hypothesis',evidence_ids:['fake']})).status,400);
 assert.equal((await change({kind:'review',decision:'approved',cause:'Synthetic hypothesis',evidence_ids:['E1']})).status,200);
 await change({kind:'transition',to:'action_pending'});await change({kind:'action',action:'Synthetic action',due_at:'2030-01-01'});await change({kind:'transition',to:'executing'});await change({kind:'execution',reference:'synthetic://test-proof'});await change({kind:'transition',to:'verification_pending'});
 const verify=await post('tasks/'+task.id+'/verify',{expected_revision:task.revision,note:'Synthetic verification request'});assert.equal(verify.body.verification.status,'unverified');assert.equal(verify.body.verification.causal_effect_confirmed,false);task=verify.body;assert.equal((await change({kind:'transition',to:'closed',evidence_ids:['E1']})).status,400);
 const ai=await post('tasks/'+task.id+'/investigate',{question:'What is missing?'});assert.equal(ai.status,409);assert(ai.body.error.includes('模型未连接'));assert.equal(tasks.get(task.id).reports.length,0);
 }finally{await app.close();}
});
