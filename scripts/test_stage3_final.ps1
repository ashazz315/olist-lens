param(
    [Parameter(Mandatory=$true)][string]$Node,
    [Parameter(Mandatory=$true)][string]$Python,
    [Parameter(Mandatory=$true)][string]$NpmCli,
    [Parameter(Mandatory=$true)][string]$Playwright,
    [Parameter(Mandatory=$true)][string]$BrowserCopy,
    [Parameter(Mandatory=$true)][string]$Output
)
$ErrorActionPreference='Stop'
$projectRoot=Split-Path $PSScriptRoot -Parent
$Output=[IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Path $Output -Force | Out-Null
if(Test-Path "$Output/test-execution.json"){throw 'Existing receipt preserved; select a fresh test directory'}
$nodeVersion=& $Node -v
if([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22){throw 'Node >=22 required'}
$pythonVersion=& $Python --version
$env:PATH=(Split-Path $Node -Parent)+';'+$env:PATH
$env:LENS_PLAYWRIGHT_MODULE=$Playwright
$results=@()
$jobs=@(
    @{name='python-raw-audit';exe=$Python;arguments=@('-X','faulthandler','-m','unittest','tests/test_stage3_raw_audit.py');directory=$projectRoot},
    @{name='python-full';exe=$Python;arguments=@('-X','faulthandler','-m','unittest','tests/test_stage3_raw_audit.py','tests/test_stage3_contract.py','tests/test_stage3_pipeline.py','tests/test_stage3_closure.py');directory=$projectRoot},
    @{name='npm-test';exe=$Node;arguments=@($NpmCli,'test');directory=$projectRoot},
    @{name='npm-browser';exe=$Node;arguments=@($NpmCli,'run','test:browser');directory=$BrowserCopy}
)
foreach($job in $jobs){
    Push-Location $job.directory
    try {
        $started=[DateTime]::UtcNow.ToString('o');$watch=[Diagnostics.Stopwatch]::StartNew()
        $exe=$job.exe;$arguments=$job.arguments;$log=Join-Path $Output ($job.name+'.log')
        & $exe @arguments *> $log
        $code=$LASTEXITCODE;$watch.Stop()
        $results+=@{name=$job.name;started_at=$started;completed_at=[DateTime]::UtcNow.ToString('o');elapsed_seconds=$watch.Elapsed.TotalSeconds;exit_code=$code;executable=$exe;arguments=$arguments;directory=$job.directory;log=$log;sha256=(Get-FileHash -LiteralPath $log -Algorithm SHA256).Hash.ToLower();is_synthetic=$true}
    } finally {Pop-Location}
}
@{node_version=$nodeVersion;node_path=$Node;node_sha256=(Get-FileHash -LiteralPath $Node -Algorithm SHA256).Hash.ToLower();python_version=$pythonVersion;python_path=$Python;tests=$results} | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath "$Output/test-execution.json" -Encoding utf8
$results | Select-Object name,exit_code,elapsed_seconds
if(@($results|Where-Object {$_.exit_code -ne 0}).Count){exit 1}
