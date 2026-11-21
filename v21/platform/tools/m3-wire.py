"""Apply narrowly scoped M3 wiring once, with exact-match safeguards."""
from pathlib import Path
p=Path(__file__).resolve().parents[1]
def replace(file,old,new):
    f=p/file;s=f.read_text(encoding='utf8');assert s.count(old)==1,(file,old[:90],s.count(old));f.write_text(s.replace(old,new),encoding='utf8')
replace('lib/imports.cjs',"async submit(input,actor){check(SOURCES", "async submit(input,actor){if(input.format==='olist_raw_nine_v2'){const request=require('./raw-olist.cjs').request(input);return this.repo.command('submit',{id:crypto.randomUUID(),source:'olist',request},actor);}check(SOURCES")
replace('lib/imports.cjs',"const files={};for(const [name,blob] of Object.entries(job.request.files))", "const raw=job.request.format==='olist_raw_nine_v2',files={};for(const [name,blob] of Object.entries(raw?{}:job.request.files))")
replace('lib/imports.cjs',"const expectedId=sha(stable(","const expectedId=raw?require('./raw-olist.cjs').identity(job.request):sha(stable(")
replace('lib/imports.cjs',"analysis:saved.result}:await compute(","analysis:saved.result}:raw?await require('./raw-olist.cjs').compute(job.request,this.files):await compute(")
replace('server.cjs',"if(route==='/api/v1/imports')check", "if(['/api/v1/imports','/api/v1/raw-files'].includes(route))check")
replace('server.cjs',"const limit=route==='/api/v1/imports'?", "const limit=['/api/v1/imports','/api/v1/raw-files'].includes(route)?")
replace('server.cjs',"if(route==='/api/v1/imports'&&req.method==='POST'){", "if(route==='/api/v1/raw-files'&&req.method==='POST'){admin();check(!simulated,'Real raw files cannot enter simulation');return send(201,await require('./lib/raw-olist.cjs').upload(body,files,realRepo));}\n   if(route==='/api/v1/imports'&&req.method==='POST'){")
replace('public/app.js',"Olist 标准三表", "Olist 标准三表 / 原始九表")
replace('public/app.js',"使用现有转换器产出的标准 CSV；此处不重跑九张原始表审计。", "支持已审计 Olist 九表逐文件上传，或现有标准三表；此处不重跑原始表审计。")
replace('public/app.js',"const files={};for(const f of form.elements.files.files)files[f.name]=await f.text();await api('imports',", "const chosen=[...form.elements.files.files];if(workspace==='real'&&data.source==='olist'&&chosen.some(f=>f.name.startsWith('olist_'))){const refs={};for(const f of chosen){$('#message').textContent='私有上传：'+f.name;const base64=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result.split(',')[1]);r.onerror=reject;r.readAsDataURL(f);});refs[f.name]=await api('raw-files',{filename:f.name,base64});}await api('imports',{source:'olist',format:'olist_raw_nine_v2',manifest:JSON.parse(data.manifest),file_refs:refs});await render('imports');return;}const files={};for(const f of chosen)files[f.name]=await f.text();await api('imports',")
