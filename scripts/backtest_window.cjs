// Adapter only: original operations.run and monitoring.run remain unchanged.
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),zlib=require('zlib'),assert=require('assert/strict');
const dist=path.resolve(__dirname,'../cloud/dist'),C=require(dist+'/core.js'),O=require(dist+'/operations.js'),M=require(dist+'/monitoring.js'),P=require(dist+'/vendor/papaparse.min.js');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8')),sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
(async()=>{
 const [input,analysis,windowFile,target]=process.argv.slice(2),w=load(windowFile),original=load(analysis),manifest=load(input+'/dataset_manifest.json');
 console.log(JSON.stringify({window:w.window_id,stage:'started'}));
 assert(!fs.existsSync(target),'Refuse overwrite');assert.equal(w.window_gates.length,0);assert.equal(w.observed_days,70);
 const files=Object.fromEntries(Object.keys(C.fields).map(k=>[k+'.csv',fs.readFileSync(input+'/'+k+'.csv','utf8')]));
 for(const name of Object.keys(files))assert.equal(sha(input+'/'+name),original.file_hashes[name]);
 const m={...manifest,operations:{before:w.before,after:w.after,complete_through:new Date(Date.parse(w.after.end)-86400000).toISOString().slice(0,10),completion_evidence:JSON.stringify({scope:'Observed fixed snapshot only; NOT provider business completeness',observed_days:70,source_completeness_guarantee:false,not_as_of:true})}};
 const valid=C.validate(files,m,P);assert.equal(valid.quality.errors,0);
 console.log(JSON.stringify({window:w.window_id,stage:'quality_passed'}));
 const SQL=await require(dist+'/vendor/sql-wasm.js')({locateFile:f=>dist+'/vendor/'+f}),legacySQL=fs.readFileSync(dist+'/analysis.sql','utf8'),operationsSQL=fs.readFileSync(dist+'/operations.sql','utf8');
 const code_sha256=crypto.createHash('sha256').update(original.code_sha256+fs.readFileSync(dist+'/operations.js','utf8')+operationsSQL).digest('hex');
 const ops=await O.run({validated:valid,SQL,legacySQL,operationsSQL,Core:C,context:{dataset_id:original.id,file_hashes:original.file_hashes,code_sha256}});
 console.log(JSON.stringify({window:w.window_id,stage:'operations_returned',status:ops.status,error:ops.error,verification:ops.verification}));
 if(ops.status==='blocked')fs.writeFileSync(target+'.failure.json',JSON.stringify({window:w,operations:ops},null,2));
 assert.equal(ops.verification?.passed,true,JSON.stringify(ops.gates));
 for(const rows of Object.values(ops.dimensions))assert.equal(rows.reduce((n,r)=>n+r.delta_cents,0),ops.delta_cents);
 const monitor=await M.run(valid,{...original,manifest:m,operations:ops,id:ops.id.slice(0,24)},sha(dist+'/monitoring.js'));
 assert.equal(monitor.status,'verified');assert.deepEqual(monitor.config,M.configuration({}).config);assert(monitor.events.every(e=>e.event_type!=='fulfillment'));
 fs.writeFileSync(target+'.part',zlib.gzipSync(JSON.stringify({window:w,operations:ops,monitoring:monitor})));fs.renameSync(target+'.part',target);
 console.log(JSON.stringify({window:w.window_id,status:monitor.status,events:monitor.events.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
