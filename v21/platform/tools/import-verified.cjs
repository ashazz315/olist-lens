'use strict';
// One-time explicit migration of EXISTING results. No CSV parsing or engine calls.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Cloud}=require('../lib/cloud.cjs'),{sha,stable}=require('../../lib/util.cjs');
const ROOT=path.resolve(__dirname,'../..'),root=path.resolve(__dirname,'..');
const dirs=['7e2cbd3659afc738653bc3fa-79ab3525','16e7ebf515713ff0b6fa27e4-a27ecd94','985ee3adb825f0ff2af1fa5c-7c2b3e8d'];
(async()=>{const cloud=new Cloud(JSON.parse(fs.readFileSync(path.join(root,'private/config.json'),'utf8'))),records=[];
 for(const name of dirs){const directory=path.join(ROOT,'runtime/v',name),version=JSON.parse(fs.readFileSync(path.join(directory,'version.json'),'utf8'));if((await cloud.read('versions',version.id)).length){records.push({version:version.id,source:version.source,status:'already_registered'});continue;}
  const id=crypto.randomUUID(),worker='verified-result-migration',actor='authorized_development_baseline_reuse';let analysis,originalHash;
  if(version.source==='olist'){const text=fs.readFileSync(path.join(directory,'analysis.json'),'utf8'),original=JSON.parse(text);originalHash=sha(text);const o=original.operations,m=original.monitoring;const suppressed={};for(const e of m.evaluations||[])if(e.status==='suppressed')for(const reason of e.reasons||[])suppressed[reason]=(suppressed[reason]||0)+1;
   analysis={metrics:original.metrics,verification:original.verification,operations:Object.fromEntries(['id','metric_version','calculation_version','status','verification','periods','quality','metrics','dimensions','delta_cents','limitations','verified_cube','source','evidence_hash'].map(k=>[k,o[k]])),monitoring:Object.fromEntries(['run_id','dataset_version','v1_snapshot_id','rule_set_version','calculation_version','metric_version','status','events','gates','config','periods','source_ref','evidence_hash'].map(k=>[k,m[k]])),cached_sku:JSON.parse(fs.readFileSync(path.join(ROOT,'evidence/browser-2026-11-15T01-14-50-413Z/sku-evidence.json'),'utf8')),projection:{source_sha256:originalHash,retains:'all metrics, dimensions and verified cube; original result retained locally',omits:'redundant full monitoring evaluations and duplicated per-rule snapshots',no_recalculation:true}};analysis.monitoring.suppressed_summary=suppressed;
  }else{analysis={external:version.summary};originalHash=sha(stable(version.summary));}
  const projected={...version,original_revision_of:version.revision_of,revision_of:null,baseline_reuse:{source_result_sha256:originalHash,no_recalculation:true,raw_location:'existing_protected_local_snapshot',cloud_raw_uploaded:false}};
  await cloud.command('submit',{id,source:version.source,request:{mode:'reuse_existing_verified_result',source_result_sha256:originalHash,files:version.file_hashes}},actor);
  await cloud.command('claim',{id,worker_id:worker},actor);
  try{await cloud.command('log',{id,stage:'verified_result_reuse',detail:{originalHash,engine_executed:false}},actor);await cloud.command('stage',{job_id:id,worker_id:worker,version:projected,analysis,result_sha256:sha(stable(analysis)),calculation_version:analysis.monitoring?.calculation_version||version.adapter_version},actor);const current=(await cloud.read('current')).find(x=>x.source===version.source);await cloud.command('publish',{id,expected_current:current?.version_id||null},actor);records.push({job:id,source:version.source,version:version.id,status:'published_existing_result',source_result_sha256:originalHash,bytes:Buffer.byteLength(JSON.stringify(analysis)),engine_executed:false});console.log(JSON.stringify(records.at(-1)));}
  catch(e){try{await cloud.command('fail',{id,worker_id:worker,error:{stage:'verified_result_reuse',message:e.message}},actor);}catch{}throw e;}
 }
 fs.writeFileSync(path.join(root,'evidence/baseline-import.json'),JSON.stringify(records,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
