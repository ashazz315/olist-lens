// SYNTHETIC/EMPTY isolated workspace. No production data or model credentials.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server.cjs');
test('HTTP local origin, token and source isolation guards',async()=>{
 const app=createServer({runtime:fs.mkdtempSync(path.join(os.tmpdir(),'lens-v21-synthetic-http-')),env:{}});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
 try{
  const s=await(await fetch(base+'/api/session')).json();assert.equal(s.model.configured,false);assert.equal(s.ga4.connected,false);
  assert.equal((await fetch(base+'/api/imports',{method:'POST',body:'{}'})).status,400);
  assert.equal((await fetch(base+'/api/state',{headers:{Origin:'https://foreign.example'}})).status,400);
  assert.equal((await fetch(base+'/api/imports',{method:'POST',headers:{'x-lens-token':s.token},body:JSON.stringify({source:'ga4'})})).status,400);
  assert.equal((await fetch(base+'/%2e%2e%2fruntime%2fworkspace.sqlite')).status,400);
  assert.equal((await(await fetch(base+'/api/state')).json()).versions.length,0);
 }finally{await app.close();}
});
