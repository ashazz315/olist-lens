'use strict';
// Loopback-only simulation acceptance. Reuses the production PostgreSQL SQL functions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const net=require('node:net'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const {check,Sessions}=require('./cloud.cjs');
const {ImmutableFiles}=require('./imports.cjs');

async function freePort(){
 const server=net.createServer();
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const port=server.address().port;
 await new Promise(resolve=>server.close(resolve));
 return port;
}

async function open(directory,{adminPassword,analystPassword}){
 check(typeof adminPassword==='string'&&adminPassword.length>=12,'Local administrator password required');
 check(typeof analystPassword==='string'&&analystPassword.length>=12&&adminPassword!==analystPassword,'Distinct local analyst password required');
 fs.mkdirSync(directory,{recursive:true});
 const {default:EmbeddedPostgres}=await import('embedded-postgres');
 const {pg_ctl}=await import('@embedded-postgres/windows-x64');
 const databaseDir=path.join(directory,'postgres-native');
 const port=await freePort();
 const password=crypto.createHash('sha256').update('olist-local-postgres\0'+adminPassword).digest('hex');
 const log=path.join(directory,'postgres.log');
 const cluster=new EmbeddedPostgres({databaseDir,port,user:'postgres',password,authMethod:'scram-sha-256',persistent:true,
  // Keep new clusters independent of the signed-in Windows account's system locale.
  initdbFlags:['--locale=C','--encoding=UTF8'],
  onLog:line=>fs.appendFileSync(log,line+'\n'),onError:error=>fs.appendFileSync(log,error.message+'\n')});
 if(!fs.existsSync(path.join(databaseDir,'PG_VERSION')))await cluster.initialise();
 const ctl=args=>promisify(execFile)(pg_ctl,['-D',databaseDir,'-w','-t','20',...args],{windowsHide:true,timeout:25000});
 await ctl(['-l',log,'-o','-h 127.0.0.1 -p '+port,'start']);
 const pg=cluster.getPgClient('postgres','127.0.0.1');
 const close=async()=>{try{await pg.end();}finally{await ctl(['-m','fast','stop']);}};
 try{
  await pg.connect();
  await pg.query(`CREATE TABLE IF NOT EXISTS public.local_migrations(name text PRIMARY KEY);`);
  const installed=new Set((await pg.query('SELECT name FROM public.local_migrations')).rows.map(r=>r.name));
  const migrations=path.resolve(__dirname,'../cloudbase/migrations');
  await pg.query('BEGIN');
  try{
   if(!installed.has('local-bootstrap')){
    await pg.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
     CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS 'SELECT NULL::text';
     CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
    await pg.query('INSERT INTO public.local_migrations VALUES ($1)',['local-bootstrap']);
   }
   for(const name of fs.readdirSync(migrations).filter(n=>n.endsWith('.sql')).sort()){
    if(installed.has(name))continue;
    await pg.query(fs.readFileSync(path.join(migrations,name),'utf8'));
    await pg.query('INSERT INTO public.local_migrations VALUES ($1)',[name]);
   }
   for(const role of ['admin','analyst'])await pg.query('INSERT INTO olist_v21.users(subject,role,display_name) VALUES ($1,$2,$1) ON CONFLICT DO NOTHING',['local-'+role,role]);
   await pg.query('COMMIT');
  }catch(error){await pg.query('ROLLBACK');throw error;}
  let pending=Promise.resolve();
  function query(sql,params){const next=pending.then(()=>pg.query(sql,params));pending=next.catch(()=>{});return next;}
  async function invoke(fn,params,types){
   const placeholders=types.map((type,i)=>'$'+(i+1)+'::'+type).join(',');
   return (await query('SELECT public.'+fn+'('+placeholders+') AS value',params)).rows[0].value;
  }
  function repository(prefix){
   const rpc=(name,params,types)=>invoke('olist_v21_'+prefix+name,params,types);
   return {
    schedule(value=null,actor=null){return invoke('olist_v21_replay_schedule',[value,actor],['jsonb','text']);},
    read(kind,id=null){return rpc('read',[kind,id],['text','text']);},
    async command(operation,body,actor){
     if(operation==='cancel')return rpc('cancel',[body.id,actor],['uuid','text']);
     if(operation==='ack_cancel')return rpc('ack_cancel',[body.id,body.worker_id],['uuid','text']);
     if(operation==='recover')await rpc('recover_canceled',[],[]);
     return rpc('command',[operation,body,actor],['text','jsonb','text']);
    },
    registerFile(file){return rpc('file',[file],['jsonb']);}
   };
  }
  const accounts={'local-admin':adminPassword,'local-analyst':analystPassword};
  const hash=s=>crypto.createHash('sha256').update(s).digest();
  const sessions=new Sessions({
   async login(username,password){
    check(Object.hasOwn(accounts,username)&&typeof password==='string'&&crypto.timingSafeEqual(hash(accounts[username]),hash(password)),'Invalid local credentials',401);
    return {access_token:username,expires_in:3600};
   },
   async identity(token){check(Object.hasOwn(accounts,token),'Session expired',401);return {sub:token};},
   async membership(token){return (await query('SELECT subject,role,display_name FROM olist_v21.users WHERE subject=$1 AND enabled',[token])).rows[0];}
  });
  const store=new ImmutableFiles(path.join(directory,'blobs'));
  const simFiles={get:id=>store.get(id),async put(bytes){const blob=await store.put(bytes);return {...blob,object_key:'local-sim/'+blob.sha256};}};
  return {repo:repository(''),scenarioRepo:repository('sim_'),sessions,simFiles,query,async close(){await pending;await close();}};
 }catch(error){await close();throw error;}
}
module.exports={open};
