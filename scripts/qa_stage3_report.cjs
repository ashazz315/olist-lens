// Read-only report QA and local chart screenshots; no remote publication.
'use strict';
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const {chromium}=require(process.env.LENS_PLAYWRIGHT_MODULE||'playwright-core');
(async()=>{
 const root=path.resolve(process.argv[2]),load=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const broken=[];let links=0;for(const file of walk(root).filter(f=>f.endsWith('.md'))){const text=fs.readFileSync(file,'utf8');for(const m of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){if(/^https?:/.test(m[1]))continue;links++;if(!fs.existsSync(path.resolve(path.dirname(file),m[1].split('#')[0])))broken.push({file,link:m[1]});}}
 assert.deepEqual(broken,[]);const b=load('backtest/monitoring-backtest-results.json'),independent=load('backtest/independent-window-reconciliation.json');assert.equal(b.verified_windows,independent.windows.length);assert(fs.readdirSync(root+'/cases').filter(f=>/^case-\d+\.json$/.test(f)).length>=5);
 fs.mkdirSync(root+'/screenshots',{recursive:true});const browser=await chromium.launch({executablePath:process.env.LENS_BROWSER_EXECUTABLE||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});const screenshots=[];
 try{const page=await browser.newPage({viewport:{width:1200,height:450}});for(const name of ['raw-rows','weekly-events','suppression']){await page.setContent('<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#fafbf8}svg{display:block;width:100%;height:auto}</style>'+fs.readFileSync(root+'/figures/'+name+'.svg','utf8'));assert.equal(await page.locator('svg').count(),1);await page.screenshot({path:root+'/screenshots/'+name+'.png',timeout:20000});screenshots.push('screenshots/'+name+'.png');}}finally{await browser.close();}
 fs.writeFileSync(root+'/report-qa.json',JSON.stringify({passed:true,local_links_checked:links,broken_links:broken,verified_windows:independent.windows.length,case_minimum_satisfied:true,screenshots},null,2));console.log(JSON.stringify({passed:true,links,screenshots}));
})().catch(e=>{console.error(e);process.exitCode=1;});
