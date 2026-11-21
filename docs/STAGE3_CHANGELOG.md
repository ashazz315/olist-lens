# 第三阶段工程改造记录

日期：2026-11-14（Asia/Shanghai）。基于 `stage3-real-data-audit` 上游提交 `d466911862ef09065ccca2032359300b85e8b225`。

本机 Git 网络 DNS 失败，通过 GitHub 连接读取分支树并逐文件核验 Git blob SHA 后建立本地分支。初始本地提交为明确标记的源码快照导入，不冒充上游提交历史。main 和公开部署不变。

- 修复已有 `audit_raw_stage3.py`：实际文件哈希与来源声明交叉核对；空键、冲突键、完全重复、非法状态、非有限金额、全日期字段、邮编多坐标统计；新增关系与实际来源报告。原始文件只读，已有输出拒绝覆盖。
- 参数化原 `prepare_case.py`：独立 raw/out/schema/manifest 路径，取消模板重写，保留原字段映射，输出行数、缺失、哈希与字段映射报告。
- 参数化原 `verify_case.py`：独立 data/analysis/sql/out 路径，保存差异证据，取消正式 case/snapshot 回写；SQLite 检查聚合行数与字段值。
- 加固原 `analyze.cjs`：保护正式输出和输入目录，已有输出拒绝覆盖；记录运行 ID、时间、SQL/CLI 哈希。原核心算法保持不变。
- 新增 `run_stage3.py`：按依赖执行；每次尝试独立目录、日志、成功/失败状态；成功后才推进状态；前置产物哈希变化阻断。失败可从原阶段重试。
- 新增 `backtest_monitoring.py` / `backtest_window.cjs`：仅作自然周窗口、覆盖门禁和原引擎调用适配，默认规则不改；逐窗口保留证据，超时或失败停止，不发布部分事件。
- 新增 `report_stage3.py`：从通过的运行生成版本清单、CSV、案例及图表；所有量化内容来自保存的计算结果。
- 修复 `npm run test:browser` 干净检出缺少 `tmp/test-import` 的问题：复用既有明确合成夹具生成逻辑。

测试状态以 `STAGE3_TEST_REPORT.md` 为准；代码存在不等于全流程通过。本轮未新增 AI、数据采集或云端调度。
