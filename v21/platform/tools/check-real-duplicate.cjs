'use strict';
// Existing independently stored advertising CSV only. No metric engine, new data,
// synthetic fixture, publication, or business approval is performed by this test.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {Cloud}=require('../lib/cloud.cjs'),{CloudFiles}=require('../lib/blob-cloud.cjs'),{Imports}=require('../lib/imports.cjs');
const {sha,stable}=require('../../lib/util.cjs');
(async()=>{
 const root=path.resolve(__dirname,'..'),env=JSON.parse(fs.readFileSync(path.join(root,'private/config.json'),'utf8'));
 const version=JSON.parse(fs.readFileSync(path.join(root,'private/baseline/advertising/version.json'),'utf8'));
 const files={};for(const [name,hash] of Object.entries(version.file_hashes)){const bytes=fs.readFileSync(path.join(version.directory,'raw',name));assert.equal(sha(bytes),hash);files[name]=bytes.toString('utf8');assert.equal(sha(files[name]),hash);}
 assert.equal(sha(stable({source:version.source,hashes:version.file_hashes,manifest:version.manifest,shipping:null,adapter:require('../../lib/adapters.cjs').VERSION})),version.id);
 const cloud=new Cloud(env),imports=new Imports(cloud,new CloudFiles(cloud)),actor='authorized_development_duplicate_check';
 assert((await cloud.read('versions',version.id)).some(v=>v.id===version.id));
 const before=await cloud.read('current'),runs=[];
 for(let i=0;i<2;i++){
  const job=await imports.submit({source:version.source,files,manifest:version.manifest},actor);
  try{const result=await imports.run(job.id,actor,async()=>{throw Error('Safety stop: unexpected metric calculation requested');});assert.equal(result.status,'awaiting_confirmation');assert.equal(result.version_id,version.id);runs.push({job_id:job.id,status:result.status,version_id:result.version_id,engine_executed:false});}
  finally{await cloud.command('cancel',{id:job.id},actor).catch(()=>{});}
 }
 const after=await cloud.read('current');assert.deepEqual(after,before);
 const result={at:new Date().toISOString(),source:'advertising',raw_sha256:version.file_hashes,authenticity:'provider claim only; not independently established',runs,current_unchanged:true,metric_engine_executed:false,published:false};
 fs.writeFileSync(path.join(root,'evidence/real-duplicate-import.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
