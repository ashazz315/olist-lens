"""Package only intended public artifacts; original data and local credentials stay out."""
import csv,json,shutil,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];DIST=ROOT/'cloud/dist';DL=DIST/'downloads';DL.mkdir(parents=True,exist_ok=True)
T=ROOT/'output/templates'
m=json.loads((T/'dataset_manifest.json').read_text(encoding='utf-8'));m.pop('template_status',None);m['schema_version']='1.0.0';(T/'dataset_manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2),encoding='utf-8')
guide=(T/'README.md').read_text(encoding='utf-8').replace('模板版本 1.0.0-draft，产品设计 v0.2。当前仅提供模板与规则设计；导入执行、自动校验和指标重算尚未实现。','模板版本 1.0.0。导入、自动校验与 SQL / JavaScript 独立复算已实现。').replace('第一版规划为完整快照替换','第一版使用完整快照替换').replace('当前展示页仅提供下载与流程设计，不接收文件。','在产品的“导入新数据”页面选择三张 CSV 与批次说明，检查与复算完成后预览并确认切换；文件在浏览器本机处理。').replace('规则在 Kaggle 适配完成后再核验并锁定。','该规则已在公开案例核验，指标版本为 1.0.0。').replace('当前草案尚未对真实 Kaggle 文件运行验证；格式正确不能证明原始业务记录真实。','结构版本已经过真实 Kaggle 适配及测试；格式正确仍不能单独证明原始业务记录真实。')
(T/'README.md').write_text(guide,encoding='utf-8')
names=['orders.csv','order_items.csv','order_reviews.csv','dataset_manifest.json','schema.json','README.md']
with zipfile.ZipFile(T/'import-templates-v1.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    for name in names:z.write(T/name,name)
shutil.copyfile(T/'import-templates-v1.zip',DL/'import-templates.zip');shutil.copyfile(T/'README.md',DL/'import-guide.md');shutil.copyfile(ROOT/'output/pdf/olist-case-study.pdf',DL/'olist-case-study.pdf');shutil.copyfile(ROOT/'data/raw/kaggle-v2/provenance.json',DL/'provenance.json')
# Source archive deliberately excludes raw datasets, browser caches, Git and hosting credentials.
with zipfile.ZipFile(DL/'project-source.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
    for pattern in ['scripts/*.py','scripts/*.cjs','scripts/*.mjs','tests/*.cjs','notebooks/*.ipynb','output/templates/*.csv','output/templates/*.json','output/templates/README.md','cloud/dist/*.js','cloud/dist/*.sql','cloud/dist/*.css','cloud/dist/index.html','cloud/dist/favicon.svg','cloud/dist/vendor/*','*.md','Start.ps1','requirements-report.txt','output/analysis/*.json']:
        for p in ROOT.glob(pattern):
            if p.is_file():z.write(p,p.relative_to(ROOT).as_posix())
    z.write(ROOT/'output/pdf/olist-case-study.pdf','output/pdf/olist-case-study.pdf')
local=ROOT/'output/site';local.mkdir(parents=True,exist_ok=True)
shutil.copytree(DIST,local,dirs_exist_ok=True)
print(json.dumps({'public_files':sum(1 for p in DIST.rglob('*') if p.is_file()),'pdf_bytes':(DL/'olist-case-study.pdf').stat().st_size,'source_zip_bytes':(DL/'project-source.zip').stat().st_size}))
