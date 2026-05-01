# Store Filter for Pepper.pl

[Polish version](README.md)

An unofficial Firefox extension that lets you hide Pepper.pl deals from selected stores.

This extension is not created, supported, or endorsed by Pepper.pl.

## Features

- Works on `https://www.pepper.pl/*`.
- Adds a `Filtruj sklep: Store name` button next to deals.
- Hides deals from stores saved on the filter list.
- Works on deal listings and individual deal pages.
- Reads the store from `data-vue3` data when Pepper.pl exposes it in the deal component.
- Uses `props.thread.merchant.merchantName` as the primary store name.
- When `merchant` is empty, uses `props.thread.linkHost`, for example `www.facebook.com` -> `facebook.com`.
- When structured data is unavailable, tries to read the store from visible deal text, including labels such as `Dostępne w` and `Zrealizuj na`.
- Ignores `Discussion` entries.
- The popup lets you manually add, remove, and clear stores.

## How It Works

On deal listings, the extension first reads data embedded by Pepper.pl in the `data-vue3` attribute:

```text
props.thread.merchant.merchantName
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

The text fallback also cleans appended Pepper.pl labels, CTA button text, and voucher codes, so the filter button does not receive names like `FlaconiSPRINGTIMEPobierz kod`.

When a store can be detected, the extension adds this button next to the deal:

```text
Filtruj sklep: Store name
```

Clicking the button asks for confirmation, saves the store to the filter list, and hides all deals from the same store.

It is best to add store names exactly as they appear on Pepper.pl, for example `Amazon.pl`, `Media Expert`, `ALDI`.

## Privacy

The hidden store list is stored with `browser.storage.sync` so filters can be synchronized between the user's devices through Firefox Sync. The extension does not send this data to the add-on author, does not use its own server, does not include analytics, and does not load remote code.

The extension uses `browser.storage.local` as a fallback/cache. On the Android branch, the list read from Firefox Sync is merged with the local copy so locally saved filters are not lost when Sync is temporarily unavailable or behaves differently on Firefox for Android.

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

The `browser.storage.local` copy is kept to make the add-on more resilient to Sync errors or temporary unavailability. On the Android branch, reads return a deduplicated list merged from both storage locations.

## Local Installation for Testing

1. Open this page in Firefox:

   ```text
   about:debugging#/runtime/this-firefox
   ```

2. Click `Load Temporary Add-on`.
3. Select `manifest.json` from the extension directory.
4. Open `https://www.pepper.pl/`.

After changing files, click `Reload` next to the add-on in `about:debugging`, then refresh the Pepper.pl tab.

## Firefox for Android

The `android` branch declares Firefox for Android compatibility:

```json
"browser_specific_settings": {
  "gecko_android": {}
}
```

The manifest also keeps a stable Gecko ID, which is required for signing and stable WebExtension storage behavior.

## Publishing / ZIP Packaging

Mozilla Add-ons expects a ZIP that contains the add-on files without a parent directory.

On Windows, you can use this script:

```powershell
.\scripts\package-amo.ps1
```

The script creates:

```text
dist/filtr-sklepow-dla-pepper-pl.zip
```

The ZIP contains only the files required to run the add-on:

- `manifest.json`
- `content.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `LICENSE`

The package does not include `.git`, `.github`, `tests`, `node_modules`, or CI files.

## Unofficial Add-on

Store Filter for Pepper.pl is an independent project.

The extension is not created, supported, or endorsed by Pepper.pl. The Pepper.pl name is used only to identify the website where the add-on works.

## Debugging

You can enable debug logs in the console on Pepper.pl:

```js
localStorage.setItem("pepperStoreFilterDebug", "1")
location.reload()
```

After refreshing, the console will show entries starting with:

```text
[Filtr sklepów Pepper]
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
node tests/manifest-android.test.js
```

The tests cover, among other things:

- store name normalization,
- merging lists saved in Firefox Sync and local storage,
- parsing `data-vue3` data,
- finding `props.thread`,
- fallback to `linkHost` when `merchant` is empty,
- fallback to rendered deal text,
- handling `Dostępne w` and `Zrealizuj na` labels,
- cleaning appended labels, voucher codes, and CTA text from store names,
- ignoring offers where no store name can be detected,
- ignoring `Discussion` entries,
- manifest declarations required for publishing on Firefox for Android.

The same tests run in GitHub Actions.

## Files

- `manifest.json` - Firefox Manifest V2 add-on configuration.
- `content.js` - logic running on Pepper.pl.
- `popup.html` - popup HTML.
- `popup.js` - popup logic and store list management.
- `popup.css` - popup styles.
- `scripts/package-amo.ps1` - script that creates the AMO ZIP.

## License

This project is released under the MIT license. See `LICENSE` for details.
