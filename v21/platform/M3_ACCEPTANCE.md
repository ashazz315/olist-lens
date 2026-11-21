# M3 实施与验收记录（2026-11-15）

**结论：部分完成，不能宣告 v2.1 正式交付。** 已完成私有九表文件接入、来源登记、模型配置与连接测试接口、版本绑定的 PDF/Excel 导出；真实数据完整计算仍失败，未发布新的指标版本，也未部署应用。

## 1. M2 核对范围

只核对 `M2_ACCEPTANCE.md`、新增平台代码及已有测试记录。前台 `/`、后台 `/admin/`、API `/api/v1/` 使用同一现有 CloudBase PostgreSQL；真实数据与独立模拟分别使用 `olist_v21` / `olist_v21_sim`。M2 已有 GMV、商品贡献、五维诊断、调查任务与人工状态流转继续复用。

没有再次扫描 1,764 个基线文件。原仓库九个既有 tracked 修改保留，未提交 GitHub、未合并 PR。本轮只写隔离副本 `v21/platform/`。11 个冻结计算/前端文件与既有哈希一致，见 `evidence/m3-delivery-verification.json`；没有修改 `core.js`、`operations.sql`、默认监控规则或 `engine-process.cjs`。

## 2. 真实数据接入：部分验证

- 原始来源 Olist / Kaggle Version 2，CC BY-NC-SA 4.0，仅非商业历史分析。
- 九张本地 CSV 共 **126,186,995 字节**，SHA-256 与既有 provenance 一致。只做文件完整性比较，没有重复九表质量审计或下载。
- 九张文件全部上传到现有私有桶 `olist-v21-private`，以内容哈希为对象键，禁止覆盖；PostgreSQL 保存文件及任务元信息。不是把 CSV 暴露为公开下载，也不是九张原表逐行落入新的业务表。
- 批次 `ee17cf4d-be4c-4724-afcf-f48f16d05430` 已记录。因本地完整计算门禁失败，批次留下阻断日志并取消排队，释放单数据集锁；没有生成或发布不完整指标版本。
- 所有原 `current_versions` 保持一致。上传收据及逐文件哈希见 `evidence/m3-private-raw-upload.json`。
- 新增逐文件上传接口和原始九表导入入口；可复用已存对象、重试失败/取消批次。当前原始九表适配器只接受已审计的固定 Kaggle V2 哈希；其他来源修订必须先取得其可信来源记录，不能绕过校验。原标准三表导入保持可用。

## 3. 计算故障：未通过

固定 Node **v24.22.1**、串行执行，记录输入哈希、PID、阶段、内存采样、stdout、stderr、退出码。结果采用 `.partial → fsync → rename`，日志与计算结果分离；失败不切换有效版本。

| 尝试 | 结果 | 证据 |
|---|---|---|
| 第一次标准化 | 隔离副本默认 schema 路径不存在，普通退出 1；为包装器补充显式 `--schema` 参数 | `private/m3-real-20261115/normalize.*` |
| 显式 schema 标准化 | Python 原有转换器退出 3221225477，即 `0xC0000005`；没有生成三表 | `private/m3-real-20261115-b/normalize.*` |
| 已验证标准三表，Node PID 12648 | `core.validate` 完成；`core.analyze` SQL 执行返回 `Error: unknown error`，退出 1 | `private/m3-existing-canonical/engine.*` |
| 同一输入沙箱外，Node PID 13880 | 同样在 `core.analyze` SQL 执行失败，退出 1 | `private/m3-existing-canonical/engine-outside.*` |

后两次不是访问冲突退出码，不能混写为相同根因。阶段采样 RSS 约 411–422 MB，**不是进程峰值测量**。只能确认失败范围，尚未证明是 Node、WASM、系统或原始记录中的哪一项导致。没有改写计算核心或调整指标使结果通过，也没有循环重跑完整审计。

因此，本轮**没有新的全量指标独立复核成功结果**。当前页面和以下报告仍引用此前已验证的不可变版本：

`7e2cbd3659afc738653bc3faa33dda43adcb65f05f6b9e8c0b731850226353a9`

其基期为 2018-02-26 至 2018-03-05，当期为 2018-03-05 至 2018-03-12，均为左闭右开区间。购买订单商品金额 25,895,540 → 22,711,315 分，变化 -3,184,225 分；订单 1,881 → 1,633，件数 2,145 → 1,859。本轮仅确认页面和导出值一致，2,338 个商品贡献合计等于全店变化，**不冒充新一轮 SQL/JavaScript/Python 全量复算通过**。

## 4. 模型与报告

- 后台提供 Provider、Base URL、Model、API Key、Temperature、Max Tokens、Timeout 和连接测试；默认 DeepSeek。
- 服务端 AES-256-GCM 保存密钥；读取与保存响应只返回公开配置，不返回密钥或密文。地址限 HTTPS 提供方白名单；禁止重定向。配置变化清除旧连接成功状态。
- 真实账号验收确认尚未配置模型密钥；连接测试返回明确未连接。规则诊断保持明确标识。真实模型业务调查的十项场景**尚未执行**，单元测试中的模拟提供方不计为真实调用。
- PDF 三页及指定十工作表 Excel 已生成、读取核对并渲染检查；同一 report ID 绑定一个版本、快照 SHA 和该版本的任务，不混入其他版本任务。请求旧版本时返回 409；匿名导出返回 401。
- 真实样本报告：`evidence/m3-live/olist-historical.pdf`、`olist-historical.xlsx`。这些是旧有效历史快照的正式格式导出，不是 M3 新数据计算成果。
- 报告包含真实支持的经营与 SKU 数据；缺营销、流量、转化、Olist 库存时显示缺口。独立模拟必须切换工作区后单独导出。履约仍受 M2 已物化数据范围限制；没有为所有商品补造履约明细。
- 本机 Excel 导出目前使用 Codex 提供的 artifact-tool；PDF 使用 reportlab 和本机可嵌入中文字体。**云端报告运行时、字体及依赖可分发性尚未验收，不能把本机导出通过等同于云端导出通过。**

## 5. 测试结果

| 项目 | 结果 | 证据 |
|---|---|---|
| 平台与业务闭环回归 | **44/44**；含新增 8 项原始导入、模型配置和报告约束测试 | `evidence/m3-run-m3-regression-124223.json` |
| 真实账号、PG 已发布版本、报告 HTTP 检查 | **7/7** | `evidence/m3-live/result.json` |
| 真实浏览器：登录、GMV、SKU、PDF/Excel、导入页、无密钥状态、移动端 | **7/7**；页面错误 0 | `evidence/m3-browser/result.json` |
| 导出独立读取 | 10 工作表、2,338 SKU、贡献合计正确、PDF 3 页 | `evidence/m3-delivery-verification.json` |
| 冻结文件 | 11/11 哈希一致；不重复全项目扫描 | 同上 |
| 本轮全量真实计算 | **失败** | 第 3 节 |
| 新版云端端到端 | **未执行** | 发布门禁未通过 |

首次回归有两个本地 HTTP 检查被沙箱 `EACCES` 阻止；取得执行权限后串行重跑通过，没有修改业务代码迎合该错误。一次直接启动的报告测试静默退出 1，后续由保留 PID/stdout/stderr 的执行器通过。报告首次遇到新增/消失商品的空分解对象，已修正为“不适用”，没有制造价格效应。

单元测试及既有模拟闭环数据明确标记 SYNTHETIC，仅存隔离测试区域；本次真实快照和九表导入均 `is_synthetic=false`。

## 6. 云端发布：未完成

现有环境 `sy-d2g7eacoh8e6c1fae` / `ap-shanghai`、共享 PG 正常；检查时体验套餐额度 3,000，已用 154.86，超额开关关闭。现有两个云函数属于其他项目，未改动；没有创建定时任务。

查询 `olist-lens` 云托管服务返回 Server not found；完整云托管列表仅有 `roadinsight-workbench`。静态托管存在不等于 Olist 后端已经存在。不能把其他项目服务替换成 Olist。见 `evidence/m3-cloud-preflight.json`。

没有创建环境、购买资源、升级套餐或提交应用部署。新版前后台/API 云地址尚无可交付项；旧公开版本未改。后续还需核实 Olist 实际托管类型、新后端配额和计费、长效服务凭证、Node24/报告运行时、私有文件恢复及实际公网权限，再备份旧版本、发布并验收。

本地开发服务凭证原有效期为 2026-11-16 11:11:16 +08:00，不能作为长期生产凭证。模型密钥、GA4 授权仍缺失。

## 7. 修改清单

已有平台文件：`server.cjs`、`lib/imports.cjs`、`lib/model-config.cjs`、`public/app.js`、`Start-platform.ps1`。

新增：`lib/raw-olist.cjs`、`lib/reports.cjs`；`contracts/` 中既有来源与 schema 的副本；`tools/m3-*`、`tools/run-m3-check.py`、`tools/report-pdf.py`、`tools/report-xlsx.mjs`；`tests/m3.test.cjs`、`tests/m3-live.cjs`、`tests/m3-browser.cjs`；本报告、使用说明及 evidence。原始 CSV、正式案例、旧计算引擎及 Fulfillment Flow 均未修改。

## 8. 剩余发布门禁

1. 定位并消除真实标准化及 SQL 全量计算失败；保留当前数据版本，仍不擅改核心口径。
2. 九表批次完整运行、独立复核、新版本原子发布及回滚实测；补齐全 SKU 履约结果。
3. 云端 Node24、报告依赖/字体、服务凭证、配额、实际 Olist 服务路径与备份确认。
4. 云端应用部署和真实前后台/API/报告端到端验收。
5. 有密钥后执行真实模型十项调查场景；GA4 未授权继续独立模拟。

已完成测试不等于业务改善，也不构成 M3 正式发布。管理员及业务使用、回滚边界见 `M3_USER_GUIDE.md`。
