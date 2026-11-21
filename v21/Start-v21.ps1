$ErrorActionPreference = 'Stop'
$nodeExecutable = $env:LENS_NODE_EXE
if (-not $nodeExecutable) {
    $nodeExecutable = Join-Path $env:USERPROFILE 'OneDrive/文档/New project2/.tools/nodejs/node.exe'
}
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Set LENS_NODE_EXE to the locally tested Node 26.4.0 executable.' }
$runtimeVersion = & $nodeExecutable --version
if ($runtimeVersion -ne 'v26.4.0') { throw "Expected locally tested Node v26.4.0; found $runtimeVersion. Validate another runtime separately." }
Write-Host 'Olist Lens v2.1 - local historical investigation workspace'
Write-Host 'Open http://127.0.0.1:8791 . No deployment or scheduled collection.'
& $nodeExecutable (Join-Path $PSScriptRoot 'server.cjs')
