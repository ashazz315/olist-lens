'use strict';
// SYNTHETIC interface inputs, no real data source or scheduler.
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),{handler}=require('../scripts/monitor-server.cjs');
test('SYNTHETIC: authenticated scheduler contract persists disabled config, rejects enablement and arbitrary sources',async()=>{
 const token='synthetic-test-token-not-a-secret-123',state={},server=http.createServer(handler({token,repository:{get:k=>state[k],put:(k,v)=>state[k]=v}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 try{assert.equal((await fetch(base+'/monitoring/capabilities')).status,401);const c=await(await fetch(base+'/monitoring/capabilities',{headers})).json();assert.equal(c.scheduler_enabled,false);assert.equal(c.source_adapter_connected,false);
  const put=body=>fetch(base+'/schedules/olist-manual',{method:'PUT',headers,body:JSON.stringify(body)});assert.equal((await put({enabled:true})).status,409);assert.equal((await put({enabled:false,cron:'99 2 * * *',timezone:'Asia/Shanghai',expected_version:0})).status,400);const valid={enabled:false,cron:'0 2 * * *',timezone:'Asia/Shanghai',expected_version:0};assert.equal((await put(valid)).status,200);assert.equal((await put(valid)).status,409);assert.equal(state['olist-manual'].enabled,false);assert.equal((await fetch(base+'/schedules/http%3A%2F%2Fexample.com',{headers})).status,404);assert.equal((await fetch(base+'/update-jobs',{method:'POST',headers,body:'{}'})).status,503);
 }finally{await new Promise(r=>server.close(r));}
});
