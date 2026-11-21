"""Additional SYNTHETIC audit regressions; never real-data evidence."""
import hashlib
import json
import unittest
from tests import test_stage3_raw_audit as base

class AuditContractTests(unittest.TestCase):
    setUp=base.RawAuditTests.setUp
    tearDown=base.RawAuditTests.tearDown
    run_audit=base.RawAuditTests.run_audit
    def edit(self,name,old,new):
        p=self.raw/name;p.write_text(p.read_text().replace(old,new),encoding='utf-8')
    def result(self):
        result=self.run_audit();self.assertIn(result.returncode,(0,1,2),result.stderr)
        return json.loads((self.out/'real-data-quality-report.json').read_text())
    def test_duplicate_primary_key(self):
        p=self.raw/'olist_orders_dataset.csv';p.write_text(p.read_text()+p.read_text().splitlines()[1]+'\n')
        self.assertEqual(self.result()['status'],'BLOCKED')
    def test_foreign_key_blank(self):
        self.edit('olist_orders_dataset.csv','o1,c1,','o1,,')
        self.assertTrue(self.result()['blockers'])
    def test_orphan(self):
        self.edit('olist_order_items_dataset.csv','o1,1,','other,1,')
        self.assertTrue(self.result()['blockers'])
    def test_geolocation_is_not_unique(self):
        p=self.raw/'olist_geolocation_dataset.csv';p.write_text(p.read_text()+'12345,1,1,city,SP\n')
        r=self.result();self.assertEqual(r['blockers'],[])
        self.assertEqual(r['tables'][p.name]['postal_prefixes']['prefixes_with_multiple_coordinates'],1)
    def test_invalid_nonfinite_amount(self):
        self.edit('olist_order_items_dataset.csv','10.00','NaN')
        self.assertTrue(self.result()['tables']['olist_order_items_dataset.csv']['numeric_issues'])
    def test_invalid_shipping_date(self):
        self.edit('olist_order_items_dataset.csv','2017-01-02 10:00:00','not-a-date')
        self.assertTrue(self.result()['tables']['olist_order_items_dataset.csv']['invalid_timestamps'])
    def test_header_and_status(self):
        self.edit('olist_orders_dataset.csv','order_status','wrong_header')
        self.assertEqual(self.result()['status'],'BLOCKED')
    def test_raw_unchanged_and_existing_output_refused(self):
        before={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.raw.iterdir()}
        self.result();saved=(self.out/'real-data-quality-report.json').read_bytes()
        self.assertNotEqual(self.run_audit().returncode,0)
        self.assertEqual(saved,(self.out/'real-data-quality-report.json').read_bytes())
        self.assertEqual(before,{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in self.raw.iterdir()})

if __name__=='__main__':
    import unittest;unittest.main()
