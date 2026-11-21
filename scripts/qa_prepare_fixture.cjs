// Reuse the existing explicitly SYNTHETIC core fixture; clean checkouts have no tmp files.
'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
const r=spawnSync(process.execPath,['--test',path.resolve(__dirname,'../tests/core.test.cjs')],{env:{...process.env,WRITE_FIXTURE:'1'},stdio:'inherit'});
if(r.error)throw r.error;
process.exitCode=r.status??1;
