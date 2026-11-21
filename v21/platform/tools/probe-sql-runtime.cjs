'use strict';
// Runtime-only diagnostic. No raw nine-table audit, publication or core changes.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../../..'),dist=path.join(root,'cloud/dist');
const init=require(path.join(dist,'vendor/sql-wasm.js'));
(async()=>{const SQL=await init({locateFile:n=>path.join(dist,'vendor',n)});const db=new SQL.Database();try{console.log(JSON.stringify({node:process.version,stage:'runtime',temp_store:db.exec('PRAGMA temp_store'),compile_options:db.exec('PRAGMA compile_options')[0].values.filter(r=>/TEMP|MEM|THREAD/.test(r[0]))}));for(const mode of ['DEFAULT','MEMORY']){db.run('PRAGMA temp_store='+mode);const t=Date.now();try{const result=db.exec('WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<120000) SELECT x FROM n ORDER BY x DESC LIMIT 1');console.log(JSON.stringify({mode,status:'passed',result,ms:Date.now()-t}));}catch(e){console.log(JSON.stringify({mode,status:'failed',error:e.message,ms:Date.now()-t}));}}}finally{db.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});
