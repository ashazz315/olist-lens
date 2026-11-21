"""Independently verify the seven core counts/totals from canonical CSV using Decimal/Python and SQLite."""
import csv,json,sqlite3,argparse
from stage3_io import fresh_dir, write_json, sha, now, run_id
from decimal import Decimal
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--data-dir',type=Path,required=True)
    ap.add_argument('--analysis',type=Path,required=True)
    ap.add_argument('--sql-path',type=Path,default=ROOT/'cloud/dist/analysis.sql')
    ap.add_argument('--out-dir',type=Path,required=True)
    args=ap.parse_args();D=args.data_dir.resolve();OUT=args.analysis.resolve();dest=fresh_dir(args.out_dir,[D,OUT]);started=now();rid=run_id()

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
    if not all(x['passed'] for x in comparisons):
        write_json(dest/'real-data-reconciliation.json',{'status':'blocked','comparisons':comparisons})
        raise ValueError('Core metric mismatch; evidence retained')
    # A second SQLite execution from the canonical files, not the browser database.
    text=args.sql_path.read_text(encoding='utf-8');queries={b.split('\n',1)[0].strip():b.split('\n',1)[1] for b in text.split('-- @')[1:]}
    con=sqlite3.connect(':memory:');con.executescript(queries['schema'])
    con.executemany('INSERT INTO orders VALUES (?,?,?,?,?,?,?)',[[x or None for x in row.values()] for row in orders])
    con.executemany('INSERT INTO order_items VALUES (?,?,?,?,?,?,?)',[(a['order_id'],int(a['order_item_id']),a['product_id'] or None,a['seller_id'] or None,a['category'] or None,int(Decimal(a['price'])*100),int(Decimal(a['freight_value'])*100) if a['freight_value'] else None) for a in items])
    con.executemany('INSERT INTO order_reviews VALUES (?,?,?,?,?)',[(a['review_id'],a['order_id'],int(a['review_score']) if a['review_score'] else None,a['review_created_at'] or None,a['review_answered_at'] or None) for a in reviews]);con.executescript(queries['views']);con.row_factory=sqlite3.Row
    for name in ['metrics','monthly','states','association','strata','statuses','samples','seller','category']:
        data=[dict(a) for a in con.execute(queries[name])];saved=[r[name]] if name=='metrics' else r[name]
        if len(data)!=len(saved):
            write_json(dest/'real-data-reconciliation.json',{'status':'blocked','table':name,'actual_rows':len(data),'expected_rows':len(saved)})
            raise ValueError('SQLite result row count mismatch '+name)
        for i,a in enumerate(data):
            if any(saved[i].get(k)!=v for k,v in a.items()):
                write_json(dest/'real-data-reconciliation.json',{'status':'blocked','table':name,'row_index':i,'differences':{k:{'sqlite':v,'analysis':saved[i].get(k)} for k,v in a.items() if saved[i].get(k)!=v}})
                raise ValueError('SQLite mismatch '+name)
    r['verification']['python']={'status':'通过','engines':'独立 Python Decimal / Python SQLite / WebAssembly SQLite','comparisons':comparisons,'aggregate_tables_verified':9}
    write_json(dest/'real-data-reconciliation.json',{'status':'passed','run_id':rid,'started_at':started,'completed_at':now(),'comparisons':comparisons,'aggregate_tables_verified':9,'input_hashes':{p.name:sha(p) for p in D.glob('*.csv')},'analysis_sha256':sha(OUT),'sql_sha256':sha(args.sql_path),'script_sha256':sha(__file__),'is_synthetic':r['manifest'].get('is_synthetic',False)})
    write_json(dest/'verified-analysis.json',r)
    print(json.dumps({'metrics':m,'association':r['association'],'stratified':r['stratified'],'top_states':r['states'][:5],'python':'passed'},ensure_ascii=True))

if __name__=='__main__': main()
