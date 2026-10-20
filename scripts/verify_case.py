"""Independently verify the seven core counts/totals from canonical CSV using Decimal/Python and SQLite."""
import csv,json,sqlite3
from decimal import Decimal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; D=ROOT/'data/canonical/olist-v2'; OUT=ROOT/'output/analysis/case.json'
def read(name):
    with (D/(name+'.csv')).open(encoding='utf-8',newline='') as f:return list(csv.DictReader(f))
orders=read('orders');items=read('order_items');reviews=read('order_reviews')
amounts={}
for r in items:amounts[r['order_id']]=amounts.get(r['order_id'],Decimal(0))+Decimal(r['price'])
reviews.sort(key=lambda r:(r['review_answered_at'],r['review_created_at'],r['review_id']))
latest={r['order_id']:r for r in reviews}
m=dict(total_orders=len(orders),delivered_orders=0,amount_cents=0,delivery_eligible=0,late_orders=0,review_eligible=0,low_reviews=0)
for r in orders:
    if r['order_status']!='delivered':continue
    m['delivered_orders']+=1;m['amount_cents']+=int(amounts[r['order_id']]*100)
    if r['delivered_at'] and r['estimated_delivery_at']:
        m['delivery_eligible']+=1;m['late_orders']+=r['delivered_at'][:10]>r['estimated_delivery_at'][:10]
    score=latest.get(r['order_id'],{}).get('review_score')
    if score:m['review_eligible']+=1;m['low_reviews']+=int(score)<=2
r=json.loads(OUT.read_text(encoding='utf-8'))
comparisons=[{'metric':k,'python':v,'sql':r['metrics'][k],'passed':v==r['metrics'][k]} for k,v in m.items()]
if not all(x['passed'] for x in comparisons):raise ValueError(comparisons)
# A second SQLite execution from the canonical files, not the browser database.
text=(ROOT/'cloud/dist/analysis.sql').read_text(encoding='utf-8');queries={b.split('\n',1)[0].strip():b.split('\n',1)[1] for b in text.split('-- @')[1:]}
con=sqlite3.connect(':memory:');con.executescript(queries['schema'])
con.executemany('INSERT INTO orders VALUES (?,?,?,?,?,?,?)',[[x or None for x in row.values()] for row in orders])
con.executemany('INSERT INTO order_items VALUES (?,?,?,?,?,?,?)',[(a['order_id'],int(a['order_item_id']),a['product_id'] or None,a['seller_id'] or None,a['category'] or None,int(Decimal(a['price'])*100),int(Decimal(a['freight_value'])*100) if a['freight_value'] else None) for a in items])
con.executemany('INSERT INTO order_reviews VALUES (?,?,?,?,?)',[(a['review_id'],a['order_id'],int(a['review_score']) if a['review_score'] else None,a['review_created_at'] or None,a['review_answered_at'] or None) for a in reviews]);con.executescript(queries['views']);con.row_factory=sqlite3.Row
for name in ['metrics','monthly','states','association','strata','statuses','samples','seller','category']:
    data=[dict(a) for a in con.execute(queries[name])];saved=[r[name]] if name=='metrics' else r[name]
    for i,a in enumerate(data):
        if any(saved[i][k]!=v for k,v in a.items()):raise ValueError('SQLite mismatch '+name)
r['verification']['python']={'status':'通过','engines':'独立 Python Decimal / Python SQLite / WebAssembly SQLite','comparisons':comparisons,'aggregate_tables_verified':9}
OUT.write_text(json.dumps(r,ensure_ascii=False,indent=2),encoding='utf-8');
(ROOT/'cloud/dist/snapshot.js').write_text('window.OLIST_CASE='+json.dumps(r,ensure_ascii=False,separators=(',',':'))+';',encoding='utf-8')
print(json.dumps({'metrics':m,'association':r['association'],'stratified':r['stratified'],'top_states':r['states'][:5],'python':'passed'},ensure_ascii=True))
