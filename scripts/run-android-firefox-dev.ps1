[CmdletBinding()]
param(
  [string]$AvdName,
  [string]$DeviceId,
  [string]$FirefoxPackage,
  [string]$FirefoxApkPath,
  [string]$WebExtBin,
  [string]$NpmBin,
  [string]$AdbBin,
  [string]$EmulatorBin,
  [switch]$SkipWebExt,
  [switch]$DryRun,
  [switch]$DisableSafeEmulatorFlags,
  [int]$BootTimeoutSeconds = 240,
  [int]$InstallTimeoutSeconds = 120,
  [int]$EmulatorStartupTimeoutSeconds = 90,
  [int]$AvdListTimeoutSeconds = 15
)

$ErrorActionPreference = "Stop"
$script:DebugLoggingEnabled = $PSBoundParameters.ContainsKey("Debug")
$script:DefaultWebExtAdbDiscoveryTimeoutMs = 180000

function Test-IsCiEnvironment() {
  $ciValue = "$($env:CI)".Trim()
  return $ciValue -match '^(1|true|yes)$'
}

$script:NonInteractiveMode = Test-IsCiEnvironment

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Hint([string]$Message) {
  Write-Host "    $Message" -ForegroundColor DarkGray
}

function Write-DebugLog([string]$Message) {
  if ($script:DebugLoggingEnabled) {
    Write-Host "DEBUG: $Message" -ForegroundColor Yellow
  }
}

function Get-AndroidAvdHome() {
  if ($env:ANDROID_AVD_HOME -and (Test-Path -LiteralPath $env:ANDROID_AVD_HOME)) {
    return (Resolve-Path -LiteralPath $env:ANDROID_AVD_HOME).Path
  }

  if ($env:ANDROID_SDK_HOME) {
    $sdkHomeAvd = Join-Path $env:ANDROID_SDK_HOME "avd"
    if (Test-Path -LiteralPath $sdkHomeAvd) {
      return (Resolve-Path -LiteralPath $sdkHomeAvd).Path
    }
  }

  return (Join-Path $HOME ".android\\avd")
}

function Get-AvdIniPath([string]$AvdHome, [string]$AvdName) {
  return Join-Path $AvdHome "$AvdName.ini"
}

function Get-AvdDirectoryPath([string]$AvdHome, [string]$AvdName) {
  return Join-Path $AvdHome "$AvdName.avd"
}

function Test-AvdDirectoryLooksValid([string]$AvdDirectoryPath) {
  if (-not $AvdDirectoryPath -or -not (Test-Path -LiteralPath $AvdDirectoryPath)) {
    return $false
  }

  return (
    (Test-Path -LiteralPath (Join-Path $AvdDirectoryPath "config.ini")) -or
    (Test-Path -LiteralPath (Join-Path $AvdDirectoryPath "hardware-qemu.ini")) -or
    (Test-Path -LiteralPath (Join-Path $AvdDirectoryPath "emu-launch-params.txt"))
  )
}

function Get-AvdTargetFromDirectory([string]$AvdDirectoryPath) {
  $candidateFiles = @(
    (Join-Path $AvdDirectoryPath "config.ini"),
    (Join-Path $AvdDirectoryPath "hardware-qemu.ini")
  )

  foreach ($candidateFile in $candidateFiles) {
    if (-not (Test-Path -LiteralPath $candidateFile)) {
      continue
    }

    foreach ($line in (Get-Content -LiteralPath $candidateFile -ErrorAction SilentlyContinue)) {
      if ($line -match 'android-\d+') {
        return $Matches[0]
      }
    }
  }

  return $null
}

function Get-AvdCpuArchitecture([string]$AvdDirectoryPath) {
  $candidateFile = Join-Path $AvdDirectoryPath "hardware-qemu.ini"
  if (-not (Test-Path -LiteralPath $candidateFile)) {
    return $null
  }

  foreach ($line in (Get-Content -LiteralPath $candidateFile -ErrorAction SilentlyContinue)) {
    if ($line -match '^\s*hw\.cpu\.arch\s*=\s*(.+?)\s*$') {
      return $Matches[1].Trim()
    }
  }

  return $null
}

function Assert-AvdSupportedByCurrentEmulator {
  param(
    [string]$AvdHome,
    [string]$AvdName
  )

  $avdDirectoryPath = Get-AvdDirectoryPath -AvdHome $AvdHome -AvdName $AvdName
  $cpuArch = Get-AvdCpuArchitecture -AvdDirectoryPath $avdDirectoryPath

  if ($cpuArch -and $cpuArch -eq "arm") {
    throw @"
Selected AVD '$AvdName' uses CPU architecture '$cpuArch', which is not supported by this Android emulator build.

Create or choose an x86_64/x86 Android Virtual Device instead.
This AVD directory is:
$avdDirectoryPath
"@
  }
}

function Ensure-AvdLaunchMetadata {
  param(
    [string]$AvdHome,
    [string]$AvdName
  )

  $iniPath = Get-AvdIniPath -AvdHome $AvdHome -AvdName $AvdName
  if (Test-Path -LiteralPath $iniPath) {
    return [pscustomobject]@{
      AvdHomeOverride = $null
      IniPath = $iniPath
      Temporary = $false
    }
  }

  $avdDirectoryPath = Get-AvdDirectoryPath -AvdHome $AvdHome -AvdName $AvdName
  if (-not (Test-AvdDirectoryLooksValid -AvdDirectoryPath $avdDirectoryPath)) {
    throw "AVD '$AvdName' is missing both its .ini metadata and a usable .avd directory."
  }

  $tempAvdHome = Join-Path $env:TEMP "pepper-store-filter-avd-home"
  New-Item -ItemType Directory -Path $tempAvdHome -Force | Out-Null

  $tempIniPath = Join-Path $tempAvdHome "$AvdName.ini"
  $iniLines = @(
    "avd.ini.encoding=UTF-8",
    "path=$avdDirectoryPath"
  )

  $target = Get-AvdTargetFromDirectory -AvdDirectoryPath $avdDirectoryPath
  if ($target) {
    $iniLines += "target=$target"
  }

  Set-Content -LiteralPath $tempIniPath -Value $iniLines -Encoding UTF8
  Write-DebugLog "Synthesized temporary AVD ini for $AvdName at $tempIniPath"

  return [pscustomobject]@{
    AvdHomeOverride = $tempAvdHome
    IniPath = $tempIniPath
    Temporary = $true
  }
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

function Invoke-ExternalCommandWithTimeout {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList,
    [int]$TimeoutSeconds = 15
  )

  Write-DebugLog "Starting external process with timeout ${TimeoutSeconds}s: $FilePath $($ArgumentList -join ' ')"
  $job = Start-Job -ScriptBlock {
    param($ExecutablePath, $ExecutableArgs)

    try {
      $output = & $ExecutablePath @ExecutableArgs 2>&1
      [pscustomobject]@{
        ExitCode = $LASTEXITCODE
        Output   = @($output | ForEach-Object { "$_" })
      }
    } catch {
      [pscustomobject]@{
        ExitCode = $null
        Output   = @("EXCEPTION: $($_.Exception.Message)")
      }
    }
  } -ArgumentList $FilePath, $ArgumentList

  if (-not (Wait-Job -Job $job -Timeout $TimeoutSeconds)) {
    try {
      Stop-Job -Job $job -ErrorAction SilentlyContinue | Out-Null
    } catch {
      # Best-effort cleanup only.
    }
    Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null

    return [pscustomobject]@{
      TimedOut = $true
      ExitCode = $null
      StdOut   = @()
      StdErr   = @()
    }
  }

  $result = Receive-Job -Job $job
  Remove-Job -Job $job -Force -ErrorAction SilentlyContinue | Out-Null

  $allOutput = @()
  if ($result) {
    $allOutput = @($result.Output | Where-Object { $_ -ne $null })
  }

  $stdoutLines = @($allOutput | Where-Object { $_ -notmatch '^(WARNING|ERROR|FATAL|INFO)\b' })
  $stderrLines = @($allOutput | Where-Object { $_ -match '^(WARNING|ERROR|FATAL|INFO)\b|^EXCEPTION:' })

  return [pscustomobject]@{
    TimedOut = $false
    ExitCode = $result.ExitCode
    StdOut   = $stdoutLines
    StdErr   = $stderrLines
  }
}

function Find-CommandPath([string[]]$Names) {
  foreach ($name in $Names) {
    if (-not $name) {
      continue
    }

    $command = Get-Command -Name $name -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  return $null
}

function Prompt-YesNo([string]$Question) {
  if ($script:NonInteractiveMode) {
    throw "Cannot prompt in CI/non-interactive mode: $Question"
  }

  $response = Read-Host "$Question [y/N]"
  return $response -match "^(y|yes|t|tak)$"
}

function Prompt-ExistingFilePath([string]$Question, [string]$ExpectedExtension = "") {
  if ($script:NonInteractiveMode) {
    throw "Cannot prompt for a file path in CI/non-interactive mode: $Question"
  }

  while ($true) {
    $response = (Read-Host $Question).Trim()
    if (-not $response) {
      return $null
    }

    if (-not (Test-Path -LiteralPath $response)) {
      Write-Hint "File does not exist: $response"
      continue
    }

    if ($ExpectedExtension -and ([System.IO.Path]::GetExtension($response) -ne $ExpectedExtension)) {
      Write-Hint "Expected a file with extension $ExpectedExtension"
      continue
    }

    return (Resolve-Path -LiteralPath $response).Path
  }
}

function Select-OptionInteractive {
  param(
    [string]$Title,
    [string[]]$Options
  )

  if (-not $Options -or $Options.Count -eq 0) {
    return $null
  }

  if ($script:NonInteractiveMode) {
    if ($Options.Count -eq 1) {
      Write-DebugLog "CI/non-interactive mode auto-selected the only available option: $($Options[0])"
      return $Options[0]
    }

    throw "Multiple options are available in CI/non-interactive mode. Pass an explicit value instead."
  }

  if (-not $Host.UI.RawUI) {
    Write-DebugLog "RawUI is unavailable; falling back to numeric selection for options: $($Options -join ', ')"
    Write-Step $Title
    for ($i = 0; $i -lt $Options.Count; $i += 1) {
      Write-Host ("[{0}] {1}" -f ($i + 1), $Options[$i])
    }

    while ($true) {
      $response = Read-Host "Choose AVD number"
      $selectedNumber = 0

      if ([int]::TryParse($response, [ref]$selectedNumber)) {
        if ($selectedNumber -ge 1 -and $selectedNumber -le $Options.Count) {
          return $Options[$selectedNumber - 1]
        }
      }
    }
  }

  $selectedIndex = 0
  Write-DebugLog "Starting interactive arrow-key selection for options: $($Options -join ', ')"

  while ($true) {
    Clear-Host
    Write-Step $Title
    Write-Hint "Use Up/Down arrows and Enter to confirm."
    Write-Host ""

    for ($i = 0; $i -lt $Options.Count; $i += 1) {
      if ($i -eq $selectedIndex) {
        Write-Host ("> {0}" -f $Options[$i]) -ForegroundColor Green
      } else {
        Write-Host ("  {0}" -f $Options[$i])
      }
    }

    $key = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")

    switch ($key.VirtualKeyCode) {
      38 {
        if ($selectedIndex -gt 0) {
          $selectedIndex -= 1
        }
      }
      40 {
        if ($selectedIndex -lt ($Options.Count - 1)) {
          $selectedIndex += 1
        }
      }
      13 {
        Clear-Host
        Write-DebugLog "Interactive selection confirmed: $($Options[$selectedIndex])"
        return $Options[$selectedIndex]
      }
      27 {
        throw "AVD selection cancelled by user."
      }
    }
  }
}

function Wait-ForToolAvailability {
  param(
    [scriptblock]$Resolver,
    [string]$ToolLabel,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $resolvedPath = & $Resolver
    if ($resolvedPath) {
      return $resolvedPath
    }

    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for $ToolLabel to become available."
}

function Invoke-ExternalCommandAndWriteOutput {
  param(
    [string]$FilePath,
    [string[]]$ArgumentList
  )

  $output = & $FilePath @ArgumentList 2>&1
  foreach ($line in @($output)) {
    Write-Host $line
  }
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

function Resolve-ToolPath {
  param(
    [string]$PreferredPath,
    [string]$CommandName,
    [string[]]$FallbackPaths = @()
  )

  if ($PreferredPath) {
    Write-DebugLog "Trying preferred tool path/command '$PreferredPath' for $CommandName"
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
    Write-DebugLog "Resolved $CommandName from PATH: $($command.Source)"
    return $command.Source
  }

  foreach ($candidate in $FallbackPaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      Write-DebugLog "Resolved $CommandName from fallback path: $candidate"
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Resolve-NpmPath([string]$PreferredPath) {
  if ($PreferredPath) {
    return Resolve-ToolPath -PreferredPath $PreferredPath -CommandName "npm"
  }

  $npmPath = Find-CommandPath @("npm", "npm.cmd", "npm.ps1")
  if ($npmPath) {
    Write-DebugLog "Resolved npm from PATH: $npmPath"
    return $npmPath
  }

  $fallbackPaths = @(
    "C:\Program Files\nodejs\npm.cmd",
    (Join-Path $env:APPDATA "npm\npm.cmd")
  )

  foreach ($candidate in $fallbackPaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      Write-DebugLog "Resolved npm from fallback path: $candidate"
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Get-NpmGlobalPrefix([string]$ResolvedNpmPath) {
  if (-not $ResolvedNpmPath) {
    return $null
  }

  try {
    $prefix = (& $ResolvedNpmPath prefix -g 2>$null | Select-Object -First 1).Trim()
    if ($prefix) {
      Write-DebugLog "npm global prefix: $prefix"
      return $prefix
    }
  } catch {
    Write-DebugLog "Failed to read npm global prefix from ${ResolvedNpmPath}: $($_.Exception.Message)"
    return $null
  }

  return $null
}

function Resolve-WebExtPath([string]$PreferredPath) {
  if ($PreferredPath) {
    return Resolve-ToolPath -PreferredPath $PreferredPath -CommandName "web-ext"
  }

  $commandPath = Find-CommandPath @("web-ext", "web-ext.cmd", "web-ext.ps1")
  if ($commandPath) {
    Write-DebugLog "Resolved web-ext from PATH: $commandPath"
    return $commandPath
  }

  $fallbackPaths = @(
    (Join-Path $env:APPDATA "npm\web-ext.cmd"),
    (Join-Path $env:APPDATA "npm\web-ext.ps1")
  )

  foreach ($candidate in $fallbackPaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      Write-DebugLog "Resolved web-ext from fallback path: $candidate"
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Resolve-WebExtPathWithNpmPrefix([string]$PreferredPath, [string]$ResolvedNpmPath) {
  $resolvedPath = Resolve-WebExtPath -PreferredPath $PreferredPath
  if ($resolvedPath) {
    return $resolvedPath
  }

  $npmPrefix = Get-NpmGlobalPrefix -ResolvedNpmPath $ResolvedNpmPath
  if (-not $npmPrefix) {
    return $null
  }

  $fallbackPaths = @(
    (Join-Path $npmPrefix "web-ext.cmd"),
    (Join-Path $npmPrefix "web-ext.ps1"),
    (Join-Path $npmPrefix "web-ext")
  )

  foreach ($candidate in $fallbackPaths) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      Write-DebugLog "Resolved web-ext from npm global prefix: $candidate"
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }

  return $null
}

function Ensure-NpmPath([string]$PreferredPath, [switch]$DryRunMode) {
  $resolvedNpm = Resolve-NpmPath -PreferredPath $PreferredPath
  if ($resolvedNpm) {
    return $resolvedNpm
  }

  $wingetPath = Find-CommandPath @("winget", "winget.exe")
  if (-not $wingetPath) {
    Write-Hint "npm was not found and winget is unavailable for guided installation."
    return $null
  }

  if ($DryRunMode) {
    Write-Hint "Dry run: npm was not found. The script would ask to install Node.js LTS with winget."
    return $null
  }

  if ($script:NonInteractiveMode) {
    throw @"
npm was not found in CI/non-interactive mode.

Install Node.js/npm on the runner ahead of time, or pass -NpmBin explicitly.
"@
  }

  if (-not (Prompt-YesNo "npm was not found. Install Node.js LTS (includes npm) with winget now?")) {
    return $null
  }

  Write-Step "Installing Node.js LTS with winget"
  Invoke-ExternalCommandAndWriteOutput -FilePath $wingetPath -ArgumentList @(
    "install",
    "--id", "OpenJS.NodeJS.LTS",
    "-e",
    "--accept-package-agreements",
    "--accept-source-agreements"
  )

  Write-Step "Waiting for npm to become available"
  return Wait-ForToolAvailability `
    -Resolver { Resolve-NpmPath -PreferredPath $PreferredPath } `
    -ToolLabel "npm" `
    -TimeoutSeconds $InstallTimeoutSeconds
}

function Ensure-WebExtPath([string]$PreferredPath, [string]$ResolvedNpmPath, [switch]$DryRunMode) {
  $resolvedWebExt = Resolve-WebExtPathWithNpmPrefix `
    -PreferredPath $PreferredPath `
    -ResolvedNpmPath $ResolvedNpmPath
  if ($resolvedWebExt) {
    return $resolvedWebExt
  }

  if (-not $ResolvedNpmPath) {
    return $null
  }

  if ($DryRunMode) {
    Write-Hint "Dry run: web-ext was not found. The script would ask to install it with npm."
    return $null
  }

  if ($script:NonInteractiveMode) {
    throw @"
web-ext was not found in CI/non-interactive mode.

Install web-ext on the runner ahead of time, or pass -WebExtBin explicitly.
"@
  }

  if (-not (Prompt-YesNo "web-ext was not found. Install it globally with npm now?")) {
    return $null
  }

  Write-Step "Installing web-ext with npm"
  Invoke-ExternalCommandAndWriteOutput -FilePath $ResolvedNpmPath -ArgumentList @(
    "install",
    "--global",
    "web-ext"
  )

  Write-Step "Waiting for web-ext to become available"
  return Wait-ForToolAvailability `
    -Resolver { Resolve-WebExtPathWithNpmPrefix -PreferredPath $PreferredPath -ResolvedNpmPath $ResolvedNpmPath } `
    -ToolLabel "web-ext" `
    -TimeoutSeconds $InstallTimeoutSeconds
}

function Get-NdkVersions([string]$SdkRoot) {
  if (-not $SdkRoot) {
    return @()
  }

  $versions = New-Object System.Collections.Generic.List[string]

  $ndkRoot = Join-Path $SdkRoot "ndk"
  if (Test-Path -LiteralPath $ndkRoot) {
    Get-ChildItem -LiteralPath $ndkRoot -Directory -ErrorAction SilentlyContinue |
      ForEach-Object {
        if ($_.Name -and -not $versions.Contains($_.Name)) {
          [void]$versions.Add($_.Name)
        }
      }
  }

  $ndkBundleRoot = Join-Path $SdkRoot "ndk-bundle"
  if ((Test-Path -LiteralPath $ndkBundleRoot) -and -not $versions.Contains("ndk-bundle")) {
    [void]$versions.Add("ndk-bundle")
  }

  return @($versions.ToArray())
}

function Get-RunningAndroidDevices([string]$AdbPath) {
  $output = & $AdbPath devices 2>$null
  if (-not $output) {
    Write-DebugLog "adb devices returned no output."
    return @()
  }

  $devices = @(
    $output |
      Select-Object -Skip 1 |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_ -match "^(\S+)\s+device$" } |
      ForEach-Object { $Matches[1] }
  )

  Write-DebugLog "adb devices parsed as: $(if ($devices.Count -gt 0) { $devices -join ', ' } else { '<none>' })"
  return $devices
}

function Get-RunningEmulatorDevice([string]$AdbPath) {
  $devices = @(
    Get-RunningAndroidDevices -AdbPath $AdbPath |
      Where-Object { $_ -like "emulator-*" }
  )

  if ($devices.Count -eq 1) {
    return [string]$devices[0]
  }

  if ($devices.Count -gt 1) {
    throw "Multiple Android emulators are already running. Pass -DeviceId explicitly. Found: $($devices -join ', ')"
  }

  return $null
}

function Get-AvailableAvds([string]$EmulatorPath, [int]$TimeoutSeconds = 15) {
  $names = New-Object System.Collections.Generic.List[string]
  $validAvdNamePattern = '^[A-Za-z0-9._-]+$'
  $avdHome = Get-AndroidAvdHome
  Write-DebugLog "AVD fallback directory: $avdHome"
  if (-not (Test-Path -LiteralPath $avdHome)) {
    Write-DebugLog "AVD fallback directory does not exist."
  } else {
    Get-ChildItem -LiteralPath $avdHome -File -ErrorAction SilentlyContinue |
      Where-Object { $_.Extension -eq ".ini" } |
      ForEach-Object {
        $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
        $iniContent = @{}

        foreach ($line in (Get-Content -LiteralPath $_.FullName -ErrorAction SilentlyContinue)) {
          if ($line -match '^\s*([^=]+?)\s*=\s*(.*)\s*$') {
            $iniContent[$Matches[1]] = $Matches[2]
          }
        }

        $declaredPath = $iniContent["path"]
        $hasRealAvdPath = $declaredPath -and (Test-Path -LiteralPath $declaredPath)

        if (-not $hasRealAvdPath) {
          Write-DebugLog "Skipping stale AVD entry from .ini file: $name (declared path missing: $declaredPath)"
          return
        }

        if ($name -and -not $names.Contains($name)) {
          Write-DebugLog "Found AVD from .ini file: $name"
          [void]$names.Add($name)
        }
      }

    Get-ChildItem -LiteralPath $avdHome -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like "*.avd" } |
      ForEach-Object {
        $name = [System.IO.Path]::GetFileNameWithoutExtension($_.Name)
        $looksLikeAvd = Test-AvdDirectoryLooksValid -AvdDirectoryPath $_.FullName

        if (-not $looksLikeAvd) {
          Write-DebugLog "Skipping directory that does not look like a valid AVD: $($_.FullName)"
          return
        }

        if ($name -and -not $names.Contains($name)) {
          $expectedIniPath = Get-AvdIniPath -AvdHome $avdHome -AvdName $name
          if (Test-Path -LiteralPath $expectedIniPath) {
            Write-DebugLog "Found AVD from .avd directory: $name"
          } else {
            Write-DebugLog "Found recoverable AVD from .avd directory without .ini metadata: $name"
          }
          [void]$names.Add($name)
        }
      }
  }

  if ($names.Count -gt 0) {
    Write-DebugLog "AVD list resolved from filesystem sources: $($names.ToArray() -join ', ')"
    return [string[]]@($names.ToArray())
  }

  try {
    Write-DebugLog "Filesystem AVD discovery returned nothing; falling back to emulator -list-avds"
    $commandResult = Invoke-ExternalCommandWithTimeout `
      -FilePath $EmulatorPath `
      -ArgumentList @("-list-avds") `
      -TimeoutSeconds $TimeoutSeconds

    if ($commandResult.TimedOut) {
      Write-DebugLog "emulator -list-avds timed out after ${TimeoutSeconds}s"
    }

    $emulatorOutput = @(
      @($commandResult.StdOut + $commandResult.StdErr) |
        ForEach-Object { "$_".Trim() } |
        Where-Object { $_ }
    )
    if ($emulatorOutput.Count -gt 0) {
      Write-DebugLog "emulator -list-avds raw output: $($emulatorOutput -join ' || ')"
    } else {
      Write-DebugLog "emulator -list-avds produced no output"
    }
    Write-DebugLog "emulator -list-avds exit code: $($commandResult.ExitCode)"

    if (-not $commandResult.TimedOut) {
      foreach ($name in @(
        $commandResult.StdOut |
          ForEach-Object { "$_".Trim() } |
          Where-Object { $_ -and $_ -match $validAvdNamePattern }
      )) {
        if (-not $names.Contains($name)) {
          [void]$names.Add($name)
        }
      }
    }
  } catch {
    Write-DebugLog "emulator -list-avds threw: $($_.Exception.Message)"
  }

  return [string[]]@($names.ToArray())
}

function Wait-ForAndroidBoot {
  param(
    [string]$AdbPath,
    [string]$TargetDeviceId,
    [int]$TimeoutSeconds
  )

  Write-Step "Waiting for $TargetDeviceId to become available through adb"

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $deviceState = (& $AdbPath -s $TargetDeviceId get-state 2>$null).Trim()
      Write-DebugLog "ADB state poll for ${TargetDeviceId}: '$deviceState'"

      if ($deviceState -ne "device") {
        Start-Sleep -Seconds 3
        continue
      }

      $bootCompleted = (& $AdbPath -s $TargetDeviceId shell getprop sys.boot_completed 2>$null).Trim()
      $packageReady = (& $AdbPath -s $TargetDeviceId shell pm path android 2>$null)
      Write-DebugLog "Boot poll for ${TargetDeviceId}: sys.boot_completed='$bootCompleted', packageReady=$([bool]$packageReady)"

      if ($bootCompleted -eq "1" -and $packageReady) {
        return
      }
    } catch {
      Write-DebugLog "Boot poll for ${TargetDeviceId} failed: $($_.Exception.Message)"
      # Keep polling until timeout.
    }

    Start-Sleep -Seconds 3
  }

  throw "Timed out waiting for Android emulator $TargetDeviceId to boot."
}

function Wait-ForEmulatorDevice {
  param(
    [string]$AdbPath,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)

  while ((Get-Date) -lt $deadline) {
    $deviceId = Get-RunningEmulatorDevice -AdbPath $AdbPath
    if ($deviceId) {
      Write-DebugLog "Detected emulator device directly: $deviceId"
      return $deviceId
    }

    $runningDevices = Get-RunningAndroidDevices -AdbPath $AdbPath
    $firstEmulator = $runningDevices | Where-Object { $_ -like "emulator-*" } | Select-Object -First 1
    if ($firstEmulator) {
      Write-DebugLog "Detected emulator from running devices list: $firstEmulator"
      return $firstEmulator
    }

    Write-DebugLog "No emulator device detected yet. Running devices: $(if ($runningDevices.Count -gt 0) { $runningDevices -join ', ' } else { '<none>' })"
    Start-Sleep -Seconds 3
  }

  throw "The emulator process started, but no emulator device appeared in adb within $TimeoutSeconds seconds."
}

function Get-FirefoxPackageCandidates([string]$AdbPath, [string]$TargetDeviceId) {
  $packages = & $AdbPath -s $TargetDeviceId shell pm list packages 2>$null
  if (-not $packages) {
    return @()
  }

  $allPackages = @(
    $packages |
      ForEach-Object { $_.Trim() -replace "^package:", "" } |
      Where-Object { $_ -match "^org\.mozilla\." }
  )

  $preferredOrder = @(
    "org.mozilla.fenix",
    "org.mozilla.firefox",
    "org.mozilla.firefox_beta",
    "org.mozilla.fenix.nightly",
    "org.mozilla.focus",
    "org.mozilla.klar"
  )

  $ordered = New-Object System.Collections.Generic.List[string]

  foreach ($preferred in $preferredOrder) {
    if ($allPackages -contains $preferred) {
      [void]$ordered.Add($preferred)
    }
  }

  foreach ($packageName in $allPackages) {
    if (-not $ordered.Contains($packageName)) {
      [void]$ordered.Add($packageName)
    }
  }

  return @($ordered.ToArray())
}

function Ensure-FirefoxInstalled {
  param(
    [string]$AdbPath,
    [string]$TargetDeviceId,
    [string]$PreferredPackage,
    [string]$PreferredApkPath,
    [switch]$DryRunMode
  )

  $firefoxCandidates = @(
    Get-FirefoxPackageCandidates -AdbPath $AdbPath -TargetDeviceId $TargetDeviceId
  )
  if ($firefoxCandidates.Count -gt 0) {
    if ($PreferredPackage -and ($firefoxCandidates -contains $PreferredPackage)) {
      return $PreferredPackage
    }

    if ($PreferredPackage -and -not ($firefoxCandidates -contains $PreferredPackage)) {
      Write-Hint "Requested Firefox package '$PreferredPackage' is not installed; using detected package '$($firefoxCandidates[0])'."
    }

    return $firefoxCandidates[0]
  }

  if ($DryRunMode) {
    Write-Hint "Dry run: no Mozilla browser package is installed on the emulator."
    Write-Hint "Dry run: script would ask whether to install Firefox from a local APK."
    return $null
  }

  $resolvedFirefoxApkPath = $PreferredApkPath
  if ($resolvedFirefoxApkPath) {
    if (-not (Test-Path -LiteralPath $resolvedFirefoxApkPath)) {
      throw "Firefox APK path does not exist: $resolvedFirefoxApkPath"
    }
    $resolvedFirefoxApkPath = (Resolve-Path -LiteralPath $resolvedFirefoxApkPath).Path
  }

  if (-not $resolvedFirefoxApkPath -and $script:NonInteractiveMode) {
    throw @"
No Mozilla Android browser package was detected on $TargetDeviceId in CI/non-interactive mode.

Install Firefox into the emulator image ahead of time, or pass -FirefoxApkPath to install it automatically.
"@
  }

  if (-not $resolvedFirefoxApkPath -and -not (Prompt-YesNo "No Firefox for Android package was found on the emulator. Install one from a local APK now?")) {
    throw @"
No Mozilla Android browser package was detected on $TargetDeviceId.

Install Firefox for Android into the emulator first, or run the script again with:
-FirefoxApkPath C:\path\to\firefox.apk
"@
  }

  if (-not $resolvedFirefoxApkPath) {
    $resolvedFirefoxApkPath = Prompt-ExistingFilePath `
      -Question "Enter the full path to a Firefox Android APK (.apk), or leave empty to cancel" `
      -ExpectedExtension ".apk"
  }

  if (-not $resolvedFirefoxApkPath) {
    throw "Firefox APK installation was cancelled by the user."
  }

  Write-Step "Installing Firefox APK into the emulator"
  Write-DebugLog "adb install source: $resolvedFirefoxApkPath"
  & $AdbPath -s $TargetDeviceId install -r $resolvedFirefoxApkPath

  $firefoxCandidates = @(
    Get-FirefoxPackageCandidates -AdbPath $AdbPath -TargetDeviceId $TargetDeviceId
  )
  if ($firefoxCandidates.Count -eq 0) {
    throw @"
Firefox APK installation finished, but no Mozilla browser package was detected afterwards.

APK used:
$resolvedFirefoxApkPath
"@
  }

  if ($PreferredPackage -and ($firefoxCandidates -contains $PreferredPackage)) {
    return $PreferredPackage
  }

  return $firefoxCandidates[0]
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sdkRoot = Get-AndroidSdkRoot
$ndkVersions = Get-NdkVersions -SdkRoot $sdkRoot

$resolvedAdb = Resolve-ToolPath `
  -PreferredPath $AdbBin `
  -CommandName "adb" `
  -FallbackPaths @(
    $(if ($sdkRoot) { Join-Path $sdkRoot "platform-tools\\adb.exe" }),
    $(if ($sdkRoot) { Join-Path $sdkRoot "platform-tools\\adb" })
  )

$resolvedEmulator = Resolve-ToolPath `
  -PreferredPath $EmulatorBin `
  -CommandName "emulator" `
  -FallbackPaths @(
    $(if ($sdkRoot) { Join-Path $sdkRoot "emulator\\emulator.exe" }),
    $(if ($sdkRoot) { Join-Path $sdkRoot "emulator\\emulator" })
  )

$resolvedNpm = $null
$resolvedWebExt = $null

if (-not $SkipWebExt) {
  $resolvedNpm = Ensure-NpmPath -PreferredPath $NpmBin -DryRunMode:$DryRun
  $resolvedWebExt = Ensure-WebExtPath `
    -PreferredPath $WebExtBin `
    -ResolvedNpmPath $resolvedNpm `
    -DryRunMode:$DryRun
}

$missingTools = @()
if (-not $resolvedAdb) { $missingTools += "adb" }
if (-not $resolvedEmulator) { $missingTools += "Android emulator" }
if (-not $SkipWebExt -and -not $resolvedNpm) { $missingTools += "npm" }
if (-not $SkipWebExt -and -not $resolvedWebExt) { $missingTools += "web-ext" }

if ($missingTools.Count -gt 0) {
  throw @"
Missing required tools: $($missingTools -join ", ").

This script does not install dependencies automatically.
Install the missing tools yourself, then run it again.

Hints:
- adb + emulator usually come from Android SDK / Android Studio
- web-ext can be installed with npm, but this script will not do that for you
- you can also pass explicit paths via -AdbBin, -EmulatorBin, and -WebExtBin
"@
}

Write-Step "Using repo root: $repoRoot"
if ($sdkRoot) {
  Write-Hint "android sdk : $sdkRoot"
} else {
  Write-Hint "android sdk : not detected through ANDROID_SDK_ROOT / ANDROID_HOME"
}

if ($ndkVersions.Count -gt 0) {
  Write-Hint "android ndk : $($ndkVersions -join ', ')"
} else {
  Write-Hint "android ndk : not detected"
}

Write-Hint "adb      : $resolvedAdb"
Write-Hint "emulator : $resolvedEmulator"
if (-not $SkipWebExt) {
  Write-Hint "npm      : $resolvedNpm"
  Write-Hint "web-ext  : $resolvedWebExt"
}

if (-not $DeviceId) {
  $DeviceId = Get-RunningEmulatorDevice -AdbPath $resolvedAdb
}

if (-not $DeviceId) {
  $availableAvds = @(Get-AvailableAvds -EmulatorPath $resolvedEmulator -TimeoutSeconds $AvdListTimeoutSeconds)
  Write-DebugLog "Available AVDs after discovery: $(if ($availableAvds.Count -gt 0) { $availableAvds -join ', ' } else { '<none>' })"

  if (-not $AvdName) {
    if ($availableAvds.Count -gt 0) {
      if ($script:NonInteractiveMode) {
        if ($availableAvds.Count -eq 1) {
          $AvdName = $availableAvds[0]
          Write-DebugLog "CI/non-interactive mode auto-selected only available AVD: $AvdName"
        } else {
          throw @"
No -AvdName was provided in CI/non-interactive mode, and multiple AVDs are available.

Pass -AvdName explicitly. Available AVDs:
$($availableAvds -join [Environment]::NewLine)
"@
        }
      } else {
        Write-DebugLog "No -AvdName provided; invoking interactive selector."
        $AvdName = Select-OptionInteractive `
          -Title "Choose an Android Virtual Device" `
          -Options $availableAvds
      }
    } else {
      throw "No running emulator and no AVD found. Create an Android Virtual Device first."
    }
  }

  Write-Step "Starting Android emulator: $AvdName"
  $resolvedAvdHome = Get-AndroidAvdHome

  if ($DryRun) {
    $dryRunArgs = @(
      "-avd", $AvdName,
      "-netdelay", "none",
      "-netspeed", "full"
    )

    if (-not $DisableSafeEmulatorFlags) {
      $dryRunArgs += @(
        "-gpu", "swiftshader_indirect",
        "-no-snapshot-load",
        "-no-snapshot-save"
      )
    }

    $expectedIniPath = Get-AvdIniPath -AvdHome $resolvedAvdHome -AvdName $AvdName
    if (-not (Test-Path -LiteralPath $expectedIniPath)) {
      $expectedAvdDirectory = Get-AvdDirectoryPath -AvdHome $resolvedAvdHome -AvdName $AvdName
      if (Test-AvdDirectoryLooksValid -AvdDirectoryPath $expectedAvdDirectory) {
        Write-Hint "Dry run: script would synthesize temporary AVD metadata because $expectedIniPath is missing."
      }
    }

    $dryRunCpuArch = Get-AvdCpuArchitecture -AvdDirectoryPath (Get-AvdDirectoryPath -AvdHome $resolvedAvdHome -AvdName $AvdName)
    if ($dryRunCpuArch) {
      Write-Hint "Dry run: selected AVD CPU architecture is $dryRunCpuArch."
    }

    Write-Hint "Dry run: emulator would start with $($dryRunArgs -join ' ')"
    return
  }

  Assert-AvdSupportedByCurrentEmulator -AvdHome $resolvedAvdHome -AvdName $AvdName
  $avdLaunchMetadata = Ensure-AvdLaunchMetadata -AvdHome $resolvedAvdHome -AvdName $AvdName
  $emulatorArgs = @(
    "-avd", $AvdName,
    "-netdelay", "none",
    "-netspeed", "full"
  )

  if (-not $DisableSafeEmulatorFlags) {
    $emulatorArgs += @(
      "-gpu", "swiftshader_indirect",
      "-no-snapshot-load",
      "-no-snapshot-save"
    )
  }

  Write-DebugLog "Launching emulator with arguments: $($emulatorArgs -join ' ')"
  $logStamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $emulatorStdOutLog = Join-Path $env:TEMP "pepper-store-filter-emulator-${logStamp}-stdout.log"
  $emulatorStdErrLog = Join-Path $env:TEMP "pepper-store-filter-emulator-${logStamp}-stderr.log"
  Write-DebugLog "Emulator stdout log: $emulatorStdOutLog"
  Write-DebugLog "Emulator stderr log: $emulatorStdErrLog"
  $previousAndroidAvdHome = $env:ANDROID_AVD_HOME

  try {
    if ($avdLaunchMetadata.AvdHomeOverride) {
      $env:ANDROID_AVD_HOME = $avdLaunchMetadata.AvdHomeOverride
      Write-DebugLog "Temporarily setting ANDROID_AVD_HOME to $($avdLaunchMetadata.AvdHomeOverride)"
    }

    $emulatorProcess = Start-Process `
      -FilePath $resolvedEmulator `
      -ArgumentList $emulatorArgs `
      -RedirectStandardOutput $emulatorStdOutLog `
      -RedirectStandardError $emulatorStdErrLog `
      -PassThru
  } finally {
    if ($avdLaunchMetadata.AvdHomeOverride) {
      if ($previousAndroidAvdHome) {
        $env:ANDROID_AVD_HOME = $previousAndroidAvdHome
      } else {
        Remove-Item Env:ANDROID_AVD_HOME -ErrorAction SilentlyContinue
      }
    }
  }
  Write-DebugLog "Started emulator process id: $($emulatorProcess.Id)"

  Start-Sleep -Seconds 4
  if ($emulatorProcess.HasExited) {
    $stdoutTail = Get-FileTailText -Path $emulatorStdOutLog
    $stderrTail = Get-FileTailText -Path $emulatorStdErrLog

    if ($stdoutTail) {
      Write-DebugLog "Emulator stdout tail:`n$stdoutTail"
    }
    if ($stderrTail) {
      Write-DebugLog "Emulator stderr tail:`n$stderrTail"
    }

    $errorDetails = @(
      "The emulator process exited early with code $($emulatorProcess.ExitCode). The emulator itself likely crashed before adb could detect it.",
      "stdout log: $emulatorStdOutLog",
      "stderr log: $emulatorStdErrLog"
    )

    if ($stderrTail) {
      $errorDetails += "Last stderr lines:`n$stderrTail"
    } elseif ($stdoutTail) {
      $errorDetails += "Last stdout lines:`n$stdoutTail"
    }

    throw ($errorDetails -join [Environment]::NewLine + [Environment]::NewLine)
  }

  Write-Step "Waiting for emulator process to appear in adb"
  $DeviceId = Wait-ForEmulatorDevice `
    -AdbPath $resolvedAdb `
    -TimeoutSeconds $EmulatorStartupTimeoutSeconds
}

Wait-ForAndroidBoot -AdbPath $resolvedAdb -TargetDeviceId $DeviceId -TimeoutSeconds $BootTimeoutSeconds

$FirefoxPackage = Ensure-FirefoxInstalled `
  -AdbPath $resolvedAdb `
  -TargetDeviceId $DeviceId `
  -PreferredPackage $FirefoxPackage `
  -PreferredApkPath $FirefoxApkPath `
  -DryRunMode:$DryRun

if (-not $FirefoxPackage) {
  if ($DryRun) {
    Write-Step "Firefox for Android is required before the extension can be launched"
    Write-Hint "Dry run stops here because no Mozilla browser package is installed on the emulator."
    Write-Hint "Run again without -DryRun to install Firefox from a local APK, or pass -FirefoxApkPath explicitly."
    return
  }

  throw "No Firefox for Android package is available on $DeviceId."
}

Write-Step "Target device ready"
Write-Hint "device   : $DeviceId"
Write-Hint "firefox  : $FirefoxPackage"

if ($SkipWebExt) {
  Write-Step "Launching Firefox without temporary add-on install"

  if ($DryRun) {
    Write-Hint "Dry run: adb shell monkey -p $FirefoxPackage 1"
    return
  }

  & $resolvedAdb -s $DeviceId shell monkey -p $FirefoxPackage 1 | Out-Null
  Write-Host "Firefox launched on $DeviceId."
  return
}

$webExtArgs = @(
  "run",
  "--target=firefox-android",
  "--source-dir", $repoRoot.Path,
  "--android-device", $DeviceId,
  "--firefox-apk", $FirefoxPackage,
  "--adb-bin", $resolvedAdb,
  "--adb-discovery-timeout", $script:DefaultWebExtAdbDiscoveryTimeoutMs
)

Write-Step "Running the extension on Firefox for Android through web-ext"
Write-Hint "$resolvedWebExt $($webExtArgs -join ' ')"
Write-Hint "If web-ext waits for the Remote Debugging Server, enable 'Remote debugging via USB' in Firefox for Android: Settings -> Developer tools."

if ($DryRun) {
  return
}

& $resolvedWebExt @webExtArgs
