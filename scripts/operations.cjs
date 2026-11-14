// CLI: full-snapshot v1 + v2 analysis. Output is a candidate; it never deploys or schedules.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DIST=path.resolve(__dirname,'../cloud/dist'),C=require(DIST+'/core.js'),O=require(DIST+'/operations.js');
const Papa=require(DIST+'/vendor/papaparse.min.js'),init=require(DIST+'/vendor/sql-wasm.js');
const sha=x=>crypto.createHash('sha256').update(x).digest('hex');
async function analyze(files,manifest){
 if(Object.values(files).reduce((n,s)=>n+Buffer.byteLength(s),0)>80*1024*1024)throw Error('Input exceeds 80 MB');
 const valid=C.validate(files,manifest,Papa);
 if(valid.quality.errors)return {status:'blocked',quality:valid.quality,operations:{status:'blocked',gates:['legacy_quality_failed'],alerts:[]}};
 const SQL=await init({locateFile:f=>DIST+'/vendor/'+f}),legacySQL=fs.readFileSync(DIST+'/analysis.sql','utf8'),opsSQL=fs.readFileSync(DIST+'/operations.sql','utf8');
 const result=C.analyze(valid,SQL,legacySQL);result.file_hashes=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,sha(v)]));
 result.code_sha256=sha(fs.readFileSync(DIST+'/core.js','utf8')+legacySQL);
 result.id=sha(C.stableJSON({files:result.file_hashes,manifest,app_version:C.VERSION,metric_version:C.METRIC_VERSION,code_sha256:result.code_sha256})).slice(0,24);
 const context={dataset_id:result.id,file_hashes:result.file_hashes,code_sha256:sha(result.code_sha256+fs.readFileSync(DIST+'/operations.js','utf8')+opsSQL)};
 result.operations=await O.run({validated:valid,SQL,legacySQL,operationsSQL:opsSQL,Core:C,context});
 if(manifest.operations){result.legacy_id=result.id;result.id=result.operations.id.slice(0,24);}
 result.analysis_runs=[{run_id:result.operations.id,status:result.operations.status,generated_at:result.operations.generated_at,gates:result.operations.gates}];
 result.monitoring=await require(DIST+'/monitoring.js').run(valid,result,sha(fs.readFileSync(DIST+'/monitoring.js','utf8')));
 return result;
}
module.exports={analyze};
if(require.main===module)(async()=>{const [input,out]=process.argv.slice(2);if(!input||!out)throw Error('Usage: node scripts/operations.cjs INPUT_DIRECTORY OUTPUT_JSON');const files=Object.fromEntries(Object.keys(C.fields).map(k=>[k+'.csv',fs.readFileSync(path.join(input,k+'.csv'),'utf8')]));const manifest=JSON.parse(fs.readFileSync(path.join(input,'dataset_manifest.json'),'utf8'));const result=await analyze(files,manifest);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({id:result.id,status:result.operations.status,gates:result.operations.gates,alerts:result.operations.alerts.length}));if(result.operations.status==='blocked')process.exitCode=1;})().catch(e=>{console.error(e.message);process.exitCode=1;});
