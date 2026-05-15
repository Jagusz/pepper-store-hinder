# Deal Store Filter

[Polish version](README.md)

[Changelog](CHANGELOG.md)

## What's New In 0.3.0

- Added a structured thread-data cache for Pepper listing cards so the extension can keep the store and category after the page re-renders the first deals on listing pages.
- Tightened the listing parser to avoid using an early text-only fallback on cards that already expose `ThreadMainListItemNormalizer` but have not finished hydrating yet.
- The content script now starts at `document_start` and begins observing the DOM even before `body` exists, which improves handling of the first cards on listing pages.
- Expanded tests to cover Pepper category parsing, category-only deals, partial button recovery, cached normalizer reuse after DOM updates, and the case where the category button is missing on the first render.

An unofficial Firefox extension that lets you hide deals from selected stores on supported shopping and deal websites.

The current version works on Pepper.pl. This extension is not created, supported, or endorsed by Pepper.pl.

## Features

- Currently works on `https://www.pepper.pl/*`.
- Adds a `Filtruj sklep: Store name` button next to deals.
- Hides deals from stores saved on the filter list.
- Works on deal listings and individual deal pages.
- Reads the store from `data-vue3` data when the supported website exposes it in the deal component.
- Uses `props.thread.merchant.merchantName` as the primary store name.
- Reads the Pepper category from `props.thread.mainGroup.threadGroupName`.
- When `merchant` is empty, uses `props.thread.linkHost`, for example `www.facebook.com` -> `facebook.com`.
- When structured data is unavailable, tries to read the store from visible deal text, including labels such as `Dostępne w` and `Zrealizuj na`.
- Ignores `Discussion` entries.
- The popup lets you manually add, remove, and clear stores.
- The popup uses separate `Shops` and `Category` tabs, so store and category filters stay organized.
- The extension can also filter deals by Pepper category read from `props.thread.mainGroup.threadGroupName`.

## How It Works

On deal listings, the extension first reads data embedded by the supported website in the `data-vue3` attribute:

```text
props.thread.merchant.merchantName
props.thread.mainGroup.threadGroupName
```

If a deal has no assigned `merchant`, the extension tries to use the link host:

```text
props.thread.linkHost
```

If structured data is unavailable, the extension uses the rendered page text and looks for labels such as:

```text
Dostępne w Store name
Zrealizuj na Store name
```

The text fallback also cleans appended website labels, CTA button text, and voucher codes, so the filter button does not receive names like `FlaconiSPRINGTIMEPobierz kod`.

On Pepper deal listings, the first cards may be re-rendered by the frontend shortly after the initial HTML is painted. To avoid losing the category or store name, the extension starts at `document_start`, observes the DOM before `body` exists, stores structured deal data from `ThreadMainListItemNormalizer` in an internal cache, and can reuse it later even if Pepper removes or replaces the normalizer in the DOM.

When a store can be detected, the extension adds this button next to the deal:

```text
Filtruj sklep: Store name
```

Clicking the button asks for confirmation, saves the store to the filter list, and hides all deals from the same store.

It is best to add store names exactly as they appear on the supported website, for example `Amazon.pl`, `Media Expert`, `ALDI`.

## Privacy

The hidden store list is stored with `browser.storage.sync` so filters can be synchronized between the user's devices through Firefox Sync. The extension does not send this data to the add-on author, does not use its own server, does not include analytics, and does not load remote code.

The extension uses `browser.storage.local` only as a fallback/cache. When Firefox Sync works, `browser.storage.sync` is the source of truth and the local copy is overwritten with the current list. If Firefox Sync is temporarily unavailable or returns an error, the extension uses the local copy.

The extension does not use:

- `fetch()`,
- `XMLHttpRequest`,
- analytics,
- telemetry,
- external scripts,
- npm dependencies,
- a custom backend.

## Synchronization

The main storage location for the filter list is `browser.storage.sync`. If the user has Firefox Sync and add-on synchronization enabled, the list may be available on other devices signed in to the same Firefox/Mozilla account.

The `browser.storage.local` copy is kept only to make the add-on more resilient to Sync errors or temporary unavailability.

If you turn off `Firefox Sync` in settings, the extension does not read or write the filter list in `browser.storage.sync`. In that mode, the filter list stays only in the local Firefox profile.

## Settings

The popup has a settings view opened with the gear button.

- `Firefox Sync` - stores the filter list in `browser.storage.sync` and keeps a local fallback copy. When disabled, the list is stored only locally on the current device.
- `Always filter when opening a page` - automatically turns filtering back on when a supported page opens, even if filtering was temporarily disabled earlier.
- `Enable category filters` - turns category filtering on or off without clearing the saved category list.
- `Show filtered deals as compact previews` - keeps matching deals in the listing as compact previews instead of hiding them completely.
- `Show filtered deals above this threshold` - shows deals from filtered stores when their temperature is equal to or higher than the configured threshold.
- `Show filtered deals threshold` - sets the temperature threshold for showing deals from filtered stores.
- `Hide deals below this threshold` - hides deals when their temperature drops below the configured threshold.
- `Show deals below threshold as compact previews` - keeps below-threshold deals as dimmed compact previews instead of hiding them completely.
- `Hide deals threshold` - sets the temperature threshold for hiding deals with too low a temperature.

The `Disable filters` / `Enable filters` button in the main popup view temporarily shows or hides matching deals without clearing the saved store list.

## Local Installation for Testing

1. Open this page in Firefox:

   ```text
   about:debugging#/runtime/this-firefox
   ```

2. Click `Load Temporary Add-on`.
3. Select `manifest.json` from the extension directory.
4. Open `https://www.pepper.pl/`.

After changing files, click `Reload` next to the add-on in `about:debugging`, then refresh the supported website tab.

## Publishing / ZIP Packaging

Mozilla Add-ons expects a ZIP that contains the add-on files without a parent directory.

On Windows, you can use this script:

```powershell
.\scripts\package-amo.ps1
```

The script creates a file based on the version from `manifest.json`:

```text
dist/deal-store-filter-<manifest-version>.zip
```

The ZIP contains only the files required to run the add-on:

- `manifest.json`
- `i18n.js`
- `content.js`
- `popup.html`
- `popup.js`
- `popup.css`

The package does not include `.git`, `.github`, `tests`, `node_modules`, `dist`, or files such as `README.md`, `LICENSE`, `package.json`, and `package-lock.json`.

## Unofficial Add-on

Deal Store Filter is an independent project.

The extension is not created, supported, or endorsed by Pepper.pl. The Pepper.pl name is used only to identify the currently supported website.

## Debugging

You can enable debug logs in the console on a supported website:

```js
localStorage.setItem("pepperStoreFilterDebug", "1")
location.reload()
```

After refreshing, the console will show entries starting with:

```text
[Deal Store Filter]
```

To disable logs:

```js
localStorage.removeItem("pepperStoreFilterDebug")
location.reload()
```

You can also enable debugging only for one tab by adding this query parameter to the address:

```text
?pshdebug=1
```

## Tests

The project has lightweight tests based on the built-in Node.js test runner, with no npm dependencies.

Syntax checks:

```bash
node --check content.js
node --check popup.js
```

Run tests:

```bash
node tests/content.test.js
node tests/manifest.test.js
```

The tests cover, among other things:

- store name normalization,
- saving and reading through Firefox Sync,
- fallback to local storage,
- parsing `data-vue3` data,
- finding `props.thread`,
- reading the category from `mainGroup`,
- fallback to `linkHost` when `merchant` is empty,
- fallback to rendered deal text,
- handling `Dostępne w` and `Zrealizuj na` labels,
- cleaning appended labels, voucher codes, and CTA text from store names,
- ignoring offers where no store name can be detected,
- ignoring `Discussion` entries,
- skipping premature text fallback for cards that already expose a Pepper normalizer,
- reusing cached `ThreadMainListItemNormalizer` data after Pepper removes the normalizer from the first cards,
- adding the missing category button after a card first appears with only a store button,
- first-card cases where Pepper renders an empty normalizer before the full category data arrives,
- manifest declarations required for publishing.

The same tests run in GitHub Actions.

## Files

- `manifest.json` - Firefox Manifest V2 add-on configuration.
- `i18n.js` - shared translations and UI language selection logic.
- `content.js` - logic running on supported websites.
- `popup.html` - popup HTML.
- `popup.js` - popup logic and store list management.
- `popup.css` - popup styles.
- `scripts/package-amo.ps1` - script that creates the AMO ZIP.

## License

This project is released under the MIT license. See `LICENSE` for details.
