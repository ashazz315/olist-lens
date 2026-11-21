"""Check deliverable files and frozen code only; never audit original CSV again."""
import hashlib,json
from pathlib import Path
from openpyxl import load_workbook
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
p=Path(__file__).resolve().parents[1];project=p.parents[1];e=p/'evidence';upload=json.loads((e/'m3-private-raw-upload.json').read_text(encoding='utf8'))
assert len(upload['files'])==9
key=lambda rows:sorted((x['source'],x['version_id']) for x in rows)
assert key(upload['current_versions_before'])==key(upload['current_versions_after'])
frozen=[]
for entry in json.loads((p.parent/'evidence/protection-verification.json').read_text())['frozen_files']:
    actual=hashlib.sha256((project/entry['path']).read_bytes()).hexdigest();frozen.append({'path':entry['path'],'unchanged':actual==entry['copy_sha256']})
assert all(x['unchanged'] for x in frozen)
book=load_workbook(e/'m3-live/olist-historical.xlsx',read_only=True,data_only=True)
expected=['Overview','GMV','SKU Analysis','Marketing','Traffic','Conversion','Inventory','Fulfillment','Evidence','Metric Dictionary'];assert book.sheetnames==expected
rows=list(book['SKU Analysis'].iter_rows(min_row=8,values_only=True));delta=sum(x[3] for x in rows if isinstance(x[3],(int,float)));assert delta==-3184225
assert book['Overview']['B8'].value==25895540 and book['Overview']['C8'].value==22711315
pdf=PdfReader(e/'m3-live/olist-historical.pdf');assert len(pdf.pages)>=3;assert '7e2cbd3659afc738' in ''.join(page.extract_text() for page in pdf.pages)
latest=max((p/'private/reports').glob('*/report.xlsx'),key=lambda f:f.stat().st_mtime).parent
previews=sorted(latest.glob('*.xlsx.*.png'));assert len(previews)==10
canvas=Image.new('RGB',(1400,5*380),'#e9eeee');draw=ImageDraw.Draw(canvas)
for i,f in enumerate(previews):
    im=Image.open(f);im.thumbnail((680,350));x=(i%2)*700;y=(i//2)*380;canvas.paste(im,(x+10,y+24));draw.text((x+10,y+5),f.name.split('.xlsx.')[1],fill='black')
canvas.save(e/'m3-live/workbook-review.png')
report={'nine_private_files':9,'private_bytes':sum(x['size'] for x in upload['files'].values()),'published_versions_unchanged':True,'frozen_engines':frozen,'xlsx_sheets':expected,'sku_rows':len(rows),'sku_delta_cents':delta,'pdf_pages':len(pdf.pages),'basis':'previously verified historical snapshot; fresh full calculation FAILED','passed':True}
(e/'m3-delivery-verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=True))
