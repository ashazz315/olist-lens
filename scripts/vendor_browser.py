"""Pin and vendor the two browser dependencies from the npm package registry."""
import base64, hashlib, io, json, tarfile, urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'cloud/dist/vendor'; OUT.mkdir(parents=True,exist_ok=True)
records=[]
for package,version,names in [('sql.js','1.15.1',['dist/sql-wasm.js','dist/sql-wasm.wasm','LICENSE']),('papaparse','5.7.0',['papaparse.min.js','LICENSE'])]:
    meta=json.load(urllib.request.urlopen('https://registry.npmjs.org/'+package+'/'+version,timeout=30))
    url=meta['dist']['tarball']; body=urllib.request.urlopen(url,timeout=60).read()
    if 'sha512-'+base64.b64encode(hashlib.sha512(body).digest()).decode()!=meta['dist']['integrity']:raise ValueError('npm integrity mismatch')
    with tarfile.open(fileobj=io.BytesIO(body),mode='r:gz') as t:
        for name in names:
            data=t.extractfile('package/'+name).read()
            dest=OUT/(package.replace('.','-')+'-LICENSE' if name=='LICENSE' else Path(name).name)
            dest.write_bytes(data)
    records.append({'name':package,'version':meta['version'],'license':meta.get('license'),'tarball':url,'npm_integrity':meta['dist'].get('integrity'),'download_sha256':hashlib.sha256(body).hexdigest()})
(OUT/'dependencies.json').write_text(json.dumps(records,indent=2),encoding='utf-8')
print(json.dumps(records))
