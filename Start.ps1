param([ValidateRange(1024,65535)][int]$Port = 8787)
$ErrorActionPreference = 'Stop'
$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
$taskPython = if ($pythonCommand) { $pythonCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' }
if (-not (Test-Path -LiteralPath $taskPython)) { throw '请安装 Python 3.10+ 并加入 PATH。' }
Write-Host "Olist Lens: http://127.0.0.1:$Port"
& $taskPython -m http.server $Port --bind 127.0.0.1 --directory (Join-Path $PSScriptRoot 'cloud\dist')
