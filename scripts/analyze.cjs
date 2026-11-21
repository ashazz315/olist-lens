// CLI: node scripts/analyze.cjs INPUT_DIRECTORY OUTPUT_JSON
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),DIST=path.join(ROOT,'cloud','dist');
const Core=require(path.join(DIST,'core.js'));const Papa=require(path.join(DIST,'vendor','papaparse.min.js'));const initSqlJs=require(path.join(DIST,'vendor','sql-wasm.js'));
async function main(){
 const [input,out]=process.argv.slice(2);if(!input||!out||input==='--help'){console.log('Usage: node scripts/analyze.cjs INPUT_DIRECTORY OUTPUT_JSON');if(input!=='--help')process.exitCode=2;return;}
 const target=path.resolve(out),source=path.resolve(input),started=new Date().toISOString(),runId=crypto.randomUUID();
 for(const denied of ['output/analysis','output/templates','output/pdf','cloud/dist','data/canonical'].map(p=>path.resolve(ROOT,p)).concat(source))if(target===denied||target.startsWith(denied+path.sep))throw Error('Output overlaps protected/input directory');
 if(fs.existsSync(target)||fs.existsSync(target+'.quality.json'))throw Error('Output exists; use a new run path');
 const files=Object.fromEntries(Object.keys(Core.fields).map(k=>[k+'.csv',fs.readFileSync(path.join(input,k+'.csv'),'utf8')]));const manifest=JSON.parse(fs.readFileSync(path.join(input,'dataset_manifest.json'),'utf8'));
 console.log(JSON.stringify({run_id:runId,stage:'input_read',started_at:started}));
 const validated=Core.validate(files,manifest,Papa);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out+'.quality.json',JSON.stringify(validated.quality,null,2));
 if(validated.quality.errors){console.log(JSON.stringify({status:'blocked',quality:validated.quality.summary}));process.exitCode=1;return;}
 console.log(JSON.stringify({run_id:runId,stage:'quality_passed'}));
 const SQL=await initSqlJs({locateFile:f=>path.join(DIST,'vendor',f)});const sql=fs.readFileSync(path.join(DIST,'analysis.sql'),'utf8');console.log(JSON.stringify({run_id:runId,stage:'sqlite_initialized'}));const result=Core.analyze(validated,SQL,sql);
 result.file_hashes=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')]));
 result.code_sha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST,'core.js'))).update(sql).digest('hex');
 result.id=crypto.createHash('sha256').update(Core.stableJSON({files:result.file_hashes,manifest,app_version:Core.VERSION,metric_version:Core.METRIC_VERSION,code_sha256:result.code_sha256})).digest('hex').slice(0,24);
 result.stage3_run={run_id:runId,started_at:started,completed_at:new Date().toISOString(),input_directory:source,batch_id:result.id,sql_sha256:crypto.createHash('sha256').update(sql).digest('hex'),cli_sha256:crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex')};
 if(result.verification.status!=='通过')throw Error('Independent SQL/JavaScript verification failed');
 fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({id:result.id,metrics:result.metrics,verification:result.verification.status,warnings:result.quality.warnings,quality:result.quality.summary}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
