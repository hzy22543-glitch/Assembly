$RepoRoot = Split-Path -Parent $PSScriptRoot
$ReleaseArchive = Join-Path $RepoRoot 'CodeBuddy-Release.zip'

git -C $RepoRoot rev-parse --verify HEAD | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Commit the source files before creating a release archive.'
}

git -C $RepoRoot archive --format=zip --output=$ReleaseArchive HEAD
if ($LASTEXITCODE -ne 0) {
    throw 'Git could not create the release archive.'
}

Write-Host "Created $ReleaseArchive"
