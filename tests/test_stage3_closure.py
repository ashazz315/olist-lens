"""SYNTHETIC evidence-review regression. Never used in real replay outputs."""
import copy
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from review_stage3_final import check_event,rec
from fractions import Fraction

def fixture():
    periods=['history_'+str(i) for i in range(8)]+['before','after']
    values=[dict(amount_cents=10000,orders=40,units=100) for _ in periods];values[-1]['amount_cents']=20000
    ops={'periods':[dict(period=p) for p in periods],'verified_cube':{'totals':[dict(period=p,purchase_item_amount_cents=r['amount_cents'],purchase_orders=r['orders'],item_units=r['units']) for p,r in zip(periods,values)]}}
    e=dict(scope_type='shop',metric_id='amount_cents',evidence={'before':values[-2],'after':values[-1],'history':values[:8]},exact={k:rec(Fraction(v)) for k,v in [('before',10000),('after',20000),('absolute_change',10000),('relative_change',1)]},baseline={'exact':{k:rec(Fraction(v)) for k,v in [('median_change',0),('mad',0),('limit',0),('deviation',10000)]}},denominators={'before':40,'after':40},thresholds={'absolute':10000,'relative':.1},fired=True,suppressed_reasons=[])
    config=dict(baseline_periods=8,min_orders=30,mad_multiplier=3,thresholds={'amount_cents':e['thresholds']})
    return e,ops,config

class ClosureEvidenceTests(unittest.TestCase):
    def test_exact_boundary_and_zero_mad(self):
        self.assertTrue(check_event(*fixture())['exact_rule_recalculation'])
    def test_rejects_tampered_history_despite_saved_fired_flag(self):
        e,ops,c=fixture();e=copy.deepcopy(e);e['evidence']['history'][0]['amount_cents']+=1
        with self.assertRaises(AssertionError):check_event(e,ops,c)
    def test_rejects_tampered_exact_baseline(self):
        e,ops,c=fixture();e['baseline']['exact']['mad']=rec(Fraction(1))
        with self.assertRaises(AssertionError):check_event(e,ops,c)
    def test_rejects_wrong_distinct_order_denominator(self):
        e,ops,c=fixture();e['denominators']['before']=80
        with self.assertRaises(AssertionError):check_event(e,ops,c)

if __name__=='__main__':unittest.main()
