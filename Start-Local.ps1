[CmdletBinding()]
param(
    [string]$NodePath,
    [ValidateRange(1024,65535)][int]$Port = 8794,
    [switch]$PreviewOnly,
    [switch]$Install,
    [string]$NpmCache
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$platform = Join-Path $root 'v21/platform'

if (-not $NodePath) {
    $runtime = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $runtime) { throw 'Node.js 24 x64 was not found. Install it or supply -NodePath.' }
    $NodePath = $runtime.Source
}
$NodePath = (Resolve-Path -LiteralPath $NodePath).Path
$version = & $NodePath --version
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.') {
    throw "Expected Node.js 24.x, received $version. Use -NodePath to choose the Node 24 installation."
}

if (-not $PreviewOnly) {
    if ($root -match '[^\x20-\x7E]') {
        throw 'For embedded PostgreSQL on Windows, extract the working copy to a writable ASCII path such as D:\Projects\Olist-Lens-v2.1. Preview mode also works under Chinese paths.'
    }
    if (-not [Environment]::Is64BitOperatingSystem -or [Environment]::OSVersion.Platform -ne 'Win32NT' -or
        (& $NodePath -p 'process.arch') -ne 'x64') {
        throw 'The embedded PostgreSQL launcher requires Windows x64. Use -PreviewOnly for other platforms.'
    }
    if ($Install) {
        $npm = Join-Path (Split-Path -Parent $NodePath) 'npm.cmd'
        if (-not (Test-Path -LiteralPath $npm)) {
            $npm = (Get-Command npm.cmd -CommandType Application -ErrorAction Stop).Source
        }
        $oldPath = $env:Path
        try {
            $env:Path = (Split-Path -Parent $NodePath) + [IO.Path]::PathSeparator + $oldPath
            $installArgs = @('ci', '--prefix', $platform, '--no-audit', '--no-fund')
            if ($NpmCache) { $installArgs += @('--cache', $NpmCache, '--offline') }
            & $npm @installArgs
            if ($LASTEXITCODE -ne 0) { throw 'npm ci failed. Check npm access or provide a populated -NpmCache.' }
        } finally {
            $env:Path = $oldPath
        }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $platform 'node_modules/embedded-postgres/package.json'))) {
        throw 'Dependencies are missing. Run .\Start-Local.ps1 -Install, or use -PreviewOnly.'
    }
}

$oldPort = $env:LENS_PLATFORM_PORT
try {
    $env:LENS_PLATFORM_PORT = "$Port"
    $entry = if ($PreviewOnly) { 'portable/start-preview.cjs' } else { 'v21/platform/local-replay.cjs' }
    & $NodePath --no-opt (Join-Path $root $entry)
    if ($LASTEXITCODE -ne 0) { throw "Olist Lens exited with code $LASTEXITCODE." }
} finally {
    $env:LENS_PLATFORM_PORT = $oldPort
}
