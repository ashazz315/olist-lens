"""Run the identical independent verifier in bounded, fail-closed window processes."""
import argparse,subprocess,sys,time
from pathlib import Path
from stage3_io import ROOT,load,sha,now,write_json,fresh_dir

def main():
    p=argparse.ArgumentParser();p.add_argument('--data-dir',type=Path,required=True);p.add_argument('--backtest-dir',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--node',required=True);a=p.parse_args();out=fresh_dir(a.out);resultfile=a.backtest_dir/'monitoring-backtest-results.json';result=load(resultfile);assert result['status']=='passed';target=a.backtest_dir/'independent-window-reconciliation.json';assert not target.exists()
    checks=[];effects=0;executions=[]
    for w in result['windows']:
        if w['status']!='verified':continue
        command=[sys.executable,'-X','faulthandler',str(ROOT/'scripts/verify_backtest.py'),'--data-dir',str(a.data_dir),'--backtest-dir',str(a.backtest_dir),'--node',a.node,'--window-id',w['window_id'],'--receipt-dir',str(out/'receipts')]
        log=out/(w['window_id']+'.log');tick=time.perf_counter();start=now()
        with log.open('wb') as f:
            try:code=subprocess.run(command,stdout=f,stderr=subprocess.STDOUT,timeout=120).returncode
            except subprocess.TimeoutExpired:code=124
        execution=dict(window=w['window_id'],started_at=start,completed_at=now(),elapsed_seconds=time.perf_counter()-tick,command=command,exit_code=code,log=str(log),log_sha256=sha(log));executions.append(execution)
        write_json(out/'execution.json',executions)
        if code:print('STOP: independent window failed '+w['window_id'],flush=True);return 1
        receipt=out/'receipts'/(w['window_id']+'.json');r=load(receipt);assert r['status']=='passed' and r['backtest_results_sha256']==sha(resultfile);assert r['windows'][0]['window']==w['window_id']
        checks.extend(r['windows']);effects+=r['product_effects_checked'];print('verified '+w['window_id'],flush=True)
    assert len(checks)==result['verified_windows'] and len({r['window'] for r in checks})==len(checks)
    write_json(target,dict(status='passed',verified_at=now(),python=sys.version,python_executable=sys.executable,execution_mode='one window per process, no automatic retries',execution_receipt=str(out/'execution.json'),execution_sha256=sha(out/'execution.json'),backtest_results_sha256=sha(resultfile),input_hashes=load(a.backtest_dir/'plan.json')['input_hashes'],windows=checks,product_effects_checked=effects,arithmetic='Independent Python loops / Decimal integer cents / Fraction, keyed four-dimension reconciliation',business_truth_verified=False,is_synthetic=False))
    print({'windows':len(checks),'product_effects':effects,'status':'passed'});return 0
if __name__=='__main__':raise SystemExit(main())
