"""Synthetic boundary tests for scripts/audit_raw_stage3.py."""
import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "audit_raw_stage3.py"

FIXTURES = {
    "olist_orders_dataset.csv": (
        ["order_id","customer_id","order_status","order_purchase_timestamp","order_approved_at","order_delivered_carrier_date","order_delivered_customer_date","order_estimated_delivery_date"],
        ["o1","c1","delivered","2017-01-01 10:00:00","2017-01-01 11:00:00","2017-01-02 10:00:00","2017-01-03 10:00:00","2017-01-05 10:00:00"]),
    "olist_order_items_dataset.csv": (
        ["order_id","order_item_id","product_id","seller_id","shipping_limit_date","price","freight_value"],
        ["o1","1","p1","s1","2017-01-02 10:00:00","10.00","2.00"]),
    "olist_order_reviews_dataset.csv": (
        ["review_id","order_id","review_score","review_comment_title","review_comment_message","review_creation_date","review_answer_timestamp"],
        ["r1","o1","5","","","2017-01-04","2017-01-05"]),
    "olist_order_payments_dataset.csv": (
        ["order_id","payment_sequential","payment_type","payment_installments","payment_value"],
        ["o1","1","credit_card","1","12.00"]),
    "olist_customers_dataset.csv": (
        ["customer_id","customer_unique_id","customer_zip_code_prefix","customer_city","customer_state"],
        ["c1","u1","12345","city","SP"]),
    "olist_products_dataset.csv": (
        ["product_id","product_category_name","product_name_lenght","product_description_lenght","product_photos_qty","product_weight_g","product_length_cm","product_height_cm","product_width_cm"],
        ["p1","cat","10","100","1","100","10","10","10"]),
    "olist_sellers_dataset.csv": (
        ["seller_id","seller_zip_code_prefix","seller_city","seller_state"],
        ["s1","12345","city","SP"]),
    "olist_geolocation_dataset.csv": (
        ["geolocation_zip_code_prefix","geolocation_lat","geolocation_lng","geolocation_city","geolocation_state"],
        ["12345","0","0","city","SP"]),
    "product_category_name_translation.csv": (
        ["product_category_name","product_category_name_english"],
        ["cat","category"]),
}

class RawAuditTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.raw = self.root / "raw"
        self.out = self.root / "out"
        self.raw.mkdir()
        for name, (header, row) in FIXTURES.items():
            with (self.raw / name).open("w", encoding="utf-8", newline="") as f:
                writer = csv.writer(f)
                writer.writerow(header)
                writer.writerow(row)

    def tearDown(self):
        self.tmp.cleanup()

    def run_audit(self, out=None):
        return subprocess.run(
            [sys.executable, str(SCRIPT), "--raw-dir", str(self.raw),
             "--out-dir", str(out or self.out)],
            capture_output=True, text=True, check=False,
        )

    def test_valid_relationships_are_not_reported_as_orphans(self):
        result = self.run_audit()
        self.assertEqual(result.returncode, 1)  # Reference row counts intentionally differ in tiny fixture.
        report = json.loads((self.out / "real-data-quality-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "REVIEW_REQUIRED")
        self.assertEqual(report["blockers"], [])
        self.assertTrue(all(x.get("orphan_rows", 0) == 0 for x in report["relationships"].values() if "orphan_rows" in x))

    def test_missing_raw_table_blocks_audit(self):
        (self.raw / "olist_order_payments_dataset.csv").unlink()
        result = self.run_audit()
        self.assertEqual(result.returncode, 2)
        report = json.loads((self.out / "real-data-quality-report.json").read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "BLOCKED")
        self.assertTrue(any("olist_order_payments_dataset.csv" in x for x in report["blockers"]))

    def test_output_inside_raw_directory_is_rejected(self):
        result = self.run_audit(self.raw / "audit-output")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Output must not be inside", result.stderr)

if __name__ == "__main__":
    unittest.main()
