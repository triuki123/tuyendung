$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
$release = Join-Path $root 'release'
$unpacked = Join-Path $release 'AssetFlow-CV-Collector'
$zip = Join-Path $release 'AssetFlow-CV-Collector.zip'

Push-Location $root
try {
  npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "Extension build failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }

New-Item -ItemType Directory -Force -Path $release | Out-Null
if (Test-Path $unpacked) { Remove-Item -Recurse -Force $unpacked }
Copy-Item -Recurse -Path $dist -Destination $unpacked
if (Test-Path $zip) { Remove-Item -Force $zip }
Compress-Archive -Path (Join-Path $dist '*') -DestinationPath $zip -CompressionLevel Optimal

if (-not (Test-Path (Join-Path $unpacked 'manifest.json'))) {
  throw 'Goi extension khong co manifest.json o thu muc goc.'
}
Write-Host "Unpacked: $unpacked"
Write-Host "ZIP:      $zip"
