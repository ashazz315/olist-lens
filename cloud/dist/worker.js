importScripts('vendor/papaparse.min.js','vendor/sql-wasm.js','core.js','operations.js','monitoring.js');
self.onmessage=async e=>{
 try{
  const {files,manifest}=e.data;let size=0;for(const text of Object.values(files))size+=new TextEncoder().encode(text).length;if(size>80*1024*1024)throw Error('三份 CSV 合计最多 80 MB');
  self.postMessage({type:'progress',message:'检查字段、记录键、金额与订单关联…'});
  const valid=LensCore.validate(files,manifest,Papa);
  if(valid.quality.errors){self.postMessage({type:'blocked',quality:valid.quality});return;}
  self.postMessage({type:'progress',message:'建立订单分析表，执行 SQL 并独立复算…'});
  const [SQL,sqlText]=await Promise.all([initSqlJs({locateFile:f=>new URL('vendor/'+f,self.location.href).href}),fetch('analysis.sql').then(r=>{if(!r.ok)throw Error('SQL 文件读取失败');return r.text();})]);
  const result=LensCore.analyze(valid,SQL,sqlText);const sha=async x=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(x)))).map(b=>b.toString(16).padStart(2,'0')).join('');
  result.file_hashes={};for(const [name,text] of Object.entries(files))result.file_hashes[name]=await sha(text);
  result.code_sha256=await sha((await fetch('core.js').then(r=>r.text()))+sqlText);
  result.id=(await sha(LensCore.stableJSON({files:result.file_hashes,manifest,app_version:LensCore.VERSION,metric_version:LensCore.METRIC_VERSION,code_sha256:result.code_sha256}))).slice(0,24);
  if(manifest.operations){
   self.postMessage({type:'progress',message:'计算完整经营周期、商品贡献与诊断证据…'});
   try{
    const [opsText,opsCode]=await Promise.all(['operations.sql','operations.js'].map(f=>fetch(f).then(r=>{if(!r.ok)throw Error('经营模块读取失败');return r.text();})));
    result.operations=await LensOperations.run({validated:valid,SQL,legacySQL:sqlText,operationsSQL:opsText,Core:LensCore,context:{dataset_id:result.id,file_hashes:result.file_hashes,code_sha256:await sha(result.code_sha256+opsCode+opsText)}});
    result.legacy_id=result.id;result.id=result.operations.id.slice(0,24);
    result.analysis_runs=[{run_id:result.operations.id,status:result.operations.status,generated_at:result.operations.generated_at,gates:result.operations.gates}];
   }catch(err){result.operations={status:'blocked',gates:['operations_execution_failed'],error:err.message,alerts:[]};}
  }
  const blockingQuality=LensMonitoring.blockingQuality(result);if(blockingQuality){self.postMessage({type:'blocked',quality:blockingQuality});return;}
  self.postMessage({type:'progress',message:'执行分维度监控规则与历史基线检查…'});
  result.monitoring=await LensMonitoring.run(valid,result,await sha(await fetch('monitoring.js').then(r=>{if(!r.ok)throw Error('监控模块读取失败');return r.text();})));
  await LensMonitoring.bindSnapshot(result);
  self.postMessage({type:'ready',result});
 }catch(err){self.postMessage({type:'error',failure_kind:/独立复算不一致/.test(err.message)?'data_quality':'execution',message:err.message||String(err)});}
};
