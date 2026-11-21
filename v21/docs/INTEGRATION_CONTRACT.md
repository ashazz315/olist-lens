# 数据适配与关联契约

## 存储、版本和失败恢复

`runtime/attempts/<id>` 保存每次请求和上传文件；`runtime/v/<短前缀-尝试前缀>` 存不可变 raw、来源 manifest、标准化 SQLite、analysis 和 version.json。元数据版本 ID 是完整 SHA-256，绑定来源、各文件哈希、manifest、适配器版本和交运补充来源。目录缩短只为避免 Windows SQLite 长路径限制，不缩短证据中的完整哈希。

SQLite 事务内发布候选和 current 指针；失败、取消、复算不一致都不更新有效版本。服务重启将 running/queued 标为 interrupted，需明确重试；单写入进程锁保护运行中的工作区。相同内容和契约重复导入复用版本，监控事件继续使用原 monitor-store 去重。改了数据或来源说明形成修订版本，记录 revision_of，不删旧版本。

手动上传必须含实际命名 CSV、来源 manifest、is_synthetic=false、有效提取时间；修订要求 revision_note。来源 URI 必须匹配命名空间，不接受将另一商家改标签混入 Olist。该声明和文件校验不能独立证明业务真实性。内部测试用例明确标为 SYNTHETIC，保存在临时目录，不能进入正式工作区。

原 core、operations、monitoring、SQL 文件不改。原引擎质量门禁及 SQL/JS 核对通过后才能发布 Olist；外部数据可以 limited 状态保留真实警告，但不得进入 Olist 异常计算。冻结阈值，没有为展示下滑调参。

## 字段映射与粒度

完整机器可读映射保存在 `lib/adapters.cjs` schemas 及每个版本 summary.tables.*.mapping，包含每个字段来源和转换类型。金额为十进制定点 1e4 整数字符串，适配过程中用 BigInt；原 Olist 金额仍为整数分。显示格式不用于算术复核。

| 表 | 关键字段映射 | 实际粒度/候选键 |
|---|---|---|
| 库存 | Product No→product_id; Store→store_id; Start/End Date→start/end; Qty on hand→quantity | 商品+门店+起止区间；不是日库存 |
| 销售 | Transaction Date→date; Qty Sold→quantity_1e4; Sales Amount→amount_1e4; Is Return→is_return | 商品+门店+日期+销售类型+退货标记+供应商+渠道+退货原因 |
| 广告 | Campaign_ID→campaign_id; Date→date; Spend→spend_1e4; Conversions→conversions; Funnel→funnel | 活动+日期，文件为周级样本 |

库存 9999-12-31 保留 raw_end，标准结束日为空，不能当作未来覆盖。1,380 条负库存、13,869 条零数量单独标记；零不自动代表缺货。成本恒等式不一致保留问题记录，禁算利润。库存开始日范围不能当成业务全集时间覆盖。

广告源文件确实含 **CTR、ROAS 报告值**，但是没有曝光、点击、归因收入，无法复算；源值保留在 raw，标准化 verified 指标为 null，不显示为经过验证的 CTR/CPC/ROAS。缺活动状态、币种和商品映射时同样为 null。Funnel 为活动标签，不能推算消费者路径。586 行零转化却有正 ROAS 作为问题样本保留。

## 关联兼容性

| 来源对 | 主体/键 | 关联处理 |
|---|---|---|
| Olist canonical→同源原始 orders | 同版本 order_id；99,441 一对一 | 只补充交运/批准日期；逐行复核对应状态与日期 |
| Olist→GA4 | 不同商家，无已验证共同商品键 | 禁止 JOIN；未取得授权/导出 |
| Olist→零售库存/销售 | 不同商家，无共同主键 | 禁止 JOIN |
| Olist→广告 | 无商品 ID 或活动映射 | 禁止 JOIN |
| 零售销售→库存 | 发布者声明同源 Product No+Store，销售日期落在库存区间 | 仅兼容性诊断；区间端点语义未确认，不发布联合业务指标 |

以包含两端的区间假设检查：销售 125,751 行；匹配 92,591，未匹配 33,160（其中商品门店对缺失 2,717）。不得把未匹配填零。兼容接口返回 inner/left join 假设行数、匹配率、最大匹配数和多匹配销售行数；实际回执见浏览器验收 join-matrix.json。Olist 跨商家没有执行 JOIN，成功率显示不适用而不是 0% 或虚构成功率。

## 证据与复核

E1 两期全店，E2 商品贡献，E3 五维商品诊断，E4 基线与抑制，E5 缺口与反证。证据绑定完整版本、源哈希、计算版本、事件 ID 和证据包哈希。商品履约用 distinct order_id，评价按原有效评分与最新回答/创建/ID 顺序选择关联订单评价；多商品订单不推断单件商品责任。

模型仅收服务端证据，不能调用业务写入动作。报告十个固定分区，引用只能来自 E1–E5；文字禁止生成数字，数字从只读证据展示。形式校验不能证明推理真实，因此必须人工语义审核。当前不发送人工附件正文给模型，附件作为人工处理依据。

复核要求新来源事实版本、相同主体/币种、通过质量门禁、提取晚于执行、等长且不重叠的后续周期。相同历史文件换窗口不能证明效果。观察变化始终 causal_effect_confirmed=false；本机自报负责人不是企业身份认证。
