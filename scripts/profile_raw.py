import csv, json
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'data/raw/kaggle-v2'
def read(name):
    with (D/name).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
orders=read('olist_orders_dataset.csv'); items=read('olist_order_items_dataset.csv'); reviews=read('olist_order_reviews_dataset.csv')
order_ids={r['order_id'] for r in orders}; delivered=[r for r in orders if r['order_status']=='delivered']
def dup(rows,keys):return sum(v-1 for v in Counter(tuple(r[k] for k in keys) for r in rows).values())
result={'orders':len(orders),'items':len(items),'reviews':len(reviews),'status':dict(Counter(r['order_status'] for r in orders)),'duplicate_order_keys':dup(orders,['order_id']),'duplicate_item_keys':dup(items,['order_id','order_item_id']),'duplicate_review_keys':dup(reviews,['review_id','order_id']),'orphan_items':sum(r['order_id'] not in order_ids for r in items),'orphan_reviews':sum(r['order_id'] not in order_ids for r in reviews),'delivered_missing_dates':sum(not r['order_delivered_customer_date'] or not r['order_estimated_delivery_date'] for r in delivered),'delivered_before_purchase':sum(bool(r['order_delivered_customer_date']) and r['order_delivered_customer_date']<r['order_purchase_timestamp'] for r in orders),'purchase_months':dict(sorted(Counter(r['order_purchase_timestamp'][:7] for r in orders).items())),'purchase_min':min(r['order_purchase_timestamp'] for r in orders),'purchase_max':max(r['order_purchase_timestamp'] for r in orders)}
(D/'raw-profile.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=True))
