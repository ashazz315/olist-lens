import json,sys,html,os
from pathlib import Path
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak
r=json.loads(Path(sys.argv[1]).read_text(encoding='utf8'))
font=Path(os.environ.get('LENS_PDF_FONT','C:/Windows/Fonts/Deng.ttf'))
if not font.is_file():raise RuntimeError('Configure LENS_PDF_FONT to an embeddable Chinese TTF')
pdfmetrics.registerFont(TTFont('STSong-Light',str(font)))
styles=getSampleStyleSheet();styles.add(ParagraphStyle(name='CN',fontName='STSong-Light',fontSize=10,leading=16,wordWrap='CJK',spaceAfter=8));styles.add(ParagraphStyle(name='TitleCN',parent=styles['CN'],fontSize=20,leading=26));styles.add(ParagraphStyle(name='HeadCN',parent=styles['CN'],fontSize=14,leading=21,textColor=colors.HexColor('#17695c')))
story=[]
def p(text,style='CN'):
    if isinstance(text,float):text=f'{text:,.2f}'
    return Paragraph(html.escape(str(text)),styles[style])
def heading(text):story.extend([Spacer(1,10),p(text,'HeadCN')])
def table(headers,rows,widths):
    cells=[[p(x) for x in headers]]+[[p('不适用' if x is None else x) for x in row] for row in rows];t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#edf4f2')),('VALIGN',(0,0),(-1,-1),'TOP'),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.5,colors.HexColor('#17695c'))]));story.append(t)
story += [p('Olist Lens · 经营诊断报告','TitleCN'),p('独立模拟场景' if r['is_synthetic'] else 'Olist 真实历史回放'),p('数据版本：'+r['version']),p('快照 SHA-256：'+r['snapshot_sha256']),p(r['notice'])]
heading('经营概览与 GMV 分析');m=r['overview']['metrics'];table(['指标','基期','当期'],[[k,m['before'].get(k),m['after'].get(k)] for k in ['purchase_item_amount_cents','purchase_orders','item_units','avg_order_item_amount_cents']],[195,150,150]);story.append(p('全店商品金额变化（分）：'+str(r['overview']['delta_cents'])))
heading('SKU 负向贡献');table(['商品 ID','金额变化（分）','销量效应（分）','价格效应（分）'],[[x['key'],x['delta_cents'],(x.get('quantity_effect') or {}).get('value_cents'),(x.get('price_effect') or {}).get('value_cents')] for x in sorted(r['all_products'],key=lambda x:x['delta_cents'])[:10]],[195,100,100,100]);story.append(p('完整商品排名见同版本 Excel。金额贡献是算术分解，不等于业务根因。'))
story.append(PageBreak())
for key,label in [('marketing','营销分析'),('traffic','流量分析'),('conversion','转化漏斗'),('inventory','库存分析'),('fulfillment','履约与评价')]:
    heading(label);d=r['diagnostics']['dimensions'][key];story.append(p('状态：'+d.get('status','unknown')));story.append(p(d.get('reason') or d.get('maturity') or d.get('cohort') or '独立模拟数据；不能关联真实 Olist 经营结果。'))
    for row in d.get('periods',[]):story.append(p(json.dumps(row,ensure_ascii=False)))
chain=next((card['value'] for card in (r.get('evidence') or {}).get('cards',[]) if card['id']=='E7'),None)
if chain:
    story.append(PageBreak())
    heading('E7 商品调查链 · 独立模拟')
    story.append(p(chain['product']+' / '+r['evidence']['hash']))
    story.append(p('比较窗口 '+ ' / '.join(period['start']+' 至 '+period['end']+'（不含）' for period in chain['periods'])))
    distribution=chain['scope']
    story.append(p(f"可比商品 {distribution['comparable']}，上涨 {distribution['up']}，持平 {distribution['flat']}，下滑 {distribution['down']}，正向抵消 {distribution['positive_cents']} 分"))
    channels={'organic_search':'自然搜索','paid_search':'付费搜索','other':'其他渠道'}
    table(['渠道','基期访问','当期访问','变化','份额变化（百分点）'],[[channels[c['channel']],c['before']['totals']['visits'],c['after']['totals']['visits'],c['delta']['visits'],c['share_delta_pp']] for c in chain['channels']],[95,90,90,90,130])
    heading('活动、分渠道漏斗与库存')
    table(['活动','起止','加入 / 退出','状态 / 事件'],[[c['campaign_id'],c['start']+' / '+c['end'],c['joined_at']+' / '+str(c['left_at']),c['status']+' / '+str(c['exit_reason'])] for c in chain['campaigns']],[130,120,130,115])
    for c in chain['channels']:
        story.append(p(channels[c['channel']]+' · '+c['unit']))
        table(['阶段','基期','当期','变化'],[[k,c['before']['totals'][k],c['after']['totals'][k],delta] for k,delta in c['delta'].items()],[165,110,110,110])
        table(['指标','基期分子 / 分母','当期分子 / 分母'],[[k,f"{b['numerator']} / {b['denominator']}",f"{c['after']['ratios'][k]['numerator']} / {c['after']['ratios'][k]['denominator']}"] for k,b in c['before']['ratios'].items()],[165,165,165])
    table(['库存商品','日期','在手数量','信号'],[[s['product_id'],s['date'],s['on_hand'],s['risk']] for s in chain['inventory']],[130,100,100,165])
    heading('关联订单事件')
    for order in chain['orders']:
        story.append(p(order['order_id']+' / '+order['source']))
        table(['事件','时间（UTC）','退款金额（分）'],[[e['type'],e['at'],e.get('amount_cents')] for e in order['events']],[145,195,155])
    story.append(p(chain['limits']))
heading('AI 调查与人工行动');story.append(p('模型报告需人工审核；规则报告不是大模型调用。'))
if not r['tasks']:story.append(p('该数据版本尚无调查任务及行动记录；效果未验证。'))
for task in r['tasks']:
    story.append(p('任务 '+task['id']+' / '+task['status']))
    for report in task.get('reports',[]):
        story.append(p('报告模式：'+report.get('mode','unknown')))
        for key,entries in report.get('result',{}).items():
            for entry in entries:story.append(p(key+'：'+entry.get('text','')+' [证据 '+','.join(entry.get('evidence_ids',[]))+']'))
    for field in ['reviews','actions','executions']:
        for value in task.get(field,[]):story.append(p(field+' '+json.dumps(value,ensure_ascii=False)))
    if task.get('verification'):
        visible={k:v for k,v in task['verification'].items() if k not in ['before_diagnostics','after_diagnostics','product_changes']}
        story.append(p('效果复核 '+json.dumps(visible,ensure_ascii=False)))
story.append(PageBreak());heading('数据来源、证据与指标口径');story.append(p(r['source'].get('source_uri_or_description','')));story.append(p(r['source'].get('license_or_usage_notes','')))
if r['evidence']:
    for card in r['evidence']['cards']:story.append(p(card['id']+' '+card['label']+' / '+', '.join(card.get('refs',[]))))
table(['指标','口径'],r['metric_dictionary'],[145,350])
def footer(c,doc):c.setFont('STSong-Light',8);c.drawString(42,25,'Olist Lens / '+r['version'][:16]+' / '+str(doc.page))
SimpleDocTemplate(sys.argv[2],pagesize=A4,leftMargin=42,rightMargin=42,topMargin=38,bottomMargin=42,title='Olist Lens version-bound report').build(story,onFirstPage=footer,onLaterPages=footer)
