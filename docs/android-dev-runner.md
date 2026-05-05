# Android dev runner

This repo includes a helper script for running the extension on Firefox for Android without silently installing anything:

```powershell
.\scripts\run-android-firefox-dev.ps1
```

What it does:

- finds `adb`, `emulator`, `npm`, and `web-ext` if they are already installed,
- when `npm` or `web-ext` are missing, asks before attempting installation and waits for the tool to become available,
- prefers an already running emulator when one is available,
- otherwise discovers local AVDs and asks which one to launch,
- rejects unsupported ARM AVDs early and points you to `x86` / `x86_64` images,
- can temporarily recreate missing AVD `.ini` metadata when the `.avd` directory is still valid,
- starts the emulator with safer default flags unless you opt out with `-DisableSafeEmulatorFlags`,
- waits for Android boot by polling `adb get-state`, `sys.boot_completed`, and `pm path android`,
- detects an installed Mozilla browser package on the emulator,
- when Firefox is missing, can ask to install it from a local Android APK through `adb install -r`,
- runs the extension with `web-ext run --target=firefox-android`.

What it does not do:

- install Android Studio,
- install Android SDK tools,
- create an AVD,
- automatically download Firefox into the emulator,
- automatically enable Firefox's `Remote debugging via USB` setting.

Useful options:

```powershell
.\scripts\run-android-firefox-dev.ps1 -AvdName Pixel_9_API_35
.\scripts\run-android-firefox-dev.ps1 -DeviceId emulator-5554
.\scripts\run-android-firefox-dev.ps1 -FirefoxPackage org.mozilla.fenix
.\scripts\run-android-firefox-dev.ps1 -FirefoxApkPath C:\path\to\firefox.apk
.\scripts\run-android-firefox-dev.ps1 -SkipWebExt
.\scripts\run-android-firefox-dev.ps1 -DisableSafeEmulatorFlags
.\scripts\run-android-firefox-dev.ps1 -DryRun
.\scripts\run-android-firefox-dev.ps1 -Debug
```

Notes:

- `-SkipWebExt` keeps the emulator / Firefox flow but skips temporary add-on loading.
- `-DryRun` shows the planned steps without launching new work.
- `-Debug` prints extra diagnostics for tool detection, AVD discovery, emulator startup, stdout/stderr logs, and adb polling.
- If you do not pass `-AvdName` and there is no already running emulator, the script always asks which AVD to start.
- If multiple Android devices are already running, pass `-DeviceId` explicitly.
- If Firefox is missing on the emulator, the script can prompt for a local `.apk` file and install it with `adb install -r`.
- `web-ext` requires Firefox for Android to have `Remote debugging via USB` enabled in `Settings -> Developer tools`.
- The current Android AMO-style package name from `.\scripts\package-amo.ps1` is `dist/deal-store-filter-android-<version>.zip`.

Why not Docker by default:

- Android emulators inside Docker are possible, but on Windows they are usually heavier and more brittle than a local AVD setup.
- Hardware acceleration, nested virtualization, graphics forwarding, and adb connectivity tend to become the hard part.
- For day-to-day extension work, a local emulator plus `web-ext` is usually the simpler path.
