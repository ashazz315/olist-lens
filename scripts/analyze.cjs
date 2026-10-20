// CLI: node scripts/analyze.cjs INPUT_DIRECTORY OUTPUT_JSON
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),DIST=path.join(ROOT,'cloud','dist');
const Core=require(path.join(DIST,'core.js'));const Papa=require(path.join(DIST,'vendor','papaparse.min.js'));const initSqlJs=require(path.join(DIST,'vendor','sql-wasm.js'));
async function main(){
 const [input,out]=process.argv.slice(2);if(!input||!out||input==='--help'){console.log('Usage: node scripts/analyze.cjs INPUT_DIRECTORY OUTPUT_JSON');if(input!=='--help')process.exitCode=2;return;}
 const files=Object.fromEntries(Object.keys(Core.fields).map(k=>[k+'.csv',fs.readFileSync(path.join(input,k+'.csv'),'utf8')]));const manifest=JSON.parse(fs.readFileSync(path.join(input,'dataset_manifest.json'),'utf8'));
 const validated=Core.validate(files,manifest,Papa);fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out+'.quality.json',JSON.stringify(validated.quality,null,2));
 if(validated.quality.errors){console.log(JSON.stringify({status:'blocked',quality:validated.quality.summary}));process.exitCode=1;return;}
 const SQL=await initSqlJs({locateFile:f=>path.join(DIST,'vendor',f)});const sql=fs.readFileSync(path.join(DIST,'analysis.sql'),'utf8');const result=Core.analyze(validated,SQL,sql);
 result.file_hashes=Object.fromEntries(Object.entries(files).map(([k,v])=>[k,crypto.createHash('sha256').update(v).digest('hex')]));
 result.code_sha256=crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST,'core.js'))).update(sql).digest('hex');
 result.id=crypto.createHash('sha256').update(Core.stableJSON({files:result.file_hashes,manifest,app_version:Core.VERSION,metric_version:Core.METRIC_VERSION,code_sha256:result.code_sha256})).digest('hex').slice(0,24);
 fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({id:result.id,metrics:result.metrics,verification:result.verification.status,warnings:result.quality.warnings,quality:result.quality.summary}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
