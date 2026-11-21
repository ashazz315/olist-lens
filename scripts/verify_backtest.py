"""Independent Decimal/Fraction checks of all saved real-window cubes and product effects."""
import argparse
import csv
import gzip
import json
import subprocess
import sys
from collections import defaultdict
from datetime import date,timedelta
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
from stage3_io import ROOT,load,sha,write_json,now

def read(path):
    with path.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--data-dir',type=Path,required=True);p.add_argument('--backtest-dir',type=Path,required=True);p.add_argument('--node',default='node');p.add_argument('--window-id');p.add_argument('--receipt-dir',type=Path);a=p.parse_args();resultfile=a.backtest_dir/'monitoring-backtest-results.json';result=load(resultfile);assert result['status']=='passed';plan=load(a.backtest_dir/'plan.json')
    for name,h in plan['input_hashes'].items():assert sha(a.data_dir/name)==h
    target=a.backtest_dir/'independent-window-reconciliation.json'
    if a.window_id:
        assert a.receipt_dir is not None
        assert any(w['window_id']==a.window_id and w['status']=='verified' for w in result['windows'])
        target=a.receipt_dir/(a.window_id+'.json')
    if target.exists():raise FileExistsError('Existing verification preserved')
    included={'approved','invoiced','processing','shipped','delivered'};orders={};totals={};groups={}
    for r in read(a.data_dir/'orders.csv'):
        if r['order_status'] not in included:continue
        d=date.fromisoformat(r['purchased_at'][:10]);period=(d-timedelta(days=d.weekday())).isoformat();orders[r['order_id']]=(period,r)
        t=totals.setdefault(period,dict(purchase_orders=0,item_units=0,purchase_item_amount_cents=0,delivery_eligible=0,late_orders=0));t['purchase_orders']+=1
        if r['order_status']=='delivered' and r['delivered_at'] and r['estimated_delivery_at']:t['delivery_eligible']+=1;t['late_orders']+=r['delivered_at'][:10]>r['estimated_delivery_at'][:10]
    for r in read(a.data_dir/'order_items.csv'):
        if r['order_id'] not in orders:continue
        period,o=orders[r['order_id']];cents=int(Decimal(r['price'])*100);totals[period]['item_units']+=1;totals[period]['purchase_item_amount_cents']+=cents
        for dim,field in [('product','product_id'),('category','category'),('seller','seller_id'),('state','customer_state')]:
            k=(o[field] if dim=='state' else r[field]) or None;g=groups.setdefault((period,dim,k),dict(amount_cents=0,units=0,orders=set()));g['amount_cents']+=cents;g['units']+=1;g['orders'].add(r['order_id'])
    byweek=defaultdict(dict)
    for (period,dim,k),g in groups.items():byweek[period][(dim,k)]={'amount_cents':g['amount_cents'],'units':g['units'],'orders':len(g['orders'])}
    checks=[];effects=0;compact_dir=a.backtest_dir/'independent-inputs';compact_dir.mkdir(exist_ok=True)
    for window in result['windows']:
        if window['status']!='verified':continue
        if a.window_id and window['window_id']!=a.window_id:continue
        print('Verifying '+window['window_id'],flush=True)
        artifact=a.backtest_dir/window['artifact'];assert sha(artifact)==window['artifact_sha256']
        compact=compact_dir/(window['window_id']+'.json')
        if not compact.exists():subprocess.run([a.node,str(ROOT/'scripts/backtest_extract.cjs'),str(artifact),str(compact),window['artifact_sha256']],check=True,timeout=60)
        ops=load(compact);assert ops['source_sha256']==window['artifact_sha256'];periods={p['period']:p['start'] for p in ops['periods']};expected_count=sum(len(byweek[start]) for start in periods.values());cube=ops['verified_cube']
        assert len(cube['totals'])==len(periods)==10;assert len(cube['groups'])==expected_count
        for t in cube['totals']:assert {k:v for k,v in t.items() if k!='period'}==totals[periods[t['period']]]
        seen=set()
        for g in cube['groups']:
            assert set(g)=={'period','dimension','key','amount_cents','units','orders'},(window['window_id'],str(compact),'Unexpected cube keys',list(g))
            key=(g['period'],g['dimension'],g['key']);assert key not in seen;seen.add(key)
            assert {k:v for k,v in g.items() if k not in ('period','dimension','key')}==byweek[periods[g['period']]][(g['dimension'],g['key'])]
        assert ops['projection_version']==2
        assert ops['source_record_counts']['totals']==len(cube['totals'])
        assert ops['source_record_counts']['groups']==len(cube['groups'])
        assert ops['delta_cents']==totals[periods['after']]['purchase_item_amount_cents']-totals[periods['before']]['purchase_item_amount_cents']
        for dim,rows in ops['dimensions'].items():
            assert len(rows)==ops['source_record_counts']['dimensions'][dim]
            expected_keys={k for period in ('before','after') for d,k in byweek[periods[period]] if d==dim}
            assert len(rows)==len(expected_keys)==len({r['key'] for r in rows})
            assert {r['key'] for r in rows}==expected_keys
            assert sum(row['delta_cents'] for row in rows)==ops['delta_cents']
            for row in rows:
                for period in ('before','after'):
                    expected=byweek[periods[period]].get((dim,row['key']),dict(amount_cents=0,units=0,orders=0))
                    assert all(row[period][k]==v for k,v in expected.items()),(window['window_id'],dim,row['key'],period)
                assert row['delta_cents']==row['after']['amount_cents']-row['before']['amount_cents']
        for row in ops['dimensions']['product']:
            a0,a1=row['before'],row['after'];q0,q1=a0['units'],a1['units'];s0,s1=a0['amount_cents'],a1['amount_cents']
            if q0 and q1:
                qty=Fraction(q1-q0,2)*(Fraction(s0,q0)+Fraction(s1,q1));price=Fraction(q1+q0,2)*(Fraction(s1,q1)-Fraction(s0,q0))
                assert qty==Fraction(int(row['quantity_effect']['numerator']),int(row['quantity_effect']['denominator']));assert price==Fraction(int(row['price_effect']['numerator']),int(row['price_effect']['denominator']));assert qty+price==s1-s0
            else:assert row['quantity_effect'] is None and row['price_effect'] is None and row['assortment_effect_cents']==s1-s0
            effects+=1
        checks.append({'window':window['window_id'],'groups':expected_count,'cube_and_contributions_match':True,'artifact_sha256':sha(artifact),'compact_sha256':sha(compact)})
    write_json(target,{'status':'passed','verified_at':now(),'python':sys.version,'python_executable':sys.executable,'verifier_sha256':sha(__file__),'backtest_results_sha256':sha(resultfile),'input_hashes':plan['input_hashes'],'windows':checks,'product_effects_checked':effects,'arithmetic':'Independent Python loops / Decimal integer cents / Fraction','business_truth_verified':False,'is_synthetic':False});print({'windows':len(checks),'product_effects':effects,'status':'passed'})
if __name__=='__main__':main()
