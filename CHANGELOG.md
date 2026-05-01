# Changelog

## 0.2.0

Release focused on making filtering easier to control without losing the saved store list.

### Added

- Settings view in the popup.
- Temporary `Disable filters` / `Enable filters` action.
- `Firefox Sync` setting for switching between synced storage and local-only storage.
- `Always filter when opening a page` setting.
- `Show filtered deals as dimmed` mode for keeping matched deals visible as compact dimmed cards.
- Inline `Filtered by Deal Store Filter` notice on dimmed cards.
- Inline `Remove filter` action on dimmed cards.
- Immediate active-tab refresh after changing filters or settings when the content script is available.
- Tests for dimmed mode, local-only storage, filter toggling, and inline filter removal.

### Changed

- The package version is now `0.2.0`.
- The AMO package script now creates `dist/deal-store-filter-0.2.0.zip`.

### Notes For AMO

- No new host permissions.
- No remote scripts, analytics, telemetry, `fetch()`, or `XMLHttpRequest`.
- Filter data remains stored only in Firefox extension storage.

