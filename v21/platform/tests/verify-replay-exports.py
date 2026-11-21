"""Independently read the actual browser downloads from one acceptance run."""
import hashlib
import json
import sys
from pathlib import Path

# The bundled Windows C accelerator failed during the large Evidence scan.
# Use the standard pure-Python XML parser for independent workbook readback.
sys.modules['_elementtree'] = None
from openpyxl import load_workbook
from pypdf import PdfReader

root = Path(sys.argv[1])
receipt = json.loads((root / 'receipt.json').read_text(encoding='utf-8'))
result = next(row for row in receipt['checks'] if row['name'] == 'browser checks passed')
book = load_workbook(root / 'replay.xlsx', read_only=True, data_only=True)
expected = ['Overview', 'GMV', 'SKU Analysis', 'Marketing', 'Traffic', 'Conversion',
            'Inventory', 'Fulfillment', 'Evidence', 'Metric Dictionary']
assert book.sheetnames == expected
evidence = dict(book['Evidence'].iter_rows(min_row=8, values_only=True))
assert evidence['Evidence hash'] == result['evidence']
assert evidence['evidence.version'] == result['before']
assert evidence['tasks.0.verification.before_version'] == result['before']
assert evidence['tasks.0.verification.after_version'] == result['after']
assert evidence['evidence.is_synthetic'] is True
assert evidence['evidence.cards.6.value.scope.down'] == 4
sku = list(book['SKU Analysis'].iter_rows(min_row=8, values_only=True))
assert len(sku) == 5
assert sum(row[3] for row in sku) == book['Overview']['C8'].value - book['Overview']['B8'].value
related = dict(book['Fulfillment'].iter_rows(min_row=8, values_only=True))
assert {value for key, value in related.items() if str(key).endswith('.type')} >= {'returned','refunded','canceled','dispatch_delayed'}
channels = dict(book['Traffic'].iter_rows(min_row=8, values_only=True))
assert channels['E7.0.channel'] == 'organic_search'
assert channels['E7.1.channel'] == 'paid_search'
assert channels['E7.0.delta'] == 0
assert channels['E7.1.delta'] == 0
assert evidence['evidence.cards.6.value.channels.0.before.ratios.order_conversion.value'] > evidence['evidence.cards.6.value.channels.0.after.ratios.order_conversion.value']
pdf = PdfReader(root / 'replay.pdf')
pdf_text = ''.join(page.extract_text() for page in pdf.pages)
compact_pdf = ''.join(pdf_text.split())
web = (root / 'replay.html').read_text(encoding='utf-8')
for version_or_evidence in [result['before'], result['after'], result['evidence']]:
    assert version_or_evidence in compact_pdf and version_or_evidence in web
for marker in ['SIM-COFFEE','refunded','canceled','returned','2026-09-07']:
    assert marker in compact_pdf and marker in web
for file in ['replay.html','replay.pdf','replay.xlsx']:
    assert (root / file).stat().st_size > 100
out = {'passed':True,'readers':['openpyxl with pure-Python XML','pypdf','UTF-8 HTML readback'],'sheets':book.sheetnames,
       'pdf_pages':len(pdf.pages),'sku_rows':len(sku),'before_amount_cents':book['Overview']['B8'].value,
       'after_amount_cents':book['Overview']['C8'].value,'data_versions':[result['before'],result['after']],
       'evidence_hash':result['evidence'],'sha256':{f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in ['replay.html','replay.pdf','replay.xlsx']}}
(root/'exports-verification.json').write_text(json.dumps(out,indent=2),encoding='utf-8')
print(json.dumps(out))
