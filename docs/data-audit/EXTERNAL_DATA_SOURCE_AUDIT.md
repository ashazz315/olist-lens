# 外部数据源调查

审计日：2026-11-14。仅访问官方说明、公开元信息、文件目录与论文；**没有下载 CSV/TSV/ZIP，没有执行 BigQuery 查询，没有注册账户或触发付费作业。** 下列“可获取”表示发布方提供入口，不代表本轮已经成功下载并校验完整文件。实际行数、SHA-256、字段空值和关联命中率必须留给获批后的采集验收。

## 1．Google Analytics ecommerce 示例

| 核查项 | 结果 |
| --- | --- |
| 发布方/来源 | Google；[官方数据说明](https://developers.google.com/analytics/bigquery/web-ecommerce-demo-dataset) |
| 数据标识 | `bigquery-public-data.ga4_obfuscated_sample_ecommerce.events_*` |
| 性质 | Google Merchandise Store 事件的混淆样本；有占位值且内部一致性受限。不能称未处理原始真实账本，也不等同任意生成的合成数据 |
| 时间/数据量 | 官方覆盖 2020-11-01 至 2021-01-31；本轮未运行 COUNT，实际行数/字节数未核验 |
| 获取/格式 | BigQuery 公共表，需启用 BigQuery API 的 Google Cloud 项目；可在 Sandbox/免费额度限制内查询。审核后导出选定表；嵌套数据优先 NDJSON/Avro/Parquet，CSV 需先明确展平粒度 |
| 许可 | 文档页脚的 CC BY 4.0 / Apache 2.0 分别指页面内容/代码，不能直接当作数据集许可。数据使用及再分发条款需在实际获取前确认 |
| Olist 关联 | 无共同业务键，且商家和时间不同，必须独立 |

[官方 schema](https://support.google.com/analytics/answer/7029846?hl=en) 描述事件日期/时间、event_name、user_pseudo_id、event_params、items（item_id、价格、数量）、ecommerce 等结构；这不是本轮对样本实际列和值覆盖的检查。[官方示例查询](https://developers.google.com/analytics/bigquery/basic-queries) 使用 page_view、session_start、purchase、add_to_cart，并明确某些新 batch 字段不在该历史样本中。审核后先查实际 schema、事件分布和缺失率，不能假设现行全部字段均存在。

用途：独立站点浏览、加购和购买漏斗方法验证。缺口：不能保证广告曝光、真实费用、完整退款/库存；有渠道字段也不等于已有广告账单。嵌套 items 与 event_params 不应同时直接 UNNEST 后累加，否则可能放大事件和金额。**推荐作为独立流量案例，不用于填补 Olist 的流量数据。**

## 2．Retail Transactions and Stocks Data

| 核查项 | 结果 |
| --- | --- |
| 发布来源/版本 | Jimmy Smith，Mendeley Data，Version 1，发布 2026-04-27；[数据页及 DOI 10.17632/27x8mjm8k4.1](https://data.mendeley.com/datasets/27x8mjm8k4/1) |
| 文件 | 页面列 `retail_inventory_ml_apl.csv`（95.4 MB）、`retail_sales_ml_apl.csv`（37.3 MB）；CSV，Download All/单文件入口 |
| 发布方描述 | 零售交易与 on-hand 库存样本；40 家门店、2,326 个 SKU、3 个 division，四级商品层级 |
| 真实性 | 发布方描述为零售业务样本；本轮无法独立确认原业务来源、脱敏方式或是否含加工/生成字段。标记“真实业务来源声称，待核实”，不擅自标成模拟或已证实原始账本 |
| 实际行数/日期/字段 | 未下载，未核验。40/2,326 是实体数量而非行数；发布日期不等于交易日期。公开说明未给完整字段表、主键或时间跨度 |
| 许可 | 数据页标 CC BY 4.0；保留作者、版本和 DOI |
| 键/完整性待查 | 核实实际 store/SKU/date 列名、交易行 ID、库存时点、重复、缺失及销售/库存重叠覆盖；不能凭文件名假定库存是每日闭店余额 |
| Olist 关联 | 独立零售业务，无 Olist 公共主键；不可合并金额或补 Olist 缺货 |

访问限制：官方页面的搜索索引可见文件名/大小，直接页面呈现文件区不完整；本机 HTML 请求返回 HTTP 500，尝试的公开元信息路径返回 404。以上不证明文件永久不可用。**条件推荐**：人工审核后先核实字典和小范围完整性，再决定是否完整下载。若库存是快照差额而非出入库流水，仍不能直接认定补货或缺货损失。

## 3．Olist Marketing Funnel

| 核查项 | 结果 |
| --- | --- |
| 官方发布 | [Olist Kaggle](https://www.kaggle.com/datasets/olistbr/marketing-funnel-olist)，作者 Andre Sionek；[元信息 API](https://www.kaggle.com/api/v1/datasets/view/olistbr/marketing-funnel-olist) 本轮 HTTP 200 |
| 固定版本建议 | 当前 Version 2，版本说明 changed filenames，最后更新 2018-11-16；后续应固定版本而非静默取 latest |
| 文件/大小 | [官方文件清单 API](https://www.kaggle.com/api/v1/datasets/list/olistbr/marketing-funnel-olist)：`olist_marketing_qualified_leads_dataset.csv` 703,836 bytes；`olist_closed_deals_dataset.csv` 171,352 bytes；合计 875,188 bytes。不是已验证 ZIP 大小 |
| 数据量/时间 | 发布方称随机抽样约 8,000 个 MQL，请求联系范围 2017-06-01 至 2018-06-01；不是本轮文件实测 min/max。成交表行数、实际 won_date 覆盖尚未核验 |
| 性质/许可 | 真实业务、匿名化、随机样本；CC BY-NC-SA 4.0。不是完整卖家获客全集 |
| 下载方式 | Kaggle 官方 Download 或其 API/CLI；可能需要账户/条款确认。只列方案，未下载 |
| 字段验证程度 | 官方明确 seller_id 可与电商数据连接；文件清单 API 的 columns 为空。拟检查 mql_id、first_contact_date、origin、landing_page_id、seller_id、won_date，完整列名和非空率在下载后确认，不能把候选字典当实际表头 |
| 关联能力 | 仅卖家侧：先验证线索/成交关系，再经 seller_id 连接现有 sellers；实际命中率本轮未知 |

官方说明提醒同一卖家可能从多个来源提交线索。**此处 organic/paid 来源是卖家成为 Olist 商户的获客来源，不是消费者购买商品的搜索来源。** 不可据此计算消费者广告 ROAS、SKU 曝光或加购率。即使后续发现自报库存/营收字段，也必须先查语义，不能替代 SKU 库存流水或已验证成交额。

## 4．Criteo Attribution Modeling for Bidding

来源链：[Criteo AI Lab 数据资源](https://ailab.criteo.com/ressources/) → [Criteo 发布账户的数据卡](https://huggingface.co/datasets/criteo/criteo-attribution-dataset) → [文件目录](https://huggingface.co/datasets/criteo/criteo-attribution-dataset/tree/main)。目录有 `criteo_attribution_dataset.tsv.gz`，约 653 MB；数据卡显示 16,468,027 行、约 700 个 campaign、约 45K conversions，均为发布信息，未本地计数。许可 CC BY-NC-SA 4.0。

真实流量经抽样/匿名化；每行一次曝光。公开字典含 timestamp、uid、campaign、click、conversion、conversion_id/timestamp、attribution、cost、cpo 及匿名类别字段。timestamp 从 0 起，覆盖 30 天，不提供可直接恢复的自然日锚点；**cost/cpo 经变换，不是原始真实金额，cpo 不是商品销售收入。** 没有 Olist 商品键。

适合独立曝光—点击—转化、去重和归因窗口方法练习；不能验证 Olist 广告效果、真实货币 ROAS，不能把每条曝光的 conversion=1 相加当去重订单数。候选基本可获取入口明确，但不满足“原币真实花费+自然日+订单收入”的完整条件。

## 5．iPinYou RTB 历史广告日志

来源：[官方竞赛数据页](https://contest.ipinyou.com/)，[发布方数据说明论文](https://contest.ipinyou.com/ipinyou-dataset.pdf)。真实广告竞价/曝光/点击/转化日志经处理、哈希和抽样；季次属于 2013 年竞赛，具体文件日期/实际行数待下载验收，不用竞赛全年范围代替文件覆盖。

官方给百度网盘、UCL 镜像入口；本轮 UCL 入口未能访问，网盘未执行下载。格式为压缩日志文本，规模随季次和训练/测试分包不同，本轮未核对总字节数。许可仅明确非商业使用，不编造特定 CC 版本。

字段包括 Bid ID、Timestamp、Creative ID、竞价/成交价格及日志类型；第二、三季有 Advertiser ID。Bid ID 可关联该数据集内部日志。价格字段经过缩放，说明单位为 RMB/CPM，**不能按“每行 price 元”直接累加实际花费**。转化也不保证是商品购买，缺订单收入及 Olist SKU。可作独立投放技术研究，获取可达性、单位与许可确认后再考虑；本轮不列为优先下载。

## 6．补充检索与淘汰理由

| 来源 | 已查到什么 | 为什么暂不采纳 |
| --- | --- | --- |
| [Performance of Native and Catalogue Advertising](https://data.mendeley.com/datasets/yprfjybw88/1) | 发布方描述匿名曝光、时间、点击、转化；CC BY 4.0 | 未取得完整文件字段/数据量/时间覆盖证据，公开说明不确认 spend；推断的旅程阶段不是实测漏斗事件 |
| [Google Ads Performance Stability Dataset](https://zenodo.org/records/18825617) | 作者称匿名聚合数据；当前文件列表只有 130.9 kB PDF | 不是已核实含日期、活动、曝光、点击、费用和转化的逐行 CSV；数据时段、行数和再利用许可未证实 |
| [Sample Marketing CSV](https://csvtodashboard.com/sample-marketing-csv) | 字段齐全但说明由固定种子生成，CC0 | 模拟测试数据，不能用于本轮真实业务补充 |
| [Amazon 社区营销示例](https://community.amazonquick.com/t/download-this-demo-dataset-to-use-in-our-sessions-on-april-30-and-may-2/28375) | 发布方明确 dummy data | 不是真实广告经营证据 |

**本轮没有核验到同时满足“明确真实来源、可用下载、自然日、活动/商品键、曝光、点击、未变换货币花费、转化及收入”的公开电商广告源。** Criteo/iPinYou 是可追溯的真实来源加工样本，但未满足全部条件；不能为了交付而将其写成完整满足。真实 Olist ROAS 必须取得同一业务的授权投放与订单归因数据。

## 获取后的统一验收（未执行）

记录发布方、固定版本、许可/署名、获取 UTC 时间、原文件名/大小/SHA-256、归档完整性、实际行列、主外键/重复/缺失、时间/币种和单位、脱敏/抽样/生成说明。只看“真实”“公开”标签不能替代证据。未核验字段、下载入口有效性、商品键或授权任一关键条件时，停止对应能力接入；不从第三方镜像默默替换来源。

推荐次序和各业务边界见 [数据获取优先级](DATA_ACQUISITION_PRIORITY.md)；跨数据集关联规则见 [关联可行性](DATA_JOIN_FEASIBILITY.md)。
