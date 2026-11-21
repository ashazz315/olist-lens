param([ValidatePattern('^\d{4}-\d\d-\d\dT[0-9Z-]+$')][string]$AcceptanceRun)
$ErrorActionPreference='Stop'
$runtime = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies'
$node = Join-Path $runtime 'node/bin/node.exe'
$env:LENS_PYTHON = Join-Path $runtime 'python/python.exe'
$env:LENS_ARTIFACT_MODULE = Join-Path $runtime 'node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs'
if ($AcceptanceRun) {
    & $node (Join-Path $PSScriptRoot 'local-replay.cjs') $AcceptanceRun
} else {
    & $node (Join-Path $PSScriptRoot 'local-replay.cjs')
}
