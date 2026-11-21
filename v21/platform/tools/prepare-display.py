"""Project stored verification results for UI delivery. No CSV or metric engine execution."""
import collections,hashlib,json,pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
out=ROOT/'platform/private/baseline'
out.mkdir(parents=True,exist_ok=True)
dirs=['7e2cbd3659afc738653bc3fa-79ab3525','16e7ebf515713ff0b6fa27e4-a27ecd94','985ee3adb825f0ff2af1fa5c-7c2b3e8d']
records=[]
for name in dirs:
    directory=ROOT/'runtime/v'/name
    version=json.loads((directory/'version.json').read_text(encoding='utf-8'))
    if version['source']=='olist':
        raw=(directory/'analysis.json').read_bytes()
        original=json.loads(raw)
        digest=hashlib.sha256(raw).hexdigest()
        ops=original['operations']; mon=original['monitoring']
        analysis={'metrics':original['metrics'],'verification':original['verification'],
          'operations':{k:ops.get(k) for k in ['id','metric_version','calculation_version','status','verification','periods','quality','metrics','dimensions','delta_cents','limitations','verified_cube','source','evidence_hash']},
          'monitoring':{k:mon.get(k) for k in ['run_id','dataset_version','v1_snapshot_id','rule_set_version','calculation_version','metric_version','status','events','gates','config','periods','source_ref','evidence_hash']},
          'cached_sku':json.loads((ROOT/'evidence/browser-2026-11-15T01-14-50-413Z/sku-evidence.json').read_text(encoding='utf-8')),
          'projection':{'source_sha256':digest,'no_recalculation':True,'omitted':'redundant rule evaluations and metric snapshots; original JSON preserved'}}
        counter=collections.Counter()
        for e in mon.get('evaluations',[]):
            for reason in e.get('suppressed_reasons',e.get('reasons',[])):
                counter[str(reason)]+=1
        analysis['monitoring']['suppressed_summary']={'basis':'counts of stored evaluation reasons; not re-evaluated','counts':dict(counter),'stored_evaluation_count':len(mon.get('evaluations',[]))}
    else:
        analysis={'external':version['summary']}
        digest=hashlib.sha256((directory/'version.json').read_bytes()).hexdigest()
    target=out/version['source'];target.mkdir(exist_ok=True)
    with (target/'analysis.json').open('x',encoding='utf-8') as f:json.dump(analysis,f,ensure_ascii=False,separators=(',',':'))
    with (target/'version.json').open('x',encoding='utf-8') as f:json.dump(version,f,ensure_ascii=False,separators=(',',':'))
    records.append({'source':version['source'],'version':version['id'],'source_sha256':digest,'display_sha256':hashlib.sha256((target/'analysis.json').read_bytes()).hexdigest(),'engine_executed':False,'directory':str(target)})
with (out/'manifest.json').open('x',encoding='utf-8') as f:json.dump(records,f,ensure_ascii=False,indent=2)
print(json.dumps([{'source':r['source'],'engine_executed':False} for r in records]))
