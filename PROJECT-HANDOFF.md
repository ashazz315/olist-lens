# Olist Lens v2.1 项目交接

整理于 2026-11-20（北京时间）。项目用于 Olist 历史电商分析、异常调查和独立模拟回放。

## 选择交接包

| 文件 | 用途 | 内容 |
| --- | --- | --- |
| `Olist-Lens-v2.1-Local.zip` | 换 Windows 账号、换电脑、本机继续开发 | 当前源码、开发与迁移说明、已验证 Olist 分析快照、独立模拟演练和示例报告 |
| `Olist-Lens-v2.1-Source.zip` | 交给开发者、新建 GitHub 仓库、准备腾讯云迁移 | 当前源码、测试、迁移 SQL、启动器和容器入口。真实分析快照、运行状态和本机私有配置单独保管 |
| `SHA256SUMS.txt` | 校验运输完整性 | 两个 ZIP 的 SHA-256 |

本机包从当前开发工作区打包，包含检查点 `dbcf982cba16e99bba8b74fc16d7d86f6bca95d0` 之后的 BI、调查助手和页面改动。解压到该账号自己的文档或开发目录，使用自己有写权限的副本。两个 ZIP 各有顶层目录 `Olist-Lens-v2.1`。源码包也可以与本机包分别解压，用于区分开发与分发。

## 本机运行

安装 Windows x64 的 Node.js 24 和 npm。验收使用 Node v24.22.1，启动器接受 24.x。多套 Node 并存时用 `-NodePath` 指向其中的 Node 24。解压本机包后，在顶层目录打开 PowerShell。 [Node.js 官方下载](https://nodejs.org/en/download)

### 快速查看历史看板

```powershell
.\Start-Local.ps1 -PreviewOnly
```

浏览器打开 [业务前台](http://127.0.0.1:8794/)。只读模式可查看周度趋势、异常贡献、商品履约、独立模拟和规则调查。该模式只需 Node，启动后可离线查看，数据来自包中已验证的快照。

### 启动可登录的开发环境

Windows 内嵌 PostgreSQL 的完整模式请用当前账号可写的 ASCII 路径，例如 `D:\Projects\Olist-Lens-v2.1`。本机实测中文版 Windows 在含中文的路径下无法初始化该数据库；只读预览已在中文路径通过。

```powershell
.\Start-Local.ps1 -Install
# 后续启动
.\Start-Local.ps1
```

首次安装通常需要访问 npm。启动后在 [管理后台](http://127.0.0.1:8794/admin/) 登录。启动器在此副本的 `v21/platform/private/local-replay/local-accounts.json` 生成两个独立账号的密码，用户名为 `local-admin` 和 `local-analyst`。密码文件仅在所属账号自己的副本中查看。不同副本占用同一端口时加 `-Port 8795`。在终端按 Ctrl+C 停止服务。

新副本会建立新的本机 PostgreSQL，登录后可继续做独立模拟导入、发布、调查和人工复核。已保存的真实历史快照会直接显示；本机模式中的真实历史为只读。模拟样例带原验收证据和示例报告，新的个人任务、发布记录和模型配置保存在此副本的私有目录。旧机器的任务数据库、登录密码、服务令牌和模型密钥留在所属账号的保管范围内。

在业务前台切换到「独立模拟场景」。管理员可到「导入与发布」载入模拟下滑模板，或在「回放调度」安排新批次。计算完成后须人工确认发布。接入 DeepSeek 时，到「模型连接」录入本账号的 API Key 并验证连接，规则调查可离线使用。

网页与 JSON 报告可由现有平台生成。动态 PDF 需要 Python、`reportlab` 和可嵌入的中文 TrueType 字体（`LENS_PYTHON`、`LENS_PDF_FONT`）。动态 Excel 需要可用的 `@oai/artifact-tool` 模块（`LENS_ARTIFACT_MODULE` 指向入口）。本机包提供已验收的独立模拟 PDF 和十表 Excel 作为参考。

## 给下一位开发者

| 位置 | 维护内容 |
| --- | --- |
| `v21/platform/public` | 前台、后台、BI、规则问答与悬浮助手 |
| `v21/platform/server.cjs`、`v21/platform/lib` | API、权限、可用快照、导入、调查、报表与调度 |
| `cloud/dist`、`v21/lib` | 已验证的经营口径、SQL、监控规则及标准化流程 |
| `v21/platform/cloudbase/migrations` | 数据库及私有文件接口迁移顺序 |
| `v21/platform/tests` | 平台和浏览器验收脚本 |
| `docs/V2_1_PAGE_REVIEW.md`、`docs/V2_1_REPLAY_ACCEPTANCE.md` | 页面组织和历史回放验收背景 |

常用回归从根目录执行以下命令。浏览器测试还需要 Playwright Core 和 Edge，历史浏览器脚本沿用其各自的验收前置数据。

```powershell
node --no-opt --test v21/platform/tests/platform.test.cjs v21/platform/tests/m2-modules.test.cjs v21/platform/tests/workflow-api.test.cjs v21/platform/tests/investigation-agent.test.cjs
```

优先复用现有指标和规则。真实九表全量重算仍有稳定性待验收项，交接使用原已验证快照。GA4 尚需授权，模拟流量、广告与复核结果属于独立案例。数据来源为 [Olist Brazilian E-Commerce Public Dataset Version 2](https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce)。历史衍生快照按来源所列 CC BY-NC-SA 4.0 保留归属和用途条件。

## 上传到自己的 GitHub

使用源码包，解压后用目标账号或组织新建仓库。先核对仓库所有者和 `git remote -v`。如果目标已存在或有提交历史，在该仓库的新分支中导入并审阅差异。下列命令适用于空仓库。 [GitHub 官方导入指南](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

```powershell
git init -b main
git add .
git status --short
git diff --cached --stat
git commit -m "Import Olist Lens v2.1 handoff"
git remote add origin <你核对过的目标仓库地址>
git remote -v
git push -u origin main
```

保留 `.gitignore` 和包分界。公开仓库应持续排除私有快照、原始 CSV、账号、数据库、日志、密钥和 `.env`。本机包仅供经授权的本地交接。

如需核对传输结果，用 `Get-FileHash -Algorithm SHA256 .\Olist-Lens-v2.1-Local.zip` 或对源码包运行同一命令，与 `SHA256SUMS.txt` 对比。

## 腾讯云迁移选择

- **静态展示**适合独立历史案例。旧版页面位于 `cloud/dist`，其案例数据需要按源许可单独审核。
- **完整平台**以源码包的 Dockerfile 和 `portable/start-cloud.cjs` 作为 CloudBase 容器型云托管入口。容器默认端口为 `8080`，云托管需配置同一端口，并使用目标账号自己的环境。 [CloudBase 部署方式](https://docs.cloudbase.net/run/deploy/deploy/introduce) · [容器端口与入口](https://docs.cloudbase.net/run/deploy/configuring/environment/containers)

迁移完整平台时，先在目标测试环境核对 PostgreSQL、身份认证和私有存储是否可用。审阅迁移 SQL 后按文件名顺序执行，完成应用角色和服务端密钥配置，再通过受控导入发布该环境的数据。

| 配置 | 用途 |
| --- | --- |
| `LENS_CLOUDBASE_ENV` | 目标 CloudBase 环境 ID |
| `LENS_DATABASE_TOKEN` | 对目标 Olist 接口授权的服务端凭据 |
| `LENS_PUBLIC_ORIGIN` | 实际访问的单一 HTTPS origin，如 `https://your-app.example` |
| `LENS_SECRET_KEY` | 可选，启用模型配置时使用的独立 32 字节十六进制密钥 |
| `PORT` | 容器监听端口，默认 `8080` |

以目标 URL 的健康接口、实际登录、权限、有效版本读取和版本回滚为验收依据。当前交接验证在本机完成。容器配置需在目标环境验证，浮动助手的本机预览和本机回放调度采用本地入口，云端需按现有权限与发布流程分别验收。
