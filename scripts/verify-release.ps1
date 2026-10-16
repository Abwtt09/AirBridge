param([string]$Version = (Get-Content (Join-Path $PSScriptRoot '../package.json') -Raw | ConvertFrom-Json).version)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:AIRBRIDGE_UPDATE_INSTALLER=Join-Path $workspace "artifacts/release/AirBridge_${Version}_x64-setup.exe"
& cargo test --manifest-path (Join-Path $workspace 'src-tauri/Cargo.toml') --test signed_updates -- --ignored
if ($LASTEXITCODE) { throw 'Release signature verification failed' }
$release=Join-Path $workspace 'artifacts/release'
foreach ($line in Get-Content (Join-Path $release 'SHA256SUMS.txt')) {
    $expected,$name=$line -split '  ',2
    $actual=(Get-FileHash -LiteralPath (Join-Path $release $name) -Algorithm SHA256).Hash
    if ($actual -ne $expected) { throw "Release hash mismatch: $name" }
}
'Signed installer and release asset hashes verified.'
