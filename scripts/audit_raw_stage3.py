#!/usr/bin/env python3
"""Non-destructive, aggregate-only audit of the nine raw Olist Kaggle v2 CSVs."""
from __future__ import annotations
import argparse, csv, hashlib, json, zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path
from decimal import Decimal, InvalidOperation
from stage3_io import fresh_dir, write_json

ROOT = Path(__file__).resolve().parents[1]
RAW_DEFAULT = ROOT / "data/raw/kaggle-v2"
OUT_DEFAULT = ROOT / "output/stage3/recheck/real-data-audit"
BASELINE = ROOT / "cloud/dist/downloads/provenance.json"

SPECS = {
 "olist_orders_dataset.csv": (99441, ["order_id","customer_id","order_status","order_purchase_timestamp","order_approved_at","order_delivered_carrier_date","order_delivered_customer_date","order_estimated_delivery_date"], ["order_id"]),
 "olist_order_items_dataset.csv": (112650, ["order_id","order_item_id","product_id","seller_id","shipping_limit_date","price","freight_value"], ["order_id","order_item_id"]),
 "olist_order_reviews_dataset.csv": (99224, ["review_id","order_id","review_score","review_comment_title","review_comment_message","review_creation_date","review_answer_timestamp"], ["review_id","order_id"]),
 "olist_order_payments_dataset.csv": (103886, ["order_id","payment_sequential","payment_type","payment_installments","payment_value"], ["order_id","payment_sequential"]),
 "olist_customers_dataset.csv": (99441, ["customer_id","customer_unique_id","customer_zip_code_prefix","customer_city","customer_state"], ["customer_id"]),
 "olist_products_dataset.csv": (32951, ["product_id","product_category_name","product_name_lenght","product_description_lenght","product_photos_qty","product_weight_g","product_length_cm","product_height_cm","product_width_cm"], ["product_id"]),
 "olist_sellers_dataset.csv": (3095, ["seller_id","seller_zip_code_prefix","seller_city","seller_state"], ["seller_id"]),
 "olist_geolocation_dataset.csv": (1000163, ["geolocation_zip_code_prefix","geolocation_lat","geolocation_lng","geolocation_city","geolocation_state"], None),
 "product_category_name_translation.csv": (71, ["product_category_name","product_category_name_english"], ["product_category_name"]),
}

def rows(path):
    with path.open(encoding="utf-8-sig", newline="") as f:
        yield from csv.DictReader(f)

def sha256(path):
    h=hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda:f.read(1024*1024), b""): h.update(block)
    return h.hexdigest()

def timestamp(value):
    if not value: return None
    try: return datetime.fromisoformat(value.replace("Z","+00:00"))
    except ValueError: return None

def profile(path, spec):
    expected_n, expected_cols, key_cols = spec
    if not path.is_file(): return {"exists":False,"expected_rows":expected_n}, set()
    nulls, seen, ids = Counter(), {}, set()
    exact, dates, prefixes, coordinates = set(), {}, Counter(), {}
    exact_duplicates = conflicts = blank_keys = malformed_rows = invalid_statuses = 0
    duplicates = 0
    statuses, invalid_dates, date_order, value_issues = Counter(), Counter(), Counter(), Counter()
    n, min_purchase, max_purchase = 0, None, None
    with path.open(encoding="utf-8-sig", newline="") as f:
        reader=csv.DictReader(f); cols=reader.fieldnames or []
        for r in reader:
            n += 1
            if None in r or any(v is None for v in r.values()): malformed_rows += 1
            signature=hashlib.sha256(json.dumps(r,sort_keys=True,ensure_ascii=False).encode()).digest() if None not in r else hashlib.sha256(repr(r).encode()).digest()
            if signature in exact: exact_duplicates += 1
            exact.add(signature)
            for c in cols:
                if not (r.get(c) or "").strip(): nulls[c] += 1
            if key_cols:
                k=tuple((r.get(c) or "").strip() for c in key_cols)
                if not all(k): blank_keys += 1
                if k in seen:
                    duplicates += 1
                    if seen[k] != signature: conflicts += 1
                else: seen[k] = signature
                if len(key_cols)==1 and k[0]: ids.add(k[0])
            for c in cols:
                if c.endswith(('_timestamp','_date')) and r.get(c):
                    t=timestamp(r[c])
                    if t is None: invalid_dates[c] += 1
                    else:
                        x=t.isoformat(); d=dates.setdefault(c,{'min':x,'max':x});d['min']=min(d['min'],x);d['max']=max(d['max'],x)
            if path.name=="olist_geolocation_dataset.csv":
                prefix=r.get('geolocation_zip_code_prefix','');prefixes[prefix]+=1
                coordinates.setdefault(prefix,set()).add((r.get('geolocation_lat'),r.get('geolocation_lng')))
            if path.name=="olist_orders_dataset.csv":
                statuses[r.get("order_status","")] += 1
                if r.get('order_status') not in {'created','approved','invoiced','processing','shipped','delivered','unavailable','canceled'}: invalid_statuses += 1
                ts={c:timestamp(r.get(c,"")) for c in [
                    "order_purchase_timestamp","order_approved_at","order_delivered_carrier_date",
                    "order_delivered_customer_date","order_estimated_delivery_date"]}
                p=ts["order_purchase_timestamp"]
                if p:
                    x=p.isoformat(); min_purchase=x if min_purchase is None or x<min_purchase else min_purchase
                    max_purchase=x if max_purchase is None or x>max_purchase else max_purchase
                for a,b,label in [
                    ("order_purchase_timestamp","order_approved_at","approved_before_purchase"),
                    ("order_purchase_timestamp","order_delivered_carrier_date","carrier_before_purchase"),
                    ("order_purchase_timestamp","order_delivered_customer_date","delivered_before_purchase"),
                    ("order_delivered_carrier_date","order_delivered_customer_date","delivered_before_carrier")]:
                    if ts[a] and ts[b]:
                        try:
                            if ts[b]<ts[a]: date_order[label] += 1
                        except TypeError: invalid_dates['mixed_timezone'] += 1
            if path.name in ("olist_order_items_dataset.csv","olist_order_payments_dataset.csv"):
                fields=("price","freight_value") if "items" in path.name else ("payment_value",)
                for c in fields:
                    v=(r.get(c) or "").strip()
                    if v:
                        try:
                            amount=Decimal(v)
                            if not amount.is_finite() or amount*100 != (amount*100).to_integral_value(): value_issues[f'invalid_{c}'] += 1
                            elif amount<0: value_issues[f"negative_{c}"] += 1
                        except InvalidOperation: value_issues[f"invalid_{c}"] += 1
            if path.name=="olist_order_reviews_dataset.csv" and r.get("review_score"):
                try:
                    s=int(r["review_score"])
                    if not 1<=s<=5: value_issues["review_score_outside_1_to_5"] += 1
                except ValueError: value_issues["invalid_review_score"] += 1
    return ({
        "exists":True,"bytes":path.stat().st_size,"sha256":sha256(path),"rows":n,
        "expected_rows":expected_n,"row_count_matches_reference":n==expected_n,
        "columns":cols,"expected_columns":expected_cols,"columns_match_reference":cols==expected_cols,
        "null_counts":dict(nulls),"null_rates":{k:round(v/n,6) for k,v in nulls.items()} if n else {},
        "duplicate_key_rows_after_first":duplicates,"key_columns":key_cols,
        "exact_duplicate_rows_after_first":exact_duplicates,"conflicting_key_rows":conflicts,"blank_key_rows":blank_keys,"malformed_rows":malformed_rows,"invalid_statuses":invalid_statuses,
        "date_ranges":dates,"postal_prefixes":{'distinct':len(prefixes),'row_multiplicity_distribution':dict(Counter(prefixes.values())),'prefixes_with_multiple_coordinates':sum(len(v)>1 for v in coordinates.values())} if prefixes else None,
        "status_distribution":dict(statuses) if statuses else None,
        "invalid_timestamps":dict(invalid_dates),"date_order_issues":dict(date_order),
        "numeric_issues":dict(value_issues),"purchase_timestamp_min":min_purchase,
        "purchase_timestamp_max":max_purchase,
    }, ids)

def orphans(child, field, parent_ids):
    return sum(1 for r in rows(child) if (r.get(field) or "").strip() and (r.get(field) or "").strip() not in parent_ids)

def relationship(child, field, parent_ids):
    total=missing=unmatched=0
    for r in rows(child):
        total+=1;v=(r.get(field) or '').strip()
        missing+=not v;unmatched+=bool(v and v not in parent_ids)
    return {'child_rows':total,'matched_rows':total-missing-unmatched,'blank_rows':missing,'orphan_rows':unmatched,'match_rate':(total-missing-unmatched)/total if total else None,'unmatched_reason':'Blank key or no parent key; no forced mapping.'}

def main():
    ap=argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--raw-dir",type=Path,default=RAW_DEFAULT)
    ap.add_argument("--out-dir",type=Path,default=OUT_DEFAULT)
    args=ap.parse_args(); raw=args.raw_dir.resolve(); out=args.out_dir.resolve()
    if raw==out or raw in out.parents: raise SystemExit("Output must not be inside the raw data directory.")
    fresh_dir(out, [raw])
    tables, keys, blockers, review, warnings = {}, {}, [], [], []
    for name,spec in SPECS.items():
        result, ids=profile(raw/name,spec); tables[name]=result
        if ids: keys[name]=ids
        if not result["exists"]: blockers.append(f"Missing table: {name}"); continue
        if not result["columns_match_reference"]: blockers.append(f"Header mismatch: {name}")
        if result["duplicate_key_rows_after_first"]: blockers.append(f"Duplicate declared key: {name}")
        if result['blank_key_rows'] or result['malformed_rows'] or result['invalid_statuses']: blockers.append(f'Invalid required record structure: {name}')
        if not result["row_count_matches_reference"]: review.append(f"Reference row-count mismatch: {name}")
        if result["invalid_timestamps"] or result["numeric_issues"]: review.append(f"Invalid date/numeric values: {name}")
        if result["date_order_issues"]: warnings.append(f"Date-order anomalies require review: {name}")

    rel={}
    fks=[
      ("olist_orders_dataset.csv","customer_id","olist_customers_dataset.csv"),
      ("olist_order_items_dataset.csv","order_id","olist_orders_dataset.csv"),
      ("olist_order_items_dataset.csv","product_id","olist_products_dataset.csv"),
      ("olist_order_items_dataset.csv","seller_id","olist_sellers_dataset.csv"),
      ("olist_order_reviews_dataset.csv","order_id","olist_orders_dataset.csv"),
      ("olist_order_payments_dataset.csv","order_id","olist_orders_dataset.csv")]
    for child,field,parent in fks:
        if (raw/child).exists() and parent in keys:
            entry=relationship(raw/child,field,keys[parent]);rel[f"{child}.{field} -> {parent}"]=entry
            if entry['orphan_rows'] or entry['blank_rows']: blockers.append(f"Foreign-key orphans or blanks: {child}.{field} -> {parent}")

    geo=raw/"olist_geolocation_dataset.csv"
    if geo.exists():
        prefixes={r["geolocation_zip_code_prefix"].strip() for r in rows(geo) if r.get("geolocation_zip_code_prefix","").strip()}
        for child,field in [("olist_customers_dataset.csv","customer_zip_code_prefix"),("olist_sellers_dataset.csv","seller_zip_code_prefix")]:
            if (raw/child).exists():
                n=orphans(raw/child,field,prefixes)
                rel[f"{child}.{field} -> geolocation prefixes"]={**relationship(raw/child,field,prefixes),"unmatched_rows":n,"note":"Postal prefixes are many-to-many, not unique keys."}
                if n: warnings.append(f"Unmatched postal prefixes: {child}.{field}")

    cat_result={"available":False}
    prod, trans=raw/"olist_products_dataset.csv",raw/"product_category_name_translation.csv"
    if prod.exists() and trans.exists():
        translated={r["product_category_name"].strip() for r in rows(trans) if r.get("product_category_name","").strip()}
        missing=Counter(); nulls=0; total=0
        for r in rows(prod):
            c=(r.get("product_category_name") or "").strip()
            if not c: nulls+=1
            else:
                total+=1
                if c not in translated: missing[c]+=1
        cat_result={"non_null_product_categories":total,"null_product_categories":nulls,
                    "untranslated_product_rows":sum(missing.values()),"untranslated_category_count":len(missing),
                    "untranslated_category_examples":dict(missing.most_common(20))}

    archive=raw/"brazilian-ecommerce-v2.zip"; archive_result={"available":archive.exists()}
    if archive.exists():
        with zipfile.ZipFile(archive) as z: bad=z.testzip()
        archive_result.update({"crc_passed":bad is None,"first_bad_member":bad,"sha256":sha256(archive)})
        if bad: blockers.append(f"Archive CRC failed: {bad}")

    current_prov=raw/"provenance.json"; base_prov=BASELINE
    prov_result={"available":False}
    if current_prov.exists():
        cur=json.loads(current_prov.read_text(encoding="utf-8")); base=json.loads(base_prov.read_text(encoding="utf-8")) if base_prov.exists() else {}
        bfiles={x["name"]:x for x in base.get("files",[])}; cfiles={x["name"]:x for x in cur.get("files",[])}
        comparisons={}
        for name in sorted(set(bfiles)|set(cfiles)):
            b,c=bfiles.get(name),cfiles.get(name)
            comparisons[name]={"baseline_present":bool(b),"current_present":bool(c)}
            if b and c: comparisons[name].update({"rows_match":b.get("rows")==c.get("rows"),"sha256_match":b.get("sha256")==c.get("sha256")})
        prov_result={"available":True,"baseline_archive_sha256":base.get("archive_sha256"),
          "current_archive_sha256":cur.get("archive_sha256"),
          "archive_sha256_match":base.get("archive_sha256")==cur.get("archive_sha256") if base.get("archive_sha256") and cur.get("archive_sha256") else None,
          "files":comparisons}
        for name,x in tables.items():
            reference=bfiles.get(name,{}); declared=cfiles.get(name,{})
            if x.get('exists'):
                for field in ('sha256','bytes','rows','columns'):
                    if reference.get(field) is not None and x.get(field)!=reference[field]: blockers.append(f'Actual file differs from historical reference ({field}): {name}')
                    if declared.get(field) is not None and x.get(field)!=declared[field]: blockers.append(f'Actual file differs from supplied provenance ({field}): {name}')
        if archive_result.get('available') and archive_result.get('sha256')!=cur.get('archive_sha256'): blockers.append('Actual archive differs from supplied provenance')
        if cur.get('version')!=2 or cur.get('dataset')!='olistbr/brazilian-ecommerce': blockers.append('Unconfirmed official dataset version')
        if prov_result["archive_sha256_match"] is False: review.append("Archive hash differs from repository reference.")
        for name,x in comparisons.items():
            if x.get("baseline_present") and x.get("current_present") and (not x.get("rows_match") or not x.get("sha256_match")):
                review.append(f"File provenance differs from repository reference: {name}")

    status="BLOCKED" if blockers else "REVIEW_REQUIRED" if review else "PASS_WITH_WARNINGS" if warnings else "PASS"
    report={"report_version":"1.0.0","dataset":"olistbr/brazilian-ecommerce","expected_version":2,
      "raw_dir":str(raw),"generated_at":datetime.now().astimezone().isoformat(),"status":status,
      "blockers":blockers,"review_items":review,"warnings":warnings,"archive":archive_result,
      "provenance_comparison":prov_result,"tables":tables,"relationships":rel,
      "product_category_translation":cat_result,
      "limitations":["Aggregate audit only; it cannot prove every source business fact is true.",
        "Geolocation postal prefixes are non-unique and must not be treated as one-to-one keys.",
        "Nulls and date anomalies are reported, never silently imputed or deleted.",
        "This script does not modify raw data, canonical files, case JSON, or deployed snapshots."]}
    (out/"real-data-quality-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding="utf-8")
    write_json(out/'real-data-relationship-report.json',{'relationships':rel,'category_translation':cat_result,'geolocation':tables.get('olist_geolocation_dataset.csv',{}).get('postal_prefixes')})
    write_json(out/'real-data-provenance.json',{'source':json.loads(current_prov.read_text(encoding='utf-8')) if current_prov.exists() else None,'actual_archive':archive_result,'actual_files':{n:{k:x.get(k) for k in ('sha256','bytes','rows','columns')} for n,x in tables.items()},'source_verified':bool(current_prov.exists() and archive_result.get('crc_passed') and not blockers and not review)})
    lines=["# Olist raw data quality audit","",f"- Status: **{status}**",f"- Generated: {report['generated_at']}","",
      "## Table checks","","| File | Rows | Expected | Count match | Header match | Duplicate keys |","|---|---:|---:|---|---|---:|"]
    for n,x in tables.items():
        lines.append(f"| {n} | {x.get('rows','—')} | {x['expected_rows']} | {x.get('row_count_matches_reference',False)} | {x.get('columns_match_reference',False)} | {x.get('duplicate_key_rows_after_first','—')} |")
    for title,items in [("Blockers",blockers),("Review required",review),("Warnings",warnings)]:
        lines.extend(["",f"## {title}"]+[f"- {x}" for x in items] if items else ["",f"## {title}","- None"])
    lines.extend(["","## Relationships"]+[f"- \`{k}\`: {json.dumps(v,ensure_ascii=False)}" for k,v in rel.items()])
    lines.extend(["","## Category translation",json.dumps(cat_result,ensure_ascii=False,indent=2),"",
      "## Limitations"]+[f"- {x}" for x in report["limitations"]])
    (out/"real-data-quality-report.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(json.dumps({"status":status,"blockers":len(blockers),"review_items":len(review),
      "warnings":len(warnings),"output":str(out)},ensure_ascii=False))
    return 2 if blockers else 1 if review else 0

if __name__=="__main__": raise SystemExit(main())
