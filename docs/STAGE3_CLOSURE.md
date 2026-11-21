# 第三阶段收尾复现

本轮固定 Node 24.22.1（项目要求 >=22）与 Python 3.12.14，在获准的 Windows 主机环境完成。默认 PATH 的 Node 26 与隔离 Node20 均不作为本轮回放解释器。项目没有 npm dependencies；新增锁文件仅使 npm ci 可复现，不升级依赖。

先读取 [本轮结论](STAGE3_CLOSURE_RESULT.md)。真实数据、细项证据、完整日志只在本地 `output/stage3/recheck/final/`，该目录被 Git 忽略；正式公开案例不变。

以下 PowerShell 在仓库根执行，`$replayOut` 必须选择新的空目录。路径为本次实际环境，可在其他机器替换为已验证的 Node>=22/Python 可执行文件：

```powershell
$nodeExe='C:/Users/Zhang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$pythonExe='C:/Users/Zhang/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$npmCli='C:/Users/Zhang/OneDrive/文档/New project2/.tools/nodejs/node_modules/npm/bin/npm-cli.js'
$env:PATH=(Split-Path $nodeExe -Parent)+';'+$env:PATH
& $nodeExe -v
& $nodeExe $npmCli ci --offline
$replayOut='output/stage3/recheck/new-host-run'
& $pythonExe -X faulthandler scripts/run_stage3.py --stage all --out-dir $replayOut --node $nodeExe
if($LASTEXITCODE -ne 0){throw 'Replay failed; inspect run.json and execution.log'}
$state=Get-Content "$replayOut/stage-state.json" -Raw | ConvertFrom-Json
& $pythonExe -X faulthandler scripts/verify_backtest_isolated.py --data-dir $state.prepare.directory --backtest-dir $state.backtest.directory --node $nodeExe --out "$replayOut/independent-isolated"
if($LASTEXITCODE -ne 0){throw 'Independent verification failed'}
& $pythonExe scripts/review_stage3_final.py --root $replayOut --out output/stage3/recheck/new-review
```

`review_stage3_final.py` 对照保留的上一轮五个本地案例；如果这些文件缺失，应停止案例比对，不假造历史结果。`finalize_stage3_closure.py` 是本轮日志布局的结项检查器，不是通用部署命令。

浏览器回归依赖现有 Playwright 模块和 Edge。使用独立副本，复制 scripts、tests、cloud、package.json、package-lock.json、output/templates 并创建 output/analysis，防止 QA 输出覆盖正式案例；`scripts/test_stage3_final.ps1` 记录版本、命令、耗时和日志哈希。脚本不自动放宽运行权限、不跳过失败测试。

已确认受限环境的 localhost EACCES、临时目录 os.replace WinError650、锁文件及验收目录缺失；主机执行解决本轮复现需求。访问冲突底层原因尚未查明，不建议靠不断重试把失败隐藏。历史 JSON 解析异常本轮只读重复探测未复现，继续使用源哈希绑定的精简证据。

收尾仍要求业务人员完成五例审核并确认根因证据；当前不自动推送、合并或部署，也不提前实现第四阶段。
