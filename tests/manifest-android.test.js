const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function loadManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
  );
}

// Verifies the Android branch advertises Firefox for Android compatibility to
// AMO by including browser_specific_settings.gecko_android.
test("manifest declares Firefox for Android compatibility", () => {
  const manifest = loadManifest();

  assert.deepEqual(manifest.browser_specific_settings.gecko_android, {});
});

// Verifies the add-on keeps a stable Gecko ID, which is required for signing
// and for consistent WebExtension storage behavior.
test("manifest keeps a stable Gecko extension id", () => {
  const manifest = loadManifest();

  assert.equal(
    manifest.browser_specific_settings.gecko.id,
    "filtr-sklepow-pepper@example.local"
  );
});

// Verifies the manifest states that the extension does not collect or transmit
// user data outside the extension, matching the privacy behavior of the code.
test("manifest declares no data collection", () => {
  const manifest = loadManifest();

  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions,
    { required: ["none"] }
  );
});
