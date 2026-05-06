[CmdletBinding()]
param(
  [string]$AvdName,
  [string]$DeviceId,
  [string]$FirefoxPackage,
  [string]$FirefoxApkPath,
  [string]$AdbBin,
  [int]$TimeoutSeconds = 420,
  [switch]$Debug
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Hint([string]$Message) {
  Write-Host "    $Message" -ForegroundColor DarkGray
}

function Write-DebugLog([string]$Message) {
  if ($PSBoundParameters.ContainsKey("Debug")) {
    Write-Host "DEBUG: $Message" -ForegroundColor Yellow
  }
}

function Resolve-ToolPath {
  param(
    [string]$PreferredPath,
    [string]$CommandName,
    [string[]]$FallbackPaths = @()
  )

  if ($PreferredPath) {
    if (Test-Path -LiteralPath $PreferredPath) {
      return (Resolve-Path -LiteralPath $PreferredPath).Path
    }

    $preferredCommand = Get-Command -Name $PreferredPath -ErrorAction SilentlyContinue
    if ($preferredCommand) {
      return $preferredCommand.Source
    }

    throw "Tool path or command was not found: $PreferredPath"
  }

  $command = Get-Command -Name $CommandName -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  foreach ($candidate in $FallbackPaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Get-AndroidSdkRoot() {
  if ($env:ANDROID_SDK_ROOT) {
    return $env:ANDROID_SDK_ROOT
  }

  if ($env:ANDROID_HOME) {
    return $env:ANDROID_HOME
  }

  return $null
}

function Get-RunningAndroidDevices([string]$AdbPath) {
  $lines = & $AdbPath devices 2>$null
  if (-not $lines) {
    return @()
  }

  return @(
    $lines |
      Select-Object -Skip 1 |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -and $_ -notmatch '^List of devices attached' } |
      ForEach-Object {
        $parts = ($_ -split '\s+')
        if ($parts.Count -ge 2 -and $parts[1] -eq 'device') {
          $parts[0]
        }
      } |
      Where-Object { $_ }
  )
}

function Get-RunningEmulatorDevice([string]$AdbPath) {
  $runningDevices = @(Get-RunningAndroidDevices -AdbPath $AdbPath)
  $emulatorDevices = @($runningDevices | Where-Object { $_ -like "emulator-*" })

  Write-DebugLog "Running adb devices: $(if ($runningDevices.Count -gt 0) { $runningDevices -join ', ' } else { '<none>' })"

  if ($emulatorDevices.Count -eq 1) {
    return $emulatorDevices[0]
  }

  if ($emulatorDevices.Count -gt 1) {
    throw "Multiple running emulator devices were found. Pass -DeviceId explicitly."
  }

  return $null
}

function Get-FileContentLines {
  param(
    [string]$Path,
    [int]$AlreadySeenLineCount
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return @()
  }

  $allLines = @(Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue)
  if ($allLines.Count -le $AlreadySeenLineCount) {
    return @()
  }

  return @($allLines[$AlreadySeenLineCount..($allLines.Count - 1)])
}

function Get-FileTailText {
  param(
    [string]$Path,
    [int]$LineCount = 20
  )

  if (-not $Path -or -not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $lines = @(Get-Content -LiteralPath $Path -ErrorAction SilentlyContinue | Select-Object -Last $LineCount)
  if ($lines.Count -eq 0) {
    return $null
  }

  return ($lines -join [Environment]::NewLine)
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$runnerPath = Join-Path $PSScriptRoot "run-android-firefox-dev.ps1"

if (-not (Test-Path -LiteralPath $runnerPath)) {
  throw "Missing runner script: $runnerPath"
}

$sdkRoot = Get-AndroidSdkRoot
$resolvedAdb = Resolve-ToolPath `
  -PreferredPath $AdbBin `
  -CommandName "adb" `
  -FallbackPaths @(
    $(if ($sdkRoot) { Join-Path $sdkRoot "platform-tools\\adb.exe" }),
    $(if ($sdkRoot) { Join-Path $sdkRoot "platform-tools\\adb" })
  )

if (-not $resolvedAdb) {
  throw "adb was not found. Start by installing Android SDK platform-tools or pass -AdbBin."
}

if (-not $DeviceId) {
  $DeviceId = Get-RunningEmulatorDevice -AdbPath $resolvedAdb
}

if (-not $DeviceId -and -not $AvdName) {
  throw @"
No running Android emulator was found for the smoke test, and no -AvdName was provided.

Start an emulator first with:
.\scripts\run-android-firefox-dev.ps1

Then run this smoke test again, or pass -DeviceId / -AvdName explicitly.
"@
}

$powershellPath = (Get-Process -Id $PID).Path
if (-not $powershellPath) {
  $powershellPath = "powershell.exe"
}

$runnerArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $runnerPath
)

if ($DeviceId) {
  $runnerArgs += @("-DeviceId", $DeviceId)
}

if ($AvdName) {
  $runnerArgs += @("-AvdName", $AvdName)
}

if ($FirefoxPackage) {
  $runnerArgs += @("-FirefoxPackage", $FirefoxPackage)
}

if ($FirefoxApkPath) {
  $runnerArgs += @("-FirefoxApkPath", $FirefoxApkPath)
}

if ($Debug) {
  $runnerArgs += "-Debug"
}

$logStamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutLog = Join-Path $env:TEMP "pepper-store-filter-android-smoke-${logStamp}-stdout.log"
$stderrLog = Join-Path $env:TEMP "pepper-store-filter-android-smoke-${logStamp}-stderr.log"

Write-Step "Starting Android install smoke test"
Write-Hint "repo     : $repoRoot"
if ($DeviceId) {
  Write-Hint "device   : $DeviceId"
}
if ($AvdName) {
  Write-Hint "avd      : $AvdName"
}
Write-Hint "runner   : $runnerPath"
Write-Hint "stdout   : $stdoutLog"
Write-Hint "stderr   : $stderrLog"
Write-DebugLog "Child command: $powershellPath $($runnerArgs -join ' ')"

$process = Start-Process `
  -FilePath $powershellPath `
  -ArgumentList $runnerArgs `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

$successMarkers = @(
  "You can connect to this Android device on TCP port",
  "Connected to the Remote Debugging Server"
)

$failureMarkers = @(
  "UsageError:",
  "No Firefox packages were found on the selected Android device",
  "Timed out waiting for Android emulator",
  "No Firefox for Android package is available on",
  "Firefox APK installation finished, but no Mozilla browser package was detected afterwards.",
  "The emulator process exited early with code"
)

$stdoutSeen = 0
$stderrSeen = 0
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$successDetected = $false
$sawRemoteDebugHint = $false

while ((Get-Date) -lt $deadline) {
  foreach ($line in @(Get-FileContentLines -Path $stdoutLog -AlreadySeenLineCount $stdoutSeen)) {
    $stdoutSeen += 1
    Write-Host $line

    foreach ($marker in $successMarkers) {
      if ($line -like "*$marker*") {
        $successDetected = $true
      }
    }

    foreach ($marker in $failureMarkers) {
      if ($line -like "*$marker*") {
        throw "Android smoke test failed. See $stdoutLog and $stderrLog for details."
      }
    }

    if ($line -like "*Remote Debugging Server*") {
      $sawRemoteDebugHint = $true
    }
  }

  foreach ($line in @(Get-FileContentLines -Path $stderrLog -AlreadySeenLineCount $stderrSeen)) {
    $stderrSeen += 1
    Write-Host $line

    foreach ($marker in $failureMarkers) {
      if ($line -like "*$marker*") {
        throw "Android smoke test failed. See $stdoutLog and $stderrLog for details."
      }
    }
  }

  if ($successDetected) {
    Write-Step "Smoke test passed"
    Write-Hint "web-ext reached Firefox for Android on $DeviceId"

    if (-not $process.HasExited) {
      try {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      } catch {
        # Best-effort cleanup only.
      }
    }

    return
  }

  if ($process.HasExited) {
    $stdoutTail = Get-FileTailText -Path $stdoutLog
    $stderrTail = Get-FileTailText -Path $stderrLog
    $details = @(
      "Android smoke test process exited before success was detected.",
      "Exit code: $($process.ExitCode)",
      "stdout log: $stdoutLog",
      "stderr log: $stderrLog"
    )

    if ($stderrTail) {
      $details += "Last stderr lines:`n$stderrTail"
    } elseif ($stdoutTail) {
      $details += "Last stdout lines:`n$stdoutTail"
    }

    throw ($details -join [Environment]::NewLine + [Environment]::NewLine)
  }

  Start-Sleep -Seconds 1
}

if (-not $process.HasExited) {
  try {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  } catch {
    # Best-effort cleanup only.
  }
}

$timeoutMessage = @(
  "Timed out waiting for the Android install smoke test to report success.",
  "stdout log: $stdoutLog",
  "stderr log: $stderrLog"
)

if ($sawRemoteDebugHint) {
  $timeoutMessage += "Firefox for Android likely still needs 'Remote debugging via USB' enabled in Settings -> Developer tools."
}

throw ($timeoutMessage -join [Environment]::NewLine + [Environment]::NewLine)
