# Changelog

## Unreleased

## 0.3.0

### Changed

- Added a structured thread-data cache for Pepper listing cards so the extension can keep the store and category after the page re-renders the first deals on listing pages.
- Tightened the listing parser to avoid using an early text-only fallback on cards that already expose `ThreadMainListItemNormalizer` but have not finished hydrating yet.
- The content script now starts at `document_start` and begins observing the DOM even before `body` exists, which improves handling of the first cards on listing pages.
- Expanded tests to cover Pepper category parsing, category-only deals, partial button recovery, cached normalizer reuse after DOM updates, and the case where the category button is missing on the first render.

## 0.2.0

Release focused on making filtering easier to control without losing the saved store list.

### Added

- Settings view in the popup.
- Temporary `Disable filters` / `Enable filters` action.
- `Firefox Sync` setting for switching between synced storage and local-only storage.
- `Always filter when opening a page` setting.
- `Show filtered deals as compact previews` setting for keeping matched deals visible as compact previews.
- `Show filtered deals above this threshold` option with its own threshold field.
- `Hide other deals below this threshold` option with its own threshold field.
- Inline `Filtered by Deal Store Filter` notice on compact previews.
- Inline `Remove filter` action on compact previews.
- Immediate active-tab refresh after changing filters or settings when the content script is available.
- Tests for compact previews, local-only storage, filter toggling, and inline filter removal.

### Changed

- The package version is now `0.2.0`.
- The AMO package script now reads the ZIP version from `manifest.json`.

### Notes For AMO

- No new host permissions.
- No remote scripts, analytics, telemetry, `fetch()`, or `XMLHttpRequest`.
- Filter data remains stored only in Firefox extension storage.
