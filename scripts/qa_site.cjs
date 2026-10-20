// One-pass local artifact QA: browser interactions, file links and responsive width.
const {chromium}=require('C:/Users/Zhang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core');
const {pathToFileURL,fileURLToPath}=require('node:url');
const path=require('node:path');
const fs=require('node:fs');
(async()=>{
 const root=path.resolve(__dirname,'..');
 const preview=path.join(root,'output','previews'); fs.mkdirSync(preview,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(pathToFileURL(path.join(root,'output','site','index.html')).href);
  await page.screenshot({path:path.join(preview,'site-desktop.png'),fullPage:true});
  await page.screenshot({path:path.join(preview,'site-preview.png'),fullPage:false});
  for(const id of ['quality','import','references'])if(!await page.locator('#'+id).isVisible())throw Error('Missing section '+id);
  if((await page.locator('.quality-status strong').allTextContents()).join('|')!=='待接入|未执行|未执行|待验证')throw Error('Unexecuted checks shown as verified');
  if(await page.locator('.template-list a[download]').count()!==3)throw Error('CSV templates missing');
  const schema=JSON.parse(fs.readFileSync(path.join(root,'output','templates','schema.json'),'utf8'));
  for(const table of Object.values(schema.tables)){
   const csv=fs.readFileSync(path.join(root,'output','templates',table.filename),'utf8');
   if(csv.trim()!==table.fields.map(f=>f.name).join(','))throw Error('Template mismatch or unexpected data '+table.filename);
  }
  for(const [name,expected] of [['02 履约诊断','地区履约差异'],['03 体验关联','交付体验与订单评价'],['01 经营概览','月度订单表现']]){
   await page.getByRole('tab',{name}).click();
   if(await page.locator('#chart-title').textContent()!==expected)throw Error('Tab content mismatch');
  }
  await page.getByRole('tab',{name:'01 经营概览'}).focus();
  await page.keyboard.press('ArrowRight');
  if(await page.locator('#tab-1').getAttribute('aria-selected')!=='true')throw Error('Keyboard tab failed');
  await page.getByRole('tab',{name:'01 经营概览'}).click();
  await page.getByText('为什么商品金额不叫平台收入？',{exact:true}).click();
  if(!await page.locator('details').nth(1).getAttribute('open').then(v=>v!==null))throw Error('Disclosure failed');
  await page.getByText('为什么商品金额不叫平台收入？',{exact:true}).click();
  const links=await page.locator('a').evaluateAll(as=>as.map(a=>a.href));
  for(const href of links.filter(x=>x.startsWith('file:')&&!x.includes('#'))){if(!fs.existsSync(fileURLToPath(href)))throw Error('Missing file '+href)}
  for(const width of [1440,768,390,320]){
   await page.setViewportSize({width,height:1000});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
   if(overflow)throw Error('Horizontal overflow at '+width);
   if(width===390)await page.screenshot({path:path.join(preview,'site-mobile.png'),fullPage:true});
  }
  if(errors.length)throw Error(errors.join('\n'));
  console.log(JSON.stringify({ok:true,viewports:[1440,768,390,320],tabs:true,keyboard:true,disclosures:true,localLinks:true,qualityStatus:'not_executed',emptyTemplates:3,pageErrors:errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
