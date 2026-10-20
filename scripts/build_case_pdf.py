"""Create the actual eight-page report from verified results; no fabricated numbers."""
from pathlib import Path
import json,re,os
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

ROOT=Path(__file__).resolve().parents[1]
R=json.loads((ROOT/'output/analysis/case.json').read_text(encoding='utf-8'))
assert R['verification']['status']=='通过' and R['verification']['python']['status']=='通过'
OUT=ROOT/'output/pdf/olist-case-study.pdf';OUT.parent.mkdir(parents=True,exist_ok=True)
pdfmetrics.registerFont(TTFont('YH',os.environ.get('OLIST_FONT_REGULAR','C:/Windows/Fonts/msyh.ttc'),subfontIndex=0));pdfmetrics.registerFont(TTFont('YHB',os.environ.get('OLIST_FONT_BOLD','C:/Windows/Fonts/msyhbd.ttc'),subfontIndex=0))
W,H=A4;INK='#183f37';GREEN='#24745e';MUTED='#63756b';PAPER='#f5f6f0';LINE='#dce2d8';LIME='#d7ee9c';WHITE='#fffefb'
C=canvas.Canvas(str(OUT),pagesize=A4);C.setTitle('Olist 电商履约与客户体验诊断 | 真实数据分析报告');C.setAuthor('个人求职项目');C.setSubject('Kaggle Olist v2，历史公开订单分析，非商业作品展示')
def rect(x,t,w,h,color):C.setFillColor(HexColor(color));C.rect(x,H-t-h,w,h,fill=1,stroke=0)
def line(x,t,x2,color=LINE):C.setStrokeColor(HexColor(color));C.setLineWidth(.6);C.line(x,H-t,x2,H-t)
def txt(s,x,t,size=10,color=INK,bold=False):C.setFillColor(HexColor(color));C.setFont('YHB' if bold else 'YH',size);C.drawString(x,H-t-size,str(s))
def para(s,x,t,width,size=10,leading=18,color=MUTED,bold=False,bottom=754):
    font='YHB' if bold else 'YH';y=t
    for block in s.split('\n'):
        row=''
        for char in re.findall(r'[A-Za-z0-9][A-Za-z0-9_.:%/+-]*|.',block):
            if row and pdfmetrics.stringWidth(row+char,font,size)>width:txt(row,x,y,size,color,bold);y+=leading;row=char
            else:row+=char
        if row:txt(row,x,y,size,color,bold);y+=leading
    if y>bottom:raise ValueError('Report text overflow: '+s[:35])
    return y
def page(n,section,title,sub):
    rect(0,0,W,H,PAPER);txt('olist lens.',44,29,15,INK,True);txt('CASE STUDY / VERIFIED CALCULATIONS',309,36,7,MUTED);line(44,62,W-44)
    txt(section,44,85,8,GREEN,True);txt(title,44,110,25,INK,True);para(sub,44,153,W-88,9,16)
    line(44,783,W-44);txt('Olist / Kaggle v2 · 历史公开数据 · 2026.10.19',44,795,7,MUTED);txt(f'{n:02d} / 08',W-82,795,8,GREEN)
def note(s,t,h=61):rect(44,t,W-88,h,'#eaf0df');para(s,58,t+12,W-116,8.5,17,INK)
def pct(n):return '不适用' if n is None else f'{n*100:.2f}%'
def num(n):return f'{n:,}'
def bars(rows,t,height,labelkey,valuekey,percent=False,maxvalue=None):
    maxv=maxvalue or max((r[valuekey] or 0 for r in rows),default=1) or 1
    step=height/len(rows)
    for i,r in enumerate(rows):
        y=t+i*step;v=r[valuekey] or 0;txt(str(r[labelkey]),50,y+3,9,INK);rect(100,y,330*v/maxv,17,GREEN);txt(pct(v) if percent else num(v),440,y+2,9,INK)
M=R['metrics'];A={r['delivery_group']:r for r in R['association']};S=R['stratified'];TOP=R['states'][:2];share=sum(r['late_orders'] for r in TOP)/M['late_orders'];delta=A['late']['rate']-A['on_time']['rate']

page(1,'01 / EXECUTIVE SUMMARY','电商履约与客户体验诊断','从 99,441 笔历史订单出发，判断履约改善应该优先在哪里验证。个人求职作品，非 Olist 官方报告。')
txt('Executive Summary / 管理摘要',44,207,15,INK,True)
summary=[('优先结合规模与比率定位履约问题。',f"履约日期有效的 {num(M['delivery_eligible'])} 笔已交付订单中，{num(M['late_orders'])} 笔延迟，延迟率 {pct(M['late_rate'])}。SP 与 RJ 合计贡献 {pct(share)} 的延迟订单。"),('延迟组的低评分率明显更高，但不能直接归因。',f"交叉样本中，延迟组低评分率 {pct(A['late']['rate'])}，按时组为 {pct(A['on_time']['rate'])}，相差 {delta*100:.2f} 个百分点。分组同时要求有效履约日期与评分。"),('建议先做重点群体的履约排查与小范围试点。',f"月份 × 客户州分层后的加权差异仍为 {S['weighted_difference']*100:.2f} 个百分点，但仅覆盖 {pct(S['coverage'])} 的交叉样本，且未控制全部混杂。")]
for i,(title,body) in enumerate(summary):
    y=249+i*109;txt(f'0{i+1}',44,y,12,GREEN);para(title,82,y-2,W-126,11,20,INK,True);para(body,82,y+32,W-126,10,19)
rect(44,600,W-88,80,INK);txt('已交付订单',60,614,8,LIME);txt(num(M['delivered_orders']),60,638,23,WHITE);txt('商品金额 / BRL',294,614,8,LIME);txt(f"{M['amount_cents']/100:,.2f}",294,642,17,WHITE)
para('分析范围：2016-09-04 至 2018-10-17 的购买订单，使用历史最终状态。边界月份非完整经营窗口；商品金额不含运费，不代表平台收入或利润。',44,709,W-88,9,17)
C.showPage()

page(2,'02 / BUSINESS OVERVIEW','趋势先看覆盖，再解释波动','已交付订单按购买月份归属。下图展示连续月份；没有观测记录的月份计为该数据集 0 单。')
rows=R['monthly'];lookup={r['month']:r['delivered_orders'] for r in rows};months=[f'{year}-{month:02d}' for year in [2016,2017,2018] for month in range(1,13) if '2016-09'<=f'{year}-{month:02d}'<='2018-10'];values=[lookup.get(m,0) for m in months];mx=max(values);x0=75;y0=445;pw=460;ph=200
for i in range(5):
    v=mx*i/4;y=y0-v/mx*ph;line(x0,y,x0+pw);txt(f'{v:,.0f}',44,y-6,7,MUTED)
C.setStrokeColor(HexColor(GREEN));C.setLineWidth(2);p=C.beginPath()
for i,v in enumerate(values):
    x=x0+i/(len(values)-1)*pw;y=H-(y0-v/mx*ph)
    if i==0:p.moveTo(x,y)
    else:p.lineTo(x,y)
C.drawPath(p)
for i,m in enumerate(months):
    if i%5==0 or i==len(months)-1:txt(m,x0+i/(len(months)-1)*pw-17,462,7,MUTED)
peak=max(rows,key=lambda r:r['delivered_orders']);txt('月度已交付订单数 / 单',44,207,11,INK,True)
para(f"数据集中月度已交付订单数最高的是 {peak['month']}，为 {num(peak['delivered_orders'])} 单。2018 年 9–10 月仅有少量其他状态订单，不能把尾部下降解释为经营崩塌。",44,511,W-88,11,22,INK)
para('这条曲线用于识别需要进一步检查的月份，不直接判断增长质量。对时间变化进行业务比较时，应先选取覆盖可比的窗口，再分析状态、品类和地区构成。',44,598,W-88,10,20)
note('来源：订单主表最终状态。该数据不是逐日状态快照，不能据此重建历史每一天的“当时已交付订单”。',696,53)
C.showPage()

page(3,'03 / REGIONAL DIAGNOSTICS','数量与比率，共同决定排查顺序','条形从零开始，按延迟订单数排序；表中同时展示样本分母与各组延迟率。')
bars(R['states'][:6],221,225,'state','late_orders')
txt('客户州',44,492,8,MUTED);txt('履约有效订单',152,492,8,MUTED);txt('延迟订单',300,492,8,MUTED);txt('延迟率',437,492,8,MUTED)
for i,r in enumerate(R['states'][:5]):
    y=520+i*27;line(44,y-5,W-44);txt(r['state'],44,y,9);txt(num(r['delivery_eligible']),152,y,9);txt(num(r['late_orders']),300,y,9);txt(pct(r['late_rate']),437,y,9)
para(f"SP 有 {num(TOP[0]['late_orders'])} 笔延迟，延迟率为 {pct(TOP[0]['late_rate'])}；RJ 有 {num(TOP[1]['late_orders'])} 笔延迟，延迟率为 {pct(TOP[1]['late_rate'])}。两者合计占全部延迟订单的 {pct(share)}，可优先核对订单构成与交付链路。",44,679,W-88,10,19)
C.showPage()

page(4,'04 / EXPERIENCE ASSOCIATION','延迟与低评分：差异有多大？','仅使用已交付、两项履约日期有效、且具有有效评分的订单。低评分为 1–2 分。')
for i in range(5):
    y=447-i*50;line(75,y,535);txt(f'{i*25}%',44,y-5,8,MUTED)
for i,key in enumerate(['on_time','late']):
    a=A[key];x=155+i*210;height=a['rate']*200;rect(x,447-height,100,height,'#96b19c' if i==0 else GREEN);txt(pct(a['rate']),x+14,423-height,14,INK,True);txt('按时交付' if i==0 else '延迟交付',x+13,465,10,INK);txt('n = '+num(a['n']),x+4,489,9,MUTED)
para(f"延迟组 {num(A['late']['n'])} 单中有 {num(A['late']['low'])} 单低评分；按时组 {num(A['on_time']['n'])} 单中有 {num(A['on_time']['low'])} 单低评分。总体差异为 {delta*100:.2f} 个百分点，值得进一步排查，而非直接估算可挽回的差评或收入。",44,550,W-88,11,21,INK)
note('有评价人群可能与无评价人群不同。交叉样本中的分母与全体已交付订单不同，不能直接互换。该结果为历史观察性关联。',686,63)
C.showPage()

page(5,'05 / STRATIFIED CHECK','同月份、同地区，再复查关联','以购买月份 × 客户州构成分层。每层按时与延迟两组均至少 30 单，才进入探索性对照。')
cards=[('共同分层',str(S['strata'])+' 层'),('覆盖交叉订单',num(S['orders'])+' 单'),('覆盖率',pct(S['coverage']))]
for i,(name,value) in enumerate(cards):
    x=44+i*173;rect(x,215,160,90,WHITE);txt(name,x+12,228,9,MUTED);txt(value,x+12,259,19,GREEN)
txt('加权差异',44,351,11,MUTED);txt(f"{S['weighted_difference']*100:.2f} 个百分点",44,385,31,GREEN,True)
para('各层差异 = 该层延迟组低评分率 - 按时组低评分率。按各层两组样本量之和加权，比较相同月份和地区中的观察差异。',44,453,W-88,11,21,INK)
para('这次复查没有消除关联，但也没有证明因果。只有约一半交叉样本进入共同分层，低样本层被排除；商品品类、金额、卖家以及用户评价意愿等因素仍可能解释部分差异。',44,548,W-88,11,21)
note('下一步：检查未纳入分层的订单构成，再补充品类与卖家维度。真正评估履约改善效果，需要有对照的干预或更充分的因果识别设计。',688,61)
C.showPage()

page(6,'06 / QUALITY & RECONCILIATION','检查已执行，边界仍需说明','核心 7 项计数／金额与 9 组 SQL 聚合表已复核。结构校验不能单独保证源记录事实真实。')
txt('校验项',44,207,9,MUTED);txt('SQL 与独立 Python 结果',250,207,9,MUTED)
names={'total_orders':'全状态订单数','delivered_orders':'已交付订单数','amount_cents':'已交付商品金额（分）','delivery_eligible':'履约有效分母','late_orders':'延迟订单数','review_eligible':'评价有效分母','low_reviews':'低评分订单数'}
for i,a in enumerate(R['verification']['python']['comparisons']):
    y=237+i*30;line(44,y-5,W-44);txt(names[a['metric']],44,y,9);txt(num(a['sql'])+' / 一致',250,y,10,GREEN)
txt('重点质量说明',44,476,13,INK,True)
notes=[('8 笔', '已交付订单缺少履约日期，延迟率分母排除，其他有效指标保留。'),('646 笔', '已交付订单无评价，不当成好评，不进入评分分母。'),('547 笔', '同订单有多条评价，按最新回答、创建时间和评价 ID 选择。'),('1,603 行', '商品明细品类为空，保留缺失，不伪造分类。'),('6 笔', '未交付状态却有交付日期，依明确状态口径排除，需来源核查。')]
for i,(n,s) in enumerate(notes):y=513+i*33;txt(n,44,y,9,GREEN,True);para(s,118,y,W-162,8.5,16)
note('同时披露：来源本地时区未知、末期覆盖不完整。警告数量可能重叠，不能相加当作问题订单总数。',705,43)
C.showPage()

page(7,'07 / ACTION & VALIDATION','将观察结果，转成可验证的试点','建议针对历史案例提出，尚未实施，不声称已有业务改善。实际落地需要新的业务数据与执行条件。')
actions=[('01','优先排查 SP 与 RJ 的高影响订单',f"两州贡献 {pct(share)} 的延迟订单。进一步查看卖家、品类与承诺时间，识别能实际干预的环节。",'验证：明确试点与可比对照，追踪延迟率及有效覆盖，记录订单构成变化。'),('02','测试异常升级与主动沟通','延迟与低评分相关，可测试风险提醒和异常处理是否改善体验。当前关联不能用于承诺改善幅度。','验证：比较低评分率与分母，监控客服负担和投诉；保留未改善或负面结果。'),('03','复核预计交付承诺的准确度','对持续偏差的地区／卖家复查承诺规则及真实交付链路，避免将所有差异归因于运输。','验证：同时看真实交付时长与体验，不能只靠放宽承诺来宣称履约改善。')]
for i,(n,title,body,check) in enumerate(actions):
    t=211+i*157;line(44,t,W-44);txt(n,44,t+16,12,GREEN);txt(title,83,t+13,13,INK,True);para(body,83,t+47,W-127,10,19);para(check,83,t+103,W-127,9,17)
note('后续问题：缺失和无评价订单是否存在系统性偏差？未纳入共同分层的订单有哪些特点？真实干预成本与可执行范围是多少？',703,48)
C.showPage()

page(8,'08 / REPRODUCIBILITY & IMPORT','可重复导入，也可回到证据源','浏览器本地处理新数据，公开网址仅展示公开案例。访客导入的文件不传到服务器，也不替换他人结果。')
txt('标准数据接口 / v1.0.0',44,209,13,INK,True)
para('orders.csv：一行一订单\norder_items.csv：一行一商品明细\norder_reviews.csv：一行一评价记录\ndataset_manifest.json：来源、范围、币种、时区与版本',44,244,W-88,10,24,INK)
line(44,356,W-44);txt('更新与恢复',44,376,13,INK,True)
para('选择文件 → 字段／类型／键／关联校验 → SQL 与独立计算复算 → 候选预览 → 确认切换。失败保留上一有效版本，同批次不追加。历史版本存入本机浏览器，可导出完整备份并重新校验恢复。',44,411,W-88,10,20)
para('浏览器存储有设备配额，不能作为唯一备份。公开案例额外通过 Python Decimal 与 Python SQLite 核验。来源时间口径、代码哈希、文件哈希、检查记录与 SQL 均保留在下载包中。',44,506,W-88,10,20)
txt('本报告数据版本：'+R['id'],44,591,8,GREEN)
txt('原始归档 SHA-256：',44,619,8,MUTED)
prov=json.loads((ROOT/'data/raw/kaggle-v2/provenance.json').read_text(encoding='utf-8'));para(prov['archive_sha256'],44,638,W-88,8,15,INK)
url='https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce';txt('Kaggle / Olist 原始数据来源',44,681,10,GREEN);C.linkURL(url,(44,H-699,300,H-679),relative=0)
para('Olist 数据与衍生分析数据：CC BY-NC-SA 4.0。历史巴西业务不代表当前中国市场。关联不能证明因果；没有流量与完整成本，不计算转化率或利润。',44,716,W-88,9,17)
C.showPage();C.save()
from pypdf import PdfReader
reader=PdfReader(OUT);assert len(reader.pages)==8
assert all(len(p.extract_text())>100 for p in reader.pages)
print(f'Created actual report, pages=8, bytes={OUT.stat().st_size}')
