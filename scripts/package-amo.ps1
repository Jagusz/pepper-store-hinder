$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$dist = Join-Path $root "dist"
$manifestPath = Join-Path $root "manifest.json"

$files = @(
  "manifest.json",
  "content.js",
  "i18n.js",
  "popup.html",
  "popup.js",
  "popup.css",
  "LICENSE"
)

if (-not (Test-Path $manifestPath)) {
  throw "Missing manifest file: $manifestPath"
}

$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ([string]::IsNullOrWhiteSpace($version)) {
  throw "Manifest version is missing or empty."
}

$zip = Join-Path $dist "deal-store-filter-android-$version.zip"

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
