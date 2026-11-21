"""Final evidence/index check; does not publish or claim business causality."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from stage3_io import ROOT,load,sha,write_json,now
from report_stage3 import md,table

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--root',type=Path,default=ROOT/'output/stage3/recheck');p.add_argument('--delivery',type=Path);a=p.parse_args();out=a.delivery or a.root/'delivery';state=load(a.root/'stage-state.json');tree=load(ROOT/'docs/STAGE3_SOURCE_TREE.json')
    protected=[]
    for item in tree['tree']:
        path=item['path']
        if item['type']!='blob' or not (path.startswith('cloud/dist/') or path in ('output/analysis/case.json','output/pdf/olist-case-study.pdf','output/templates/schema.json')):continue
        b=(ROOT/path).read_bytes();assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==item['sha'],path
        protected.append({'path':path,'sha256':sha(ROOT/path),'git_blob_sha1':item['sha']})
    audit=load(Path(state['audit']['directory'])/'real-data-provenance.json')
    for file,facts in audit['actual_files'].items():assert sha(ROOT/'data/raw/kaggle-v2'/file)==facts['sha256']
    assert sha(ROOT/'data/raw/kaggle-v2/brazilian-ecommerce-v2.zip')==audit['actual_archive']['sha256']
    for r in state.values():
        for file,h in r['outputs'].items():assert sha(file)==h
    assert load(out/'report-qa.json')['passed'];backtest=load(out/'backtest/monitoring-backtest-results.json');independent=load(out/'backtest/independent-window-reconciliation.json');assert independent['status']=='passed';assert independent['backtest_results_sha256']==sha(out/'backtest/monitoring-backtest-results.json')
    unit=(a.root/'development-tests/npm-test-node24.log').read_text(encoding='utf-8-sig');assert 'pass 44' in unit and 'fail 0' in unit
    python=(a.root/'development-tests/python-suite-deduplicated.log').read_text(encoding='utf-8-sig');assert 'Ran 18 tests' in python and 'OK' in python
    browser=[]
    for line in (a.root/'development-tests/npm-browser-node24.log').read_text(encoding='utf-8-sig').splitlines():
        if line.startswith('{'):
            r=json.loads(line)
            if 'checks' in r:assert r['ok'];browser.append(r)
    assert sum(len(r['checks']) for r in browser)==34
    # This exact workspace was created and checked by this process; avoid changing global Git trust.
    git=['git','-c','safe.directory='+ROOT.as_posix()]
    tracked=subprocess.run(git+['ls-files','data','output/stage3/recheck'],cwd=ROOT,capture_output=True,text=True,check=True).stdout;assert not tracked.strip()
    changes=subprocess.run(git+['diff','--name-only'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.splitlines()+subprocess.run(git+['ls-files','--others','--exclude-standard'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.splitlines();changes=sorted(set(changes))
    failures=[load(p) for p in (a.root/'runs').glob('*/run.json') if load(p).get('status')!='passed']
    evidence={'checked_at':now(),'local_branch':'stage3-real-data-audit','upstream_source_commit':'d466911862ef09065ccca2032359300b85e8b225','protected_files_unchanged':protected,'raw_files_unchanged':True,'raw_and_generated_data_tracked_in_git':False,'tests':{'python_unique_tests':18,'original_node24_unit_tests':44,'node24_browser_scenarios':34,'seven_metrics':True,'nine_aggregates':True,'independent_windows':len(independent['windows']),'independent_product_effects':independent['product_effects_checked']},'failed_or_interrupted_attempts':failures,'changes':[{ 'path':p,'sha256':sha(ROOT/p)} for p in changes if (ROOT/p).is_file()],'public_deployment_changed':False,'raw_data_uploaded':False,'business_review_signed':False,'supported_node24_full_backtest_validated':False,'environment_fault_root_cause_resolved':False,'overall_acceptance':'partial; full supported-runtime replay and business review remain open'}
    write_json(out/'final-verification.json',evidence)
    report=f"""# 第三阶段测试与验收

2026-11-14（Asia/Shanghai）。**分项结果已验证，整体验收标记为部分通过，不宣布整个第三阶段无条件完成。**

{table(['项目','结果','证据/边界'],[['Python 唯一测试','18 通过','原 3 项 + 新增 15 项；去掉测试导入/继承重复计数，早期日志 24 为执行次数'],['原 npm test','44 通过','Node24 与 Node20 均通过；合成输入'],['原 npm run test:browser','34 场景通过','Node24 / Edge；桌面及移动宽度，IndexedDB、导入、恢复和导出'],['真实九表与标准化','通过（保留警告）','官方版本及实际哈希、完整记录投影'],['七指标/九聚合','通过','SQL / JS / Python Decimal / Python SQLite'],['历史窗口','109 条完整记录','76 通过，33 因覆盖/缺明细等阻断'],['独立全窗口核对','76 通过','135,521 条商品分解，四维贡献精确核对'],['正式文件保护',str(len(protected))+' 个文件通过','对照上游 Git blob 哈希'],['默认规则不变','通过','原 engine 文件哈希一致'],['Node24 全量历史回测','未完整验证','本次全量成功组合使用 Node20；Node24 小样本软件测试通过不等于全量认证'],['本机运行稳定性','未通过稳定性结论','Python 访问违规、Node 退出及大 JSON 解析失败有记录'],['业务根因/人工签字','尚未完成','候选事件与机器证据审查不冒充业务确认']])}

发现并修复：原审计漏检空外键/实际哈希/非法金额日期；转换重写模板与验证重写快照；独立验证缺聚合行数检查；干净检出 browser 测试夹具缺失。分别有合成回归或真实运行证据。完整修改和执行版本见 [验收 JSON](final-verification.json)。

真实输入来自官方九表；合成测试仅位于测试临时目录和 browser-regression-copy，不进入真实分析。文件完整性不推出业务全集完整；最终状态快照无法证明历史 as-of 无前视信息。旧结果未被改写为新结果，失败尝试保留，成功状态才推进。

当前应用仍由人工上传 CSV 更新；后台定时任务未实现；监控记录仅在当前浏览器；问答助手不是实际 LLM；历史回放不是实时监控。未部署或推送原始数据。

完整执行日志位于上一级 development-tests 和 runs；浏览器截图位于上一级 browser-regression-copy/tmp；交付图表截图见 screenshots。日志及打包副本曾出现空字节；原计算源文件哈希仍匹配，交付副本已逐个恢复和核验，修复记录保留。新增持久化写入、原子替换及读回校验。底层故障原因尚未查明，不能只依赖日志文字或宣称环境已恢复稳定。

下一步：在稳定且受支持的 Node>=22/Python 环境完成全量复现，保留同样质量门禁；由业务人员逐例复核假设与额外数据需求；阈值和新规则另立冻结方案，不在本轮调整。
"""
    md(out/'STAGE3_TEST_REPORT.md',report)
    md(ROOT/'docs/STAGE3_TEST_REPORT.md',report.replace('[验收 JSON](final-verification.json)','本地 output/stage3/recheck/delivery/final-verification.json'))
    for src,dest in [('docs/STAGE3_CHANGELOG.md','STAGE3_CHANGELOG.md'),('docs/STAGE3_REPRODUCTION.md','REPRODUCTION.md')]:shutil.copy2(ROOT/src,out/dest)
    reportpath=out/'STAGE3_FINAL_REPORT.md';text=reportpath.read_text(encoding='utf-8').split('\n\n整体验收状态：')[0];text+='\n\n整体验收状态：**部分通过**。支持运行时的全量复现与业务审核尚未完成，详见 [测试与验收报告](STAGE3_TEST_REPORT.md)。\n';reportpath.write_text(text,encoding='utf-8')
    for stage,folder in [('audit','real-data-audit'),('prepare','canonical/olist-v2'),('verify','verification'),('backtest','backtest')]:
        source=Path(state[stage]['directory'])
        for file,h in state[stage]['outputs'].items():
            relative=Path(file).relative_to(source)
            if stage=='backtest' and relative.as_posix()=='monitoring-rule-comparison.csv':continue  # Explicit report transformation expands rule-coverage disclosure.
            assert sha(out/folder/relative)==h,str(out/folder/relative)
    write_json(out/'package-receipt.json',{'generated_at':now(),'status':'reconstructed_after_aborted_writer; final readback verified','case_count':5,'runs':{k:v['run_id'] for k,v in state.items()},'prior_corrupt_receipt_preserved':'../development-tests/package-receipt.failed.bin','overall_acceptance':'partial'})
    write_json(out/'final-files-sha256.json',{str(p.relative_to(out)):sha(p) for p in out.rglob('*') if p.is_file() and p.name!='final-files-sha256.json'})
    print({'protected_files':len(protected),'python':18,'npm':44,'browser':34,'windows':len(independent['windows']),'overall':'partial'})
if __name__=='__main__':main()
