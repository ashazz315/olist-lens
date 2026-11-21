"""Isolate Node24 calculation using the previously audited canonical files."""
import importlib.util,json,sys
from pathlib import Path
p=Path(__file__).with_name('m3-recompute.py');spec=importlib.util.spec_from_file_location('runner',p);r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
root=p.resolve().parents[3];platform=p.resolve().parents[1]
baseline=json.loads((platform/'private/baseline/olist/version.json').read_text(encoding='utf8'))
source=Path(baseline['provenance']['original_directory'])
out=platform/'private/m3-existing-canonical';out.mkdir(exist_ok=False);canonical=out/'canonical';canonical.mkdir()
for name,expected in baseline['file_hashes'].items():
    assert r.digest(source/name)==expected
    (canonical/name).write_bytes((source/name).read_bytes())
r.write(canonical/'dataset_manifest.json',baseline['manifest'])
r.write(out/'input-receipt.json',{'canonical_sha256':baseline['file_hashes'],'source_directory':str(source),'basis':'previously audited normalization; raw-to-canonical rerun crashed separately','is_synthetic':False})
node=str(Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
r.run([node,str(p.with_name('m3-engine.cjs')),str(canonical),str(out/'engine-result.json')],root,out,'engine')
print(json.dumps({'result':str(out/'engine-result.json'),'sha256':r.digest(out/'engine-result.json')}))
