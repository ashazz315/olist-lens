'use strict';
// Read-only, validation-only diagnostic. Never runs SQL, monitoring or publication.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../../..'),dist=path.join(root,'cloud/dist');
const Core=require(path.join(dist,'core.js')),Papa=require(path.join(dist,'vendor/papaparse.min.js'));
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function main(input,output){
 if(!process.version.startsWith('v24.'))throw Error('Diagnostic requires the existing Node24 runtime');
 const manifest=JSON.parse(fs.readFileSync(path.join(input,'dataset_manifest.json'),'utf8'));
 const bytes=Object.fromEntries(Object.keys(Core.fields).map(k=>[k+'.csv',fs.readFileSync(path.join(input,k+'.csv'))]));
 const texts=Object.fromEntries(Object.entries(bytes).map(([k,b])=>[k,b.toString('utf8')]));
 const observed=[];
 const parser={parse(text,options){const parsed=Papa.parse(text,options);if(text===texts['order_reviews.csv'].replace(/^\uFEFF/,'')){
  const header=parsed.data[0],col=header.indexOf('review_score');
  for(const number of [83484,83485,83486]){const row=parsed.data[number-1];observed.push({logical_csv_record:number,includes_header:true,score:row?.[col]??null,code_points:Array.from(row?.[col]||'').map(c=>c.codePointAt(0)),strict_score_match:/^[1-5]$/.test(row?.[col]||''),record_sha256:hash(JSON.stringify(row)),review_id_sha256:hash(row?.[header.indexOf('review_id')]||''),order_id_sha256:hash(row?.[header.indexOf('order_id')]||'')});}
 }return parsed;}};
 const started=new Date().toISOString(),validated=Core.validate(texts,manifest,parser);
 const controls=[];
 // Tiny, explicitly synthetic fixtures. The unchanged validator is the test subject.
 for(const score of ['1','4','5','','0','6','4.0',' 4','４','NaN']){
  const fixture={
   'orders.csv':Papa.unparse({fields:Core.fields.orders,data:[['SYNTHETIC_ORDER','SYNTHETIC_CUSTOMER','SP','delivered','2018-03-01 00:00:00','2018-03-03 00:00:00','2018-03-04 00:00:00']]}),
   'order_items.csv':Papa.unparse({fields:Core.fields.order_items,data:[['SYNTHETIC_ORDER','1','SYNTHETIC_SKU','SYNTHETIC_SELLER','synthetic','10.00','0.00']]}),
   'order_reviews.csv':Papa.unparse({fields:Core.fields.order_reviews,data:[['SYNTHETIC_REVIEW','SYNTHETIC_ORDER',score,'2018-03-04 00:00:00','2018-03-05 00:00:00']]})};
  const q=Core.validate(fixture,{...manifest,dataset_name:'SYNTHETIC isolated gate control',is_synthetic:true},Papa).quality;
  controls.push({is_synthetic:true,score,expected_allowed:['1','4','5',''].includes(score),allowed:q.errors===0,error_codes:q.issues.filter(i=>i.severity==='error').map(i=>i.code)});
 }
 const realHash=Object.fromEntries(Object.entries(bytes).map(([n,b])=>[n,hash(b)]));
 const sourceUnchanged=Object.entries(realHash).every(([n,h])=>hash(fs.readFileSync(path.join(input,n)))===h);
 const result={schema:'rating-gate-diagnostic-20261118',started_at:started,completed_at:new Date().toISOString(),runtime:process.version,executable:process.execPath,pid:process.pid,architecture:process.arch,platform:process.platform,input_directory:input,input_sha256:realHash,input_unchanged:sourceUnchanged,code_sha256:hash(fs.readFileSync(path.join(dist,'core.js'))),parser_sha256:hash(fs.readFileSync(path.join(dist,'vendor/papaparse.min.js'))),row_number_definition:'j + 2 in Papa.parse(header:false, delimiter:comma, skipEmptyLines:true); logical CSV record including header, not guaranteed physical line',observed,real_validation:{errors:validated.quality.errors,rating_issues:validated.quality.issues.filter(i=>i.code==='rating'),profiles:validated.quality.profiles},synthetic_controls:controls,sql_executed:false,snapshot_modified:false,all_controls_passed:controls.every(r=>r.allowed===r.expected_allowed),status:validated.quality.errors?'gate_failure_reproduced':'historical_gate_failure_not_reproduced'};
 fs.writeFileSync(output,JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({output,status:result.status,real_errors:validated.quality.errors,controls_passed:result.all_controls_passed,input_unchanged:sourceUnchanged}));
 if(!sourceUnchanged||!result.all_controls_passed)process.exitCode=2;
}
if(require.main===module){try{main(path.resolve(process.argv[2]),path.resolve(process.argv[3]));}catch(e){console.error(e.stack);process.exitCode=1;}}
module.exports={main};
