"""SYNTHETIC pipeline safety tests, separate from real historical backtest."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from stage3_io import fresh_dir, safe_output, sha
from run_stage3 import execute_attempt
from backtest_monitoring import windows
from tests.test_stage3_raw_audit import FIXTURES

class PipelineTests(unittest.TestCase):
    def test_protected_outputs(self):
        for p in ['output/analysis/case.json','output/templates/schema.json','cloud/dist/snapshot.js','data/canonical/olist-v2']:
            with self.assertRaises(ValueError):safe_output(ROOT/p)
    def test_existing_output_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'old.json').write_text('valid')
            with self.assertRaises(FileExistsError):fresh_dir(p)
            self.assertEqual((p/'old.json').read_text(),'valid')
            from unittest.mock import patch
            from stage3_io import write_json,copy_verified
            (p/'source.txt').write_text('new')
            with patch('stage3_io.os.replace',side_effect=OSError('SYNTHETIC save failure')):
                with self.assertRaises(OSError):write_json(p/'old.json',{'new':True})
                with self.assertRaises(OSError):copy_verified(p/'source.txt',p/'old.json')
            self.assertEqual((p/'old.json').read_text(),'valid')
    def test_failed_attempt_retains_last_result(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);last=p/'previous.json';last.write_text('verified')
            receipt=execute_attempt('verify',[sys.executable,'-c','raise SystemExit(3)'],p/'new-attempt',{'is_synthetic':True})
            self.assertEqual(receipt['status'],'failed');self.assertEqual(last.read_text(),'verified');self.assertTrue((p/'new-attempt/execution.log').exists())
    def test_interrupted_attempt_recorded(self):
        def interrupt(*args,**kwargs):raise KeyboardInterrupt()
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(KeyboardInterrupt):execute_attempt('audit',[],Path(d)/'attempt',{'is_synthetic':True},interrupt)
            self.assertEqual(json.loads((Path(d)/'attempt/run.json').read_text())['status'],'interrupted')
    def test_baseline_and_missing_days(self):
        from datetime import date,timedelta
        orders=[{'order_id':str(i),'purchased_at':str(date(2017,1,2)+timedelta(days=i)),'order_status':'delivered'} for i in range(77)];items=[{'order_id':r['order_id']} for r in orders]
        w=windows(orders,items,'2017-01-02','2017-03-19')
        self.assertEqual(len(w),10);self.assertIn('insufficient_eight_full_historical_weeks',w[0]['window_gates']);self.assertEqual(w[-1]['window_gates'],[])
        self.assertLess(w[-1]['history_start'],w[-1]['before']['start']);self.assertEqual(w[-1]['before']['end'],w[-1]['after']['start'])
        self.assertTrue(windows(orders[:-1],items,'2017-01-02','2017-03-19')[-1]['window_gates'])
        self.assertIn('purchase_order_missing_items',windows(orders,items[:-1],'2017-01-02','2017-03-19')[-1]['window_gates'])
    def test_prepare_isolation_mapping_and_duplicate_attempt(self):
        import csv
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);raw=p/'raw';raw.mkdir()
            for name,(header,row) in FIXTURES.items():
                with (raw/name).open('w',newline='') as f:w=csv.writer(f);w.writerow(header);w.writerow(row)
            (raw/'provenance.json').write_text(json.dumps({'source_url':'synthetic test only','downloaded_at':'2026-01-01T00:00:00Z','is_synthetic':True}))
            before=sha(ROOT/'output/templates/schema.json');out=p/'canonical'
            command=[sys.executable,str(ROOT/'scripts/prepare_case.py'),'--raw-dir',str(raw),'--out-dir',str(out)]
            result=subprocess.run(command,capture_output=True,text=True);self.assertEqual(result.returncode,0,result.stderr)
            report=json.loads((out/'canonicalization-report.json').read_text());self.assertEqual(report['rows_removed'],0);self.assertTrue(report['is_synthetic']);self.assertEqual(report['tables']['orders']['output_rows'],1)
            self.assertEqual(before,sha(ROOT/'output/templates/schema.json'));digest=sha(out/'orders.csv')
            self.assertNotEqual(subprocess.run(command,capture_output=True).returncode,0);self.assertEqual(digest,sha(out/'orders.csv'))
            bogus=p/'bogus-analysis.json';bogus.write_text(json.dumps({'metrics':{k:0 for k in ('total_orders','delivered_orders','amount_cents','delivery_eligible','late_orders','review_eligible','low_reviews')}}));before=sha(bogus)
            result=subprocess.run([sys.executable,str(ROOT/'scripts/verify_case.py'),'--data-dir',str(out),'--analysis',str(bogus),'--out-dir',str(p/'verification')],capture_output=True,text=True)
            self.assertNotEqual(result.returncode,0);self.assertEqual(before,sha(bogus));self.assertEqual(json.loads((p/'verification/real-data-reconciliation.json').read_text())['status'],'blocked')
    def test_stage_all_dependency_order(self):
        from run_stage3 import STAGES
        self.assertEqual(STAGES,('audit','prepare','analyze','verify','backtest'))

if __name__=='__main__':unittest.main()
