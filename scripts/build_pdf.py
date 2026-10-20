"""Build the eight-page portfolio report, quality and import design prototype."""
from pathlib import Path
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'pdf' / 'olist-report-template.pdf'
OUT.parent.mkdir(parents=True, exist_ok=True)
pdfmetrics.registerFont(TTFont('YaHei', 'C:/Windows/Fonts/msyh.ttc', subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold', 'C:/Windows/Fonts/msyhbd.ttc', subfontIndex=0))
W, H = A4
INK = '#193c36'
GREEN = '#176b58'
MUTED = '#60736b'
PAPER = '#f5f5ef'
LINE = '#d6dfd5'
LIME = '#d7ee9c'
WHITE = '#fffef9'
c = canvas.Canvas(str(OUT), pagesize=A4)
c.setTitle('Olist 电商履约与客户体验诊断 | 求职项目报告样板 v0.2')
c.setAuthor('个人求职项目 / 设计样板')
c.setSubject('定位与样板阶段；未下载原始数据；无实际分析结论')

def rect(x, top, width, height, fill, stroke=None):
    c.setFillColor(HexColor(fill))
    c.setStrokeColor(HexColor(stroke or fill))
    c.setLineWidth(.6)
    c.rect(x, H-top-height, width, height, fill=1, stroke=bool(stroke))

def line(x, top, x2, color=LINE):
    c.setStrokeColor(HexColor(color)); c.setLineWidth(.6)
    c.line(x, H-top, x2, H-top)

def label(s, x, top, size=10, color=INK, bold=False):
    c.setFillColor(HexColor(color))
    c.setFont('YaHeiBold' if bold else 'YaHei', size)
    c.drawString(x, H-top-size, s)

def paragraph(s, x, top, width, size=10, leading=18, color=MUTED, bold=False, max_bottom=755):
    font = 'YaHeiBold' if bold else 'YaHei'
    y = top
    for source in s.split('\n'):
        current = ''
        for char in source:
            if current and pdfmetrics.stringWidth(current+char, font, size)>width:
                label(current, x, y, size, color, bold); y += leading; current = char
            else:
                current += char
        if current:
            label(current, x, y, size, color, bold); y += leading
        else:
            y += leading
    if y > max_bottom:
        raise ValueError(f'Content below boundary: {s[:25]} at {y}')
    return y

def page(n, section, title, subtitle):
    rect(0, 0, W, H, PAPER)
    label('olist lens.', 44, 30, 14, INK, True)
    label('PORTFOLIO STUDY / DESIGN TEMPLATE', 310, 35, 7, MUTED)
    line(44, 62, W-44)
    label(section.upper(), 44, 85, 8, GREEN, True)
    label(title, 44, 109, 25, INK, True)
    paragraph(subtitle, 44, 153, W-88, size=9, leading=16)
    line(44, 783, W-44)
    label('定位与样板 v0.2 | 质量与结果检查未执行 | 2026.10.19', 44, 795, 7, MUTED)
    label(f'{n:02d} / 08', W-82, 795, 8, GREEN)

def note(s, top, height=50):
    rect(44, top, W-88, height, '#e9eedc')
    paragraph(s, 58, top+12, W-116, 9, 16, INK)

# 01: cover and actual product positioning.
rect(0, 0, W, H, PAPER)
rect(0, 0, W, 470, INK)
label('olist lens.', 44, 36, 18, WHITE, True)
label('E-COMMERCE OPERATIONS / CASE STUDY 01', 44, 96, 8, LIME)
label('电商履约与', 44, 139, 39, WHITE, True)
label('客户体验诊断', 44, 196, 39, WHITE, True)
paragraph('哪些订单更容易延迟？\n延迟是否伴随更多差评？\n运营应该优先改善哪里？', 47, 281, 430, 14, 27, '#d0e0d4')
rect(44, 405, 165, 29, LIME)
label('求职作品 / 产品与版式样板', 56, 412, 9, INK)
label('项目定位', 44, 509, 18, INK, True)
paragraph('面向电商／运营数据分析岗位的个人项目。模拟服务运营负责人，以订单为主线，展示从多表建模、指标定义到业务诊断与行动验证的完整过程。', 44, 548, W-88, 11, 21)
line(44, 630, W-44)
label('面试官看见什么', 44, 649, 9, GREEN, True)
paragraph('SQL 多表分析  /  指标独立复算  /  业务证据解释\n质量校验设计  /  新数据导入模板  /  可验证的运营建议', 44, 676, W-88, 10, 22, INK)
paragraph('本文件为设计样板。数据尚未下载，指标、图表与结论尚未填充。\n数据来源拟采用 Kaggle Olist 历史公开数据；非 Olist 官方报告。', 44, 751, W-88, 8, 15, MUTED, max_bottom=804)
label('v0.2 / 2026.10.19', 44, 810, 7, MUTED)
label('01 / 08', W-82, 810, 8, GREEN)
c.showPage()

# 02: evidence-first executive summary layout.
page(2, '01 / executive readout', '一页读懂：问题、证据、行动', '正式版在这里放置 2–3 条经过核验的发现。当前仅呈现填充结构，不预设研究结论。')
label('数据版本：待接入    质量检查：未执行    指标复算：未执行', 44, 184, 7, GREEN)
metrics=[('已交付订单数', '按订单去重'), ('商品金额 / BRL', '不含运费，非收入'), ('延迟交付率', '仅有效交付日期'), ('低评分订单占比', '仅有效评分订单')]
gap=10; cw=(W-88-3*gap)/4
for i,(name,sub) in enumerate(metrics):
    x=44+i*(cw+gap)
    rect(x, 205, cw, 100, WHITE, LINE)
    label(name, x+10, 219, 8, INK)
    label('待计算', x+10, 244, 18, GREEN)
    label(sub, x+10, 281, 7, MUTED)
rows=[('01', '经营表现', '待填：主要趋势 + 可比窗口 + 数据边界。', '证据：月度订单与金额趋势、日期覆盖。'), ('02', '履约诊断', '待填：问题群体 + 样本量 + 延迟贡献。', '证据：地区／卖家／品类分解，低样本组单列。'), ('03', '体验与行动', '待填：分组差异 + 解释边界 + 优先试点。', '证据：低评分率对比、分层结果与验证计划。')]
for i,(num,title,body,evidence) in enumerate(rows):
    top=339+i*102
    line(44, top, W-44)
    label(num, 44, top+20, 13, GREEN)
    label(title, 85, top+17, 13, INK, True)
    paragraph(body, 85, top+43, W-129, 9, 17, INK)
    paragraph(evidence, 85, top+67, W-129, 8, 15)
note('结论写作模板：在【窗口／样本】中观察到【差异】，由【证据】支持；建议验证【动作】，并说明【局限】。', 672, 64)
c.showPage()

# 03: model and metric definitions.
page(3, '02 / data contract', '先统一口径，再比较结果', '主分析粒度为订单。所有趋势按购买月份归属；状态、缺失日期和无评价订单分别披露。')
rect(44, 201, W-88, 110, INK)
label('订单主表  orders', 61, 216, 13, LIME, True)
paragraph('商品明细 → 按订单聚合金额与件数\n支付明细 → 独立按订单聚合，用于支付口径核对\n评价明细 → 先检查重复，再保留一条评价\n客户／商品／卖家 → 提供地区与分类维度', 61, 246, W-122, 9, 15, WHITE)
defs=[('已交付订单数', '购买窗口内，状态为 delivered 的去重订单数。'), ('已交付订单商品金额', '上述订单各商品行 price 之和；BRL，不含运费。不能解释为平台收入、净收入或利润。'), ('延迟交付率', '实际交付日期晚于预计日期的订单数 ÷ 已交付且两日期均有效的订单数。比较日历日期，缺失另报。'), ('低评分订单占比', '1–2 分订单数 ÷ 有有效 1–5 分评价的已交付订单数。无有效评价单列。交叉分析另限制履约日期有效。')]
top=339
for title,body in defs:
    line(44, top, W-44)
    label(title, 44, top+12, 10, INK, True)
    end=paragraph(body, 214, top+10, W-258, 9, 17)
    top=max(top+69, end+12)
note('关键校验：商品、支付明细必须先聚合再关联，防止金额膨胀。卖家／品类可跨组，同一订单可能进入多个组，各组不可直接相加。', 653, 67)
c.showPage()

# 04: blank chart layout, no fabricated quantitative shapes.
page(4, '03 / diagnostic evidence', '从履约差异，定位待验证机会', '本页展示图表结构。所有图形位置均为空白占位，不编码真实或模拟业务数据。')
rect(44, 203, W-88, 220, WHITE, LINE)
label('A / 地区延迟贡献', 61, 218, 12, INK, True)
label('待生成：横向条形图 + 样本量 + 延迟率注释', 61, 244, 8, MUTED)
for yy in [282, 317, 352, 387]: line(84, yy, W-64, '#e6ece2')
label('数据接入后生成', 220, 325, 14, GREEN)
label('Y：客户所在州    X：延迟订单数', 61, 400, 7, MUTED)
gap=17; width=(W-88-gap)/2
for i,(title,body) in enumerate([('B / 延迟与低评分', '按时与延迟组对照；显示分母和不确定性。'), ('C / 分层复查', '按月份、地区、品类核对差异是否稳定。')]):
    x=44+i*(width+gap)
    rect(x, 441, width, 169, WHITE, LINE)
    label(title, x+15, 456, 11, INK, True)
    paragraph(body, x+15, 484, width-30, 8, 15)
    label('图表待计算', x+65, 547, 13, GREEN)
    label('不预填组间差异或结论', x+15, 587, 7, MUTED)
label('如何从图表走向判断', 44, 639, 12, INK, True)
paragraph('同时观察比率、规模和贡献，避免追逐小样本高比率。评价分析需披露无评价覆盖率，防止把评价人群当作全部用户。组间差异即使稳定，也只支持关联解释。', 44, 668, W-88, 10, 19)
c.showPage()

# 05: proposed action framework, contingent on evidence.
page(5, '04 / action & validation', '把建议写成可验证的行动', '以下是待证据支持的候选试点框架；尚未实施，不代表已有业务收益。')
actions=[('A', '履约预警试点', '触发证据：延迟贡献集中在可干预的订单群体。', '候选动作：在预计交付日前识别风险订单，测试异常升级与主动沟通。', '验证：对照比较延迟率、低评分率；同时监控客服负担与样本覆盖。'), ('B', '重点卖家协同', '触发证据：卖家差异在地区、月份与品类分层后仍存在。', '候选动作：对高影响群体排查交付链路，形成可追踪的整改试点。', '验证：比较试点前后及可比对照；记录订单构成变化，避免简单归因。'), ('C', '预计交付承诺复核', '触发证据：预计与实际交付偏差在部分订单群体持续出现。', '候选动作：与业务核对承诺规则，评估更准确的预计交付区间。', '验证：同时观察履约达标与体验；不能仅靠放宽承诺来宣称改善。')]
for i,(letter,title,trigger,act,validation) in enumerate(actions):
    top=204+i*153
    line(44, top, W-44)
    rect(44, top+17, 27, 27, GREEN)
    label(letter, 53, top+22, 12, WHITE)
    label(title, 86, top+15, 14, INK, True)
    paragraph(trigger, 86, top+45, W-130, 8.5, 16, GREEN)
    paragraph(act, 86, top+69, W-130, 9, 17)
    paragraph(validation, 86, top+109, W-130, 8, 15)
note('优先级框架：问题规模 × 证据强度 × 可干预性，并结合执行成本。样板阶段不填收益预测；任何提升幅度都需要真实试点结果。', 687, 61)
c.showPage()

# 06: provenance, limitations and the next concrete step.
page(6, '05 / methods & delivery', '让作品经得起技术追问', '交付目标：既能快速讲清业务问题，也能回到原始数据重算每一个关键指标。')
label('数据出处与解释边界', 44, 205, 13, INK, True)
paragraph('来源：Kaggle / Brazilian E-Commerce Public Dataset by Olist。数据卡描述为 2016–2018 年的匿名历史商业订单，实际覆盖与文件版本待核验。', 44, 236, W-88, 9, 17)
url='https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce'
label('打开 Kaggle 数据卡 ↗', 44, 290, 9, GREEN)
c.linkURL(url, (44,H-306,220,H-287), relative=0)
paragraph('历史巴西数据不能代表当前中国市场。缺少流量、成本和干预记录，因此不计算完整购买转化率、利润或已实现的改善效果。观察性分组无法排除全部混杂。', 44, 322, W-88, 9, 18)
line(44, 405, W-44)
label('分步交付路线', 44, 425, 13, INK, True)
steps=[('01  本次', '定位、质量与导入设计', '新增检查规则、空白模板与网上工具参考。'), ('02  下一步', '下载与质量检查', '记录许可、版本、哈希、字段、行数与缺失。'), ('03', '建模、独立复算与分析', '核对订单和金额守恒，验证分子分母与分层差异。'), ('04', '更新能力与求职包装', '实现完整快照导入与失败恢复，填入真实发现。')]
for i,(num,title,body) in enumerate(steps):
    top=466+i*49
    label(num, 44, top, 8, GREEN)
    label(title, 128, top-1, 10, INK, True)
    label(body, 128, top+18, 8, MUTED)
note('最终验收：关键指标可重算；图表有分母与来源；结论与证据一致；不虚构任职或效果。允许分析否定最初假设。', 690, 57)
c.showPage()

# 07: quality requirements, explicitly distinct from executed checks.
page(7, '06 / quality & reliability', '数据先检查，结论再验证', '本页为后续实现的验收规则。原始数据未接入，所有质量与复算状态均为“未执行”。')
checks=[('01', '来源与字段', '记录来源、版本、币种、时间范围与文件哈希。检查必需文件、列、类型、空主键及冲突记录。'), ('02', '关联与金额', '检查外键与关联倍数。商品先汇总再关联，按分核对金额守恒；支付和商品金额分开解释。'), ('03', '缺失与比较', '缺日期与无评分单列，披露有效分母和覆盖率。零分母显示不适用；完整月份才直接比较。'), ('04', '结果独立复算', 'SQL 与独立 Python 路径核对核心指标的分子分母，并抽查同日交付、多商品和多评价等边界。'), ('05', '结论与证据', '发现关联到图表、数据版本、指标口径和代码版本。显示样本量与解释局限，避免因果夸大。')]
for i,(num,title,body) in enumerate(checks):
    top=205+i*85
    line(44, top, W-44)
    label(num, 44, top+16, 12, GREEN)
    label(title, 85, top+13, 12, INK, True)
    paragraph(body, 85, top+39, W-129, 9, 17)
note('状态设计：未执行 / 不通过 / 需说明 / 通过。关键检查不通过，不能更新为已验证结果。格式与逻辑校验无法单独保证源业务记录事实真实。', 670, 69)
c.showPage()

# 08: normalized import templates and safe replacement contract.
page(8, '07 / new data import', '让新数据沿同一流程更新', '第一版规划为完整快照替换。当前提供空白模板与字段草案，导入执行和版本管理尚未实现。')
label('标准输入 / 1.0.0-draft', 44, 204, 13, INK, True)
files=[('orders.csv', '一行一订单：订单、客户地区、状态和交付时间。'), ('order_items.csv', '一行一商品明细：商品、卖家、品类、金额与运费。'), ('order_reviews.csv', '一行一评价：订单、评价键、评分及评价时间。'), ('dataset_manifest.json', '数据来源、覆盖范围、币种、时区和导入模式。')]
for i,(filename,body) in enumerate(files):
    top=241+i*42
    label(filename, 44, top, 9, GREEN, True)
    label(body, 44, top+17, 8, MUTED)
line(44, 422, W-44)
label('导入流程与失败恢复', 44, 440, 13, INK, True)
paragraph('下载模板 → 填充与选择文件 → 预览字段与范围\n完整质量检查 → 候选快照复算 → 切换当前结果', 44, 471, W-88, 11, 23, GREEN)
paragraph('校验失败或中断时保留上一有效版本，显示其真实数据时间。相同批次不直接追加；不同币种、时区或分析窗口先明确处理规则。文件模板仅含表头，空白模板不能生成业务结果。', 44, 538, W-88, 9, 18)
note('已纳入产品需求：字段说明、错误定位、检查日志、批次版本、结果追溯与失败恢复。Kaggle 原始文件需适配后进入统一模板，尚未完成真实数据验证。', 615, 68)
label('交互参考 / 官网与官方文档已核验', 44, 707, 8, INK, True)
refs=[('CSVLint', 'https://csvlint.io/'), ('Datawrapper', 'https://www.datawrapper.de/academy/upload-data'), ('Datasette Lite', 'https://lite.datasette.io/'), ('YData Profiling', 'https://docs.profiling.ydata.ai/latest/getting-started/concepts/')]
for i,(name,url) in enumerate(refs):
    x=44+i*125
    label(name, x, 732, 8, GREEN)
    c.linkURL(url,(x,H-747,x+112,H-730),relative=0)
c.showPage()
c.save()

from pypdf import PdfReader
reader = PdfReader(OUT)
assert len(reader.pages) == 8
for n, p in enumerate(reader.pages, 1):
    assert len(p.extract_text() or '') > 100, n
print(f'Created {OUT} | pages=8 | bytes={OUT.stat().st_size}')
