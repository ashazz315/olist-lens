param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$Output=[IO.Path]::GetFullPath($Output)
$safe='safe.directory='+$repo.Replace('\','/')
Push-Location $repo
try{
    $tree=Get-Content docs/STAGE3_SOURCE_TREE.json -Raw -Encoding UTF8|ConvertFrom-Json
    $protected=@()
    foreach($item in $tree.tree){
        if($item.type -ne 'blob'){continue}
        if(-not ($item.path.StartsWith('cloud/dist/') -or $item.path -in @('output/analysis/case.json','output/pdf/olist-case-study.pdf','output/templates/schema.json'))){continue}
        $path=Join-Path $repo $item.path;$bytes=[IO.File]::ReadAllBytes($path)
        $header=[Text.Encoding]::UTF8.GetBytes('blob '+$bytes.Length+[char]0)
        $blob=[byte[]]::new($header.Length+$bytes.Length)
        [Array]::Copy($header,0,$blob,0,$header.Length);[Array]::Copy($bytes,0,$blob,$header.Length,$bytes.Length)
        $hash=[Convert]::ToHexString([Security.Cryptography.SHA1]::HashData($blob)).ToLower()
        if($hash -ne $item.sha){throw ('Protected file modified: '+$item.path)}
        $protected+=@{path=$item.path;git_blob_sha1=$hash;sha256=(Get-FileHash $path -Algorithm SHA256).Hash.ToLower()}
    }
    $tracked=@(& git -c $safe ls-files data output/stage3/recheck)
    if($LASTEXITCODE -ne 0 -or $tracked.Count){throw 'Data tracking check failed'}
    & git -c $safe diff --check
    if($LASTEXITCODE -ne 0){throw 'git diff --check failed'}
    $status=@(& git -c $safe status --short)
    if($LASTEXITCODE -ne 0){throw 'git status failed'}
    $status | Set-Content "$Output/git-status.txt" -Encoding UTF8
    $diff=@(& git -c $safe diff)
    if($LASTEXITCODE -ne 0){throw 'git diff failed'}
    $diff | Set-Content "$Output/git-diff.patch" -Encoding UTF8
    $changed=@(& git -c $safe diff --name-only)+@(& git -c $safe ls-files --others --exclude-standard)
    $changes=@();$findings=@()
    foreach($name in @($changed|Sort-Object -Unique)){
        if(-not (Test-Path -LiteralPath $name -PathType Leaf)){continue}
        if($name -match '^(data/|output/stage3/recheck/|cloud/dist/)'){throw ('Unexpected publication candidate: '+$name)}
        $text=[IO.File]::ReadAllText((Join-Path $repo $name))
        if($text -match '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|\b(ghp_|github_pat_)[A-Za-z0-9_]{20,}|\bsk-(proj-)?[A-Za-z0-9_-]{30,}|\bAKIA[A-Z0-9]{16}\b'){$findings+=@{path=$name;kind='secret_pattern'}}
        $changes+=@{path=$name;sha256=(Get-FileHash -LiteralPath $name -Algorithm SHA256).Hash.ToLower()}
    }
    if($findings.Count){throw 'Potential secrets found; see only path-level diagnostics'}
    $required=@('STAGE3_FINAL_REPORT.md','STAGE3_TEST_REPORT.md','STAGE3_RUNTIME_AUDIT.md','blocker-audit.csv','blocker-audit.md','event-review.csv','event-review.md','case-review.md','real-data-quality-report.json','real-data-reconciliation.json','monitoring-backtest-results.json','monitoring-backtest-report.md','monitoring-backtest-windows.csv','135521-breakdown-reconciliation.json','STAGE3_CHANGELOG.md')
    foreach($file in $required){if(-not (Test-Path -LiteralPath (Join-Path $Output $file))){throw ('Missing deliverable: '+$file)}}
    $broken=@()
    foreach($file in Get-ChildItem -LiteralPath $Output -Filter '*.md' -File){
        $text=[IO.File]::ReadAllText($file.FullName)
        foreach($match in [regex]::Matches($text,'\]\(([^)]+)\)')){
            $target=$match.Groups[1].Value
            if($target -match '^(https?://|#)'){continue}
            if(-not(Test-Path -LiteralPath (Join-Path $file.DirectoryName $target))){$broken+=@{file=$file.Name;target=$target}}
        }
    }
    if($broken.Count){$broken|ConvertTo-Json;throw 'Broken final report links'}
    @{checked_at=[DateTime]::UtcNow.ToString('o');protected=$protected;changes=$changes;tracked_raw_data=$false;secret_pattern_findings=$findings;secret_scan_scope='changed text only; not a guarantee against all secrets';required_deliverables=$required;broken_local_report_links=$broken;github_pushed=$false;public_deployment_changed=$false;independent_full_verification=$false;human_review_complete=$false;runtime_root_cause_resolved=$false} | ConvertTo-Json -Depth 8 | Set-Content "$Output/safety-check.json" -Encoding UTF8
    $hashes=[ordered]@{}
    foreach($file in Get-ChildItem -LiteralPath $Output -Recurse -File){
        $relative=[IO.Path]::GetRelativePath($Output,$file.FullName).Replace('\','/')
        if($relative -eq 'final-files-sha256.json' -or $relative -match '^(npm-cache|browser-run)/'){continue}
        $hashes[$relative]=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLower()
    }
    $hashes | ConvertTo-Json -Depth 3 | Set-Content "$Output/final-files-sha256.json" -Encoding UTF8
    [pscustomobject]@{protected_files=$protected.Count;required_files=$required.Count;hashed_files=$hashes.Count;changes=$changes.Count;broken_links=$broken.Count;status='partial_acceptance'}
}finally{Pop-Location}
