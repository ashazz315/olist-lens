# Olist Lens v2.1 — M1 平台与业务闭环开发批次

日期：2026-11-15。状态：本批次实现并通过下列限定验收；不代表整个 v2.1 已完成生产验收。

## 实际交付

- 在隔离工作副本 `work/olist-v21/v21/platform` 新增后端、业务前台、管理后台、迁移与测试。原项目工作区及既有未提交成果保留。
- 复用已有 CloudBase 环境 `sy-d2g7eacoh8e6c1fae`。新增独立 PostgreSQL schema `olist_v21`、13 张表、4 个迁移和私有存储桶 `olist-v21-private`。未新建环境、购买资源、部署公开应用、提交 GitHub 或合并 PR。
- 按用户授权创建应用账号 `zhang`，绑定 Olist admin。认证由 CloudBase 验证；应用角色不会修改其他项目角色。初始凭据只保存在 `private/initial-admin.json`，不写入报告或页面源码。
- 登录会话由后端保管；提供 admin/analyst 权限、CSRF 与来源检查、私有文件访问隔离。13 张业务表启用 RLS，匿名和普通认证角色不能直接操作业务表，服务端通过专用 RPC 访问。
- 数据集级任务锁、执行租约、失败重试、原始文件哈希寻址、不可变版本/快照、发布事务和当前版本 CAS 检查。运行中取消须等工作进程确认，不能立即释放数据集锁。租约到期恢复需显式请求，未部署后台调度。
- 经营总览、商品负向贡献排序、商品诊断、独立库存/广告查询、流量/转化接入状态、调查任务和 JSON 导出。既有指标引擎与默认规则未改。
- 调查任务支持人工审核、措施、执行记录、复核和重新打开；API 将操作者绑定到登录身份。没有后续合格真实版本时保持未验证，不能关闭为已验证改善。
- 模型配置使用服务端加密密钥、固定 HTTPS 提供方白名单、证据与版本绑定。未配置真实模型，调用明确返回“模型未连接”；隔离测试中的模拟提供方不用于正式展示。

## 云端迁移及代码清单

| 新增文件/目录 | 用途 |
| --- | --- |
| `cloudbase/migrations/20261115120000_olist_platform.sql` | 初始数据结构、权限、任务和发布事务 |
| `cloudbase/migrations/20261115121000_publish_qualification.sql` | 修复新发布函数的 SQL 名称歧义 |
| `cloudbase/migrations/20261115122000_private_files.sql` | 私有文件桶及文件登记 RPC |
| `cloudbase/migrations/20261115124000_cancellation_marker.sql` | 取消请求标记、确认和恢复 |
| `server.cjs` | 独立 API、认证、权限与静态页面入口 |
| `lib/cloud.cjs` | CloudBase 认证、RPC 和会话 |
| `lib/imports.cjs`, `lib/blob-cloud.cjs` | 完整快照导入、私有对象、重复版本复用与既有引擎桥接 |
| `lib/baseline.cjs` | 已验证结果读取、商品诊断和证据包 |
| `lib/model-config.cjs` | 模型配置加密、调用适配与未连接状态 |
| `public/` | 独立业务前台、管理后台、响应式布局 |
| `tests/` | HTTP、业务状态机、PostgreSQL 回滚测试与真实浏览器验收 |
| `tools/` | 连接验证、已有结果投影登记、私有存储/重复批次与文件保护验证 |
| `Start-platform.ps1`, `.gitignore` | 固定 Node 24 启动和本地私密文件排除 |

依赖沿用现有安装。未修改 `core.js`、`operations.sql`、`monitoring.js` 或 `engine-process.cjs`。实际源码清单及 SHA-256 见 `evidence/code-manifest.json`。

## 数据与已执行导入

登记的是此前已验证的真实历史计算结果，未重新解析九表或计算指标。三个来源独立存储：

| 来源 | 云端当前版本 | 状态与边界 |
| --- | --- | --- |
| Olist | `7e2cbd3659afc738653bc3faa33dda43adcb65f05f6b9e8c0b731850226353a9` | 既有已验证结果，历史回放 |
| 库存/销售 | `16e7ebf515713ff0b6fa27e421a5a01fa20569cf26facf3839af9a29ad93e3dd` | limited；负库存、时间覆盖、成本问题保留 |
| 广告 | `985ee3adb825f0ff2af1fa5c2d97d1c253119105418860c4caf2c52a2f03170b` | limited；提供方声称真实，尚未独立证实真实性 |

登记回执：`evidence/baseline-import.json`。Olist 原分析 JSON SHA-256 为 `27182dcd62e3c918d08c72855c29de70490e33a27d592cc23ed91ff8752ac6c2`。为展示提取约 4.3 MB 的已有结果，保留指标、贡献维度、已验证聚合、事件和来源；冗长逐项监控评估仍保留在原文件。不是重新生成计算结果。

广告 CSV 已在本批次的重复导入验收中上传到私有哈希对象，SHA-256 为 `9b0bc4b5f074255c51fb71943662c0eca9d42580d3b42c66faaa9effd3b0031f`。连续两次建立候选都复用原版本，未调用引擎，随后取消候选，未重新发布。详见 `evidence/real-duplicate-import.json`。

其余原始 CSV 仍保留本地，并未全量迁移到云端；库存和广告明细目前查询本地已生成的只读 SQLite。没有将独立来源与 Olist 商品 JOIN。广告原有报告 CTR/ROAS 不作为可核验指标，缺少曝光、点击及收入时不重算 CTR/CPC/ROAS。GA4 仍需授权。库存成本不能用于利润计算。

商品履约页面仅复用了已保存、版本匹配的一份商品证据；其他未物化商品明确显示尚未准备，打开页面不会偷偷触发完整计算。

## 测试结果

| 验证项 | 实际结果 | 证据 |
| --- | --- | --- |
| 新平台及既有工作流隔离回归 | 27/27 通过，全部标记为内部合成测试 | `evidence/tests-final.txt` |
| 真实 PostgreSQL 事务测试 | 权限/RLS、锁、单次领取、质量门禁、原子发布、版本不可变、告警去重、取消/恢复通过；事务回滚 | `tests/postgres-regression.sql`, `evidence/postgres-regression.json` |
| 回滚后检查 | 测试任务和测试审计记录均为 0；3 个当前版本保留 | `evidence/cloud-final-state.json` |
| 真实账号与数据库连接 | CloudBase 登录、身份校验、Olist admin、RPC 通过 | `evidence/cloud-connection.json` |
| 私有对象 | 上传、读回哈希、重复保护、匿名读取拒绝通过 | `evidence/private-storage.json` |
| 已获取广告文件重复导入 | 2 次复用同一版本，0 次引擎调用，当前版本未变化 | `evidence/real-duplicate-import.json` |
| 真实浏览器 | 11 项通过，0 脚本错误；桌面、390/320px 页面检查 | `evidence/browser-2026-11-15T03-26-03-458Z/results.json` |
| 原成果保护 | 1,764 个原基线文件内容无变化；11 个冻结文件哈希一致 | `evidence/protection-final.json` |
| 固定 Node 24 订单 validate 串行检查 | 3/3 正常退出，约 0.509/0.509/0.511 秒，记录 PID/输入哈希/内存 | 根工作区 `output/access-violation-diagnosis-20261115/resume-node24-{1,2,3}/` |

浏览器使用既有 Playwright 和隔离 Edge，不操作用户的个人浏览器资料。截图包含 `business-desktop.png`、`sku-desktop.png`、`admin-imports-desktop.png`、`business-mobile.png`。浏览器验收未代用户批准真实业务原因或执行行动。

订单 validate 检查只读取固定订单 CSV，关联表以表头隔离，因此有预期的关联数据缺失质量错误。这是进程稳定性检查，不是全量数据质量或完整计算通过的证明。

## 修复记录与仍需验收的限制

已修复本批次发现的：新 SQL 发布函数名称歧义；取消运行任务过早释放锁；相同数据重复运行没有复用已登记版本；移动端宽表整页溢出；未认证上传在鉴权前读取大请求体。修改均限制于新增平台代码。

仍未完成或不能据此宣称完成：

1. **Windows 原生退出根因未定。** 订单最小验证 3 次通过，但注册大体积旧分析 JSON 的 Node 进程另一次出现 `-1073741819`，空 stdout/stderr，未进入原计算引擎、未创建数据库任务。证据在 `evidence/result-registration-crash.json`。改由 Python 标准库读取已存在结果供页面开发；这不等于修复 Node 或证明完整计算稳定。保留失败脚本取证，不要重复运行 `tools/import-verified.cjs`。
2. **全量真实数据计算、上传后的完整 Olist 计算闭环尚未重新验收。** 目前验证到失败隔离、重复复用、保存和发布边界；不改原引擎。
3. **后端仍在本机运行。** 已有共享数据库和私有文件服务，但未部署 Olist 云端后端。库存/广告查询仍依赖本地已有派生数据库，完整原文件迁移、全部商品履约物化、云端运行包仍待完成。
4. **会话为单进程内存会话。** 重启后需重新登录，多实例会话和生产 HTTPS/反向代理尚未部署。
5. **开发服务凭据有期限。** 本批次专用凭据到期时间为 2026-11-16 11:11:16 +08:00；到期后需按安全流程更新私有配置。不要把 `private/` 上传 GitHub 或复制到静态托管。
6. GA4、真实 LLM、自动采集和后台调度未接通，页面明确显示状态。没有后续真实可比数据，效果复核保持未验证；不声称行动产生了改善。
7. 当前提供 JSON 导出；PDF/Excel、角色编辑与版本恢复的完整管理页面、告警独立状态操作页面尚待补齐（部分底层 API 已存在）。页面无自动定时刷新冒充后台任务。
8. 数据提供方的真实性说明和广告字段不一致仍需人工复核。历史数据演示不等于实时监控或企业实际净 GMV。

下一批优先完成管理端剩余操作、可移植数据读取和全量商品已验证证据物化，再单独验收计算可靠性；GA4/模型接入依赖实际授权。保持原始引擎和数据边界，未完成项不通过补数或规则模板伪装。

## 本地使用

在 PowerShell 运行 `./Start-platform.ps1`，使用固定 Node v24.22.1。前台 `http://127.0.0.1:8792/`，管理后台 `http://127.0.0.1:8792/admin/`。账号 `zhang`，初始密码查看本地 `private/initial-admin.json`，不要粘贴到公开问题、截图或提交。

不配置云端凭据时可用 `-ReadOnlyPreview` 查看本地已验证结果；预览不会允许数据和调查状态写入。当前运行凭据只在后端读取。

官方实现依据：[CloudBase PostgreSQL 数据权限](https://docs.cloudbase.net/database/postgresql/data-permission)、[PostgreSQL 文件存储 API](https://docs.cloudbase.net/http-api/storage-pg/pg-storage-api)。
