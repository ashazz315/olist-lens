# 上下文与 M0 恢复

2026-11-15。只读来源：相邻工作区 `olist-stage3`。本开发在 `olist-v21/v21` 继续，原工作区有未提交文件，未 reset、clean、覆盖或合并。

开始时读取 V2_DESIGN、V2_STAGE2、V2_ACCEPTANCE、V2_STAGE2_ACCEPTANCE、MONITORING_AUDIT、FEATURES、CHANGELOG。GitHub 只读核验 main 为 24c6b112c4d180ade6d7540309e9f4f0aa621190；PR #1 draft/open/unmerged，不代表审计完成。原本地分支 stage3-real-data-audit，HEAD d99e866，PR 快照头 d466911。最终保护检查以本轮原目录 1,764 文件 SHA-256 清单为准，包含原 1,727 文件及 M0 后续交付物，不将数量不同误判为丢失。

## 实际找到的交付物

原目录 `output/external-data/`：

- external_data_acceptance_report.md
- acquisition_manifest.json
- ga4_data_audit.md
- inventory_data_audit.md
- advertising_data_audit.md
- cross_source_compatibility.md

原文件在 `external_staging/inventory`、`external_staging/advertising`，manifest 中保存发布页、下载回执、许可和获取时间。适配器逐文件核对已有发布文件 SHA-256，未再下载或覆盖。

| 文件 | 实际行数 | SHA-256 |
|---|---:|---|
| retail_inventory_ml_apl.csv | 284755 | c765678a26c2d024e8300b8f5b4a67cb2e2bde6e24213f202914557d000ce37d |
| retail_sales_ml_apl.csv | 125751 | da4763939baed1f46bfca7e893f9512a0294544494b1e794e5b8f2c59efbd2a1 |
| Coffeeshop_Personalization_Campaign_Data.csv | 1872 | 9b0bc4b5f074255c51fb71943662c0eca9d42580d3b42c66faaa9effd3b0031f |

广告实际 36 活动，发布者描述的 24 活动与文件不同。库存和广告真实性只有发布者声明，哈希吻合仅证明下载内容一致，不证明商业系统真实性。

Olist 使用原阶段三 canonical 三表：99,441 订单、112,650 商品明细、99,224 评价，既有来源记录为 Kaggle Version 2，CC BY-NC-SA 4.0，Olist 归属保留。本轮不重新冒称完成九表审计或独立 Python 全量回测。上一阶段商品独立复核仍只有 17/76 窗口完整回执，其余运行故障和五例业务审核未由本轮解决。

交运补充字段来自同份官方原始 orders，SHA-256 为 8df58ef3d2d7e9944010f7beecd9b75367f5588ec6e3c91cec19ae3345ef9ecf。order_id 一对一匹配 99,441/99,441，状态、购买和交付时间逐行与 canonical 对照；缺交运日期 1,783 行保留为空。该补充映射不进入原指标引擎。人工上传的新批次若未提供对应补充数据，显示未提供，不能沿用旧日期。

Fulfillment Flow 仅只读参考证据约束和独立 API 适配思路，未修改、未合并。没有借用其他项目访问 token 作为模型凭据。
