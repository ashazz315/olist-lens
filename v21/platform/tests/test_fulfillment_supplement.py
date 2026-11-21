"""SYNTHETIC fixture only. No cloud or raw business files."""
import importlib.util,unittest
from pathlib import Path
p=Path(__file__).resolve().parents[1]/'tools/materialize-fulfillment.py';s=importlib.util.spec_from_file_location('supplement',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
class Checks(unittest.TestCase):
    def test_distinct_order_latest_review_and_cancellation_scope(self):
        def order(i,status):return dict(order_id=i,order_status=status,purchased_at='2020-01-01',delivered_at='2020-01-05' if status=='delivered' else '',estimated_delivery_at='2020-01-04')
        orders=[order('A','delivered'),order('B','canceled')];items=[dict(order_id='A',product_id='X'),dict(order_id='A',product_id='X'),dict(order_id='A',product_id='Y'),dict(order_id='B',product_id='X')]
        reviews=[dict(order_id='A',review_id='old',review_score='1',review_answered_at='2020-01-05'),dict(order_id='A',review_id='new',review_score='5',review_answered_at='2020-01-06')]
        result=m.build(orders,items,reviews,{'X'},[dict(period='before',start='2020-01-01',end='2020-01-08'),dict(period='after',start='2020-01-08',end='2020-01-15')],{'A':{},'B':{}})['X']['periods'];b,a=result
        self.assertEqual((b['distinct_orders'],b['purchase_distinct_orders'],b['canceled']),(2,1,1));self.assertEqual((b['related_order_review_count'],b['related_order_low_score_count']),(1,0));self.assertTrue(b['examples'][0]['contains_other_products']);self.assertEqual(b['late_rate'],1);self.assertIsNone(a['late_rate'])
if __name__=='__main__':unittest.main()
