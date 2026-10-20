"""Download the selected public Kaggle archive, preserving provenance and hashes."""
import csv, hashlib, json, urllib.request, zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data' / 'raw' / 'kaggle-v2'
DEST.mkdir(parents=True, exist_ok=True)
BASE = 'https://www.kaggle.com/api/v1/datasets/'
metadata = json.load(urllib.request.urlopen(BASE+'view/olistbr/brazilian-ecommerce', timeout=60))
(DEST/'dataset-metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
archive=DEST/'brazilian-ecommerce-v2.zip'
if not archive.exists():
    print('Downloading public Kaggle archive...',flush=True)
    request=urllib.request.Request(BASE+'download/olistbr/brazilian-ecommerce?datasetVersionNumber=2',headers={'User-Agent':'OlistLens-Portfolio/1.0'})
    with urllib.request.urlopen(request,timeout=120) as response, archive.with_suffix('.part').open('wb') as output:
        while block:=response.read(1024*1024): output.write(block)
    archive.with_suffix('.part').replace(archive)
with zipfile.ZipFile(archive) as z:
    if z.testzip(): raise ValueError('Corrupt archive')
    for name in z.namelist():
        target=(DEST/name).resolve()
        if target.parent != DEST.resolve(): raise ValueError('Unexpected archive path')
        if not target.exists(): target.write_bytes(z.read(name))
files=[]
for p in sorted(DEST.glob('*.csv')):
    with p.open(encoding='utf-8-sig',newline='') as f:
        r=csv.reader(f); columns=next(r); count=sum(1 for _ in r)
    files.append({'name':p.name,'bytes':p.stat().st_size,'rows':count,'columns':columns,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
prior=json.loads((DEST/'provenance.json').read_text(encoding='utf-8')) if (DEST/'provenance.json').exists() else {}
provenance={'dataset':'olistbr/brazilian-ecommerce','source_url':'https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce','download_url':BASE+'download/olistbr/brazilian-ecommerce?datasetVersionNumber=2','version':2,'api_metadata_current_version':metadata.get('currentVersionNumber'),'license':metadata.get('licenseName'),'upstream_last_updated':metadata.get('lastUpdated'),'downloaded_at':prior.get('downloaded_at',datetime.now(timezone.utc).isoformat()),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':files}
(DEST/'provenance.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'license':provenance['license'],'archive_bytes':archive.stat().st_size,'files':[{k:v for k,v in f.items() if k in ('name','rows')} for f in files]},ensure_ascii=True),flush=True)
