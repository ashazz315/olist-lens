'use strict';
// Execute the unchanged CLI in a child process: native/WASM failures cannot kill the workspace server.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const {load,writeNew,need}=require('./util.cjs');
async function analyzeDirectory(directory,{timeoutMs=120000}={}){
 const output=path.join(directory,'engine-candidate.json'),started=new Date().toISOString();
 const script=path.resolve(__dirname,'../../scripts/operations.cjs');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[script,path.join(directory,'raw'),output],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='',timedOut=false,spawnError=null;
  child.stdout.on('data',b=>{stdout=(stdout+b).slice(-8000);});child.stderr.on('data',b=>{stderr=(stderr+b).slice(-8000);});
  child.on('error',e=>{spawnError=e.message;});
  const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
  child.on('close',(code,signal)=>{clearTimeout(timer);try{
   writeNew(path.join(directory,'engine-run.json'),JSON.stringify({runtime:process.version,executable:process.execPath,started_at:started,finished_at:new Date().toISOString(),code,signal,timed_out:timedOut,spawn_error:spawnError,stdout,stderr},null,2));
   need(!timedOut&&!spawnError&&code===0,'Engine process failed; candidate not published: '+JSON.stringify({code,signal,timedOut,spawnError,stderr}));
   need(fs.existsSync(output),'Missing engine candidate');resolve(load(output));
  }catch(e){reject(e);}});
 });
}
module.exports={analyzeDirectory};
