# v2.0 第二阶段：数据更新与异常监控

交付日期：2026-11-14（Asia/Shanghai）。计算版本 `monitoring-2.0.0`；购买指标契约仍为 `operations-2.0.0`。原 v1 履约口径不变。

## 基线与实际范围

从 GitHub `main` 的 `b54142be5014f055031e96d602123fe60e2dfd79` 和第一阶段本机交付副本继续开发。实施前重跑 22 项单元测试与 12 项浏览器验收，全部通过。复用原 CSV 完整快照导入、`core.js`、`analysis.sql`、独立复算、第一阶段商品分解与证据包，不重写旧指标。

旧 `core.js`、`analysis.sql`、`snapshot.js`、`tests/core.test.cjs`、公开分析 JSON、PDF 和旧导入模板保持字节一致。第一阶段设计见 [V2_DESIGN.md](V2_DESIGN.md)。本阶段不新增 AI 对话助手。

## 已实现

| 模块 | 行为 |
|---|---|
| 完整快照更新 | 读取文件后建立执行任务，自动校验、SQL/JS 重算、监控检测；用户确认后发布 |
| 任务记录 | 独立 attempt/job ID，状态、原文件哈希、来源提取时间、执行时间、数据版本、失败原因与 retry_of |
| 监控版本 | 规范化去重事实按内容生成 dataset_version；计算代码、规则配置与比较窗口单独确定 run_id |
| 修订 | 同来源、同覆盖期的内容变化生成不可变新版本，revision_of 关联前版；保留修订说明和旧证据 |
| 异常引擎 | 全店、商品、品类、卖家的金额/订单/件数/订单平均商品金额，实体自身历史变化中位数/MAD 基线 |
| 履约 | 全店延迟率，要求提供已终结 cohort 声明及观察截止依据；逐单核查交付状态、日期和截止时间 |
| 质量异常 | 失败批次仅生成质量事件，accepted_dataset_version=null；经营/履约结果不发布 |
| 工作台 | 独立“异常监控”页，指标概览、事件筛选和分页、下降商品榜、详情、历史、任务、记录导出 |
| 人工处理 | 待处理、处理中、关闭、显式重开；操作者、依据和追加处理历史；关闭必须有结论和证据引用 |
| 调度契约 | 可运行、鉴权的服务端 HTTP 接口，配置持久化与版本冲突检查；没有真实来源时拒绝启用 |

金额全部由原 `operations.sql` 和独立 JavaScript 验证后的 cube 提供。经营金额是购买周期内已接受订单的商品行金额，排除 created/canceled/unavailable，不含运费、退款调整，不能叫企业实际净 GMV。旧版金额仍只含已交付订单。

## 数据更新与失败规则

任务正常路径：`queued → validating → computing → awaiting_confirmation → publishing → succeeded`。

旁路状态：`failed`、`duplicate`、`canceled`、`interrupted`、`publication_pending`。预览不会发布。关闭页面不会继续后台计算；重开时通过 Web Locks 判断其他标签页是否仍持有任务，只有已失去执行者的任务才标中断。修正质量失败后重新提交原流程；同批次的新尝试关联 retry_of。存储失败可重新导入；已保存快照的待同步监控可点击“重试待同步任务”或刷新恢复。

旧数据存储 `olist-lens-v1` 不升级。新增 `olist-lens-monitoring-v2`，用一个事务状态对象保存 jobs/datasets/runs/events/event_history/snapshot_runs。比设计稿的多个 objectStore 更小，领域对象保持独立；单次 readwrite 事务读改写，防止多标签页丢写。浏览器存储是本机工作区，不是多人云端数据库；配额、清理和设备损坏可能丢失本机记录，请导出备份。

两个数据库不具备共同原子事务：先持久化 publishing 任务，提交旧完整快照，再单事务写入监控版本、指标与事件。旧快照失败则不发布监控；第二步后监控失败保留 pending，当前版本显示尚无监控，不能拿上一版冒充。重开核对已保存 snapshot ID / run ID 后幂等补发。恢复旧快照按它的映射选择监控结果；无映射则明确为空。

同一规范化数据、规则与周期重复检测不新增事件、不重置人工处理状态。CSV 行顺序和完全相同的重复行不产生新经营事实；不同原文件哈希仍保留在执行任务。相同事实换规则会生成新分析运行，但不声称新采集数据。历史修订保留前版，不自动关闭或重开旧事件。

## 异常与证据契约

经营规则同时要求绝对变化、相对变化和偏离历史中位数超过 MAD 门槛；历史只用基期之前的完整窗口。各实体有自己的历史序列。默认门槛需业务回测，不声称统计显著性或已达到某误报率。

低样本、历史不足、缺 ID、零基数、无有效分母分别留下 suppressed_reasons。缺 ID 时保守抑制该维度；全店缺商品 ID 也抑制。空基期百分比为 null。历史存在但没有该商品的完整周期可以记录零销售，不能虚构平均价格。多组 distinct order_id 不能相加当作总订单。

履约只实现全店规则。使用延迟订单数 / 有效已交付订单数，按日历日期比较。为避免近期未完成订单偏差，当前实现要求历史、基期、当期所含接受订单均已交付且日期有效，并要求 `monitoring.fulfillment.finalized_cohorts=true`、有效 `observed_through` 和非空 evidence；否则展示描述性指标并抑制告警。不能用提取时间本身替代成熟度证据。

每条业务事件包含数据/规则/计算/指标版本、源 manifest 与原文件 SHA-256、期间、范围、两期指标、分母、历史序列、阈值、SQL 分组说明及双路径复算记录。商品下降榜只按负金额排序，提供件数/单价分解引用。事件和算术贡献都不是根因判断。

关闭要求非空处理人、处理依据、受控结论及证据引用。状态变更追加 event_history，不因指标恢复自动关闭或声称行动有效。身份为本机用户自报，未实现服务端身份认证与防篡改审计。

## 配置与使用

1. 用 `Start.ps1` 或静态 HTTP 服务器打开 `cloud/dist`。
2. 导入原三表 CSV 和 manifest；保留 `manifest.operations` 的完整比较窗口、覆盖水位和提供者证据。
3. 可选将 [monitoring-config.example.json](../cloud/dist/downloads/monitoring-config.example.json) 放到 `manifest.monitoring`。金额阈值为整数分；延迟率 absolute=0.05 表示 5 个百分点。
4. `mode` 默认 `historical_replay`，也支持 `manual_snapshot`。不支持 live_source。请显式填写 `is_synthetic`，不能把生成样本标为真实数据。
5. 确认导入后进入“异常监控”，核对来源、周期和证据，再记录人工处理。

## 服务端调度接口：已实现接口，未启用定时执行

`scripts/monitor-server.cjs` 默认仅绑定 `127.0.0.1:8788`。设置至少 32 字符的 `MONITOR_API_TOKEN` 后运行 `npm run monitor:contract`；不能把凭证提交到仓库。配置文件默认 `tmp/monitor-schedules.json`，可用 `MONITOR_STATE_FILE` 指定。

所有接口均要求 `Authorization: Bearer <token>`：

| 接口 | 当前行为 |
|---|---|
| GET /monitoring/capabilities | 返回历史/人工模式；source_adapter_connected=false、scheduler_enabled=false |
| GET /schedules/olist-manual | 查看禁用的 cron/timezone/config version |
| PUT /schedules/olist-manual | 要求 enabled=false、expected_version；持久保存配置；启用返回 409 |
| POST /update-jobs | 未接 durable updateService 时返回 503；未来依赖注入同一任务服务，要求 Idempotency-Key |
| GET /update-jobs/{id} | 未接任务服务返回 503 |
| POST /update-jobs/{id}/retry | 未接任务服务返回 503 |

cron 当前只验证五字段的 `*` 或单个整数子集，不是实际调度器。只接受预配置 source_id，不提供任意 URL 抓取。接口可本地执行与测试，本次腾讯云仍发布静态应用，没有部署这个接口服务、队列或自动调度。未来真实来源、鉴权、采集适配器、服务端事务/锁/队列/调度部署需要下一轮接入。

## 验证与未实现清单

见 [V2_STAGE2_ACCEPTANCE.md](V2_STAGE2_ACCEPTANCE.md)。测试使用明确标记的合成输入；公开 v1 历史快照只用于回归浏览，不声称重新导入过缺失的真实完整 CSV。

未实现：可持续数据源与无人值守拉取、后台队列/定时调度部署、多人共享云端告警持久化、经过身份认证的操作审计、商品/品类/卖家履约率规则、AI 对话助手、流量漏斗、广告/自然搜索/库存/退款数据。没有以零值或合成结果填补这些缺口。
