"""Serial real-data calculation; receipts are separate from durable engine results."""
import argparse,collections,datetime,hashlib,json,os,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3]
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def write(p,value):
    tmp=p.with_suffix(p.suffix+'.partial')
    with tmp.open('x',encoding='utf8') as f:json.dump(value,f,ensure_ascii=False);f.flush();os.fsync(f.fileno())
    os.replace(tmp,p)
def run(command,cwd,out,name):
    start=time.time()
    with (out/(name+'.stdout.log')).open('wb') as so,(out/(name+'.stderr.log')).open('wb') as se:
        p=subprocess.Popen(command,cwd=cwd,stdout=so,stderr=se,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0));code=p.wait()
    r={'command':command,'cwd':str(cwd),'pid':p.pid,'exit_code':code,'duration_seconds':time.time()-start,'stdout':name+'.stdout.log','stderr':name+'.stderr.log'}
    write(out/(name+'.receipt.json'),r)
    if code:raise RuntimeError(f'{name} exited {code}; completed artifacts retained; publication forbidden')
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--raw',type=Path,required=True);ap.add_argument('--out',type=Path,required=True);ap.add_argument('--node',required=True);ap.add_argument('--manifest',type=Path,required=True);ap.add_argument('--schema',type=Path,required=True);args=ap.parse_args()
    out=args.out.resolve();out.mkdir(parents=True,exist_ok=False);raw=args.raw.resolve()
    provenance=json.loads((raw/'provenance.json').read_text(encoding='utf8'))
    hashes={r['name']:digest(raw/r['name']) for r in provenance['files']}
    if any(hashes[r['name']]!=r['sha256'] for r in provenance['files']):raise ValueError('Previously audited input changed; no automatic publication')
    write(out/'input-receipt.json',{'is_synthetic':False,'mode':'historical_replay','at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'hashes':hashes,'provenance':provenance,'scope':'Integrity comparison only; nine-table audit not repeated'})
    run([sys.executable,str(ROOT/'scripts/prepare_case.py'),'--raw-dir',str(raw),'--out-dir',str(out/'canonical'),'--schema-path',str(args.schema.resolve())],ROOT,out,'normalize')
    manifest=json.loads(args.manifest.read_text(encoding='utf8'));manifest=manifest.get('manifest',manifest)
    write(out/'canonical/dataset_manifest.json',manifest)
    write(out/'canonical-hashes.json',{p.name:digest(p) for p in (out/'canonical').glob('*.csv')})
    run([args.node,str(Path(__file__).with_name('m3-engine.cjs')),str(out/'canonical'),str(out/'engine-result.json')],ROOT,out,'engine')
    full=json.loads((out/'engine-result.json').read_text(encoding='utf8'));ops=full['operations'];mon=full['monitoring']
    projection={k:full[k] for k in ['metrics','verification','quality']}
    projection['operations']={k:ops.get(k) for k in ['id','metric_version','calculation_version','status','verification','periods','quality','metrics','dimensions','delta_cents','limitations','verified_cube','source','evidence_hash']}
    projection['monitoring']={k:mon.get(k) for k in ['run_id','dataset_version','v1_snapshot_id','rule_set_version','calculation_version','metric_version','status','events','gates','config','periods','source_ref','evidence_hash']}
    counts=collections.Counter(str(reason) for e in mon.get('evaluations',[]) for reason in e.get('suppressed_reasons',e.get('reasons',[])))
    projection['monitoring']['suppressed_summary']={'counts':dict(counts),'stored_evaluation_count':len(mon.get('evaluations',[]))}
    projection['projection']={'source_sha256':digest(out/'engine-result.json'),'no_recalculation':True}
    write(out/'analysis-projection.json',projection)
    write(out/'completed.json',{'status':'candidate_computed_not_published','result_sha256':digest(out/'engine-result.json'),'node':subprocess.check_output([args.node,'--version'],text=True).strip()})
    print(str(out))
if __name__=='__main__':main()
