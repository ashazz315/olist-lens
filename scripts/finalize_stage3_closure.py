"""Finalize current closure receipts, preserving old reports and production artifacts."""
import argparse,hashlib,json,re,subprocess
from collections import Counter
from pathlib import Path
from stage3_io import ROOT,load,sha,now,write_json,copy_verified
from report_stage3 import md,table

def main():
    p=argparse.ArgumentParser();p.add_argument('--out',type=Path,required=True);a=p.parse_args();out=a.out.resolve();review=load(out/'review-receipt.json');state=load(out/'host-execution/stage-state.json');tests=load(out/'tests-final/test-execution.json')
    testrows=[];browser=[]
    for r in tests['tests']:
        assert r['exit_code']==0 and sha(r['log'])==r['sha256'];text=Path(r['log']).read_text(encoding='utf-8-sig')
        if r['name'].startswith('python'):
            count=int(re.search(r'Ran (\d+) tests',text)[1]);assert '\nOK' in text
        elif r['name']=='npm-test':
            count=int(re.search(r'pass (\d+)',text)[1]);assert re.search(r'fail 0\b',text)
        else:
            for line in text.splitlines():
                if line.startswith('{'):
                    z=json.loads(line)
                    if 'checks' in z:assert z['ok'];browser.append(z)
            count=sum(len(z['checks']) for z in browser)
        testrows.append([r['name'],count,count,0,0,round(r['elapsed_seconds'],3),r['started_at']])
    assert [r[1] for r in testrows]==[3,22,44,34]
    # Exact official source blobs, including vendor dependencies and published cases.
    protected=[];tree=load(ROOT/'docs/STAGE3_SOURCE_TREE.json')
    for item in tree['tree']:
        name=item['path']
        if item['type']!='blob' or not(name.startswith('cloud/dist/') or name in ('output/analysis/case.json','output/pdf/olist-case-study.pdf','output/templates/schema.json')):continue
        b=(ROOT/name).read_bytes();assert hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()==item['sha'],name
        protected.append({'path':name,'sha256':sha(ROOT/name),'git_blob_sha1':item['sha']})
    for stage in state.values():
        for f,h in stage['outputs'].items():assert sha(f)==h
    lock=load(ROOT/'package-lock.json');pkg=load(ROOT/'package.json');assert lock['name']==pkg['name'] and lock['version']==pkg['version'] and lock['packages']['']['engines']==pkg['engines'];assert len(lock['packages'])==1
    q=load(out/'real-data-quality-report.json');recon=load(out/'real-data-reconciliation.json');assert recon['status']=='passed'
    probe=load(out/'runtime-json-probe.json');sandbox_probe=load(out/'runtime-json-probe-sandbox.json');assert probe['status']==sandbox_probe['status']=='passed'
    md(out/'STAGE3_RUNTIME_AUDIT.md',f'''# 本轮运行环境与故障核查

实际回放：`{tests['node_version']}`，可执行文件 `{tests['node_path']}`，SHA-256 `{tests['node_sha256']}`。Python `{tests['python_version']}`，路径 `{tests['python_path']}`。

首次 `node -v` 为 v26.4.0，`where.exe node` 还列出 Codex WindowsApps 路径；npm 11.17.0 / prefix 是用户 OneDrive New project2/.tools/nodejs。另有上轮隔离 Node20，未用于本轮回放。未更改系统 PATH；运行脚本仅在当前进程前置 Node24，并对子进程使用绝对路径。package engines 为 >=22。

## 已复现并定位的故障

1. **缺少锁文件**：首次 npm ci 返回 EUSAGE。补齐无第三方 npm 依赖的 lockfileVersion 3，离线 npm ci 通过；无依赖升级。日志 `logs/npm-ci-before.log` 与 `logs/npm-ci.log`。浏览器测试额外依赖本机 Playwright 和 Edge，未伪装成 npm ci 安装的依赖；vendor 原始 Git blob 完整性已核对。
2. **受限执行环境的 localhost 权限**：首次 npm test 记录 `connect EACCES 127.0.0.1`。相同 Node24、代码、测试在获准主机环境全部通过；未跳过网络/API 校验。日志 `logs/npm-test.log` / `logs/npm-test-host.log`。
3. **沙箱临时目录原子重命名**：两项 Python 测试在 `#!sandbox.../Temp` 的 os.replace 返回 WinError 650；主机环境同代码测试通过。保留原子替换与读回校验。日志 `logs/python-tests.log` / `logs/python-tests-host.log`。
4. **验收副本目录缺失**：首次浏览器执行已完成场景后写 output/analysis 报 ENOENT；补建隔离副本目录，未改公开 output/analysis，重新执行完整 34 场景通过。日志 `logs/browser-host.log` / `logs/browser-host-retry.log`。

## 仍未查明的底层故障

本轮受限环境九表审计再次出现进程退出码 3221225477（0xC0000005，access violation），完整日志与 faulthandler 栈保留于 `execution/runs/20261114T084829-77131b7c6d3c/`。同解释器、输入和代码在主机环境本轮完整执行成功，支持环境相关性的判断，但不足以确认哪个系统组件、驱动或内存故障导致该异常。不能将“本次主机成功”写成底层根因已修复。

完整回放之后的独立复核在主机环境也失败过：Node24 提取 2018-03-05 证据退出 3221225477；Python3.12 出现 KeyError(period)；Python3.11 在 2017-12-18 的字典计算出现访问冲突。日志 independent-backtest*.log 全部保留，因此**不能归因成仅沙箱问题**。同一失败 gzip 的三次 Node 提取均成功，且 Node 对已保存 51 个投影逐字段比对源文件均一致；没有证据认定为实际字段缺失。最终改为每窗口单独进程执行同一独立校验，失败即停、不自动重试，逐窗口日志、时间、退出码和回执保留在 independent-isolated/。这种隔离是复算执行方式的改进，不是底层根因已修复的证明。

只读 Windows WER 记录保存在 windows-crash-evidence.json：确认 Python faulting module 为 python312.dll，异常 0xc0000005；近期还存在多个 BlueScreen 报告（历史报告重报时间不等于当时发生时间）。未获得能定位责任驱动/内存组件的转储分析结果，本机未发现 cdb/windbg/dumpchk 命令。不能仅凭这些记录断言硬件损坏或某个驱动有错。未自动重启、修复系统或修改安全设置。

上轮标准库 JSON 报 `int('0')` 异常，本轮同原始 gzip 在主机和沙箱各连续解析 5 次均通过，原文件 SHA 不变。Python tracemalloc 峰值 {max(x['python_tracemalloc_peak_bytes'] for x in probe['records']):,} bytes（不是系统总 RSS）；未复现该错误，也没有证据认定是 OOM。详见两个 runtime-json-probe JSON。上轮零字节日志/打包副本保留，不用它们作为本轮通过证明。

精简证据版本 2 保留商品键、四维 before/after 的整数分/件数/去重订单数及精确分数、源 gzip SHA、原始与投影记录数。独立复核逐键连回 canonical，而非只核对行数或总和。原始 gzip 未删除。所有窗口使用最多 2 个 Node 子进程、单进程 max-old-space-size=2048、180 秒超时；实际退出码和耗时保留。

结论：支持 Node>=22 的完整真实回放已复现；已确认并处理锁文件、执行权限和验收目录问题。**不能宣布所有历史运行故障已经根治。** 用户无需升级当前 Node；后续运行应使用本报告固定的主机解释器组合，命令见仓库 docs/STAGE3_CLOSURE.md。若仍要追究受限环境 access violation，需要宿主环境诊断/崩溃转储，当前证据不足，不能编造修复原因。
''')
    md(out/'STAGE3_TEST_REPORT.md','# 本轮测试结果\n\n全部来自本轮实际日志；原始审计 3 项是完整 Python 22 项的子集，不重复计数。\n\n'+table(['测试','数量','通过','失败','阻断','秒','开始 UTC'],testrows)+f"\nNode {tests['node_version']}，{tests['python_version']}。完整命令、起止时间、运行路径、日志 SHA 见 [测试执行记录](tests/test-execution.json)。\n\n真实验证：九表审计 {q['status']}；核心七指标与九组聚合一致；{review['windows']} 个窗口，{review['verified']} 已验证、{review['blocked']} 正常保留门禁；{review['product_rows']} 商品行按键和精确分数独立复核。软件测试输入均为 SYNTHETIC；真实回放只读取官方 canonical，各自目录独立。\n\n首次受限环境失败、浏览器副本目录失败均保留；见 [运行审计](STAGE3_RUNTIME_AUDIT.md)。不能用最终通过覆盖此前失败事实。浏览器 34 场景为合成导入/存储/版本恢复回归，**不声称本轮全量真实 CSV 已在浏览器上传验收**。截图在 browser-run/tmp/ 各 QA 子目录，未发布线上。")
    md(out/'STAGE3_CHANGELOG.md','''# 第三阶段收尾修改

- 补齐 package-lock.json（原项目无 npm 依赖），使 npm ci 可执行。
- backtest_monitoring.py 增加实际子进程起止时间、耗时、退出码和日志关联，算法与门禁不变。
- backtest_extract.cjs 保留商品键和完整分解字段，加入源文件 SHA、原始行数及字段映射。
- verify_backtest.py 新增逐键、逐周期、全维度金额/件数/去重订单数核对，检查遗漏与重复。
- 新增 review_stage3_final.py：阻断分类、逐事件 Fraction 规则复算、五案例审核准备和商品行粒度说明。
- 新增 4 项 SYNTHETIC 反篡改/阈值边界测试；增加带版本、日志 SHA 和耗时的 PowerShell 测试入口。
- 新增只读 JSON 内存/解析诊断脚本和本轮报告生成器。
- 旧公开案例、默认指标、阈值、履约成熟度及 cloud/dist 完整性保持一致。旧 recheck 报告保留，本轮输出位于 final。
- 待处理：受限环境访问冲突底层根因、五例业务人工签署。未推送 GitHub、未合并 main、未部署腾讯云。
''')
    counts=review['event_classification'];cases=review['case_recommendations']
    md(out/'STAGE3_FINAL_REPORT.md',f'''# Olist Lens 第三阶段收尾报告

**本轮工程复现与算术证据复核已完成；整体验收仍为部分通过。** 未完成项为受限环境访问冲突底层根因、五例业务人工审核。当前不满足无条件进入第四阶段的全部验收条件。

| 验收项 | 本轮结果 | 结论 |
| --- | --- | --- |
| 九张官方原始表 | {q['status']}，ZIP CRC/SHA 和九表行数重新验证 | 已验证文件来源；存在保留的数据质量警告 |
| 七核心指标 / 九组聚合 | SQL、JavaScript、Python Decimal/SQLite 一致 | 已验证 |
| Node24 完整回放 | {review['windows']} 窗口，{review['verified']} 验证，{review['blocked']} 阻断 | 已验证；没有放宽门禁 |
| 候选事件 | {review['events']}；A={counts.get('A',0)}，B={counts.get('B',0)}，C={counts.get('C',0)}，D={counts.get('D',0)} | 统计候选，不是确认业务故障 |
| 商品分解 | {review['product_rows']:,} 行 | 逐窗口×商品键独立复算一致 |
| 软件回归 | 22 Python、44 单元/API、34 浏览器场景 | 本轮通过；均为明确标记的合成测试 |
| 五个案例 | 证据建议：需要修订 {cases.get('需要修订',0)}，证据不足 {cases.get('证据不足',0)} | 人工签署 0/5；不得代签 |
| 原有正式文件 | {len(protected)} 个 Git blob 一致 | 已验证未修改 |
| 底层运行稳定性 | 主机完整执行成功；受限环境访问冲突仍有记录 | 部分验证，根因未查明 |

## 阻断和事件解释

互斥窗口主类：{dict(review['blocker_primary_counts'])}。重叠原因：{dict(review['blocker_reason_counts'])}。缺少历史/完整日期证据属于 A，纳入订单缺商品明细属于 B；本次没有 C 类程序失败窗口。完整逐行记录见 [阻断清单](blocker-audit.csv) 和 [分类说明](blocker-audit.md)。不能用 76/109 作为模型准确率。

事件分类 A 表示快照内证据充分；D 为同实体、指标、方向相邻周期持续触发，仍保留不同事件 ID。A/D 都缺少外部因果证据；不冒称已确认故障。金额、分母、八周基线、中位数/MAD、门限、商品贡献和源哈希逐项见 [42 事件复核](event-review.md)。

135,521 不是原始订单商品明细条数，而是成功窗口中 `(window_id, product_id)` 的商品比较汇总行；同商品可跨窗口再次出现。原始 112,650 是全期间全部状态的商品明细，二者不应一一对应。精简包与源包逐键追溯，四维贡献总和、件数、数量效应、价格效应及新增/消失组合效应独立核对。见 [分解复核记录](135521-breakdown-reconciliation.json)。

## 人工审核与剩余边界

[五例审核包](case-review.md) 已准备。订单均额和件数案例需修订金额排序与目标指标的解释；金额案例算术成立，业务原因仍缺库存、促销、渠道、退款及历史修订台账。每例人类审核人、时间和结论为空，不自动标记通过。业务审核人需从“通过 / 需要修订 / 证据不足”给出结论和依据。

文件 CRC、字段、关系和覆盖检查不代表提供方业务全集保证。最终订单状态不是历史 as-of 状态，不能证明没有前视；履约成熟度无证据继续抑制。当前依然是人工上传 CSV、浏览器本地监控记录、历史回放；后台调度、云数据库、实际 LLM 均未新增。

已修复锁文件缺失及验收环境问题；尚未查明 access violation 底层原因。详见 [运行审计](STAGE3_RUNTIME_AUDIT.md)、[测试报告](STAGE3_TEST_REPORT.md)、[修改清单](STAGE3_CHANGELOG.md)。报告及原始数据未上传 GitHub，未部署腾讯云，公开案例未更新。仅准备本地分支提交说明。

下一步先完成业务审核及宿主运行故障诊断。第三阶段全部验收前不制定或实施第四阶段云端持续接入功能。
''')
    # Failures remain prominent. Source projection counts are not independent pass counts.
    if review['independent_status']!='passed':
        prefix=f"**本轮独立复核未完成：仅 {review['independent_windows']} / {review['verified']} 个窗口、{review['independent_product_rows']:,} / {review['product_rows']:,} 条商品行取得完整独立回执。其余因访问冲突阻断，不能沿用上一轮通过结论。**\n\n"
        path=out/'STAGE3_FINAL_REPORT.md';text=path.read_text(encoding='utf-8')
        text=text.replace('本轮工程复现与算术证据复核已完成','本轮 Node24 全量回放已完成，商品独立复核仅部分完成').replace('未完成项为受限环境访问冲突底层根因、五例业务人工审核','未完成项为剩余窗口独立复核、运行时访问冲突底层根因、五例业务人工审核').replace('逐窗口×商品键独立复算一致',f"仅 {review['independent_product_rows']:,} 行独立复算通过，其余待验证").replace('四维贡献总和、件数、数量效应、价格效应及新增/消失组合效应独立核对。','四维贡献总和、件数、数量效应、价格效应及新增/消失组合效应仅在 17 个窗口完成独立核对；全部 76 个窗口已完成原引擎 SQL/JavaScript 互核和无损投影检查，二者不能混为独立 Python 全量通过。').replace('A/D 都缺少外部因果证据','B 类 39 个事件需补齐本轮原始明细独立复核回执。A/D 都缺少外部因果证据')
        md(path,prefix+text)
        path=out/'STAGE3_TEST_REPORT.md';text=path.read_text(encoding='utf-8').replace('tests/test-execution.json','tests-final/test-execution.json').replace(f"{review['product_rows']} 商品行按键和精确分数独立复核",f"仅 {review['independent_product_rows']} / {review['product_rows']} 商品行完成独立复核，其余运行失败未通过")
        md(path,prefix+text)
        path=out/'STAGE3_RUNTIME_AUDIT.md';md(path,path.read_text(encoding='utf-8')+'\n\n最终单窗口隔离也在 2017-07-10 访问冲突停止；共 17 个成功回执，17,835 条商品分解。没有继续重复尝试直到通过，也没有生成整批独立复核成功回执。三个不同执行方式失败均保留。因此本轮并未修复底层运行问题。')
    md(ROOT/'docs/STAGE3_CLOSURE_RESULT.md',(out/'STAGE3_FINAL_REPORT.md').read_text(encoding='utf-8').replace('](blocker-','](../output/stage3/recheck/final/blocker-').replace('](event-','](../output/stage3/recheck/final/event-').replace('](case-','](../output/stage3/recheck/final/case-').replace('](135521-','](../output/stage3/recheck/final/135521-').replace('](STAGE3_','](../output/stage3/recheck/final/STAGE3_'))
    git=['git','-c','safe.directory='+ROOT.as_posix()]
    def command(args):
        r=subprocess.run(git+args,cwd=ROOT,capture_output=True,text=True,encoding='utf-8',check=True)
        if not isinstance(r.stdout,str):raise RuntimeError('Unexpected subprocess stdout type; no safety pass published')
        return r.stdout
    assert not command(['ls-files','data','output/stage3/recheck']).strip()
    status=command(['status','--short']);(out/'git-status.txt').write_text(status,encoding='utf-8');command(['diff','--check']);(out/'git-diff.patch').write_text(command(['diff']),encoding='utf-8')
    changed=sorted(set(command(['diff','--name-only']).splitlines()+command(['ls-files','--others','--exclude-standard']).splitlines()));findings=[]
    for name in changed:
        f=ROOT/name
        if not f.is_file():continue
        assert not name.startswith(('data/','output/stage3/recheck/','cloud/dist/'))
        text=f.read_text(encoding='utf-8-sig',errors='replace')
        # Report locations only, never print detected secret contents.
        for label,pattern in [('private_key',r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),('github_token',r'\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}'),('openai_key',r'\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}'),('aws_key',r'\bAKIA[A-Z0-9]{16}\b')]:
            if re.search(pattern,text):findings.append({'path':name,'kind':label})
    assert not findings,findings
    write_json(out/'safety-check.json',dict(checked_at=now(),protected=protected,tracked_raw_data=False,pattern_secret_findings=findings,secret_scan_scope='changed text files; pattern scan cannot prove absence of every secret',changes=[dict(path=n,sha256=sha(ROOT/n)) for n in changed if (ROOT/n).is_file()],public_deployment_changed=False,github_pushed=False,human_review_complete=False,environment_root_cause_resolved=False))
    md(out/'COMMIT_DRAFT.md','''# 本地提交说明草稿（尚未推送）

建议标题：audit: reproduce Stage 3 replay on Node 24 and bind event evidence

补齐无依赖锁文件，增加窗口执行回执及源哈希绑定的逐商品独立复算，核查全部阻断和候选事件，保留五例人工审核待办。默认引擎、阈值、公开案例不变。

本轮验证：22 Python、44 单元/API、34 浏览器场景；109 窗口 / 76 原引擎 SQL-JS 互核 / 33 门禁阻断 / 42 候选。独立 Python 复核仅 17 窗口、17835 / 135521 商品行通过；其余运行失败，未完成。

原始 CSV、订单/评价/商品细项及完整回测证据只留本地 ignored 目录；公开文档仅汇总。未完成业务人工签署与底层故障根因，任务书提交前条件尚未全部满足，不执行 push/merge/deploy。当前检出是已核验上游 d466911 的内容快照，不能当作具有完整上游祖先的分支直接强推；后续提交需以真实远程 head 为父提交，先核对远程变化。
''')
    # Keep a source-controlled aggregate-only synopsis; raw/event IDs remain ignored.
    md(ROOT/'docs/STAGE3_CLOSURE_RESULT.md',(out/'STAGE3_FINAL_REPORT.md').read_text(encoding='utf-8').replace('](blocker-','](../output/stage3/recheck/final/blocker-').replace('](event-','](../output/stage3/recheck/final/event-').replace('](case-','](../output/stage3/recheck/final/case-').replace('](135521-','](../output/stage3/recheck/final/135521-').replace('](STAGE3_','](../output/stage3/recheck/final/STAGE3_'))
    write_json(out/'final-files-sha256.json',{p.relative_to(out).as_posix():sha(p) for p in out.rglob('*') if p.is_file() and p.name!='final-files-sha256.json' and not any(x in p.relative_to(out).parts for x in ('npm-cache','browser-run'))})
    print({'status':'partial_acceptance','tests':[r[1] for r in testrows],'protected':len(protected),'review':review})
if __name__=='__main__':main()
