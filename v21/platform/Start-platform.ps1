param([switch]$ReadOnlyPreview)
$ErrorActionPreference='Stop'
$nodeExecutable = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
if (-not (Test-Path -LiteralPath $nodeExecutable)) { throw 'Validated Node 24 runtime not found; configure its path explicitly.' }
if ((& $nodeExecutable --version) -ne 'v24.22.1') { throw 'Runtime changed; validate before continuing.' }
if (-not $ReadOnlyPreview) {
    $configFile=Join-Path $PSScriptRoot 'private/config.json'
    if (-not (Test-Path -LiteralPath $configFile)) { throw 'Private backend configuration is missing. Use -ReadOnlyPreview for verified historical results.' }
    $config=Get-Content -LiteralPath $configFile -Raw | ConvertFrom-Json
    foreach ($property in $config.PSObject.Properties) { [Environment]::SetEnvironmentVariable($property.Name,[string]$property.Value,'Process') }
}
Write-Host 'Olist platform: http://127.0.0.1:8792 /admin/ . No cloud application deployment.'
$env:LENS_PYTHON = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe'
$env:LENS_ARTIFACT_MODULE = Join-Path $env:USERPROFILE '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs'
& $nodeExecutable --use-env-proxy (Join-Path $PSScriptRoot 'server.cjs')
