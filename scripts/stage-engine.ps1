param([Parameter(Mandatory=$true)][string]$MsysRoot)
$ErrorActionPreference='Stop'
$workspace=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$destination=Join-Path $workspace 'engine/runtime'
$bin=Join-Path $MsysRoot 'ucrt64/bin'
$objdump=Join-Path $bin 'objdump.exe'
$plugins=Join-Path $MsysRoot 'ucrt64/lib/gstreamer-1.0'
New-Item -ItemType Directory -Force $destination,(Join-Path $destination 'lib/gstreamer-1.0'),(Join-Path $destination 'licenses') | Out-Null
$seen=@{}
function Copy-NativeDependency([string]$Source,[string]$Target) {
    $key=[IO.Path]::GetFileName($Source).ToLowerInvariant()
    if ($seen.ContainsKey($key)) {return}
    $seen[$key]=$true
    Copy-Item -LiteralPath $Source -Destination $Target -Force
    $imports=& $objdump -p $Source | Select-String 'DLL Name: (.+)$'
    foreach ($entry in $imports) {
        $name=$entry.Matches[0].Groups[1].Value.Trim()
        $dependency=Join-Path $bin $name
        if (Test-Path -LiteralPath $dependency) {Copy-NativeDependency $dependency (Join-Path $destination $name)}
        elseif (!(Test-Path -LiteralPath (Join-Path $env:WINDIR "System32/$name")) -and $name -notmatch '^(api-ms-|ext-ms-)') {throw "Unresolved runtime dependency: $name"}
    }
}
Copy-NativeDependency (Join-Path $workspace 'vendor/uxplay/build/uxplay.exe') (Join-Path $destination 'uxplay.exe')
$scanner=Join-Path $MsysRoot 'ucrt64/libexec/gstreamer-1.0/gst-plugin-scanner.exe'
Copy-NativeDependency $scanner (Join-Path $destination 'gst-plugin-scanner.exe')
foreach ($name in @('app','libav','audioconvert','audioresample','volume','level','wasapi','coreelements')) {
    $file="libgst$name.dll"
    Copy-NativeDependency (Join-Path $plugins $file) (Join-Path $destination "lib/gstreamer-1.0/$file")
}
Copy-Item -LiteralPath (Join-Path $workspace 'vendor/uxplay/LICENSE') -Destination (Join-Path $destination 'licenses/UxPlay-GPL-3.0.txt') -Force
Copy-Item -LiteralPath (Join-Path $workspace 'engine/empty.conf') -Destination (Join-Path $destination 'airbridge-no-config') -Force
Copy-Item -LiteralPath (Join-Path $workspace 'engine/source-lock.json') -Destination (Join-Path $destination 'source-lock.json') -Force
# Retain packaged dependency licenses, including FFmpeg's actual GPL configuration.
Copy-Item -Path (Join-Path $MsysRoot 'ucrt64/share/licenses/*') -Destination (Join-Path $destination 'licenses') -Recurse -Force
Get-ChildItem -LiteralPath $destination -Recurse -File | Where-Object Name -ne 'manifest.json' | ForEach-Object {
    [pscustomobject]@{path=$_.FullName.Substring($destination.Length+1);sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash}
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $destination 'manifest.json')
$size=(Get-ChildItem $destination -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Output ('Staged native runtime: {0:N1} MiB' -f $size)
