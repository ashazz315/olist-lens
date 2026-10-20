# 云端部署

目标网址：https://olist-lens-operations.redgoby7.chatgpt.site

访问范围：public。平台已确认发布成功；普通浏览器正常打开产品，并以 credentials: omit 请求验证匿名 HTTP 200、返回本应用，无需登录。

首次发布时间：2026-10-19 20:07:50；窄屏排版修复发布于 20:17:08（Asia/Shanghai）。

- Site：appgprj_6ad600cab19081918e9a41a7e87244e3
- 当前保存版本：appgprj_6ad600cab19081918e9a41a7e87244e3~appgver_ddbbd8f2f5c881918617df1fe2b3933d
- 当前部署：appgdep_6ad60a3e3b008191bc905c0e213e8b26
- 精确源码提交：90aacf10e1ecdef11e6229d6452ad395f653d54d
- 案例数据版本：ab7a405f82b7cf35559a7bea

普通浏览器已经核验页面与公开下载。独立无头浏览器和 Python HTTP 客户端触发 Cloudflare 403，不能将其误读为 Site 私有。BrowserSkill 的文件 URL 权限不足，未在普通浏览器会话里重做文件附件操作；完整浏览器导入与回滚已在本地真实 Worker 验收，云端代码来自同一已验证提交。

最终窄屏修复：1440、1024、838、768、390、320 像素均核对金额单行显示、不溢出；未更改数据口径。最终普通浏览器再次核验匿名入口与新版 CSS 返回 HTTP 200。

发布源仓库已推送并核验；Windows 缺少 Bash，官方打包入口无法启动，改用相同的官方 prepare-site-build.cjs 检查／暂存，再以 tarfile 生成同结构归档，平台成功接收并部署。

实现：静态 Site；公开案例为已校验快照；访客导入在本机 Worker 执行并保存在 IndexedDB，不使用共享服务端业务数据。
