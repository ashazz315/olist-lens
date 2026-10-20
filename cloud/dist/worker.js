importScripts('vendor/papaparse.min.js','vendor/sql-wasm.js','core.js');
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
  self.postMessage({type:'ready',result});
 }catch(err){self.postMessage({type:'error',message:err.message||String(err)});}
};
