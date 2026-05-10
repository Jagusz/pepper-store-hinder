const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadI18n() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "i18n.js"),
    "utf8"
  );
  const context = { globalThis: {} };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "i18n.js" });
  return context.globalThis.DealStoreFilterI18n;
}

test("normalizeUiLanguageSetting returns auto for auto", () => {
  const i18n = loadI18n();

  assert.equal(i18n.normalizeUiLanguageSetting("auto"), "auto");
});

test("normalizeUiLanguageSetting returns en for en", () => {
  const i18n = loadI18n();

  assert.equal(i18n.normalizeUiLanguageSetting("en"), "en");
});

test("normalizeUiLanguageSetting returns pl for pl", () => {
  const i18n = loadI18n();

  assert.equal(i18n.normalizeUiLanguageSetting("pl"), "pl");
});

test("normalizeUiLanguageSetting normalizes case and whitespace", () => {
  const i18n = loadI18n();

  assert.equal(i18n.normalizeUiLanguageSetting("  EN  "), "en");
  assert.equal(i18n.normalizeUiLanguageSetting("Pl"), "pl");
});

test("normalizeUiLanguageSetting falls back to auto for unsupported languages", () => {
  const i18n = loadI18n();

  assert.equal(i18n.normalizeUiLanguageSetting("de"), "auto");
  assert.equal(i18n.normalizeUiLanguageSetting("fr"), "auto");
  assert.equal(i18n.normalizeUiLanguageSetting("es"), "auto");
});

test("normalizeUiLanguageSetting handles null and undefined", () => {
  const i18n = loadI18n();

  assert.equal(i18n.normalizeUiLanguageSetting(null), "auto");
  assert.equal(i18n.normalizeUiLanguageSetting(undefined), "auto");
  assert.equal(i18n.normalizeUiLanguageSetting(""), "auto");
});

test("getPrimaryLanguageCode extracts the primary code", () => {
  const i18n = loadI18n();

  assert.equal(i18n.getPrimaryLanguageCode("pl-PL"), "pl");
  assert.equal(i18n.getPrimaryLanguageCode("en-US"), "en");
  assert.equal(i18n.getPrimaryLanguageCode("de-DE"), "de");
});

test("getPrimaryLanguageCode handles underscore separators", () => {
  const i18n = loadI18n();

  assert.equal(i18n.getPrimaryLanguageCode("pl_PL"), "pl");
  assert.equal(i18n.getPrimaryLanguageCode("en_US"), "en");
});

test("getPrimaryLanguageCode returns empty for null/undefined", () => {
  const i18n = loadI18n();

  assert.equal(i18n.getPrimaryLanguageCode(null), "");
  assert.equal(i18n.getPrimaryLanguageCode(undefined), "");
  assert.equal(i18n.getPrimaryLanguageCode(""), "");
});

test("isPolishLanguage detects Polish language codes", () => {
  const i18n = loadI18n();

  assert.equal(i18n.isPolishLanguage("pl"), true);
  assert.equal(i18n.isPolishLanguage("pl-PL"), true);
  assert.equal(i18n.isPolishLanguage("pl_PL"), true);
  assert.equal(i18n.isPolishLanguage("PL"), true);
});

test("isPolishLanguage rejects non-Polish codes", () => {
  const i18n = loadI18n();

  assert.equal(i18n.isPolishLanguage("en"), false);
  assert.equal(i18n.isPolishLanguage("en-US"), false);
  assert.equal(i18n.isPolishLanguage("de"), false);
  assert.equal(i18n.isPolishLanguage(""), false);
});

test("resolveUiLanguage returns explicit setting when not auto", () => {
  const i18n = loadI18n();

  assert.equal(i18n.resolveUiLanguage("en"), "en");
  assert.equal(i18n.resolveUiLanguage("pl"), "pl");
});

test("resolveUiLanguage resolves from page language when auto", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.resolveUiLanguage("auto", { pageLanguage: "pl-PL" }),
    "pl"
  );
  assert.equal(
    i18n.resolveUiLanguage("auto", { pageLanguage: "en-US" }),
    "en"
  );
});

test("resolveUiLanguage falls back to browser language when page language is missing", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.resolveUiLanguage("auto", { browserLanguage: "pl-PL" }),
    "pl"
  );
  assert.equal(
    i18n.resolveUiLanguage("auto", { browserLanguage: "en-US" }),
    "en"
  );
});

test("resolveUiLanguage checks browserLanguages array", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.resolveUiLanguage("auto", {
      browserLanguage: "en-US",
      browserLanguages: ["de-DE", "pl-PL"]
    }),
    "pl"
  );
  assert.equal(
    i18n.resolveUiLanguage("auto", {
      browserLanguage: "en-US",
      browserLanguages: ["de-DE", "fr-FR"]
    }),
    "en"
  );
});

test("resolveLanguageFromSources prefers page language", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.resolveLanguageFromSources({
      pageLanguage: "en-US",
      browserLanguage: "pl-PL"
    }),
    "en"
  );
});

test("resolveLanguageFromSources falls back to browser language", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.resolveLanguageFromSources({
      pageLanguage: "",
      browserLanguage: "pl-PL"
    }),
    "pl"
  );
});

test("resolveLanguageFromSources defaults to en when no sources", () => {
  const i18n = loadI18n();

  assert.equal(i18n.resolveLanguageFromSources({}), "en");
  assert.equal(i18n.resolveLanguageFromSources(), "en");
});

test("t interpolates parameters", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.t("en", "filterStoreButton", { name: "Amazon.pl" }),
    "Hide store: Amazon.pl"
  );
  assert.equal(
    i18n.t("pl", "filterStoreButton", { name: "Amazon.pl" }),
    "Ukryj sklep: Amazon.pl"
  );
});

test("t interpolates pluginName parameter", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.t("en", "dimmedStoreNotice", { pluginName: "Test Plugin" }),
    "Test Plugin: Filtered by store filter"
  );
  assert.equal(
    i18n.t("pl", "dimmedStoreNotice", { pluginName: "Test Plugin" }),
    "Test Plugin: Ukryte przez filtr sklepu"
  );
});

test("DEFAULT_UI_LANGUAGE is auto", () => {
  const i18n = loadI18n();

  assert.equal(i18n.DEFAULT_UI_LANGUAGE, "auto");
});

test("SUPPORTED_UI_LANGUAGES contains en and pl", () => {
  const i18n = loadI18n();

  assert.deepEqual([...i18n.SUPPORTED_UI_LANGUAGES], ["en", "pl"]);
});

test("TRANSLATIONS contains en and pl dictionaries", () => {
  const i18n = loadI18n();

  assert.ok(i18n.TRANSLATIONS.en);
  assert.ok(i18n.TRANSLATIONS.pl);
  assert.ok(i18n.TRANSLATIONS.en.appTitle);
  assert.ok(i18n.TRANSLATIONS.pl.appTitle);
});

test("t handles null/undefined params gracefully", () => {
  const i18n = loadI18n();

  assert.equal(i18n.t("en", "appTitle", null), "Deal Store Filter");
  assert.equal(i18n.t("en", "appTitle", undefined), "Deal Store Filter");
});

test("resolveUiLanguage handles null/undefined setting", () => {
  const i18n = loadI18n();

  assert.equal(
    i18n.resolveUiLanguage(null, { pageLanguage: "pl-PL" }),
    "pl"
  );
  assert.equal(
    i18n.resolveUiLanguage(undefined, { pageLanguage: "pl-PL" }),
    "pl"
  );
});
