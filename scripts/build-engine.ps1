param([string]$MsysRoot = (Join-Path $PSScriptRoot '../.tools/msys64'))
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$msys=(Resolve-Path $MsysRoot).Path
$env:MSYSTEM='UCRT64'
$env:CHERE_INVOKING='1'
$bash=Join-Path $msys 'usr/bin/bash.exe'
if (!(Test-Path -LiteralPath $bash)) { throw 'Install portable MSYS2 and the packages in docs/BUILD.md first.' }
# Paths are passed as environment data rather than embedded shell code.
$env:AIRBRIDGE_WORKSPACE=$workspace.Replace('\','/')
& $bash (Join-Path $PSScriptRoot 'build-engine.sh').Replace('\','/')
if ($LASTEXITCODE) {throw 'UxPlay compilation failed'}
& (Join-Path $PSScriptRoot 'stage-engine.ps1') -MsysRoot $msys
