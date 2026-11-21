"""Map unmodified Kaggle v2 files to the versioned public input contract."""
import csv,json,hashlib,argparse
from stage3_io import fresh_dir, write_json, now, run_id
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--raw-dir',type=Path,default=ROOT/'data/raw/kaggle-v2')
    ap.add_argument('--out-dir',type=Path,default=ROOT/'output/stage3/recheck/canonical/olist-v2')
    ap.add_argument('--schema-path',type=Path,default=ROOT/'output/templates/schema.json')
    ap.add_argument('--manifest-path',type=Path)
    args=ap.parse_args(); RAW=args.raw_dir.resolve(); OUT=args.out_dir.resolve()
    manifest_path=args.manifest_path.resolve() if args.manifest_path else OUT/'dataset_manifest.json'
    if manifest_path.parent!=OUT: raise ValueError('--manifest-path must be inside --out-dir')
    fresh_dir(OUT,[RAW]); started=now(); rid=run_id(); table_report={}

    def read(name):
        with (RAW/name).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
    def keyed(rows,key):
        ids=[r[key] for r in rows]
        if len(ids)!=len(set(ids)):raise ValueError('Non-unique source dimension '+key)
        return {r[key]:r for r in rows}
    customers=keyed(read('olist_customers_dataset.csv'),'customer_id'); products=keyed(read('olist_products_dataset.csv'),'product_id');translations=keyed(read('product_category_name_translation.csv'),'product_category_name')
    schema=json.loads(args.schema_path.read_text(encoding='utf-8'))
    orders=read('olist_orders_dataset.csv');items=read('olist_order_items_dataset.csv');reviews=read('olist_order_reviews_dataset.csv')
    missing_customers=sum(r['customer_id'] not in customers for r in orders);missing_products=sum(r['product_id'] not in products for r in items)
    if missing_customers or missing_products:
        write_json(OUT/'canonicalization-report.json',{'status':'blocked','unmapped_customer_orders':missing_customers,'unmapped_product_items':missing_products})
        raise ValueError('Required source dimension is unmapped; no imputation allowed')
    def write(name,rows):
        rows=list(rows)
        table_report[name]={'input_rows':len(rows),'output_rows':len(rows),'missing_fields':{k:sum(not r[k] for r in rows) for k in rows[0]} if rows else {}}
        with (OUT/(name+'.csv')).open('w',encoding='utf-8',newline='') as f:
            w=csv.DictWriter(f,fieldnames=[x['name'] for x in schema['tables'][name]['fields']]);w.writeheader();w.writerows(rows)
    write('orders',({'order_id':r['order_id'],'customer_id':r['customer_id'],'customer_state':customers[r['customer_id']]['customer_state'],'order_status':r['order_status'],'purchased_at':r['order_purchase_timestamp'],'delivered_at':r['order_delivered_customer_date'],'estimated_delivery_at':r['order_estimated_delivery_date']} for r in orders))
    write('order_items',({'order_id':r['order_id'],'order_item_id':r['order_item_id'],'product_id':r['product_id'],'seller_id':r['seller_id'],'category':translations.get(products[r['product_id']]['product_category_name'],{}).get('product_category_name_english',products[r['product_id']]['product_category_name']),'price':r['price'],'freight_value':r['freight_value']} for r in items))
    write('order_reviews',({'review_id':r['review_id'],'order_id':r['order_id'],'review_score':r['review_score'],'review_created_at':r['review_creation_date'],'review_answered_at':r['review_answer_timestamp']} for r in reviews))
    provenance=json.loads((RAW/'provenance.json').read_text(encoding='utf-8'))
    manifest={'schema_version':'1.0.0','dataset_name':'Olist 公开案例 · 第 2 版','source_uri_or_description':provenance['source_url'],'extracted_at':provenance['downloaded_at'],'coverage_start':min(r['order_purchase_timestamp'][:10] for r in orders),'coverage_end':max(r['order_purchase_timestamp'][:10] for r in orders),'currency':'BRL','source_timezone':'source_local_unknown','import_mode':'full_snapshot','coverage_notes':'全量历史截面；末期和边界月份不代表完整经营期间，按购买月份归属。','license_or_usage_notes':'CC BY-NC-SA 4.0 · Olist / Kaggle；个人非商业求职案例，衍生数据同许可。'}
    manifest['is_synthetic']=provenance.get('is_synthetic',False)
    manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'canonical':str(OUT),'mapping':'no business rows removed or imputed','files':{p.name:{'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in OUT.iterdir()}},ensure_ascii=True))

    for name in table_report: table_report[name]['sha256']=hashlib.sha256((OUT/(name+'.csv')).read_bytes()).hexdigest()
    write_json(OUT/'canonicalization-report.json',{'status':'passed','run_id':rid,'started_at':started,'completed_at':now(),'tables':table_report,'rows_removed':0,'rows_imputed':0,'unmapped_required_records':0,'is_synthetic':manifest['is_synthetic'],'canonical_version':'1.0.0','schema_sha256':hashlib.sha256(args.schema_path.read_bytes()).hexdigest(),'raw_files':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in RAW.glob('*.csv')}})
    write_json(OUT/'field-mapping-report.json',{'orders':{'order_id':'orders.order_id','customer_id':'orders.customer_id','customer_state':'customers.customer_state via customer_id','order_status':'orders.order_status','purchased_at':'orders.order_purchase_timestamp','delivered_at':'orders.order_delivered_customer_date','estimated_delivery_at':'orders.order_estimated_delivery_date'},'order_items':{'order_id':'order_items.order_id','order_item_id':'order_items.order_item_id','product_id':'order_items.product_id','seller_id':'order_items.seller_id','category':'products.product_category_name via product_id, translation English if available; otherwise retain original Portuguese or blank','price':'order_items.price','freight_value':'order_items.freight_value'},'order_reviews':{'review_id':'reviews.review_id','order_id':'reviews.order_id','review_score':'reviews.review_score','review_created_at':'reviews.review_creation_date','review_answered_at':'reviews.review_answer_timestamp'},'precision':'Source decimal strings preserved','timezone':'source_local_unknown; no UTC conversion','optional_fields_retained_only_in_raw':['review_comment_title','review_comment_message','payments','geolocation']})

if __name__=='__main__': main()
