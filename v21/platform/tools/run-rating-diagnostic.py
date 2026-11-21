"""Capture new evidence only; do not retry full SQL or overwrite earlier runs."""
import csv,datetime,hashlib,json,os,subprocess,time,uuid
from pathlib import Path
platform=Path(__file__).resolve().parents[1]
out=platform/'private'/('rating-gate-20261118-'+uuid.uuid4().hex[:8]);out.mkdir()
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
def save(name,data):(out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
version_file=platform/'private/baseline/olist/version.json';analysis_file=version_file.with_name('analysis.json');version=json.loads(version_file.read_text(encoding='utf8'))
supplement=platform/'private/sku-fulfillment'/(version['id']+'.json');checkfile=supplement.with_suffix('.sha256')
input_dir=platform/'private/m3-existing-canonical/canonical'
assets={str(p.relative_to(platform)):sha(p) for p in [version_file,analysis_file,supplement,checkfile] if p.is_file()}
supplement_status='missing'
if supplement.exists() and checkfile.exists():
    supplement_status='verified' if sha(supplement)==checkfile.read_text().strip() else 'hash_mismatch'
input_hashes={name:sha(input_dir/name) for name in version['file_hashes']};assert input_hashes==version['file_hashes'],'Canonical inputs changed'
with (input_dir/'order_reviews.csv').open(encoding='utf-8-sig',newline='') as f:
    reader=csv.reader(f);records=[];logical=0
    for physical_row in reader:
        if not physical_row:continue
        logical+=1
        if logical==1:header=physical_row
        if logical in [83484,83485,83486]:
            score=physical_row[header.index('review_score')];records.append({'logical_csv_record':logical,'physical_end_line':reader.line_num,'score':score,'code_points':[ord(x) for x in score]})
        if logical>=83486:break
save('baseline.json',{'version':version['id'],'assets_before':assets,'supplement_status':supplement_status,'canonical_hashes':input_hashes,'independent_python_rows':records,'python':os.sys.version})
node=Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
cmd=[str(node),str(platform/'tools/diagnose-rating-gate.cjs'),str(input_dir),str(out/'gate-result.json')];start=time.monotonic()
with (out/'stdout.log').open('wb') as stdout,(out/'stderr.log').open('wb') as stderr:
    process=subprocess.Popen(cmd,cwd=platform.parents[1],stdout=stdout,stderr=stderr,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));code=process.wait(timeout=60)
after={name:sha(platform/name) for name in assets};assert assets==after,'Protected asset changed'
save('execution.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':cmd,'cwd':str(platform.parents[1]),'pid':process.pid,'exit_code':code,'exit_hex':hex(code&0xffffffff),'elapsed_seconds':time.monotonic()-start,'assets_unchanged':True,'stdout':'stdout.log','stderr':'stderr.log'})
if (out/'gate-result.json').exists():
    result=json.loads((out/'gate-result.json').read_text(encoding='utf8'));assert [{'logical_csv_record':x['logical_csv_record'],'score':x['score'],'code_points':x['code_points']} for x in records]==[{'logical_csv_record':x['logical_csv_record'],'score':x['score'],'code_points':x['code_points']} for x in result['observed']]
print(json.dumps({'directory':str(out),'exit_code':code,'assets_unchanged':True}));raise SystemExit(code)
