"""Version-bound fulfillment supplement. No GMV/rule recalculation or snapshot mutation."""
import csv,hashlib,json,os,sys
from pathlib import Path
def digest(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def build(orders,items,reviews,products,periods,carriers):
    by={o['order_id']:o for o in orders};chosen={};links={};members={}
    for row in reviews:
        key=row['order_id'];rank=tuple(row.get(k) or '' for k in ['review_answered_at','review_created_at','review_id'])
        if key not in chosen or rank>chosen[key][0]:chosen[key]=(rank,row.get('review_score'))
    for row in items:
        members.setdefault(row['order_id'],set()).add(row['product_id'])
        if row['product_id'] in products:links.setdefault(row['product_id'],set()).add(row['order_id'])
    result={}
    for product in sorted(products):
        records=[]
        for period in periods:
            cohort=sorted((by[k] for k in links.get(product,set()) if k in by and period['start']<=by[k]['purchased_at'][:10]<period['end']),key=lambda o:o['order_id'])
            eligible=[o for o in cohort if o['order_status']=='delivered' and o['delivered_at'] and o['estimated_delivery_at']]
            late=sum(o['delivered_at'][:10]>o['estimated_delivery_at'][:10] for o in eligible)
            scores=[chosen[o['order_id']][1] for o in cohort if o['order_id'] in chosen and chosen[o['order_id']][1] not in ['',None]]
            records.append({'period':period['period'],'distinct_orders':len(cohort),'purchase_distinct_orders':sum(o['order_status'] in ['approved','invoiced','processing','shipped','delivered'] for o in cohort),'delivery_eligible':len(eligible),'late_orders':late,'late_rate':late/len(eligible) if eligible else None,'carrier_recorded':sum(bool(carriers[o['order_id']].get('order_delivered_carrier_date')) for o in cohort),'canceled':sum(o['order_status']=='canceled' for o in cohort),'unavailable':sum(o['order_status']=='unavailable' for o in cohort),'missing_delivery_dates':sum(o['order_status']=='delivered' and not(o['delivered_at'] and o['estimated_delivery_at']) for o in cohort),'related_order_review_count':len(scores),'related_order_low_score_count':sum(int(s)<=2 for s in scores),'examples':[{'order_ref':hashlib.sha256(o['order_id'].encode()).hexdigest()[:12],'status':o['order_status'],'estimated':o['estimated_delivery_at'],'delivered':o['delivered_at'],'carrier':carriers[o['order_id']].get('order_delivered_carrier_date') or None,'contains_other_products':len(members[o['order_id']])>1} for o in cohort[:12]]})
        result[product]={'status':'descriptive','metric':'distinct order_id; delivered with valid dates','evaluation_scope':'关联订单评价，不是独立商品评价；多商品订单不可归责单一商品','maturity':'历史最终状态，不构成当时已成熟证明','periods':records}
    return result
def main():
    platform=Path(__file__).resolve().parents[1];v=json.loads((platform/'private/baseline/olist/version.json').read_text(encoding='utf8'));a=json.loads((platform/'private/baseline/olist/analysis.json').read_text(encoding='utf8'))
    canonical=Path(v['provenance']['original_directory']);raw=Path(v['directory'])/'raw'/v['shipping']['file']
    hashes={name:digest(canonical/name) for name in v['file_hashes']};assert hashes==v['file_hashes'];assert digest(raw)==v['shipping']['sha256']
    def read(p):
        with p.open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
    orders=read(canonical/'orders.csv');items=read(canonical/'order_items.csv');reviews=read(canonical/'order_reviews.csv');carriers={r['order_id']:r for r in read(raw)}
    assert set(carriers)=={o['order_id'] for o in orders}
    for o in orders:
        for left,right in [('order_status','order_status'),('purchased_at','order_purchase_timestamp'),('delivered_at','order_delivered_customer_date'),('estimated_delivery_at','order_estimated_delivery_date')]:assert (o[left] or '')==(carriers[o['order_id']][right] or '')
    products={r['key'] for r in a['operations']['dimensions']['product']};periods=[p for p in a['operations']['periods'] if p['period'] in ['before','after']]
    data={'schema':'sku-fulfillment-supplement-2.1','version':v['id'],'is_synthetic':False,'source_hashes':hashes,'shipping_sha256':v['shipping']['sha256'],'basis':'same immutable historical snapshot; no GMV or monitoring recalculation','products':build(orders,items,reviews,products,periods,carriers)}
    for row in a['operations']['dimensions']['product']:
        for p in data['products'][row['key']]['periods']:assert p['purchase_distinct_orders']==row[p['period']]['orders']
    dest=platform/'private/sku-fulfillment';dest.mkdir(exist_ok=True);target=dest/(v['id']+'.json');payload=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode();checksum=hashlib.sha256(payload).hexdigest()
    with target.open('xb') as f:f.write(payload);f.flush();os.fsync(f.fileno())
    target.with_suffix('.sha256').write_text(checksum,encoding='ascii')
    summary={'version':v['id'],'products':len(products),'period_order_counts_reconciled':2*len(products),'sha256':checksum,'is_synthetic':False,'source_hashes':hashes,'snapshot_modified':False}
    (platform/'evidence/recovery-fulfillment.json').write_text(json.dumps(summary,indent=2),encoding='utf8');print(json.dumps(summary))
if __name__=='__main__':main()
