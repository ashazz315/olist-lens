"""Evidence review of fresh real replay. Never signs a human/business approval."""
import argparse
import csv
import hashlib
import json
from collections import Counter,defaultdict
from decimal import Decimal
from fractions import Fraction
from pathlib import Path
from stage3_io import ROOT,load,sha,now,write_json,copy_verified
from backtest_monitoring import windows,export_csv,read
from report_stage3 import table,md,seller_products,effect

def frac(r):return None if r is None else Fraction(int(r['numerator']),int(r['denominator']))
def rec(f):return None if f is None else {'numerator':str(f.numerator),'denominator':str(f.denominator)}
def median(v):
    s=sorted(v);n=len(s);return s[n//2] if n%2 else (s[n//2-1]+s[n//2])/2
def metric(r,k):
    if k=='aov_cents':return Fraction(r['amount_cents'],r['orders']) if r['orders'] else None
    return Fraction(r[k])

def check_event(e,ops,config):
    """Independent exact arithmetic + direct cube lineage, including all eight history rows."""
    def row(period):
        if e['scope_type']=='shop':
            t=next(r for r in ops['verified_cube']['totals'] if r['period']==period)
            return dict(amount_cents=t['purchase_item_amount_cents'],orders=t['purchase_orders'],units=t['item_units'])
        return next((r for r in ops['verified_cube']['groups'] if r['period']==period and r['dimension']==e['scope_type'] and r['key']==e['entity_id']),dict(amount_cents=0,orders=0,units=0))
    a,b=row('before'),row('after');h=[row(p['period']) for p in ops['periods'] if p['period'].startswith('history_')]
    assert len(h)==config['baseline_periods']==8
    for actual,saved in zip([a,b]+h,[e['evidence']['before'],e['evidence']['after']]+e['evidence']['history']):
        assert all(actual[k]==saved[k] for k in ('amount_cents','orders','units'))
    av,bv=metric(a,e['metric_id']),metric(b,e['metric_id']);hist=[metric(r,e['metric_id']) for r in h]
    assert av is not None and av!=0 and bv is not None and None not in hist
    delta=bv-av;rel=delta/av;changes=[y-x for x,y in zip(hist,hist[1:])];center=median(changes);mad=median([abs(x-center) for x in changes]);limit=mad*Fraction(str(config['mad_multiplier']))*Fraction('1.4826');deviation=abs(delta-center)
    for key,val in [('before',av),('after',bv),('absolute_change',delta),('relative_change',rel)]:assert frac(e['exact'][key])==val
    for key,val in [('median_change',center),('mad',mad),('limit',limit),('deviation',deviation)]:assert frac(e['baseline']['exact'][key])==val
    assert e['denominators']==dict(before=a['orders'],after=b['orders'])
    assert min(r['orders'] for r in [a,b]+h)>=config['min_orders']
    t=config['thresholds'][e['metric_id']];assert t==e['thresholds']
    assert delta and abs(delta)>=Fraction(str(t['absolute'])) and abs(rel)>=Fraction(str(t['relative'])) and deviation>limit
    assert e['fired'] and not e['suppressed_reasons']
    return dict(exact_rule_recalculation=True,history_rows=8,min_orders=min(r['orders'] for r in [a,b]+h),before=rec(av),after=rec(bv),delta=rec(delta),relative=rec(rel),median=rec(center),mad=rec(mad),limit=rec(limit),deviation=rec(deviation))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out;out.mkdir(exist_ok=True,parents=True);state=load(a.root/'stage-state.json')
    assert all(state[s]['status']=='passed' for s in ('audit','prepare','analyze','verify','backtest'))
    for stage in state.values():
        for f,h in stage['outputs'].items():assert sha(f)==h,f
    dirs={k:Path(v['directory']) for k,v in state.items()};back=dirs['backtest'];result=load(back/'monitoring-backtest-results.json')
    projections=load(out/'compact-all-source-check.json');assert projections['status']=='passed';projection_by_window={r['window']:r for r in projections['records']};assert len(projection_by_window)==result['verified_windows']
    if (back/'independent-window-reconciliation.json').exists():ind=load(back/'independent-window-reconciliation.json')
    else:
        receipts=[load(f) for f in sorted((out/'independent-isolated/receipts').glob('*.json'))]
        for r in receipts:assert r['status']=='passed' and r['backtest_results_sha256']==sha(back/'monitoring-backtest-results.json')
        ind=dict(status='partial_runtime_failure',backtest_results_sha256=sha(back/'monitoring-backtest-results.json'),input_hashes=load(back/'plan.json')['input_hashes'],windows=[w for r in receipts for w in r['windows']],product_effects_checked=sum(r['product_effects_checked'] for r in receipts),failure_log=str(out/'logs/independent-isolated.log'),not_validated_windows=[w['window_id'] for w in result['windows'] if w['status']=='verified' and w['window_id'] not in {v['window'] for r in receipts for v in r['windows']}])
        write_json(out/'independent-partial-reconciliation.json',ind)
    assert ind['backtest_results_sha256']==sha(back/'monitoring-backtest-results.json');verified_window_ids={r['window'] for r in ind['windows']};observed_product_rows=sum(r['product_rows'] for r in projections['records'])
    for name,h in ind['input_hashes'].items():assert sha(dirs['prepare']/name)==h
    bywindow={w['window_id']:w for w in result['windows']};assert len(bywindow)==result['window_count']
    # Re-evaluate the window gates from retained records, without inventing business-fullness proof.
    orders=read(dirs['prepare']/'orders.csv');items=read(dirs['prepare']/'order_items.csv');manifest=load(dirs['prepare']/'dataset_manifest.json')
    recomputed=windows(orders,items,manifest['coverage_start'],manifest['coverage_end']);assert len(recomputed)==len(bywindow)
    for w in recomputed:assert w['window_gates']==bywindow[w['window_id']]['window_gates']
    blockers=[];reason_counts=Counter();gate_dir=out/'blocker-evidence';gate_dir.mkdir(exist_ok=True)
    for w in result['windows']:
        if w['status']!='blocked':continue
        reasons=w['window_gates'];reason_counts.update(reasons);types=sorted(set('B' if r=='purchase_order_missing_items' else 'A' for r in reasons));evidence=gate_dir/(w['window_id']+'.json')
        write_json(evidence,dict(window=w,independently_recomputed=True,canonical_hashes=ind['input_hashes'],scope='retained snapshot; missing daily records do not prove missing provider transactions',is_synthetic=False))
        blockers.append(dict(window_id=w['window_id'],blocker_types='+'.join(types),primary_type='B' if 'B' in types else 'A',reasons=reasons,expected_gate=True,needs_program_fix=False,needs_source_evidence=True,rerun=True,log=str(evidence.relative_to(out)),evidence_sha256=sha(evidence),execution='gate checked; engine intentionally not executed',engine_elapsed_seconds=None))
    export_csv(out/'blocker-audit.csv',blockers)
    md(out/'blocker-audit.md','# 阻断窗口复核\n\n'+table(['类型（窗口互斥主类）','数量'],Counter(r['primary_type'] for r in blockers).items())+'\n'+table(['原因（可重叠）','窗口数'],reason_counts.items())+'\nA：八周历史不足或留存快照日覆盖不足。B：纳入购买状态订单没有商品明细。C：本次完整回放没有程序失败窗口。缺少某日订单也可能是低交易量，证据不足时保留门禁，不能擅称该日数据一定丢失。履约未成熟和小样本是成功窗口内的规则抑制，不混入 33 个窗口级阻断。逐窗口原始条件和 SHA 见 [完整清单](blocker-audit.csv)。')
    events=result['events'];eventids=[e['event_id'] for e in events];assert len(eventids)==len(set(eventids))
    review=[];details=[];prior=defaultdict(list);compacts={}
    config={'baseline_periods':8,'min_orders':30,'mad_multiplier':3,'thresholds':{'amount_cents':{'absolute':10000,'relative':.1},'orders':{'absolute':10,'relative':.1},'units':{'absolute':10,'relative':.1},'aov_cents':{'absolute':1000,'relative':.1}}}
    for e in events:
        wid=e['window_id'];w=bywindow[wid];assert w['status']=='verified' and not w['window_gates']
        artifact=back/w['artifact'];assert sha(artifact)==w['artifact_sha256']
        if wid not in compacts:
            compact=back/'independent-inputs'/(wid+'.json');check=projection_by_window[wid];assert sha(compact)==check['compact_sha256'];compacts={wid:load(compact)}
        ops=compacts[wid];assert ops['source_sha256']==w['artifact_sha256'];assert e['dataset_version']==w['dataset_version'];assert e['rule_version']==w['rule_set_version'];assert e['source_ref']['file_hashes']==ind['input_hashes']
        calc=check_event(e,ops,config)
        products=seller_products(dirs['prepare'],e['entity_id'],w['before'],w['after']) if e['scope_type']=='seller' else ops['dimensions']['product']
        amount_delta=sum(r['delta_cents'] for r in products);assert amount_delta==e['evidence']['after']['amount_cents']-e['evidence']['before']['amount_cents']
        if e['metric_id']=='units':assert sum(r['after']['units']-r['before']['units'] for r in products)==e['absolute_change']
        if e['metric_id']=='amount_cents':assert amount_delta==e['absolute_change']
        key=(e['scope_type'],e['entity_id'],e['metric_id']);same_direction=lambda x:x['absolute_change']*e['absolute_change']>0
        adjacent=[x for x in prior[key] if bywindow[x['window_id']]['after']['end']==w['after']['start'] and same_direction(x)]
        repeated=[x['event_id'] for x in prior[key]];prior[key].append(e)
        classification=('D' if adjacent else 'A') if wid in verified_window_ids else 'B';top=sorted(products,key=lambda r:abs(r['delta_cents']),reverse=True)[:10]
        d={'event':e,'checks':calc,'category':classification,'category_meaning':'持续性事件（算术仍充分）' if adjacent else '数据证据充分的历史异常候选','persistent_with':[x['event_id'] for x in adjacent],'other_windows_same_rule':repeated,'artifact':str(artifact),'artifact_sha256':sha(artifact),'compact_sha256':sha(back/'independent-inputs'/(wid+'.json')),'product_scope':e['scope_type'],'product_contributions':products,'top_product_contributions':top,'product_amount_delta_cents':amount_delta,'nonadditive_notice':'金额贡献用于金额变化；订单均额须核对金额/订单分母；跨商品订单数不可相加。件数变化按件数核对。','assortment':dict(Counter(r.get('status') for r in products)),'quality_status':'retained-snapshot gates and exact arithmetic passed; provider population and as-of completeness unproven','business_fault_confirmed':False,'is_synthetic':False}
        d['independent_canonical_reconciliation_completed']=wid in verified_window_ids
        if classification=='B':d['category_meaning']='本轮原始明细独立复算未完成，需补充该验证回执；事件内部精确规则核对成立'
        path=out/'event-evidence'/(e['event_id']+'.json');write_json(path,d);details.append(d)
        review.append(dict(event_id=e['event_id'],window_id=wid,scope=e['scope_type'],entity_id=e['entity_id'],metric=e['metric_id'],dataset_version=e['dataset_version'],rule_version=e['rule_version'],before=e['before'],after=e['after'],change=e['absolute_change'],relative_change=e['relative_change'],baseline_median_change=e['baseline']['median_change'],baseline_mad=e['baseline']['mad'],thresholds=e['thresholds'],history=e['baseline']['values'],denominators=e['denominators'],min_historical_and_current_orders=calc['min_orders'],category=classification,persistent_with=d['persistent_with'],duplicate=False,product_amount_delta_cents=amount_delta,new_products=d['assortment'].get('new',0),discontinued_products=d['assortment'].get('discontinued',0),quality=d['quality_status'],artifact_sha256=d['artifact_sha256'],evidence=str(path.relative_to(out)),evidence_sha256=sha(path)))
    export_csv(out/'event-review.csv',review);counts=Counter(r['category'] for r in review)
    md(out/'event-review.md','# 候选异常事件逐项复核\n\n'+table(['分类','数量'],[(x,counts[x]) for x in 'ABCD'])+'\n全部事件按整数分/精确有理数重新核对当前值、分母、八个历史值、七次变化的中位数、MAD、阈值和偏离。事件 ID 无重复。D 指同实体同指标同方向相邻周再次触发；不同指标的同期触发不是重复事件。每条记录保存完整商品贡献、源包及精简包 SHA。\n\nA/D 仅说明留存快照内的统计证据充分，不确认业务故障或业务根因。缺少历史 as-of 修订记录、促销、库存、渠道和退款数据；这些限制适用于所有事件，不是以缺失值补零。新/消失商品对金额变化的组合效应单独列示，无虚假价格效应。订单均额不能直接用商品金额贡献解释为均额贡献。\n\n[逐事件清单](event-review.csv)；完整 evidence JSON 链接见清单。无异常真值，不报告准确率、召回率或误报率。')
    # Preserve five old cases and compare them to this run. Human signoff is never generated.
    case_rows=[];case_text=['# 五个真实案例证据复核','本文件为 Codex 计算与文档审查，**不是人类业务审核签字**。人工审核人、时间、结论保留为空；每例另给限定三选一的证据审查建议。']
    for n in range(1,6):
        original=ROOT/f'output/stage3/recheck/delivery/cases/case-{n:02}.json';old=load(original);oe=old['event'];d=next(x for x in details if all(x['event'][k]==oe[k] for k in ('window_id','metric_id','scope_type','entity_id')));e=d['event']
        assert e['exact']==oe['exact'] and e['baseline']==oe['baseline']
        current={r['key']:r for r in d['product_contributions']}
        for r in old['product_contributions']:
            z=current[r['key']];assert all(r[k]==z[k] for k in ('before','after','delta_cents','quantity_effect','price_effect','assortment_effect_cents'))
        # AOV and unit cases originally ranked products only by amount; that does not attribute their target metric.
        recommendation='需要修订' if e['metric_id'] in ('units','aov_cents') else '证据不足'
        explanation='原案例按商品金额排序，不能据此归因订单均额/件数告警；应同时呈现目标指标和分母。' if recommendation=='需要修订' else '金额贡献和规则复算一致，但缺少业务根因的外部证据及人工签字。'
        c=dict(case_id=old['case_id'],source='Official Olist Kaggle Version 2, CC BY-NC-SA 4.0',original_case=str(original),original_case_sha256=sha(original),event=e,review_evidence=str((out/'event-evidence'/(e['event_id']+'.json')).relative_to(out)),checks=d['checks'],top_products=d['top_product_contributions'],arithmetic_conclusion='通过',evidence_review_recommendation=recommendation,recommendation_reason=explanation,human_review={'status':'pending','reviewer':None,'reviewed_at':None,'conclusion':None,'allowed_conclusions':['通过','需要修订','证据不足']},business_interpretation='观察到指标偏离历史变化；数量、单价和组合是算术分解，不能据此确定促销/广告/库存因果。',possible_explanations=['订单规模、商品组合或成交价格变化','历史最终状态修订影响；需 as-of 台账反证'],missing_evidence=['促销/价格活动','库存及缺货记录','流量渠道','退款和订单历史修订','业务审核人结论'],causal_claim=False,is_synthetic=False)
        c['arithmetic_conclusion']='事件内部精确规则通过；原始明细独立复核'+('通过' if d['independent_canonical_reconciliation_completed'] else '未完成')
        c['independent_canonical_reconciliation_completed']=d['independent_canonical_reconciliation_completed']
        write_json(out/f'case-{n:02}-review.json',c);case_rows.append([c['case_id'],e['window_id'],e['metric_id'],c['arithmetic_conclusion'],recommendation,'待人工签署'])
        top=c['top_products'][:5];case_text.extend([f"## {c['case_id']} · {e['window_id']} · {e['metric_id']}",f"来源：{c['source']}。数据版本 `{e['dataset_version']}`。基期 {e['before']} → 当期 {e['after']}；变化 {e['absolute_change']}，相对变化 {e['relative_change']}。分母 {e['denominators']}。",table(['商品','金额变化（分）','件数变化','数量效应（分）','价格效应（分）','组合效应（分）'],[[r['key'],r['delta_cents'],r['after']['units']-r['before']['units'],effect(r['quantity_effect']),effect(r['price_effect']),r['assortment_effect_cents']] for r in top]),f"证据审查建议：**{recommendation}**。{explanation} 人工审核结论：尚未收到，不能代签。",f"可能解释及缺失数据见 [完整案例复核 JSON](case-{n:02}-review.json)。未确认因果关系或业务改善。"])
    case_text.insert(2,table(['案例','窗口','指标','算术','证据建议','人工审核'],case_rows));md(out/'case-review.md','\n\n'.join(case_text))
    breakdown={**ind,'grain':'one product_id per verified comparison window; primary key=(window_id,product_id)','underlying_file':'backtest/runs/<window>.json.gz: operations.dimensions.product; compact preserves identical keys and row counts','cross_window_repetition':True,'within_window_product_key_unique':True,'contains_other_dimensions':False,'raw_order_item_rows':len(items),'one_to_one_with_raw_items':False,'explanation':'112650 is source item-line count over all dates/statuses. 135521 is aggregated product comparison rows across 76 rolling windows: eligible states only, product union of two weeks, products may recur across windows. Eight history weeks contribute to verified cube but not this product-row count.','independent_arithmetic':'Decimal integer cents and Fraction; source-bound cube, keyed before/after amount/units/distinct-order counts, exact quantity/price/assortment effects and all four dimension sums verified','keyed_projection_version':2}
    breakdown.update(product_rows_observed_in_all_source_packages=observed_product_rows,independent_windows_completed=len(verified_window_ids),independent_all_rows_passed=ind['status']=='passed',independent_arithmetic_scope='Only windows listed in this receipt completed Decimal/Fraction and keyed canonical reconciliation',interpretation='源包行数及投影一致不等于独立复算全部通过；本轮只对成功的独立回执计数')
    write_json(out/'135521-breakdown-reconciliation.json',breakdown)
    for stage,name in [('audit','real-data-quality-report.json'),('verify','real-data-reconciliation.json'),('analyze','real-data-analysis.json'),('backtest','monitoring-backtest-results.json'),('backtest','monitoring-backtest-windows.csv')]:copy_verified(dirs[stage]/name,out/name)
    copy_verified(dirs['audit']/'real-data-provenance.json',out/'real-data-provenance.json')
    suppress=list(csv.DictReader((back/'monitoring-suppression-analysis.csv').open(encoding='utf-8-sig')));supp=Counter()
    for r in suppress:supp[r['reason']]+=int(r['count'])
    md(out/'monitoring-backtest-report.md','# Node 24 本轮真实历史回放\n\n'+table(['项目','本轮结果'],[['窗口',result['window_count']],['已验证',result['verified_windows']],['门禁阻断',result['blocked_windows']],['候选事件',result['event_count']],['商品分解行',ind['product_effects_checked']]])+'\n'+table(['抑制原因（可重叠）','次数'],supp.items())+'\n履约门禁保持不变；未提供每订单历史成熟证据，不能因最终已交付状态放行。观察/留出区间按 2018-04-02 划分；默认阈值未调参。历史最终快照不能证明历史 as-of 无前视。\n\n逐窗口耗时、日志、版本、日期和 SHA 在 [窗口记录](monitoring-backtest-windows.csv)；全部指标实际值与基线在原始包 monitoring.evaluations，路径见 [结果索引](monitoring-backtest-results.json)。阻断窗口未执行引擎，耗时不虚填零。')
    if ind['status']!='passed':
        for name in ('event-review.md','case-review.md','monitoring-backtest-report.md'):
            path=out/name;md(path,path.read_text(encoding='utf-8')+f"\n\n**本轮独立复核未全部通过**：{len(verified_window_ids)} / {result['verified_windows']} 个窗口取得完整回执，{ind['product_effects_checked']} / {observed_product_rows} 条商品行完成原始明细独立复算。其余受运行时访问冲突阻断。事件内部规则复核与源包投影检查不能代替这一步；B 类事件需补齐独立复核证据，未发现计算错误不等于已经排除错误。见 [部分复核回执](independent-partial-reconciliation.json)。")
    write_json(out/'review-receipt.json',dict(reviewed_at=now(),source_state_sha256=sha(a.root/'stage-state.json'),backtest_directory=str(back),windows=len(bywindow),verified=result['verified_windows'],blocked=len(blockers),blocker_primary_counts=Counter(r['primary_type'] for r in blockers),blocker_reason_counts=reason_counts,events=len(review),event_classification=counts,scope_counts=Counter(e['scope_type'] for e in events),cases=len(case_rows),case_recommendations=Counter(r[4] for r in case_rows),human_approved_cases=0,product_rows=observed_product_rows,independent_windows=len(verified_window_ids),independent_product_rows=ind['product_effects_checked'],independent_status=ind['status'],is_synthetic=False))
    print(load(out/'review-receipt.json'))

if __name__=='__main__':main()
