'use strict';
// Actual current historical snapshot; no calculation or publication.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createServer}=require('../server.cjs');
const root=path.resolve(__dirname,'..'),env=JSON.parse(fs.readFileSync(path.join(root,'private/config.json'))),account=JSON.parse(fs.readFileSync(path.join(root,'private/initial-admin.json'))),runtime=path.join(require('node:os').homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
env.LENS_PYTHON=path.join(runtime,'python/python.exe');env.LENS_ARTIFACT_MODULE=path.join(runtime,'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs');env.LENS_REPORT_PREVIEW='1';
(async()=>{const output=path.join(root,'evidence/m3-live');fs.mkdirSync(output,{recursive:true});const app=createServer({env});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;let cookie='',csrf='';const checks=[];
 const call=(name,body)=>fetch(base+'/api/v1/'+name,{method:body?'POST':'GET',headers:{cookie,origin:base,'content-type':'application/json','x-csrf-token':csrf},...(body?{body:JSON.stringify(body)}:{})});
 try{assert.equal((await call('report?format=pdf')).status,401);checks.push('anonymous report denied');const login=await call('login',{username:account.username,password:account.password});assert.equal(login.status,200);cookie=login.headers.get('set-cookie').split(';')[0];const who=await login.json();csrf=who.csrf;assert.equal(who.member.role,'admin');checks.push('actual administrator CloudBase login');
 const o=await (await call('overview')).json();assert.equal(o.is_synthetic,false);assert.equal(o.delta_cents,-3184225);assert(o.reconciled);checks.push('real published historical metrics and contribution reconciliation');assert.equal((await call('report?format=pdf&version=wrong')).status,409);checks.push('stale report version rejected');
 const model=await(await call('model')).json();assert(!('secret' in model));if(!model.key_configured){assert.equal((await call('model/test',{})).status,409);checks.push('missing actual model key explicitly disconnected');}
 for(const format of ['pdf','xlsx']){const r=await call('report?format='+format+'&version='+o.version);if(r.status!==200)throw Error(format+': '+await r.text());assert.equal(r.headers.get('x-lens-version'),o.version);const bytes=Buffer.from(await r.arrayBuffer());assert(bytes.length>1000);fs.writeFileSync(path.join(output,'olist-historical.'+format),bytes);checks.push(format+' export bound to actual immutable version');}
 const current=await(await call('current')).json();fs.writeFileSync(path.join(output,'result.json'),JSON.stringify({checks,version:o.version,current,model,passed:true,calculation_executed:false,publication_executed:false},null,2));console.log(JSON.stringify({checks,passed:true}));
 }finally{await app.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
