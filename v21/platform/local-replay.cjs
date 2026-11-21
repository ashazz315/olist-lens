'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {open}=require('./lib/local-postgres.cjs'),{createServer}=require('./server.cjs');
async function start(directory,port){
 fs.mkdirSync(directory,{recursive:true});
 const file=path.join(directory,'local-accounts.json');
 if(!fs.existsSync(file)){
  const password=()=>crypto.randomBytes(20).toString('base64url');
  fs.writeFileSync(file,JSON.stringify({adminPassword:password(),analystPassword:password()},null,2),{flag:'wx',mode:0o600});
 }
 const modelKeyFile=path.join(directory,'model-encryption-key');
 if(!process.env.LENS_SECRET_KEY&&!fs.existsSync(modelKeyFile)){
  try{fs.writeFileSync(modelKeyFile,crypto.randomBytes(32).toString('hex'),{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;}
 }
 const modelKey=process.env.LENS_SECRET_KEY||fs.readFileSync(modelKeyFile,'utf8').trim();
 if(!/^[a-f0-9]{64}$/i.test(modelKey))throw Error('Invalid local model encryption key');
 const db=await open(directory,JSON.parse(fs.readFileSync(file,'utf8')));
 const env={LENS_PYTHON:process.env.LENS_PYTHON,LENS_ARTIFACT_MODULE:process.env.LENS_ARTIFACT_MODULE,
  LENS_REPORT_DIR:path.join(directory,'reports'),LENS_SECRET_KEY:modelKey};
 const app=createServer({env,repo:db.repo,scenarioRepo:db.scenarioRepo,sessions:db.sessions,scenarioFiles:db.simFiles,localReplay:true});
 try{await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});}
 catch(error){await db.close();throw error;}
 return {app,db,port:app.server.address().port,async close(){await app.close();await db.close();}};
}
if(require.main===module){
 const run=process.argv[2];
 if(run&&!/^\d{4}-\d\d-\d\dT[0-9Z-]+$/.test(run))throw Error('Invalid acceptance run');
 const directory=run?path.join(__dirname,'private/replay-acceptance',run):path.join(__dirname,'private/local-replay');
 if(run&&!fs.existsSync(path.join(directory,'postgres-native/PG_VERSION')))throw Error('Existing replay acceptance database not found');
 start(directory,Number(process.env.LENS_PLATFORM_PORT||8794)).then(instance=>{
  console.log('Local PostgreSQL replay: http://127.0.0.1:'+instance.port+'/ and /admin/');
  console.log('Local account file: '+path.join(directory,'local-accounts.json'));
  process.once('SIGINT',()=>instance.close().catch(e=>{console.error(e.message);process.exitCode=1;}));
 }).catch(e=>{console.error(e.message);process.exitCode=1;});
}
module.exports={start};
