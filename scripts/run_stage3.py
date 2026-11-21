"""Manual local orchestration. Immutable attempt directories; commit pointers only on success."""
import argparse
import hashlib
import os
import subprocess
import sys
from pathlib import Path
from stage3_io import ROOT, load, sha, now, run_id, safe_output, write_json

STAGES=('audit','prepare','analyze','verify','backtest')

def fingerprint(raw):
    files=sorted(Path(raw).glob('*.csv'))
    for name in ('provenance.json','brazilian-ecommerce-v2.zip'):
        p=Path(raw)/name
        if p.exists(): files.append(p)
    return hashlib.sha256(''.join(p.name+sha(p) for p in files).encode()).hexdigest()

def execute_attempt(stage,command,directory,context,executor=subprocess.run):
    directory.mkdir(parents=True,exist_ok=False)
    receipt={'run_id':directory.name,'stage':stage,'status':'running','started_at':now(),'process_id':os.getpid(),'command':command,'script_hashes':{str(Path(x).resolve()):sha(x) for x in command if str(x).endswith(('.py','.cjs')) and Path(x).is_file()},**context}
    write_json(directory/'run.json',receipt)
    try:
        with (directory/'execution.log').open('wb') as log:
            result=executor(command,cwd=str(ROOT),stdout=log,stderr=subprocess.STDOUT,check=False)
        receipt['exit_code']=result.returncode;receipt['status']='passed' if result.returncode==0 else 'failed'
    except BaseException as e:
        receipt['status']='interrupted' if isinstance(e,KeyboardInterrupt) else 'failed';receipt['error']=str(e)
        receipt['completed_at']=now();write_json(directory/'run.json',receipt)
        raise
    receipt['completed_at']=now();write_json(directory/'run.json',receipt)
    return receipt

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--stage',choices=STAGES+('all',),required=True);p.add_argument('--raw-dir',type=Path,default=ROOT/'data/raw/kaggle-v2');p.add_argument('--out-dir',type=Path,default=ROOT/'output/stage3/recheck');p.add_argument('--node',default='node');p.add_argument('--audit-python',default=sys.executable,help='Optional diagnostic interpreter override, recorded in the run receipt');a=p.parse_args()
    out=safe_output(a.out_dir,[a.raw_dir]);out.mkdir(parents=True,exist_ok=True);statefile=out/'stage-state.json';state=load(statefile) if statefile.exists() else {}
    if not a.raw_dir.exists(): raise SystemExit('Raw dataset missing. Run official scripts/download_kaggle.py first; authentication/source issues must be resolved before continuing.')
    batch=fingerprint(a.raw_dir)
    for stage in (STAGES if a.stage=='all' else (a.stage,)):
        previous=STAGES[:STAGES.index(stage)]
        for dependency in previous:
            r=state.get(dependency,{})
            if r.get('status')!='passed' or r.get('raw_fingerprint')!=batch: raise SystemExit('Required successful same-batch stage missing: '+dependency)
            for file,digest in r.get('outputs',{}).items():
                if not Path(file).is_file() or sha(file)!=digest: raise SystemExit('Dependency output modified: '+file)
        directory=out/'runs'/run_id();dest=directory/stage
        if stage=='audit': cmd=[a.audit_python,'-X','faulthandler',str(ROOT/'scripts/audit_raw_stage3.py'),'--raw-dir',str(a.raw_dir.resolve()),'--out-dir',str(dest)]
        if stage=='prepare': cmd=[sys.executable,str(ROOT/'scripts/prepare_case.py'),'--raw-dir',str(a.raw_dir.resolve()),'--out-dir',str(dest)]
        if stage=='analyze': cmd=[a.node,str(ROOT/'scripts/analyze.cjs'),state['prepare']['directory'],str(dest/'real-data-analysis.json')]
        if stage=='verify': cmd=[sys.executable,str(ROOT/'scripts/verify_case.py'),'--data-dir',state['prepare']['directory'],'--analysis',str(Path(state['analyze']['directory'])/'real-data-analysis.json'),'--out-dir',str(dest)]
        if stage=='backtest': cmd=[sys.executable,str(ROOT/'scripts/backtest_monitoring.py'),'--data-dir',state['prepare']['directory'],'--analysis',str(Path(state['analyze']['directory'])/'real-data-analysis.json'),'--verification',str(Path(state['verify']['directory'])/'real-data-reconciliation.json'),'--out-dir',str(dest),'--node',a.node]
        receipt=execute_attempt(stage,cmd,directory,{'raw_fingerprint':batch,'directory':str(dest),'is_synthetic':False})
        if receipt['status']=='passed' and stage=='audit' and not load(dest/'real-data-provenance.json')['source_verified']:
            receipt['status']='blocked';receipt['error']='Official raw source verification incomplete';write_json(directory/'run.json',receipt)
        if receipt['status']!='passed': print('STOP: '+str(directory/'run.json'));return 1
        receipt['outputs']={str(f):sha(f) for f in dest.rglob('*') if f.is_file()};write_json(directory/'run.json',receipt)
        state[stage]=receipt
        for following in STAGES[STAGES.index(stage)+1:]: state.pop(following,None)
        write_json(statefile,state)
        print(stage+': passed '+receipt['run_id'],flush=True)
    return 0
if __name__=='__main__': raise SystemExit(main())
