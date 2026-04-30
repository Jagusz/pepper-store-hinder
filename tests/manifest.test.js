const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

function loadManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "manifest.json"), "utf8")
  );
}

// Verifies the add-on stays on Firefox Manifest V2 for the first AMO release.
test("manifest uses Manifest V2", () => {
  const manifest = loadManifest();

  assert.equal(manifest.manifest_version, 2);
});

// Verifies the install-time permissions stay limited to storage and Pepper.pl.
test("manifest requests only minimal permissions", () => {
  const manifest = loadManifest();

  assert.equal(
    JSON.stringify(manifest.permissions),
    JSON.stringify(["storage", "https://www.pepper.pl/*"])
  );
});

// Verifies AMO privacy metadata declares no data collection outside the
// extension.
test("manifest declares no data collection", () => {
  const manifest = loadManifest();

  assert.deepEqual(
    manifest.browser_specific_settings.gecko.data_collection_permissions,
    { required: ["none"] }
  );
});

// Verifies the add-on does not load remote scripts from the manifest.
test("manifest does not declare remote scripts", () => {
  const manifest = loadManifest();
  const manifestText = JSON.stringify(manifest);

  assert.equal(/https?:\/\/(?!www\.pepper\.pl\/\*)/.test(manifestText), false);
});

// Verifies user-facing metadata uses the intended unofficial product name and
// AMO description.
test("manifest uses publication-ready name and description", () => {
  const manifest = loadManifest();

  assert.equal(manifest.name, "Filtr sklepów dla Pepper.pl");
  assert.equal(
    manifest.description,
    "Nieoficjalne rozszerzenie do ukrywania ofert z wybranych sklepów na Pepper.pl. Lista filtrów może być synchronizowana przez Firefox Sync."
  );
});
