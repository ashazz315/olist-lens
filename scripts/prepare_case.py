"""Map unmodified Kaggle v2 files to the versioned public input contract."""
import csv,json,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; RAW=ROOT/'data/raw/kaggle-v2'; OUT=ROOT/'data/canonical/olist-v2';OUT.mkdir(parents=True,exist_ok=True)
def read(name):
    with (RAW/name).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
def keyed(rows,key):
    ids=[r[key] for r in rows]
    if len(ids)!=len(set(ids)):raise ValueError('Non-unique source dimension '+key)
    return {r[key]:r for r in rows}
customers=keyed(read('olist_customers_dataset.csv'),'customer_id'); products=keyed(read('olist_products_dataset.csv'),'product_id');translations=keyed(read('product_category_name_translation.csv'),'product_category_name')
schema=json.loads((ROOT/'output/templates/schema.json').read_text(encoding='utf-8')); schema['schema_version']='1.0.0';schema['status']='implemented';
(ROOT/'output/templates/schema.json').write_text(json.dumps(schema,ensure_ascii=False,indent=2),encoding='utf-8')
orders=read('olist_orders_dataset.csv');items=read('olist_order_items_dataset.csv');reviews=read('olist_order_reviews_dataset.csv')
def write(name,rows):
    with (OUT/(name+'.csv')).open('w',encoding='utf-8',newline='') as f:
        w=csv.DictWriter(f,fieldnames=[x['name'] for x in schema['tables'][name]['fields']]);w.writeheader();w.writerows(rows)
write('orders',({'order_id':r['order_id'],'customer_id':r['customer_id'],'customer_state':customers[r['customer_id']]['customer_state'],'order_status':r['order_status'],'purchased_at':r['order_purchase_timestamp'],'delivered_at':r['order_delivered_customer_date'],'estimated_delivery_at':r['order_estimated_delivery_date']} for r in orders))
write('order_items',({'order_id':r['order_id'],'order_item_id':r['order_item_id'],'product_id':r['product_id'],'seller_id':r['seller_id'],'category':translations.get(products[r['product_id']]['product_category_name'],{}).get('product_category_name_english',products[r['product_id']]['product_category_name']),'price':r['price'],'freight_value':r['freight_value']} for r in items))
write('order_reviews',({'review_id':r['review_id'],'order_id':r['order_id'],'review_score':r['review_score'],'review_created_at':r['review_creation_date'],'review_answered_at':r['review_answer_timestamp']} for r in reviews))
provenance=json.loads((RAW/'provenance.json').read_text(encoding='utf-8'))
manifest={'schema_version':'1.0.0','dataset_name':'Olist 公开案例 · 第 2 版','source_uri_or_description':provenance['source_url'],'extracted_at':provenance['downloaded_at'],'coverage_start':min(r['order_purchase_timestamp'][:10] for r in orders),'coverage_end':max(r['order_purchase_timestamp'][:10] for r in orders),'currency':'BRL','source_timezone':'source_local_unknown','import_mode':'full_snapshot','coverage_notes':'全量历史截面；末期和边界月份不代表完整经营期间，按购买月份归属。','license_or_usage_notes':'CC BY-NC-SA 4.0 · Olist / Kaggle；个人非商业求职案例，衍生数据同许可。'}
(OUT/'dataset_manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'canonical':str(OUT),'mapping':'no business rows removed or imputed','files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in OUT.iterdir()}},ensure_ascii=True))
