'use strict';
// Instrument calls, never alter the frozen calculation implementation.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),[input,output]=process.argv.slice(2);
function mark(stage){try{process.stdout.write(JSON.stringify({stage,pid:process.pid,node:process.version,at:new Date().toISOString(),memory:process.memoryUsage()})+'\n');}catch{}}
for(const [file,names] of [['core.js',['validate','analyze']],['operations.js',['run']],['monitoring.js',['run']]]){
 const mod=require(path.join(root,'cloud/dist',file));for(const name of names){const original=mod[name];mod[name]=function(...args){mark(file+':'+name+':start');const value=original.apply(this,args);if(value?.then)return value.then(v=>{mark(file+':'+name+':complete');return v;});mark(file+':'+name+':complete');return value;};}
}
(async()=>{if(!process.version.startsWith('v24.'))throw Error('Node 24 required');mark('read');const files=Object.fromEntries(['orders.csv','order_items.csv','order_reviews.csv'].map(n=>[n,fs.readFileSync(path.join(input,n),'utf8')]));const manifest=JSON.parse(fs.readFileSync(path.join(input,'dataset_manifest.json'),'utf8'));const result=await require(path.join(root,'scripts/operations.cjs')).analyze(files,manifest);mark('result:serialize');const json=JSON.stringify(result),tmp=output+'.partial';const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,json);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,output);mark('result:durable');if(result.status==='blocked'||!result.operations?.verification?.passed||result.monitoring?.status!=='verified')process.exitCode=2;})().catch(e=>{try{process.stderr.write(e.stack+'\n');}finally{process.exitCode=1;}});
