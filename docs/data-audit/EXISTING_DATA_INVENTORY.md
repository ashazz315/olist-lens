# 现有数据资产盘点

审计日：2026-11-14。本轮只读，未重新计算经营指标。实际 CSV 的 SHA-256 与表头已重新核对，均匹配保留的完整扫描报告；因此复用同字节文件的实际行数、缺失、键和时间统计，不以文本换行数误算含多行评论的 CSV。

## 数据位置与证据

- 原始九表：[data/raw/kaggle-v2](../../data/raw/kaggle-v2/)，官方 Olist Kaggle Version 2；原始 ZIP SHA-256 `967e41e04fc306fe604e2a693f488995a8b41e5047418f8a5c8e4abd6deca784`，CRC/来源证据引用[既有 provenance](../../output/stage3/recheck/final/real-data-provenance.json)。本轮不重新下载。
- [九表质量报告](../../output/stage3/recheck/final/real-data-quality-report.json)：PASS_WITH_WARNINGS，不是没有数据质量问题或业务全集保证。
- 当前隔离检出没有 `data/canonical/olist-v2/`；实际通过标准化的三表位于下述 prepare 目录，不假定惯用路径已存在。
- [核心独立复核](../../output/stage3/recheck/final/real-data-reconciliation.json)、[本轮运行结项记录](../../output/stage3/recheck/final/review-receipt.json)、[正式指标设计](../V2_DESIGN.md)。
- Olist 归属及 CC BY-NC-SA 4.0 保留；历史数据不是实时订单，不是商业生产数据源。原始及处理后明细不公开上传。

## 九表总览

| 文件 | 实际记录数（不含表头） | 字段数 | 粒度 | 主键 |
| --- | --- | --- | --- | --- |
| olist_orders_dataset.csv | 99441 | 8 | 一行一个订单的最终快照 | order_id |
| olist_order_items_dataset.csv | 112650 | 7 | 一行一个订单商品明细（现有契约一行计一件） | order_id + order_item_id |
| olist_order_reviews_dataset.csv | 99224 | 7 | 一行一条订单评价；一个订单可多条评价 | review_id + order_id |
| olist_order_payments_dataset.csv | 103886 | 5 | 一行一个订单支付序号 | order_id + payment_sequential |
| olist_customers_dataset.csv | 99441 | 5 | 订单关联的客户记录；customer_unique_id 可跨订单重复 | customer_id |
| olist_products_dataset.csv | 32951 | 9 | 一行一个匿名 product_id 的产品属性 | product_id |
| olist_sellers_dataset.csv | 3095 | 4 | 一行一个卖家 | seller_id |
| olist_geolocation_dataset.csv | 1000163 | 5 | 一行邮编前缀对应的地理观测，非唯一地址 | 无已验证唯一主键；邮编前缀不唯一 |
| product_category_name_translation.csv | 71 | 2 | 一行一项品类名称翻译 | product_category_name |

## olist_orders_dataset.csv

字段（源拼写原样保留）：`order_id`, `customer_id`, `order_status`, `order_purchase_timestamp`, `order_approved_at`, `order_delivered_carrier_date`, `order_delivered_customer_date`, `order_estimated_delivery_date`。

外键/引用：customer_id → customers。

可支持：订单量、状态、购买时间归属、交付延迟；不是状态变更历史。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- `order_delivered_carrier_date` = 1783
- `order_delivered_customer_date` = 2965
- `order_approved_at` = 160

时间覆盖（源本地时间，未擅自转 UTC）：
- `order_purchase_timestamp`：09/04/2016 21:15:19 至 10/17/2018 17:30:18
- `order_delivered_carrier_date`：10/08/2016 10:34:01 至 09/11/2018 19:48:28
- `order_delivered_customer_date`：10/11/2016 13:46:32 至 10/17/2018 13:22:46
- `order_estimated_delivery_date`：09/30/2016 00:00:00 至 11/12/2018 00:00:00

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`8df58ef3d2d7e9944010f7beecd9b75367f5588ec6e3c91cec19ae3345ef9ecf`

## olist_order_items_dataset.csv

字段（源拼写原样保留）：`order_id`, `order_item_id`, `product_id`, `seller_id`, `shipping_limit_date`, `price`, `freight_value`。

外键/引用：order_id → orders；product_id → products；seller_id → sellers。

可支持：商品金额、件数、均价、卖家/品类贡献及运费描述；不提供库存或优惠原价。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- 全部字段的审计空值计数为 0；不保证内容语义完整。

时间覆盖（源本地时间，未擅自转 UTC）：
- `shipping_limit_date`：09/19/2016 00:15:34 至 04/09/2020 22:35:08

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`0bc4d068c4fe38cbb01bd90e8746e3c613fe7b4baef75fab7b0e329701c3e279`

## olist_order_reviews_dataset.csv

字段（源拼写原样保留）：`review_id`, `order_id`, `review_score`, `review_comment_title`, `review_comment_message`, `review_creation_date`, `review_answer_timestamp`。

外键/引用：order_id → orders。

可支持：评分、低评分及评论文本；无可靠逐商品评价归属。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- `review_comment_title` = 87658
- `review_comment_message` = 58274

时间覆盖（源本地时间，未擅自转 UTC）：
- `review_creation_date`：10/02/2016 00:00:00 至 08/31/2018 00:00:00
- `review_answer_timestamp`：10/07/2016 18:32:28 至 10/29/2018 12:27:35

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`012b61c7593e34f51fa614efdf802b9c7056ce6aae5307ddb93236e7cfc797d7`

## olist_order_payments_dataset.csv

字段（源拼写原样保留）：`order_id`, `payment_sequential`, `payment_type`, `payment_installments`, `payment_value`。

外键/引用：order_id → orders。

可支持：支付方式、分期、记录金额；无支付事件时间、退款或成功/失败尝试流水。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- 全部字段的审计空值计数为 0；不保证内容语义完整。

时间覆盖（源本地时间，未擅自转 UTC）：
- 表内无独立业务日期字段；需经有定义的订单关系取得购买日期。地理/翻译/主数据无历史有效期，不能宣称已经覆盖某一连续时段。

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`4f713964f2815dbbaa40b9488268c55aac3627bfce5aa96cf58d1f3616de3cc0`

## olist_customers_dataset.csv

字段（源拼写原样保留）：`customer_id`, `customer_unique_id`, `customer_zip_code_prefix`, `customer_city`, `customer_state`。

外键/引用：被 orders.customer_id 引用；邮编前缀可对 geolocation 作覆盖检查。

可支持：客户州/城市与匿名客户身份；无消费者会话、搜索渠道。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- 全部字段的审计空值计数为 0；不保证内容语义完整。

时间覆盖（源本地时间，未擅自转 UTC）：
- 表内无独立业务日期字段；需经有定义的订单关系取得购买日期。地理/翻译/主数据无历史有效期，不能宣称已经覆盖某一连续时段。

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`983a422239e1712ded753b3bf9ecf47dc73f144d306029dcfa99e70a226883d2`

## olist_products_dataset.csv

字段（源拼写原样保留）：`product_id`, `product_category_name`, `product_name_lenght`, `product_description_lenght`, `product_photos_qty`, `product_weight_g`, `product_length_cm`, `product_height_cm`, `product_width_cm`。

外键/引用：product_category_name → category_translation（部分缺失/未翻译）。

可支持：品类、尺寸重量、图文长度；没有真实商品名称全文、挂牌价、库存或完整 SKU 变体主数据。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- `product_category_name` = 610
- `product_name_lenght` = 610
- `product_description_lenght` = 610
- `product_photos_qty` = 610
- `product_weight_g` = 2
- `product_length_cm` = 2
- `product_height_cm` = 2
- `product_width_cm` = 2

时间覆盖（源本地时间，未擅自转 UTC）：
- 表内无独立业务日期字段；需经有定义的订单关系取得购买日期。地理/翻译/主数据无历史有效期，不能宣称已经覆盖某一连续时段。

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`3e6569628a17fbc75fd206ee357b59e20364b9afa90f5b6cd5b4d624c58aa9cc`

## olist_sellers_dataset.csv

字段（源拼写原样保留）：`seller_id`, `seller_zip_code_prefix`, `seller_city`, `seller_state`。

外键/引用：被 items.seller_id 引用；邮编前缀可对 geolocation 作覆盖检查。

可支持：卖家/州分层；没有卖家广告、成本或 SKU 库存。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- 全部字段的审计空值计数为 0；不保证内容语义完整。

时间覆盖（源本地时间，未擅自转 UTC）：
- 表内无独立业务日期字段；需经有定义的订单关系取得购买日期。地理/翻译/主数据无历史有效期，不能宣称已经覆盖某一连续时段。

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`1f643d2b950373b85735e7794b20986f528d7a000432e7c6f9bcbb44d0846a0e`

## olist_geolocation_dataset.csv

字段（源拼写原样保留）：`geolocation_zip_code_prefix`, `geolocation_lat`, `geolocation_lng`, `geolocation_city`, `geolocation_state`。

外键/引用：由客户/卖家邮编前缀条件关联。

可支持：地理参考；不能把前缀作为唯一键 join 后直接汇总金额。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- 全部字段的审计空值计数为 0；不保证内容语义完整。

时间覆盖（源本地时间，未擅自转 UTC）：
- 表内无独立业务日期字段；需经有定义的订单关系取得购买日期。地理/翻译/主数据无历史有效期，不能宣称已经覆盖某一连续时段。

无主键唯一性通过结论；完全重复行（首次之后）261,831，邮编前缀 19,015 个；不能擅自去重后覆盖源表。

源文件 SHA-256：

`b514f6fc991b9566aeba02aa5d67e2c3630f034b60a0e05aa0d082a3b66d88d6`

## product_category_name_translation.csv

字段（源拼写原样保留）：`product_category_name`, `product_category_name_english`。

外键/引用：被 products.product_category_name 引用。

可支持：中立的品类标签映射；不能作为跨商家商品身份映射。

缺失（列名=缺失记录数；未列出的字段在该审计中为 0）：
- 全部字段的审计空值计数为 0；不保证内容语义完整。

时间覆盖（源本地时间，未擅自转 UTC）：
- 表内无独立业务日期字段；需经有定义的订单关系取得购买日期。地理/翻译/主数据无历史有效期，不能宣称已经覆盖某一连续时段。

主键重复/冲突/空键：0 / 0 / 0；完全重复行（首次之后）：0。

源文件 SHA-256：

`a81f0d1f27b27e7293f761bc79e3ce8f348ee39c4b3ed3e49bde38f478586278`

## 时间、关系与缺失的关键解释

- orders 购买时间至 2018-10-17，不能把数据集常见“2018-08 结束”描述直接当文件实测终点。尾部有记录不代表首尾周期完整。
- 商品明细 shipping_limit_date 的最大值是 2020-04-09：这是源审计记录的发货截止字段异常/边界，**不是交易数据覆盖到 2020 年**。订单批准字段存在，但当前保留报告未给其独立 min/max；本轮不编造该范围。
- 原报告记录 carrier_before_purchase=166、delivered_before_carrier=23；缺失与顺序冲突保留，不能改状态/日期制造通过。
- orders→customers、items→orders/products/sellers、reviews→orders、payments→orders 的已审计子表外键未见孤儿。这不代表反向覆盖完整：购买状态订单无商品明细仍可触发经营窗口阻断。
- 客户邮编前缀未匹配 278 条、卖家 7 条；geolocation 前缀多行。州字段已存在，通常无需为了州贡献额外关联该大表。
- 品类缺失不能补零或借别家产品猜填。品类翻译不全与原品类为空需区分。
- raw 99,224 条评价全部进入 canonical。95,832 是 v1 “已交付且按既有规则选中有效评分”的订单分母，不是标准化后评价表行数。多评价选取和 delivered 筛选解释两种粒度差异；本轮不删评价使数字相等。
- 商品金额应先在商品行/订单层聚合，评价按现有排序选取；多支付、多评价和地理多重关系不得放大商品金额。

## 标准化三表
实际目录：[output/stage3/recheck/final/host-execution/runs/20261114T084934-ad36630a8772/prepare](../../output/stage3/recheck/final/host-execution/runs/20261114T084934-ad36630a8772/prepare/)。[字段映射](../../output/stage3/recheck/final/host-execution/runs/20261114T084934-ad36630a8772/prepare/field-mapping-report.json)；[标准化回执](../../output/stage3/recheck/final/host-execution/runs/20261114T084934-ad36630a8772/prepare/canonicalization-report.json)。

### orders.csv

输入 99441 行，输出 99441 行。字段：`order_id`, `customer_id`, `customer_state`, `order_status`, `purchased_at`, `delivered_at`, `estimated_delivery_at`。

字段映射：

- `order_id` ← `orders.order_id`
- `customer_id` ← `orders.customer_id`
- `customer_state` ← `customers.customer_state via customer_id`
- `order_status` ← `orders.order_status`
- `purchased_at` ← `orders.order_purchase_timestamp`
- `delivered_at` ← `orders.order_delivered_customer_date`
- `estimated_delivery_at` ← `orders.order_estimated_delivery_date`

缺失：

- `order_id`：0
- `customer_id`：0
- `customer_state`：0
- `order_status`：0
- `purchased_at`：0
- `delivered_at`：2965
- `estimated_delivery_at`：0

SHA-256：

`1747f6e4f0c84995e6c4c16bafb54eaa026ec98b6285073d467d39b9cc7a0515`

### order_items.csv

输入 112650 行，输出 112650 行。字段：`order_id`, `order_item_id`, `product_id`, `seller_id`, `category`, `price`, `freight_value`。

字段映射：

- `order_id` ← `order_items.order_id`
- `order_item_id` ← `order_items.order_item_id`
- `product_id` ← `order_items.product_id`
- `seller_id` ← `order_items.seller_id`
- `category` ← `products.product_category_name via product_id, translation English if available; otherwise retain original Portuguese or blank`
- `price` ← `order_items.price`
- `freight_value` ← `order_items.freight_value`

缺失：

- `order_id`：0
- `order_item_id`：0
- `product_id`：0
- `seller_id`：0
- `category`：1603
- `price`：0
- `freight_value`：0

SHA-256：

`ef23c7e07428ba5822bdca20da6db784697990b4ec28fc6620c677abb656729f`

### order_reviews.csv

输入 99224 行，输出 99224 行。字段：`review_id`, `order_id`, `review_score`, `review_created_at`, `review_answered_at`。

字段映射：

- `review_id` ← `reviews.review_id`
- `order_id` ← `reviews.order_id`
- `review_score` ← `reviews.review_score`
- `review_created_at` ← `reviews.review_creation_date`
- `review_answered_at` ← `reviews.review_answer_timestamp`

缺失：

- `review_id`：0
- `order_id`：0
- `review_score`：0
- `review_created_at`：0
- `review_answered_at`：0

SHA-256：

`c8457c0f22ecc31980f777b8e5ebb849b976af9167d3f5dc161be764b0e7cba3`

三表主键分别为 order_id、order_id+order_item_id、review_id+order_id；商品和评价仍通过 order_id 指向订单，商品中的 product_id/seller_id 是保留的源维度键。订单、商品、评价日期分别继承上文对应原字段；商品表本身不带订单日期，需关联 orders。source_timezone 为 source_local_unknown，不擅自换时区。

标准化回执 rows_removed=0、rows_imputed=0；这是“保留全部业务记录”，不是“保留全部原始字段”。以下差异对缺口判断尤其重要：

- 评论标题/正文在 raw 已存在，但 canonical 评论表只含评分和日期；**不需要从其他商家采评论填补**。
- 支付表、批准/交运日期、客户 unique_id、地理详细记录、商品物理属性留在 raw，当前三表未全部承载；属于“可复用原始字段”，不是外部数据缺失。
- canonical category 有 1,603 条商品明细为空；与 raw products 的 610 个产品品类缺失是不同统计粒度，不能要求数量相等。
- price/freight 原始十进制文本保留，现有计算以整数分/精确分数核验。没有币种转换或伪造退款。

## 已有结果与验证范围（引用，未重算）

| 指标 | 已保存独立值 | 口径 |
| --- | --- | --- |
| total_orders | 99441 | 全部订单数 |
| delivered_orders | 96478 | 最终 delivered 订单数 |
| amount_cents | 1322149811 | delivered 商品金额，整数分；不是购买订单金额或净 GMV |
| delivery_eligible | 96470 | 合法实际/预计日期的 delivered 订单分母 |
| late_orders | 6534 | 上述分母中实际交付日晚于预计日 |
| review_eligible | 95832 | 已交付且按既有选取规则有评分的订单 |
| low_reviews | 12273 | 上述评分≤2 的订单 |

七指标与九组聚合已有 SQL、JavaScript、Python Decimal/SQLite 证据；本轮核对输入文件/SQL/分析文件哈希后引用。经营商品金额与分解沿用 [operations.js](../../cloud/dist/operations.js) / [operations.sql](../../cloud/dist/operations.sql)，纳入 approved、invoiced、processing、shipped、delivered，按购买日期归属，排除 created/canceled/unavailable；不含运费及未知退款调整。

最近 Node24 回放：109 窗口中 76 个完成原 SQL/JS 互核，33 个受门禁阻断；独立 Python 只有 17/76 窗口、17,835/135,521 商品分解通过，其他因运行时错误未完成。不能将“数据已有”写成“全部指标和所有窗口已独立验证”。本轮不修改或重新执行该验证任务。

商品平均单价=金额/件数；订单平均商品金额=金额/去重订单数。product_id 并未证明是卖家 SKU/规格编码。价格效应只是算术分解，不能证明促销、广告、缺货或退款导致金额下降。

更多结论见 [指标缺口矩阵](BUSINESS_METRIC_GAP_MATRIX.md)、[外部源审计](EXTERNAL_DATA_SOURCE_AUDIT.md) 和 [获取方案](DATA_ACQUISITION_PRIORITY.md)。
