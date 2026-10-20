const {chromium}=require('C:/Users/Zhang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),BASE=process.env.LENS_TEST_URL||'http://127.0.0.1:8787';
(async()=>{const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true}),page=await context.newPage();const errors=[],writes=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')writes.push({url:r.url(),method:r.method()});});
  await page.goto(BASE);await page.waitForFunction(()=>typeof current!=='undefined'&&current.metrics&&database!==null);console.log('layout',await page.evaluate(()=>({width:innerWidth,height:document.documentElement.scrollHeight})));
  assert.equal(await page.evaluate(()=>current.metrics.delivered_orders),96478);const publicId=await page.evaluate(()=>current.id);
  await page.screenshot({path:path.join(ROOT,'output/previews/product-overview.png'),fullPage:true});
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});for(const panel of ['overview','quality','import','history','methods']){await page.locator(`[data-panel="${panel}"]`).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${panel}@${width}`);}
   if(width===390){await page.locator('[data-panel="overview"]').click();await page.screenshot({path:path.join(ROOT,'output/previews/product-mobile.png'),fullPage:true});}
  }
  await page.setViewportSize({width:1440,height:1100});await page.locator('[data-panel="overview"]').click();
  await page.getByRole('tab',{name:'地区诊断'}).click();assert.equal(await page.locator('#chart-title').textContent(),'地区延迟贡献');await page.getByRole('tab',{name:'地区诊断'}).press('ArrowRight');assert.equal(await page.locator('#chart-title').textContent(),'交付体验与低评分');
  await page.locator('[data-panel="quality"]').click();await page.screenshot({path:path.join(ROOT,'output/previews/product-quality.png'),fullPage:true});
  // Verify all published local download links respond successfully.
  const links=await page.locator('a').evaluateAll(a=>a.map(x=>x.href));for(const href of links.filter(x=>x.startsWith(locationOrigin(BASE))&&!x.includes('#'))){const response=await page.request.get(href);assert.equal(response.status(),200,href);}
  const fill=async directory=>{await page.locator('[data-panel="import"]').click();for(const name of ['orders','order_items','order_reviews'])await page.locator('#file-'+name).setInputFiles(path.join(directory,name+'.csv'));await page.locator('#file-manifest').setInputFiles(path.join(directory,'dataset_manifest.json'));};
  const run=async()=>{await page.locator('#run-import').click();await page.waitForFunction(()=>!document.querySelector('#run-import').disabled&&!document.querySelector('#import-preview').classList.contains('hidden'),null,{timeout:120000});};
  const fixture=path.join(ROOT,'tmp/test-import'),template=path.join(ROOT,'output/templates');
  // Empty templates must not switch the active version.
  await fill(template);await run();assert.match(await page.locator('#import-progress').textContent(),/阻断/);assert.equal(await page.evaluate(()=>current.id),publicId);assert.equal(await page.locator('#commit-import').isVisible(),false);
  // Synthetic fixture is clearly labeled, checked in the real Worker, then committed.
  await fill(fixture);await run();assert.equal(await page.evaluate(()=>candidate.result.metrics.amount_cents),3610);assert.equal(await page.evaluate(()=>current.id),publicId);await page.locator('#commit-import').click();await page.waitForFunction(()=>current.metrics.delivered_orders===4);const syntheticId=await page.evaluate(()=>current.id);
  await page.reload();await page.waitForFunction(()=>current.metrics.delivered_orders===4);assert.equal(await page.evaluate(()=>current.id),syntheticId);
  await fill(fixture);await run();assert.match(await page.locator('#import-progress').textContent(),/相同批次/);assert.equal(await page.locator('#commit-import').isVisible(),false);assert.equal(await page.evaluate(async()=> (await getSnapshots()).length),1);
  // Malformed rating produces a downloadable issue record, retaining the valid snapshot.
  const bad=path.join(ROOT,'tmp/bad-import');fs.mkdirSync(bad,{recursive:true});for(const name of ['orders.csv','order_items.csv','order_reviews.csv','dataset_manifest.json'])fs.copyFileSync(path.join(fixture,name),path.join(bad,name));fs.writeFileSync(path.join(bad,'order_reviews.csv'),fs.readFileSync(path.join(bad,'order_reviews.csv'),'utf8').replace('R01,O01,5,','R01,O01,0,'));
  await fill(bad);await run();assert.match(await page.locator('#import-progress').textContent(),/阻断/);assert.equal(await page.evaluate(()=>current.id),syntheticId);const dlPromise=page.waitForEvent('download');await page.locator('#download-errors').click();const dl=await dlPromise;await dl.saveAs(path.join(ROOT,'tmp/import-errors.csv'));assert.match(fs.readFileSync(path.join(ROOT,'tmp/import-errors.csv'),'utf8'),/rating/);
  // Restore published case, and restore a backup with deliberately corrupted saved metrics.
  const backup=await page.evaluate(async()=>{const a=(await getSnapshots())[0];a.result.metrics.delivered_orders=999999;return a;});const backupPath=path.join(ROOT,'tmp/tampered-backup.json');fs.writeFileSync(backupPath,JSON.stringify(backup));
  await page.locator('[data-panel="history"]').click();await page.locator('#restore-case').click();await page.waitForFunction(()=>current.metrics.delivered_orders===96478);await page.locator('#backup-file').setInputFiles(backupPath);await page.waitForFunction(()=>candidate?.result.metrics.delivered_orders===4);assert.equal(await page.evaluate(()=>current.metrics.delivered_orders),96478);
  // Cancel during file reads; asynchronous read completion must not restart processing.
  await fill(path.join(ROOT,'data/canonical/olist-v2'));await page.locator('#run-import').click();await page.locator('#cancel-import').click();await page.waitForTimeout(700);assert.equal(await page.evaluate(()=>worker),null);assert.equal(await page.evaluate(()=>current.id),publicId);
  // Full 99k-order browser import should match the published case exactly, including hash.
  await fill(path.join(ROOT,'data/canonical/olist-v2'));await run();assert.equal(await page.evaluate(()=>candidate.result.id),publicId);assert.equal(await page.evaluate(()=>candidate.result.metrics.amount_cents),1322149811);assert.equal(await page.evaluate(()=>candidate.result.verification.status),'通过');
  await page.screenshot({path:path.join(ROOT,'output/previews/product-import.png'),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await page.locator('[data-panel="overview"]').click();await page.emulateMedia({media:'print'});await page.pdf({path:path.join(ROOT,'tmp/browser-print.pdf'),format:'A4',printBackground:true});
  const result={ok:true,viewports:[1440,1024,768,390,320],coreBrowserFlows:['empty blocked','valid preview commit','reload persistence','idempotence','invalid rating retains old','CSV errors download','case restore','backup recomputed','cancellation','full real-data import matches published'],filesUploadedToServer:0,pageErrors:errors,publicId};fs.writeFileSync(path.join(ROOT,'output/analysis/browser-qa.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
function locationOrigin(url){return new URL(url).origin;}
