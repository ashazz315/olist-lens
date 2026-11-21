'use strict';
// Actual CloudBase auth / PostgreSQL / private file / HTTP integration.
// Two unchanged rows from the acquired independent advertising file. NOT Olist.
// Test publication is explicit, tagged, temporary, and restored in finally.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createServer}=require('../server.cjs'),{Cloud}=require('../lib/cloud.cjs');
const Papa=require('../../../cloud/dist/vendor/papaparse.min.js');
const root=path.resolve(__dirname,'..'),env=JSON.parse(fs.readFileSync(path.join(root,'private/config.json'),'utf8')),account=JSON.parse(fs.readFileSync(path.join(root,'private/initial-admin.json'),'utf8'));
(async()=>{const cloud=new Cloud(env),initial=await cloud.read('current'),old=initial.find(v=>v.source==='advertising');assert(old);const original=(await cloud.read('versions',old.version_id))[0].content;
 const csv=fs.readFileSync(path.join(original.directory,'raw/Coffeeshop_Personalization_Campaign_Data.csv'),'utf8'),parsed=Papa.parse(csv,{header:true,skipEmptyLines:true});assert.equal(parsed.errors.length,0);
 const small=Papa.unparse({fields:parsed.meta.fields,data:parsed.data.slice(0,2)}),manifest={...original.manifest,extracted_at:new Date().toISOString(),revision_note:'M1 authorized temporary integration excerpt; restore immediately',purpose:'integration_test_excerpt',excerpt_rows:2,original_file_sha256:original.file_hashes['Coffeeshop_Personalization_Campaign_Data.csv']};
 const app=createServer({env});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;let cookie,csrf,published=false,job;const checks=[];
 async function call(route,body,anonymous=false){const r=await fetch(base+'/api/v1/'+route,{method:body===undefined?'GET':'POST',headers:{...(anonymous?{}:{cookie:cookie||''}),'content-type':'application/json',origin:base,'x-csrf-token':csrf||''},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')};}
 try{
  assert.equal((await call('export',undefined,true)).status,401);assert.equal((await fetch(base+'/private/initial-admin.json')).status,404);checks.push('anonymous export and private credentials denied');
  const login=await call('login',{username:account.username,password:account.password});assert.equal(login.status,200);assert.equal(login.data.member.role,'admin');cookie=login.cookie.split(';')[0];csrf=login.data.csrf;assert(!JSON.stringify(login.data).includes(env.LENS_DATABASE_TOKEN));checks.push('actual administrator login; no service secret in response');
  assert.equal((await call('users')).status,200);checks.push('admin connected to PostgreSQL');
  const input={source:'advertising',files:{'Coffeeshop_Personalization_Campaign_Data.csv':small},manifest};let r=await call('imports',input);assert.equal(r.status,202);job=r.data;assert.equal(job.status,'queued');checks.push('small acquired CSV upload creates queued task');
  r=await call('imports',input);assert(r.status>=400);checks.push('concurrent duplicate dataset submission rejected');
  assert.equal((await call('jobs/'+job.id+'/run',{})).status,202);
  for(let n=0;n<40;n++){job=(await cloud.read('jobs',job.id))[0];if(job.status!=='queued'&&job.status!=='running')break;await new Promise(r=>setTimeout(r,250));}
  assert.equal(job.status,'awaiting_confirmation',JSON.stringify(job.error));assert.notEqual(job.version_id,old.version_id);checks.push('existing adapter validation produced new immutable candidate');
  assert((await call('jobs/'+job.id+'/publish',{expected_current:'deliberately-stale-test'})).status>=400);assert.equal((await cloud.read('current')).find(v=>v.source==='advertising').version_id,old.version_id);checks.push('failed publication preserves previous version');
  assert.equal((await call('jobs/'+job.id+'/publish',{expected_current:old.version_id})).status,200);published=true;checks.push('authenticated admin approval publishes atomically');
  const front=await call('external?source=advertising');assert.equal(front.status,200);assert.equal(front.data.version,job.version_id);assert.equal(front.data.rows.length,2);checks.push('business frontend reads newly published version and rows');
  const versions=await call('versions');assert(versions.data.some(v=>v.id===front.data.version));assert.equal((await call('overview')).data.version,initial.find(v=>v.source==='olist').version_id);checks.push('front/admin share versions; Olist GMV baseline isolated and unchanged');
  await cloud.command('restore',{version_id:old.version_id,expected_current:job.version_id,reason:'M1 integration completed; restore original full independent advertising sample'},login.data.member.subject);published=false;
  const final=await cloud.read('current');assert.deepEqual(final.map(v=>[v.source,v.version_id]).sort(),initial.map(v=>[v.source,v.version_id]).sort());checks.push('all original current version IDs restored');
  const result={at:new Date().toISOString(),checks,passed:true,source:'advertising',data_label:'2 unmodified acquired rows; authenticity remains provider claim only',job_id:job.id,candidate:job.version_id,original_current:old.version_id,original_current_restored:true,olist_engine_executed:false,small_external_adapter_executed:true};fs.writeFileSync(path.join(root,'evidence/m1-live-integration.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{if(published)await cloud.command('restore',{version_id:old.version_id,expected_current:job.version_id,reason:'Integration finally restore'},'authorized_m1_integration_restore');else if(job&&['queued','running','awaiting_confirmation'].includes((await cloud.read('jobs',job.id))[0]?.status))await cloud.command('cancel',{id:job.id},'authorized_m1_integration_cleanup');await app.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
