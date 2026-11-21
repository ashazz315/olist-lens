# 第三阶段本地复现

所有真实输出位于 `output/stage3/recheck/`，该目录和 `data/` 已被 Git 忽略。不要提交原始 CSV、规范化 CSV 或包含完整明细的证据包。许可证为 Olist / Kaggle CC BY-NC-SA 4.0，仅作非商业历史验证。

1. 首次获取官方 Version 2：`python scripts/download_kaggle.py`。已校验的数据不要重复下载；先核对 ZIP SHA-256 `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784` 和来源清单。下载工具保持原实现，认证或来源问题必须先解决。
2. `python -m unittest tests.test_stage3_raw_audit tests.test_stage3_contract tests.test_stage3_pipeline`
3. `python scripts/run_stage3.py --stage all`。亦可按 audit → prepare → analyze → verify → backtest 顺序逐步执行。
4. 每次运行写入 `output/stage3/recheck/runs/<唯一ID>/<阶段>/`。失败保留旧成功记录，不更新成功指针；新尝试使用新 ID。查看 `run.json`、`execution.log` 与 `stage-state.json`。
5. 回测通过后，对成功运行目录执行 `python scripts/verify_backtest.py --data-dir <prepare目录> --backtest-dir <backtest目录> --node <node可执行文件>`，独立核验全部窗口、四维贡献和商品效应。大证据先提取源哈希绑定的精简字段，计算仍由 Python Decimal/Fraction 独立完成。
6. 全部核验通过后：`python scripts/report_stage3.py`。写入新的 delivery 目录；再次生成必须用 `--out-dir` 指定新目录，避免覆盖历史交付。运行 `node scripts/qa_stage3_report.cjs output/stage3/recheck/delivery` 检查链接和截图；`python scripts/finalize_stage3.py` 校验保护文件、数据隔离、测试及所有交付副本哈希，并生成验收状态。

单阶段参数接口：

```bash
python scripts/audit_raw_stage3.py --raw-dir data/raw/kaggle-v2 --out-dir output/stage3/recheck/new-audit
python scripts/prepare_case.py --raw-dir data/raw/kaggle-v2 --out-dir output/stage3/recheck/new-canonical --schema-path output/templates/schema.json
node scripts/analyze.cjs output/stage3/recheck/new-canonical output/stage3/recheck/new-analysis/real-data-analysis.json
python scripts/verify_case.py --data-dir output/stage3/recheck/new-canonical --analysis output/stage3/recheck/new-analysis/real-data-analysis.json --sql-path cloud/dist/analysis.sql --out-dir output/stage3/recheck/new-verification
python scripts/backtest_monitoring.py --data-dir output/stage3/recheck/new-canonical --analysis output/stage3/recheck/new-analysis/real-data-analysis.json --verification output/stage3/recheck/new-verification/real-data-reconciliation.json --out-dir output/stage3/recheck/new-backtest
```

`--manifest-path` 如指定，必须是 `--out-dir` 内的新文件。核验与回测不修改分析输入。回测适配采用原 operations / monitoring 接口，单窗口独立 Node 进程，记录执行参数，180 秒超时即停止该次回测。

环境：项目声明 Node >=22。本机 Node24/旧便携 Python 曾访问违规或异常退出；独立成功运行使用应用配套 Python 3.12.14、审计 Python 3.11.9 及 Node20.20.1。Node24 的 44 项单元与 34 场景浏览器回归通过，但全量历史回测未完成 Node24 认证。Node20 是本次诊断组合，不代表已完成所有受支持运行时认证。可用 `--node` 和 `--audit-python` 显式指定解释器，参数写入运行记录。不可把这些故障标成环境已彻底修复。

打包过程中发现部分复制文件及回执含空字节，而计算源文件哈希仍匹配。失败回执和逐文件修复记录保留在 development-tests。交付副本已从有效源重建并逐个复核；新增持久化 flush/fsync、原子替换及写后读回检查。不能据修复后的副本宣称底层故障根因已解决。

浏览器回归使用原 `npm test` / `npm run test:browser`。在 `output/stage3/recheck/browser-regression-copy` 的独立源码副本运行，避免原 QA 固定路径重写主工作副本的历史 QA 文件。设置 `LENS_PLAYWRIGHT_MODULE` 指向已有 playwright-core，`LENS_BROWSER_EXECUTABLE` 可指定本地 Edge/Chromium；不使用用户登录配置。

统一入口是人工命令，不是后台定时任务。没有真实历史 as-of 状态版本、持续数据源或异常人工真值，不能据此宣称实时监控、准确率、召回率或因果改善。
