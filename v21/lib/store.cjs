'use strict';
const {DatabaseSync}=require('node:sqlite'),fs=require('node:fs'),path=require('node:path');
const {now,need}=require('./util.cjs');
class Store{
 constructor(dir){fs.mkdirSync(dir,{recursive:true});this.dir=dir;this.lock=path.join(dir,'owner.lock');
 if(fs.existsSync(this.lock)){const previous=JSON.parse(fs.readFileSync(this.lock,'utf8'));let live=true;try{process.kill(previous.pid,0);}catch(e){if(e.code==='ESRCH')live=false;}need(!live,'工作区已被另一个本机进程打开');fs.renameSync(this.lock,this.lock+'.abandoned.'+Date.now());}
 fs.writeFileSync(this.lock,JSON.stringify({pid:process.pid,at:now()}),{flag:'wx'});
 try{this.db=new DatabaseSync(path.join(dir,'workspace.sqlite'));this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS objects(kind TEXT,id TEXT,value TEXT,PRIMARY KEY(kind,id));');}catch(e){fs.unlinkSync(this.lock);throw e;}
 for(const job of this.list('jobs'))if(['queued','running'].includes(job.status)){job.status='interrupted';job.error='Service stopped before candidate completed; explicit retry required';this.put('jobs',job.id,job);}}
 get(kind,id){const r=this.db.prepare('SELECT value FROM objects WHERE kind=? AND id=?').get(kind,id);return r?JSON.parse(r.value):null;}
 list(kind){return this.db.prepare('SELECT value FROM objects WHERE kind=? ORDER BY rowid DESC').all(kind).map(r=>JSON.parse(r.value));}
 put(kind,id,value){this.db.prepare('INSERT INTO objects VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value').run(kind,id,JSON.stringify(value));return value;}
 transaction(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
 current(source){const id=this.get('current',source)?.id;return id?this.get('versions',id):null;}
 promote(jobId,actor,monitorDomain){return this.transaction(()=>{const j=this.get('jobs',jobId);need(j?.status==='awaiting_confirmation','No validated candidate');need(actor?.trim(),'Actor required');const v=this.get('versions',j.version);need(v&&v.quality!=='blocked','Quality gate failed');const previous=this.current(v.source);
 if(v.source==='olist'){const pack=JSON.parse(fs.readFileSync(path.join(v.directory,'analysis.json'),'utf8')).monitoring;const state=this.get('monitor','main')||monitorDomain.fresh();monitorDomain.createJob(state,{job_id:j.id,submitted_at:j.started_at});for(const status of ['validating','computing','awaiting_confirmation','publishing'])monitorDomain.transition(state,j.id,status,{dataset_version:pack.dataset_version,run_id:pack.run_id,v1_snapshot_id:pack.v1_snapshot_id});monitorDomain.publish(state,j.id,pack);this.put('monitor','main',state);}
 this.put('current',v.source,{id:v.id,actor,at:now()});j.status=previous?.id===v.id?'duplicate':'succeeded';j.published_at=now();j.actor=actor;this.put('jobs',j.id,j);return j;});}
 close(){this.db.close();if(fs.existsSync(this.lock)&&JSON.parse(fs.readFileSync(this.lock,'utf8')).pid===process.pid)fs.unlinkSync(this.lock);}
}
module.exports={Store};
