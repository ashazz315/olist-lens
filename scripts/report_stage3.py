"""Package reviewed stage outputs; charts/cases are derived from saved real calculations."""
import argparse
import csv
import gzip
import html
import json
import shutil
from collections import Counter
from pathlib import Path
from fractions import Fraction
from decimal import Decimal
from stage3_io import ROOT, load, sha, now, write_json, fresh_dir, copy_verified
from backtest_monitoring import export_csv

def table(headers,rows):
    def cell(x):return str(x).replace('|','\\|').replace('\n',' ')
    return '| '+' | '.join(headers)+' |\n| '+' | '.join('---' for _ in headers)+' |\n'+'\n'.join('| '+' | '.join(cell(x) for x in r)+' |' for r in rows)+'\n'

def md(path,text):Path(path).write_text(text.strip()+'\n',encoding='utf-8')
def ratio(n,d):return str(Fraction(n,d)) if d else '不可计算：分母为零'
def effect(r):return str(Fraction(int(r['numerator']),int(r['denominator']))) if r else '不适用（新增/消失）'

def seller_products(canonical,seller,before,after):
    orders={r['order_id']:r for r in read_rows(canonical/'orders.csv') if r['order_status'] in {'approved','invoiced','processing','shipped','delivered'}};groups={}
    for r in read_rows(canonical/'order_items.csv'):
        if r['seller_id']!=seller or r['order_id'] not in orders:continue
        d=orders[r['order_id']]['purchased_at'][:10]
        period='before' if before['start']<=d<before['end'] else 'after' if after['start']<=d<after['end'] else None
        if period is None:continue
        g=groups.setdefault(r['product_id'],{'key':r['product_id'],'before':{'units':0,'amount_cents':0},'after':{'units':0,'amount_cents':0}});g[period]['units']+=1;g[period]['amount_cents']+=int(Decimal(r['price'])*100)
    def record(v):return {'numerator':str(v.numerator),'denominator':str(v.denominator)}
    for r in groups.values():
        q0,q1=r['before']['units'],r['after']['units'];s0,s1=r['before']['amount_cents'],r['after']['amount_cents'];r['delta_cents']=s1-s0
        if q0 and q1:
            quantity=Fraction(q1-q0,2)*(Fraction(s1,q1)+Fraction(s0,q0));price=Fraction(q1+q0,2)*(Fraction(s1,q1)-Fraction(s0,q0));assert quantity+price==s1-s0
            r.update(quantity_effect=record(quantity),price_effect=record(price),assortment_effect_cents=0,status='continuing')
        else:r.update(quantity_effect=None,price_effect=None,assortment_effect_cents=s1-s0,status='new' if q1 else 'discontinued')
    return list(groups.values())

def bar_svg(file,labels,values,title):
    width=1080;height=330;maxv=max(values) if values else 1;maxv=max(maxv,1);step=980/max(len(values),1)
    shapes=[]
    for i,(label,value) in enumerate(zip(labels,values)):
        x=65+i*step;h=210*value/maxv
        shapes.append(f'<rect x="{x:.2f}" y="{270-h:.2f}" width="{max(1,step-2):.2f}" height="{h:.2f}" fill="#147d78"><title>{html.escape(str(label))}: {value}</title></rect>')
        if len(labels)<12 or i%13==0:shapes.append(f'<text x="{x:.2f}" y="290" font-size="10">{html.escape(str(label)[:20])}</text>')
    text=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(title)}"><rect width="1080" height="330" fill="#fafbf8"/><g font-family="Arial,sans-serif" fill="#173c3c"><text x="30" y="32" font-size="19">{html.escape(title)}</text><text x="20" y="65">{maxv:,}</text><text x="38" y="274">0</text><path d="M60 60V270H1050" stroke="#789" fill="none"/>{"".join(shapes)}</g></svg>'
    Path(file).write_text(text,encoding='utf-8')

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--root',type=Path,default=ROOT/'output/stage3/recheck');ap.add_argument('--out-dir',type=Path);a=ap.parse_args();state=load(a.root/'stage-state.json')
    if any(state.get(s,{}).get('status')!='passed' for s in ('audit','prepare','analyze','verify','backtest')):raise SystemExit('All prerequisite stages must pass before final packaging')
    for r in state.values():
        for file,h in r['outputs'].items():assert sha(file)==h,'Modified stage evidence: '+file
    dest=fresh_dir(a.out_dir or a.root/'delivery');audit=Path(state['audit']['directory']);canonical=Path(state['prepare']['directory']);analysis=Path(state['analyze']['directory']);verification=Path(state['verify']['directory']);backtest=Path(state['backtest']['directory'])
    independent=load(backtest/'independent-window-reconciliation.json');assert independent['status']=='passed';assert independent['backtest_results_sha256']==sha(backtest/'monitoring-backtest-results.json')
    for name,source in [('real-data-audit',audit),('canonical/olist-v2',canonical),('verification',verification),('backtest',backtest)]:copy_verified(source,dest/name)
    (dest/'analysis').mkdir();(dest/'cases').mkdir();(dest/'figures').mkdir()
    legacy=load(analysis/'real-data-analysis.json');recon=load(verification/'real-data-reconciliation.json');b=load(backtest/'monitoring-backtest-results.json');q=load(audit/'real-data-quality-report.json');prov=load(audit/'real-data-provenance.json');source=prov['source']
    shutil.copy2(analysis/'real-data-analysis.json',dest/'analysis/real-data-analysis.json');shutil.copy2(verification/'real-data-reconciliation.json',dest/'analysis/real-data-reconciliation.json')
    export_csv(dest/'analysis/metric-comparison.csv',recon['comparisons']);export_csv(dest/'analysis/monthly-analysis.csv',legacy['monthly'])
    write_json(dest/'manifest.json',{'project_version':'2.0.1','dataset':source['dataset'],'dataset_version':source['version'],'raw_archive_sha256':source['archive_sha256'],'raw_files':prov['actual_files'],'license':source['license'],'attribution':'Olist / Kaggle','coverage':{k:legacy['manifest'][k] for k in ('coverage_start','coverage_end')},'canonical_version':'1.0.0','metric_version':legacy['metric_version'],'analysis_code_sha256':legacy['code_sha256'],'sql_sha256':recon['sql_sha256'],'verified_at':now(),'validation':'arithmetic verified; business population completeness unproven','runs':{k:v['run_id'] for k,v in state.items()},'is_synthetic':False,'not_realtime':True})
    shutil.copy2(dest/'manifest.json',dest/'real-data-manifest.json')
    for name in ('canonicalization-report.json','field-mapping-report.json'):shutil.copy2(canonical/name,dest/name)
    # Explicit scopes; AOV is per order, not average unit price. Unsupported rules are not invented.
    coverage=[{'requested_metric':x,'existing_rule':y,'coverage':z} for x,y,z in [('商品平均成交单价','none','描述性 amount/units 与数量价格分解；原引擎不对此单独告警'),('品类/卖家销售贡献','amount_cents','金额告警及贡献解释；没有独立份额变化规则'),('延迟订单数','late_rate','保留分子；没有独立延迟数量告警规则'),('订单平均商品金额','aov_cents','原规则：amount/orders；不得冒称商品平均单价')]]
    export_csv(dest/'backtest/monitoring-rule-comparison.csv',coverage)
    cases=[]
    definitions=[('2017-03-13','aov_cents','shop','订单平均商品金额变化'),('2017-11-20','amount_cents','shop','全店商品金额上升'),('2017-11-27','units','shop','商品件数下降'),('2018-05-21','amount_cents','seller','卖家商品金额下降'),('2018-05-28','amount_cents','shop','金额回升的证据边界')]
    for index,(wid,metric,scope,title) in enumerate(definitions,1):
        event=next((e for e in b['events'] if e['window_id']==wid and e['metric_id']==metric and e['scope_type']==scope),None)
        if event is None:continue
        artifact=backtest/'runs'/(wid+'.json.gz')
        with gzip.open(artifact,'rt',encoding='utf-8') as f:run=json.load(f)
        ops=run['operations'];direction=1 if event['absolute_change']>0 else -1
        scoped=seller_products(canonical,event['entity_id'],run['window']['before'],run['window']['after']) if scope=='seller' else ops['dimensions']['product']
        if scope=='seller':assert sum(r['delta_cents'] for r in scoped)==event['absolute_change']
        products=sorted(scoped,key=lambda r:direction*r['delta_cents'],reverse=True)[:5];categories=sorted(ops['dimensions']['category'],key=lambda r:direction*r['delta_cents'],reverse=True)[:5]
        facts={'case_id':f'case-{index:02}','title':title,'window':run['window'],'event':event,'top_shop_products':products,'top_shop_categories':categories,'shop_total_delta_cents':ops['delta_cents'],'shop_contribution_sum_cents':sum(r['delta_cents'] for r in ops['dimensions']['product']),'evidence':'../backtest/runs/'+artifact.name,'evidence_sha256':sha(artifact),'confidence':'算术与规则已验证；业务原因未经人工确认','causal_conclusion':None,'is_synthetic':False,'interpretation_scope':'商品/品类贡献为全店范围；卖家事件不可直接用这些行归因为卖家内部商品变化'}
        facts['product_scope']=scope;facts['product_contributions']=facts.pop('top_shop_products');facts['interpretation_scope']='商品贡献与事件范围一致；品类表明确为全店背景。卖家商品分解由同批规范化明细独立 Decimal/Fraction 计算并与卖家事件金额核对。'
        assert facts['shop_contribution_sum_cents']==ops['delta_cents'];cases.append(facts);write_json(dest/'cases'/(facts['case_id']+'.json'),facts)
        text=f"""# {title}（{wid}）

结论可信程度：**算术与规则已验证；业务根因无法确认，待业务人员复核。** 本案例由 Codex 对结构化证据作核查，不冒充业务人员签字。

## 已确认事实

指标 {metric}，范围 {scope} / {event['entity_id']}；基期 {event['before']} → 当期 {event['after']}，变化 {event['absolute_change']}，相对变化 {event['relative_change']}。金额单位为分；AOV 单位为分/订单，不是分/件。

分母：{event['denominators']}。八周基线的变化中位数 {event['baseline']['median_change']}，MAD {event['baseline']['mad']}，界限 {event['baseline']['limit']}。事件必须同时满足绝对、相对、基线偏离和样本条件。

## 全店贡献与分解

以下商品贡献范围为 {scope}，与本例事件范围一致；品类表仅作全店背景。卖家商品分解直接读取同批规范化订单明细，使用独立 Decimal/Fraction 计算并与卖家事件金额核对。全店金额变化 {ops['delta_cents']} 分，全店商品贡献合计精确一致；金额使用整数分，效应使用精确有理数，无金额舍入容差。

{table(['商品','金额变化（分）','基/当期件数','数量效应（分）','价格效应（分）','组合效应（分）'],[[r['key'],r['delta_cents'],str(r['before']['units'])+' / '+str(r['after']['units']),effect(r['quantity_effect']),effect(r['price_effect']),r['assortment_effect_cents']] for r in products])}

{table(['品类','金额变化（分）'],[[r['key'],r['delta_cents']] for r in categories])}

数量效应=(q1-q0)×(p1+p0)/2；价格效应=(p1-p0)×(q1+q0)/2。新增/消失商品无双期单价，不计算价格效应，保留组合变化。完整行见 JSON 和原始计算包。

## 完整性与可能解释

已通过保存快照内 70 天日期覆盖、纳入订单有明细、SQL/JavaScript 复核；不代表提供方业务全集保证，也没有历史 as-of 状态。销量、价格或商品组合可以解释算术变化；促销、渠道、库存和退款原因仍是假设。

不能确认：是否由广告、搜索、缺货、促销、竞争或运营行动造成。没有这些源数据，不能据此生成已确认根因或改善结论。

建议核查：先逐项核对贡献最大的商品订单明细，再索取对应日期的促销记录、商品上架/库存、退款与订单修订台账；比较相邻窗口和未受影响商品。只有外部证据一致才评估业务解释。缺少订单级商品评价归属，不能据订单评价断言某件商品质量。

[结构化案例]({facts['case_id']}.json) · [原引擎证据包]({facts['evidence']})。数据源：Olist Kaggle Version 2，CC BY-NC-SA 4.0，历史回放。
"""
        md(dest/'cases'/(facts['case_id']+'.md'),text)
    # Reference contribution export has a labelled window, never presented as all-period totals.
    reference=next(w for w in b['windows'] if w['window_id']=='2018-06-11' and w['status']=='verified')
    with gzip.open(backtest/reference['artifact'],'rt',encoding='utf-8') as f:ref=json.load(f)
    suppressed=[]
    for state_name in ('new','discontinued'):
        product=next(r for r in ref['operations']['dimensions']['product'] if r['status']==state_name)
        evaluation=next(e for e in ref['monitoring']['evaluations'] if e['scope_type']=='product' and e['entity_id']==product['key'] and e['metric_id']=='amount_cents')
        assert not evaluation['fired'];suppressed.append({'case_type':state_name,'product':product,'evaluation':evaluation})
    for scope_name,metric in [('category','amount_cents'),('shop','late_rate')]:
        evaluation=next(e for e in ref['monitoring']['evaluations'] if e['scope_type']==scope_name and e['metric_id']==metric and e['suppressed_reasons']);assert not evaluation['fired'];suppressed.append({'case_type':scope_name,'evaluation':evaluation})
    write_json(dest/'cases/suppressed-review.json',{'window':reference['window_id'],'evidence':'../backtest/'+reference['artifact'],'samples':suppressed,'business_anomalies_confirmed':False})
    md(dest/'cases/suppressed-review.md','# 新增、消失、品类及履约抑制抽查\n\n参考窗口 '+reference['window_id']+'。这些是实际数据中被抑制的评估，不是人为制造的告警。\n\n'+table(['类型','指标','抑制原因'],[[s['case_type'],s['evaluation']['metric_id'],s['evaluation']['suppressed_reasons']] for s in suppressed])+'\n[完整分子、分母、基线及证据](suppressed-review.json)。新增/消失商品价格效应不适用；缺维度与缺成熟度均保持门禁。')
    for dimension in ('category','product','seller'):
        export_csv(dest/'analysis'/(dimension+'-analysis.csv'),[dict(window_id=reference['window_id'],**r) for r in ref['operations']['dimensions'][dimension]])
    md(dest/'analysis/real-data-analysis-report.md',f"""# 真实经营指标与独立复核

新参数化脚本直接读取真实三表，未以公开快照为输入。七项核心值与九组 SQL 聚合均通过 Python Decimal/SQLite 复核。

{table(['指标','原 SQL','独立 Python','一致'],[[r['metric'],r['sql'],r['python'],r['passed']] for r in recon['comparisons']])}

已交付订单商品金额不含运费，不是平台收入、利润或实际净 GMV。经营回测购买订单金额包含现有纳入状态，二者口径不混用。延迟率分母 {legacy['metrics']['delivery_eligible']}，低评分率分母 {legacy['metrics']['review_eligible']}；缺评价不作好评。多商品、多评价先独立聚合，不能直接多对多 JOIN 金额。

月度 CSV 为原 v1 已交付分析；商品/品类/卖家 CSV 明确标记参考比较窗口 2018-06-11，并非全历史销售排名。所有回测窗口的四维贡献存于 backtest/runs。商品平均成交单价为金额/件数，区别于订单平均商品金额；零分母为不可计算。

延迟与低评分为观察性关联；分层也未控制所有混杂因素，不支持物流导致低评分的因果结论。退款/广告/库存缺失，未填造。字段映射见 [字段报告](../field-mapping-report.json)，精确对账见 [JSON](real-data-reconciliation.json)。
""")
    byscope=Counter(e['scope_type'] for e in b['events']);supp=read_rows(dest/'backtest/monitoring-suppression-analysis.csv');reason=Counter()
    for row in supp:reason[row['reason']]+=int(row['count'])
    recurrence=Counter((e['scope_type'],e['entity_id'],e['metric_id']) for e in b['events'])
    md(dest/'backtest/monitoring-backtest-report.md',f"""# 真实历史回测

{b['window_count']} 个窗口，{b['verified_windows']} 个通过保存快照门禁，{b['blocked_windows']} 个被阻断。{len(b['events'])} 个候选事件，范围分布 {dict(byscope)}。通过窗口平均 {len(b['events'])/b['verified_windows']:.3f} 个事件；没有真值标签，准确率、召回率、误报率、漏报率均不可估计。

![每周候选事件](../figures/weekly-events.svg)

图表来源：[完整窗口记录](monitoring-backtest-windows.csv)。阻断窗口的零事件表示未评估，不能解释为经营正常。周一自然周，基期之前八周作为基线，基期与当期各一周，共十周；首尾部分周排除。原默认阈值未调整；2018-04-02 时间切分沿用前期冻结方案，不是从未看过的外部盲测。最终状态快照仍可能存在事后修订，因此不宣称历史 as-of 无前视偏差。

![抑制原因次数](../figures/suppression.svg)

{table(['抑制原因','评估次数'],sorted(reason.items()))}

原因可重叠，不能相加为独立样本。履约缺成熟度证据全部抑制，不从最终 delivered 状态推断成熟。商品稀疏及品类缺维度造成检测盲区；零事件不等于业务健康。

相同实体/指标跨周重复触发组合 {sum(n>1 for n in recurrence.values())} 个；同一事件 ID 重复 {len(b['events'])-len({e['event_id'] for e in b['events']})} 个。跨周重复与重复写入不同，方向反转也不合并成持续恶化。

现有规则没有商品平均单价、销售贡献份额或延迟数量的独立告警，见 [规则覆盖清单](monitoring-rule-comparison.csv)。保留描述性指标与分解；本轮不以 AOV 替代单价，不新增算法来填补盲区。

[事件明细](monitoring-alerts.csv) · [完整结果与证据引用](monitoring-backtest-results.json) · [五个证据案例](../cases/case-01.md)。业务原因待复核。
""")
    bar_svg(dest/'figures/weekly-events.svg',[w['window_id'] for w in b['windows']],[w['events'] for w in b['windows']],'Candidate events by week | blocked weeks are not evaluated')
    bar_svg(dest/'figures/suppression.svg',list(reason),list(reason.values()),'Suppression reasons | counts may overlap')
    labels=[n.replace('olist_','').replace('_dataset.csv','').replace('product_category_name_translation.csv','translation') for n in q['tables']]
    bar_svg(dest/'figures/raw-rows.svg',labels,[x['rows'] for x in q['tables'].values()],'Raw rows | nine source tables')
    md(dest/'STAGE3_FINAL_REPORT.md',f"""# 第三阶段交付与复核

日期：2026-11-14（Asia/Shanghai）。**数据与算术结果已验证；业务原因待复核，运行环境稳定性仍有限。**

## 一、数据质量概览

![九表记录](figures/raw-rows.svg)

[九表质量审计](real-data-audit/real-data-quality-report.md) · [来源与实际哈希](real-data-audit/real-data-provenance.json) · [关系覆盖](real-data-audit/real-data-relationship-report.json)。A 文件完整性通过；B/C 缺失与日期异常保留；D 仅验证快照所见日期；E 提供方业务全集保证无法验证。

## 二、经营指标验证

[独立指标报告](analysis/real-data-analysis-report.md) · [逐项对比 CSV](analysis/metric-comparison.csv)。规范化三表保留全部业务记录，七项核心指标、九组聚合通过独立复核。完整版本和代码哈希见 [manifest](manifest.json)。

## 三、历史异常回测

[回测报告与图表](backtest/monitoring-backtest-report.md)：{b['window_count']} 窗口、{b['verified_windows']} 通过、{b['blocked_windows']} 阻断、{len(b['events'])} 个候选事件。采用原监控算法；不声明准确率或误报率。

## 四、业务案例

{chr(10).join('- ['+c['title']+'](cases/'+c['case_id']+'.md)' for c in cases)}

五例均取自实际候选事件。另见 [新增/消失、品类与履约抑制抽查](cases/suppressed-review.md)。被原门禁抑制时不制造真实告警；规则覆盖限制在回测报告明确披露。机器证据审查不等于业务人员批准。

## 验收边界

本报告的数据计算来自成功的独立运行。曾有 Python 访问违规、Node 进程退出，失败记录保留，不能宣称环境已根治。所有原始 CSV 只读；没有云部署、定时任务、AI 接口或真实数据上传。原正式案例、快照、模板的哈希及软件测试结果必须结合开发验收报告检查后，才可判断完整任务书是否全部通过。
""")
    write_json(dest/'package-receipt.json',{'generated_at':now(),'inputs':{k:v['run_id'] for k,v in state.items()},'files':{str(f.relative_to(dest)):sha(f) for f in dest.rglob('*') if f.is_file()},'case_count':len(cases),'status':'data_package_generated_not_full_acceptance'})
    print(dest)

def read_rows(path):
    with Path(path).open(encoding='utf-8-sig',newline='') as f:return list(csv.DictReader(f))
if __name__=='__main__':main()
