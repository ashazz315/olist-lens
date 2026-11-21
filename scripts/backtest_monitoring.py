"""Sequential full-week orchestration of unchanged monitoring-2.0.1; no threshold tuning."""
import argparse
import csv
import gzip
import json
import subprocess
import time
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from stage3_io import ROOT, load, sha, now, run_id, fresh_dir, write_json

def read(path):
    with Path(path).open(encoding='utf-8-sig',newline='') as f: return list(csv.DictReader(f))

def windows(orders,items,start,end):
    first=date.fromisoformat(start);first+=timedelta(days=(-first.weekday())%7);end=date.fromisoformat(end)+timedelta(days=1)
    weeks=[];t=first
    while t+timedelta(days=7)<=end: weeks.append(t);t+=timedelta(days=7)
    daily=Counter(r['purchased_at'][:10] for r in orders);item_ids={r['order_id'] for r in items}
    missing=[r for r in orders if r['order_status'] in {'approved','invoiced','processing','shipped','delivered'} and r['order_id'] not in item_ids]
    result=[]
    for after in weeks[1:]:
        before=after-timedelta(days=7);history=before-timedelta(days=56);stop=after+timedelta(days=7);days=[(history+timedelta(days=i)).isoformat() for i in range(70)];gates=[]
        if history<first:gates.append('insufficient_eight_full_historical_weeks')
        observed=sum(bool(daily[d]) for d in days)
        if observed<70:gates.append('unproven_daily_coverage_in_retained_snapshot')
        if any(history.isoformat()<=r['purchased_at'][:10]<stop.isoformat() for r in missing):gates.append('purchase_order_missing_items')
        result.append({'window_id':after.isoformat(),'before':{'start':before.isoformat(),'end':after.isoformat()},'after':{'start':after.isoformat(),'end':stop.isoformat()},'history_start':history.isoformat(),'observed_days':observed,'window_gates':gates,'partition':'observation' if after.isoformat()<'2018-04-02' else 'holdout'})
    return result

def export_csv(path,rows):
    fields=list(dict.fromkeys(k for r in rows for k in r))
    with Path(path).open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows([{k:json.dumps(v,ensure_ascii=False) if isinstance(v,(dict,list)) else v for k,v in r.items()} for r in rows])

def execute_window(node,data,analysis,spec,target,logfile):
    started=now();tick=time.perf_counter()
    command=[node,'--max-old-space-size=2048',str(ROOT/'scripts/backtest_window.cjs'),str(data.resolve()),str(analysis.resolve()),str(spec),str(target)]
    try:
        with logfile.open('wb') as log:r=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT,timeout=180)
        return r.returncode,command,{'started_at':started,'completed_at':now(),'elapsed_seconds':time.perf_counter()-tick,'log':str(logfile),'exit_code':r.returncode}
    except subprocess.TimeoutExpired:return 124,command,{'started_at':started,'completed_at':now(),'elapsed_seconds':time.perf_counter()-tick,'log':str(logfile),'exit_code':124}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--data-dir',type=Path,required=True);p.add_argument('--analysis',type=Path,required=True);p.add_argument('--verification',type=Path,required=True);p.add_argument('--out-dir',type=Path,required=True);p.add_argument('--node',default='node');a=p.parse_args()
    ver=load(a.verification);assert ver['status']=='passed';assert ver['analysis_sha256']==sha(a.analysis)
    for name,h in ver['input_hashes'].items():assert sha(a.data_dir/name)==h
    out=fresh_dir(a.out_dir,[a.data_dir,a.analysis,a.verification]);(out/'runs').mkdir();(out/'logs').mkdir();m=load(a.data_dir/'dataset_manifest.json');assert m.get('is_synthetic') is False
    ws=windows(read(a.data_dir/'orders.csv'),read(a.data_dir/'order_items.csv'),m['coverage_start'],m['coverage_end']);events=[];suppression=Counter();started=now();rid=run_id()
    code={f:sha(ROOT/'cloud/dist'/f) for f in ('core.js','analysis.sql','operations.js','operations.sql','monitoring.js')};write_json(out/'plan.json',{'run_id':rid,'started_at':started,'engine_sha256':code,'split':'2018-04-02','thresholds':'original defaults unchanged','input_hashes':ver['input_hashes'],'historical_final_snapshot_not_as_of':True})
    pool=ThreadPoolExecutor(max_workers=2);jobs={}
    for w in ws:
        if not w['window_gates']:
            spec=out/'runs'/(w['window_id']+'.window.json');write_json(spec,w)
            jobs[w['window_id']]=pool.submit(execute_window,a.node,a.data_dir,a.analysis,spec,out/'runs'/(w['window_id']+'.json.gz'),out/'logs'/(w['window_id']+'.log'))
    for w in ws:
        w['status']='blocked' if w['window_gates'] else 'pending';w['events']=0
        if not w['window_gates']:
            target=out/'runs'/(w['window_id']+'.json.gz');returncode,command,execution=jobs[w['window_id']].result()
            w['execution']=execution
            if returncode==124:w['error']='Window execution timeout; no event publication'
            w['execution_command']=command
            if returncode:
                pool.shutdown(wait=True,cancel_futures=True)
                w['status']='failed';w['exit_code']=returncode;write_json(out/'monitoring-backtest-results.json',{'status':'failed','windows':ws,'failed_window':w['window_id'],'completed_events_not_published':events});return 1
            with gzip.open(target,'rt',encoding='utf-8') as f:run=json.load(f)
            mon=run['monitoring'];w.update(status='verified',events=len(mon['events']),artifact='runs/'+target.name,artifact_sha256=sha(target),evaluations=len(mon['evaluations']),suppressed_evaluations=sum(bool(e['suppressed_reasons']) for e in mon['evaluations']),dataset_version=mon['dataset_version'],rule_set_version=mon['rule_set_version'])
            events.extend(dict(window_id=w['window_id'],**e) for e in mon['events'])
            for e in mon['evaluations']:
                for reason in e['suppressed_reasons']:suppression[(e['scope_type'],e['metric_id'],reason)]+=1
        write_json(out/'progress.json',{'last_window':w['window_id'],'events':len(events),'run_id':rid})
    pool.shutdown(wait=True)
    assert len({e['event_id'] for e in events})==len(events)
    result={'status':'passed','run_id':rid,'started_at':started,'completed_at':now(),'windows':ws,'events':events,'window_count':len(ws),'event_count':len(events),'verified_windows':sum(w['status']=='verified' for w in ws),'blocked_windows':sum(w['status']=='blocked' for w in ws),'engine_sha256':code,'is_synthetic':False,'thresholds_unchanged':True,'ground_truth_available':False,'accuracy':None,'recall':None,'false_positive_rate':None,'publication':False}
    write_json(out/'monitoring-backtest-results.json',result);export_csv(out/'monitoring-backtest-windows.csv',ws);export_csv(out/'monitoring-alerts.csv',events);export_csv(out/'monitoring-suppression-analysis.csv',[dict(scope=k[0],metric=k[1],reason=k[2],count=n) for k,n in suppression.items()]);export_csv(out/'monitoring-rule-comparison.csv',[{'rule':'monitoring-2.0.1 defaults','changed':False,'experiment':'none','events':len(events)}]);return 0
if __name__=='__main__': raise SystemExit(main())
