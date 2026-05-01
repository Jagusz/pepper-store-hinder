$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$zip = Join-Path $dist "filtr-sklepow-dla-pepper-0.1.0.zip"

$files = @(
  "manifest.json",
  "content.js",
  "popup.html",
  "popup.js",
  "popup.css"
)

New-Item -ItemType Directory -Path $dist -Force | Out-Null
if (Test-Path $zip) {
  Remove-Item -LiteralPath $zip -Force
}

$missingFiles = $files | Where-Object { -not (Test-Path (Join-Path $root $_)) }
if ($missingFiles.Count -gt 0) {
  throw "Missing package files: $($missingFiles -join ', ')"
}

Compress-Archive -Path ($files | ForEach-Object { Join-Path $root $_ }) -DestinationPath $zip
Write-Host "Created $zip"
