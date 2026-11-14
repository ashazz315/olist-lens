# Olist Lens v2.0 第一轮设计与审计

设计日期：2026-11-14（Asia/Shanghai）。状态：设计先行，首轮实现商品拆解、证据包与本地运行记录；不是线上 v2 正式发布。

## 1. 现有系统审计

审计源：本机 `C:/Users/Zhang/OneDrive/文档/ChatGPT/DA/olist-lens`，HEAD `b54142be5014f055031e96d602123fe60e2dfd79`，工作区干净。代码及文档声明 v1.0.0；未发现 Git v1.0.0 标签，不能宣称已有不可变发布标签。开发使用逐文件复制的隔离副本，不改原仓库、旧公开快照、旧指标定义或线上部署。

| 模块 / 证据位置 | 已实现 | v2 差距 / 处置 |
|---|---|---|
| cloud/dist/core.js / validate | 三表标准 CSV、全量快照、主键冲突阻断、完全重复去重、整数分、孤儿检测、元数据检查 | 非 delivered 订单可缺商品；product_id/seller_id/category 可空。经营分析另设门禁，不能继承旧质量通过就认定经营完整 |
| cloud/dist/analysis.sql | 商品先按订单汇总，评价每单取最新；订单事实粒度；9 组 SQL 结果 | amount_cents 只含 delivered；新增 SQL 文件，不修改这个历史字段 |
| core.js / independent | JavaScript 独立复算主要订单计数及金额 | v2 增加商品、维度与期间汇总逐组 SQL/JS 对账 |
| cloud/dist/worker.js | 本机 Worker 计算、文件 SHA-256、代码哈希、结果 ID | 在旧结果完成后附加独立 v2 结果，v2 阻断不能使旧报告失效 |
| cloud/dist/app.js | IndexedDB snapshots/settings、候选预览、确认切换、按 ID 恢复、导出 | 保持数据库 v1 结构；v2 运行记录随快照存储，新增独立配置表单，不使用定时器采集 |
| scripts/analyze.cjs / verify_case.py | Node 分析、Python Decimal 与 SQLite 独立复核 | 当前原始/规范化 CSV 不在仓库副本中；真实数据 Python 全量复核不可重跑，不能沿用旧记录声称本次执行 |
| tests/core.test.cjs | 7 项边界测试 | 本次修改前 7/7 通过；新增经营专项测试和浏览器回归 |
| scripts/qa_product.cjs | 导入、重复、备份重算、版本恢复、真实数据导入 | 环境路径硬编码且后两步依赖未提供的原始 CSV；补充独立可运行的本轮浏览器验收 |
| Fulfillment Flow lib/workflow.cjs | 只读证据 ID、数据版本/哈希、无自由数值、反证与人工语义审核 | 复用原则与接口形状；不复制履约特定 E1–E8 内容，不声称已接通模型服务 |

已发现的边界：历史快照恢复直接信任本机保存的旧计算结果，备份文件重新导入才执行复算；这两条行为不同。本轮 v2 只发布新导入计算的结果，旧快照没有 v2 时显示“证据不足”，不从聚合图表反推商品事实。

## 2. 数据可用性

| 字段/数据 | 当前适配器能力 | 可支持 / 不可支持 |
|---|---|---|
| orders 的购买日期、状态、客户州 | 可导入，公开快照仅有聚合及有限样本 | 按购买时间归属、订单量、地区拆解；不是付款事件或实时状态历史 |
| order_items 的 product_id、seller_id、category、price | 标准契约已有，但本次没有真实完整 CSV | 单件行数、商品金额、平均观测单价、商品/品类/卖家拆解 |
| delivered_at / estimated_delivery_at | 可空；已交付且双日期有效才可比较 | 按自然日期判定延迟；缺日期不能按时处理 |
| order_reviews | 一单可多评价；旧 SQL 取最新 | 旧体验分析继续；v2 金额 SQL 完全不连接评价 |
| 广告/自然搜索/曝光/访问/库存/退款/成本 | 当前契约没有 | 标记 unavailable；不填零，不推测渠道和退款净额 |
| 期间完整性 / 源系统水位 | 旧 manifest 的 coverage 只是声明范围 | 新 operations.complete_through + completion_evidence 显式声明，不能由最后一笔交易日期推断完整 |
| 状态时点 | 公开历史最终状态 | 有回溯修订/存活偏差；不能称当时实时 GMV。历史基线仅使用同批快照、同规则的更早期间 |

旧公开报告可继续展示，但其汇总无法支撑真实商品异常。测试样本统一 `is_synthetic: true`；数据性质未知时须标为 unknown。本轮不自动下载或补造业务事实。

## 3. 指标契约 operations-2.0.0

输入继续使用 schema_version=1.0.0 / full_snapshot，新增可选 manifest.operations 配置，不要求迁移 v1 CSV。每条 order_items 是一件，不将 order_item_id 当数量。金额以 BRL 等 manifest 币种的整数分计，不跨币种换算。

购买订单总体：购买时间落在 [start, end) 的订单，状态为 approved / invoiced / processing / shipped / delivered；排除 created（未确认）、canceled、unavailable。这里“购买”是已接受订单的观测代理，没有付款凭证，不能称实付收入。排除各状态的订单数/商品金额另行保留。该定义是新增经营契约，不改历史口径。

| 指标 ID | 粒度 / 分子 | 分母 / 零值与排除 |
|---|---|---|
| purchase_item_amount_cents | 合格订单商品行 price_cents 求和 | 无分母；不另加运费；未做退款、税费或平台抽佣调整，不是实际净 GMV |
| purchase_orders | 合格订单 distinct order_id | 商品缺失必须阻断，不能用不完整金额除完整订单数 |
| item_units | 合格订单的去重商品行数 | 非件数列之和；订单取消等状态排除 |
| avg_order_item_amount_cents | purchase_item_amount_cents | purchase_orders；分母零返回 null |
| product_sales_share | 商品金额 | 当期总体商品金额；零分母 null；未知商品单独 null 分组 |
| product_delta_cents | 同商品当期金额 − 基期金额 | 新增/消失商品参与并集，绝不只 inner join |
| delta_contribution_share | product_delta_cents | 总体 delta；总变化零为 null，负值或 >100% 合法，不是销售份额 |
| avg_unit_price_cents | 商品金额 | 商品件数；零件数 null，不填虚构价格 |
| delivery_eligible / late_orders / late_rate | 已交付且实际与预计日期均有效；实际自然日期 > 预计自然日期 | late_orders / delivery_eligible；缺日期排除并披露；零分母 null；与购买期一起归属 |

v1 `amount_cents` 始终为“已交付订单商品金额”。v2 字段独立命名。平均值保留计算精度，展示才舍入；拆解使用有理数表示精确分值。

比较窗口：首轮支持相邻、等长、完整、互不重叠的固定天数窗口 [start,end)，默认用户配置 7 天；要求整周以对齐星期构成。日/月同比及不同天数自然月留后续版本。来源时间使用原始本地日期字符串；source_local_unknown 只允许同批来源内部比较，不假装 UTC。complete_through 是包含的最后完整日，coverage_end 亦包含；不能超出提取日，若时区未知则保守留一日缓冲。

低样本默认两期任一期 <30 单标记，不作为统计显著性阈值；阈值可配置。缺商品 ID 保留 null 组，阻断商品告警但保留可核对算术；缺品类/卖家/地区保留 null 组和覆盖率，只阻断对应维度的强解释。

## 4. 商品拆解与证据

同一 product_id 以两期并集对齐。S=Q×P，使用对称分解：

- 件数效应 = (Q1−Q0)×(P1+P0)/2。
- 平均单价效应 = (P1−P0)×(Q1+Q0)/2。
- 两项之和精确等于 S1−S0。P 是观测平均单价，受规格、卖家与促销构成影响，不能直接解释为调价。
- 新商品 Q0=0 或消失商品 Q1=0 时，不虚构缺期价格；两效应为 null，全差额进入 assortment_effect_cents，status=new/discontinued。双期无商品不生成行。
- 品类、卖家、客户州各自是互斥商品行分组，金额独立与总体对账；三个维度不能再相加。维度订单量允许跨组出现，不可相加当总订单量。商品跨品类映射标记，不擅自选一个分类。

SQL 保留按商品行连接 orders 的事实，禁止连接评价。每个周期总量及各分组由独立 JS 循环重新计算，任何不一致阻断 v2 发布。证据 ID 绑定 run_id，包含文件 SHA-256、旧数据版本 ID、新指标版本、代码/SQL 哈希、manifest、窗口、状态过滤、质量门禁、维度覆盖、排除项、分解恒等式与完整性声明。证据记录引用查询名/表/分组键/过滤条件，可由完整批次复现，不传客户个人标识给 AI。

## 5. 运行、快照与告警

配置放在 manifest.operations：两个期间、min_orders、min_product_orders、thresholds（绝对分金额/相对变化/历史 MAD 倍数）、baseline_periods（至少 4 个，以提供至少 3 个相邻历史变化；建议 8 个）、完整性声明。所有阈值只是可配置起点，不能作为统计保证；需用真实历史回测误报率。

同一次快照内计算更早的连续等长窗口，以相邻历史变化的中位数与 MAD 建立变化基线，要求同币种/规则/来源/星期结构且所有窗口完整。禁止用未来窗口或当前变化训练基线。MAD=0 时记录无波动基线，仍须同时满足绝对、相对和历史偏离门槛；基线缺少、零基期、样本不足、核心字段缺失、质量失败均不发告警。

运行状态：blocked / insufficient_evidence / verified；告警状态：pending_review → confirmed 或 dismissed。没有告警也记录原因。告警至少含 run_id、metric_id、before/after/delta、影响商品及证据 ID、source、计算版本、规则与处理状态。它是本机候选提醒，不是确诊根因；首次默认 pending_review。

幂等键由完整输入哈希、旧数据版本、v2 计算哈希、配置生成，同批重算 ID 相同；不把生成时钟加入键。重新导入自动计算候选，只有用户确认完整快照后成为当前结果。新运行不会追加到旧金额；恢复旧版本显示其对应运行。IndexedDB 保存失败保留旧快照；v2 失败不抹除旧报告，也不得显示旧告警为新批结论。

本轮本地 runs/metric_snapshots 随完整快照保存，可 JSON 导出。全量快照之间不增量拼接。后台采集、水位校验、批次注册表、任务队列、失败重试、幂等调度与通知投递需独立服务，留下一轮；页面打开后执行 Worker 不是无人值守更新。

## 6. AI 接口与审核

首轮实现确定性 evidence-only 问答适配器与结构校验，不接真实模型。输入仅允许已验证的结构化包；询问广告、搜索、库存、退款、净 GMV、因果和收益时回答“证据不足”，列明所缺数据。接口返回 confirmed_observations / possible_explanations / missing_data / hypotheses_to_falsify，所有量化观察通过证据 ID 渲染；可能解释始终标待验证。

复用 Fulfillment Flow 的只读证据边界、引用白名单、禁止自由数值和语义人工审核理念。记录 run_id、证据哈希、metric_version、计算版本、引用列表；prompt/response/模型版本由下一轮真实接入补充。结构校验不等于事实正确或语义审核。没有可信服务端身份时本机审核只作用户自报记录，不宣称权限隔离。

正式行动单必须引用已验证包，并有明确的人工审阅人、确认时间、审核说明及选中的观察证据；先确认诊断再产生行动单。AI 不能调用审核状态转换。行动单的执行和收益保持未证实。

## 7. 测试与验收矩阵

所有新增 fixture 明确 Synthetic test only / is_synthetic=true，不混入公开快照。

| 验收 | 自动验证方式 |
|---|---|
| 重复导入不重复计数 | 相同输入稳定 run_id、同键结果替换、浏览器重复批次不新增 snapshot |
| 多商品 × 多评价不放大 | SQL 不连接 reviews；多评价和完全重复行 fixture 金额恒定 |
| 商品贡献与总体一致 | 正负变化、新增、消失、总差零、分数分值；精确有理数恒等式 |
| 质量与完整性阻断 | 冲突键、孤儿、非已交付订单缺明细、缺产品 ID、缺声明、范围越界、未完整/非可比窗口、基线不足、低样本 |
| 独立复算 | SQL 总量/商品/品类/卖家/地区与 JS 循环逐组比对；故意篡改 SQL 必须阻断 |
| AI 证据不足 | 缺渠道/退款、阻断包、伪造证据 ID、未审阅生成行动单均拒绝 |
| v1 回归 | 原 7 项测试不改；原报告快照/PDF/SQL/core 字节哈希不变；真实 Worker 导入、保存、重载、备份复算、恢复 |
| 真实历史复核 | 当前没有完整 CSV，不计为已执行；后续提供已授权全量批次再跑旧 Python 和真实数据 browser case |

## 8. 开发任务拆分与顺序

1. P0 设计审计（本文件）：冻结旧口径，列出数据缺口与风险，完成指标与验收契约。
2. P0 商品异常引擎：独立 operations.sql / operations.js，SQL/JS 核对、分解、维度、缺失/样本/期间门禁。
3. P0 诊断证据：稳定运行 ID、查询引用、输入/代码哈希、JSON 导出、确定性问答和审核/行动单接口。
4. P1 本地集成：Worker 导入自动重算，快照内 runs / metric_snapshots / alerts，经营结果面板与配置；兼容旧版本和恢复。
5. P1 检测：同批历史变化基线、组合阈值、无数据不发、候选提醒与审核状态；无外部推送。
6. P0 验收：专项、旧单元、浏览器、变更清单与可运行源码交付，不发布线上。
7. 下一轮：真实数据回测、自然月比较、实时状态历史、流量漏斗、服务端采集/调度/通知、鉴权与 AI 模型深度接入。不能声称全链路已打通。
