# Olist Lens v2.0 首轮开发预览

这是基于 `b54142be5014f055031e96d602123fe60e2dfd79` 的隔离开发副本，第一阶段随后已发布至腾讯云；本轮第二阶段说明见 [docs/V2_STAGE2.md](docs/V2_STAGE2.md)。原 v1.0.0 商品金额口径、公开报告和核心计算文件保持不变。完整审计、数据可用性、指标字典、模块设计、验收矩阵与任务拆分见 [docs/V2_DESIGN.md](docs/V2_DESIGN.md)；本轮验收见 [docs/V2_ACCEPTANCE.md](docs/V2_ACCEPTANCE.md)。

## 运行

在此目录执行 `./Start.ps1`，打开 http://127.0.0.1:8787。也可以使用 Python 3.10+：

```powershell
python -m http.server 8787 --bind 127.0.0.1 --directory cloud/dist
```

原公开案例不会自动获得商品诊断：本仓库没有真实完整商品明细，也不能从旧汇总还原。选择“导入新数据”，上传标准三表 CSV 与 manifest；manifest.operations 配置可直接放在批次说明内，也可通过可选配置框覆盖。校验后先预览，确认切换后在“商品异常”查看。

配置示例：[cloud/dist/downloads/operations-config.example.json](cloud/dist/downloads/operations-config.example.json)。示例日期不是你的真实期间；必须修改日期、完整性水位与 `completion_evidence`。示例故意留空证据字段，直接使用会阻断经营分析。首轮仅支持相邻等长整周窗口。

`is_synthetic: true` 用于合成样本，真实数据应显式标为 false，未标记显示 unknown；不要将测试结果讲成真实经营收益。

## 合成样本验证

需要 Node.js 22+（包含 Web Crypto；本轮使用 Node 26.4.0）。不需要下载 npm 依赖；CSV / SQLite WASM 复用仓库中固定版本。

```powershell
node --test tests/core.test.cjs tests/operations.test.cjs
node tests/operations-fixture.cjs tmp/operations-fixture
node scripts/operations.cjs tmp/operations-fixture output/analysis/operations-synthetic.json
```

可在网页导入 `tmp/operations-fixture/` 的四个文件。样本明确标为合成，仅用于验证多商品、多评价、状态排除、两期比较和告警门禁。默认生产样本阈值是 30 单，fixture 特意设为 1 单来覆盖候选告警路径，不能作为业务默认配置。

## 浏览器验收

先安装或指定 Playwright Core，并指定本机 Chromium / Edge 路径。脚本自建临时 HTTP 服务，完成后自动关闭浏览器与服务；没有外部发布、上传或定时采集。

```powershell
$env:WRITE_FIXTURE='1'
node --test tests/core.test.cjs
$env:LENS_PLAYWRIGHT_MODULE='你的绝对路径/node_modules/playwright-core'
$env:LENS_BROWSER_EXECUTABLE='C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
node scripts/qa_operations.cjs
```

浏览器输出在 `output/analysis/v2-browser-qa.json`。截图和合成浏览器文件在 `tmp/v2-browser`，默认不打包。旧 `scripts/qa_product.cjs` 的全量真实数据分支仍需原始规范化 CSV，本轮未执行该分支。

## 新增模块

- `operations.sql`：按订单商品行连接，独立总量与四维度聚合，不连接评价。
- `operations.js`：质量/完整性门禁、独立 JS 复算、精确有理数分解、历史变化中位数/MAD、证据引用与审核接口。
- `worker.js`：旧结果完成后运行 v2；经营失败保留旧履约结果，但不产生新经营结论。
- `operations-ui.js`：贡献表、证据查看/导出、确定性问答、人工审核和行动单。本机存储写入串行化，避免问答/审核互相覆盖。
- `scripts/operations.cjs`：可复现的命令行入口；相同输入、代码和配置产生相同运行标识。

`result.operations` 包含 run_id、metric_snapshots、evidence、alerts、verification。`result.analysis_runs` 保存本快照的运行摘要；快照之间不叠加金额。配置了经营分析时，外层快照 ID 绑定 v2 运行 ID，旧计算 ID 保存在 legacy_id；未配置经营分析的旧批次沿用原有 ID 算法。重新导入备份只使用 CSV 与 manifest，忽略保存的计算结果和人工审核，必须重新检查并审核。

问答本轮是确定性证据适配器，不是已接入的大模型。每次问答记录问题、回答、运行版本、计算版本、证据哈希与引用，保存在本机 `diagnosis_sessions`。正式行动单必须有人填写审阅人和审核说明；身份为本机用户自报，尚无服务端权限隔离。行动单仅表示核查任务，执行和收益始终未验证。

## 发布与后续范围

不要使用旧 `scripts/package_release.py` 自动构建本轮交付：它依赖未提供的原始数据并重建历史产物。当前完整源码 ZIP 已包含可运行静态文件。网页原有“v1 代码”下载仍是历史归档；本轮完整源码以交付 ZIP 为准。

没有后台采集、无人值守调度、渠道/流量漏斗或真实模型连接；也没有用前端定时器替代后台任务。真实全量数据重验、误报率回测、自然月比较、服务端身份与通知、AI 深度集成是下一轮任务。新增模块尚未做最大 80 MB 规模的性能基准测试。
