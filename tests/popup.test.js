const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createMockElement(tagName = "div", extra = {}) {
  const calls = [];
  const children = [];

  return {
    tagName,
    id: "",
    className: "",
    classList: {
      toggle: () => {},
      add: () => {},
      remove: () => {}
    },
    dataset: {},
    style: {},
    textContent: "",
    title: "",
    type: "",
    hidden: false,
    disabled: false,
    options: extra.options || [],
    children,
    appendChild: (child) => {
      children.push(child);
    },
    append: (...items) => {
      for (const item of items) {
        children.push(item);
      }
    },
    prepend: (child) => {
      children.unshift(child);
    },
    addEventListener: (...args) => {
      calls.push(args);
    },
    setAttribute: () => {},
    remove: () => {},
    replaceChildren: () => {
      children.length = 0;
    },
    querySelector: () => null,
    addEventListenerCalls: calls,
    focus: () => {}
  };
}

function createMockDocument(overrides = {}) {
  const elements = {};

  function querySelector(selector) {
    if (overrides[selector]) return overrides[selector];
    if (!elements[selector]) {
      elements[selector] = createMockElement();
    }
    return elements[selector];
  }

  return {
    documentElement: {
      lang: "en",
      classList: { toggle: () => {} }
    },
    title: "",
    querySelector,
    querySelectorAll: () => [],
    createElement: createMockElement,
    addEventListener: () => {},
    _elements: elements
  };
}

function deepMergeBrowser(defaults, overrides) {
  const result = { ...defaults };
  for (const key of Object.keys(overrides)) {
    if (typeof overrides[key] === "object" && overrides[key] !== null && !Array.isArray(overrides[key])) {
      result[key] = deepMergeBrowser(defaults[key] || {}, overrides[key]);
    } else {
      result[key] = overrides[key];
    }
  }
  return result;
}

function loadPopup(overrides = {}) {
  const i18nSource = fs.readFileSync(
    path.join(__dirname, "..", "i18n.js"),
    "utf8"
  );
  const source = fs.readFileSync(
    path.join(__dirname, "..", "popup.js"),
    "utf8"
  );

  const mockDocument = overrides.document || createMockDocument();

  const defaultBrowser = {
    storage: {
      sync: {
        get: async () => ({ hiddenStores: [], hiddenCategories: [] }),
        set: async () => {}
      },
      local: {
        get: async (defaults) => {
          const result = {};
          for (const key of Object.keys(defaults)) {
            result[key] = defaults[key];
          }
          return result;
        },
        set: async () => {}
      },
      onChanged: {
        addListener: () => {}
      }
    },
    tabs: {
      query: async () => [],
      sendMessage: async () => {}
    },
    i18n: {
      getUILanguage: () => "en-US"
    }
  };

  const browser = deepMergeBrowser(defaultBrowser, overrides.browser || {});

  const context = {
    console,
    setTimeout,
    clearTimeout,
    document: mockDocument,
    browser,
    navigator: overrides.navigator || {
      language: "en-US",
      languages: ["en-US"]
    },
    window: {
      confirm: overrides.confirm || (() => true)
    }
  };

  vm.createContext(context);
  vm.runInContext(i18nSource, context, { filename: "i18n.js" });
  vm.runInContext(source, context, { filename: "popup.js" });
  return context;
}

test("normalizeStoreName trims and collapses whitespace", () => {
  const context = loadPopup();

  assert.equal(context.normalizeStoreName("  Amazon   .pl  "), "Amazon .pl");
});

test("normalizeText lowercases and collapses whitespace", () => {
  const context = loadPopup();

  assert.equal(context.normalizeText("  Amazon.PL  "), "amazon.pl");
});

test("normalizeThresholdValue parses valid numbers and rejects invalid", () => {
  const context = loadPopup();

  assert.equal(context.normalizeThresholdValue("200"), 200);
  assert.equal(context.normalizeThresholdValue("9.5"), 9.5);
  assert.equal(context.normalizeThresholdValue("9,5"), 9.5);
  assert.equal(context.normalizeThresholdValue(""), null);
  assert.equal(context.normalizeThresholdValue("-1"), null);
  assert.equal(context.normalizeThresholdValue("abc"), null);
  assert.equal(context.normalizeThresholdValue(null), null);
  assert.equal(context.normalizeThresholdValue(undefined), null);
  assert.equal(context.normalizeThresholdValue(0), 0);
});

test("normalizeSettings falls back to legacy threshold", () => {
  const context = loadPopup();

  const result = context.normalizeSettings({
    showFilteredAboveThreshold: true,
    hideUnfilteredBelowThreshold: true,
    temperatureThreshold: 150
  });

  assert.equal(result.showFilteredThreshold, 150);
  assert.equal(result.hideUnfilteredThreshold, 150);
});

test("normalizeSettings handles empty input", () => {
  const context = loadPopup();

  const result = context.normalizeSettings({});

  assert.equal(result.useFirefoxSync, true);
  assert.equal(result.alwaysFilterOnPageOpen, true);
  assert.equal(result.filtersEnabled, true);
  assert.equal(result.categoryFiltersEnabled, true);
  assert.equal(result.showFilteredAsDimmed, false);
  assert.equal(result.showFilteredThreshold, null);
  assert.equal(result.hideUnfilteredThreshold, null);
  assert.equal(result.uiLanguage, "auto");
});

test("normalizeSettings handles undefined input", () => {
  const context = loadPopup();

  const result = context.normalizeSettings(undefined);

  assert.equal(result.useFirefoxSync, true);
  assert.equal(result.filtersEnabled, true);
});

test("mergeStoreLists removes duplicates case-insensitively", () => {
  const context = loadPopup();

  assert.equal(
    JSON.stringify(context.mergeStoreLists(["Amazon.pl", "ALDI"], [" amazon.PL ", "Netto"])),
    JSON.stringify(["ALDI", "Amazon.pl", "Netto"])
  );
});

test("mergeStoreLists handles empty and non-array inputs", () => {
  const context = loadPopup();

  assert.equal(
    JSON.stringify(context.mergeStoreLists(null, undefined, "not-array")),
    JSON.stringify([])
  );
});

test("getSettings reads from storage.local", async () => {
  const context = loadPopup({
    browser: {
      storage: {
        local: {
          get: async (defaults) => {
            assert.ok(Object.prototype.hasOwnProperty.call(defaults, "settings"));
            return { settings: { useFirefoxSync: false } };
          }
        }
      }
    }
  });

  const settings = await context.getSettings();

  assert.equal(settings.useFirefoxSync, false);
});

test("saveSettings normalizes and saves settings", async () => {
  let savedValue = null;
  const context = loadPopup({
    browser: {
      storage: {
        local: {
          get: async () => ({ settings: {} }),
          set: async (value) => {
            savedValue = value;
          }
        }
      }
    }
  });

  await context.saveSettings({ filtersEnabled: false });

  assert.ok(savedValue);
  assert.ok(Object.prototype.hasOwnProperty.call(savedValue, "settings"));
  assert.equal(savedValue.settings.filtersEnabled, false);
});

test("setStatus updates status text element", () => {
  const statusElement = createMockElement();
  const context = loadPopup({
    document: createMockDocument({
      "#storage-status": statusElement,
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  context.setStatus("Test message");

  assert.equal(statusElement.textContent, "Test message");
});

test("setStatus handles null statusText gracefully", () => {
  const context = loadPopup({
    document: createMockDocument()
  });

  assert.doesNotThrow(() => {
    context.setStatus("Test message");
  });
});

test("getActiveFilterConfig returns shops config by default", () => {
  const context = loadPopup({
    document: createMockDocument({
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  const config = context.getActiveFilterConfig();

  assert.equal(config.storageKey, "hiddenStores");
  assert.equal(config.emptyMessage, "No hidden stores.");
});

test("renderStores renders empty state", () => {
  const listElement = createMockElement();
  const clearButton = createMockElement();
  const context = loadPopup({
    document: createMockDocument({
      "#store-list": listElement,
      "#clear-filters": clearButton,
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  context.renderStores([]);

  assert.equal(listElement.children.length, 1);
  assert.equal(listElement.children[0].className, "empty");
  assert.equal(clearButton.disabled, true);
});

test("renderStores renders store list", () => {
  const listElement = createMockElement();
  const clearButton = createMockElement();
  const context = loadPopup({
    document: createMockDocument({
      "#store-list": listElement,
      "#clear-filters": clearButton,
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  context.renderStores(["Amazon.pl", "Netto"]);

  assert.equal(listElement.children.length, 2);
  assert.equal(clearButton.disabled, false);
});

test("getHiddenValues uses sync as primary source", async () => {
  let syncGetCalls = 0;
  let localSetCalls = 0;
  const context = loadPopup({
    browser: {
      storage: {
        sync: {
          get: async () => {
            syncGetCalls += 1;
            return { hiddenStores: ["Amazon.pl"] };
          },
          set: async () => {}
        },
        local: {
          get: async () => ({ hiddenStores: [] }),
          set: async () => {
            localSetCalls += 1;
          }
        }
      }
    },
    document: createMockDocument({
      "#storage-status": createMockElement(),
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  const values = await context.getHiddenValues("hiddenStores", { useFirefoxSync: true });

  assert.ok(syncGetCalls > 0);
  assert.ok(localSetCalls > 0);
  assert.equal(JSON.stringify(values), JSON.stringify(["Amazon.pl"]));
});

test("getHiddenValues falls back to local when sync fails", async () => {
  const context = loadPopup({
    browser: {
      storage: {
        sync: {
          get: async () => {
            throw new Error("sync unavailable");
          },
          set: async () => {}
        },
        local: {
          get: async () => ({ hiddenStores: ["Netto"] }),
          set: async () => {}
        }
      }
    },
    document: createMockDocument({
      "#storage-status": createMockElement(),
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  const values = await context.getHiddenValues("hiddenStores", { useFirefoxSync: true });

  assert.equal(JSON.stringify(values), JSON.stringify(["Netto"]));
});

test("saveHiddenValues saves to sync and local", async () => {
  let syncSetCalls = 0;
  let localSetCalls = 0;
  const context = loadPopup({
    browser: {
      storage: {
        sync: {
          get: async () => ({}),
          set: async () => {
            syncSetCalls += 1;
          }
        },
        local: {
          get: async () => ({}),
          set: async () => {
            localSetCalls += 1;
          }
        },
        tabs: {
          query: async () => [],
          sendMessage: async () => {}
        }
      }
    },
    document: createMockDocument({
      "#storage-status": createMockElement(),
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  await context.saveHiddenValues("hiddenStores", ["Amazon.pl"], { useFirefoxSync: true });

  assert.equal(syncSetCalls, 1);
  assert.equal(localSetCalls, 1);
});

test("updateStorageStatus shows filters disabled message", () => {
  const statusElement = createMockElement();
  const context = loadPopup({
    document: createMockDocument({
      "#storage-status": statusElement,
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  context.updateStorageStatus(true, { filtersEnabled: false, useFirefoxSync: true });

  assert.equal(statusElement.textContent.includes("disabled"), true);
});

test("updateStorageStatus shows sync disabled message", () => {
  const statusElement = createMockElement();
  const context = loadPopup({
    document: createMockDocument({
      "#storage-status": statusElement,
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  context.updateStorageStatus(false, { filtersEnabled: true, useFirefoxSync: false });

  assert.equal(statusElement.textContent.includes("locally"), true);
});

test("showMainView and showSettingsView toggle views", () => {
  const mainView = createMockElement();
  const settingsView = createMockElement();
  const context = loadPopup({
    document: createMockDocument({
      "#main-view": mainView,
      "#settings-view": settingsView,
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  context.showSettingsView();
  assert.equal(mainView.hidden, true);
  assert.equal(settingsView.hidden, false);

  context.showMainView();
  assert.equal(mainView.hidden, false);
  assert.equal(settingsView.hidden, true);
});

test("queueSettingsSave returns a promise", async () => {
  const context = loadPopup({
    document: createMockDocument({
      "#main-title": createMockElement(),
      "#sync-badge": createMockElement(),
      "#filter-tabs": createMockElement(),
      "#store-form": createMockElement(),
      "#store-name": createMockElement(),
      "#filter-input-label": createMockElement(),
      "#add-filter-button": createMockElement(),
      "#store-list": createMockElement(),
      "#clear-filters": createMockElement(),
      "#toggle-filters": createMockElement(),
      "#tab-shops": createMockElement(),
      "#tab-categories": createMockElement(),
      "#main-view": createMockElement(),
      "#settings-toggle": createMockElement(),
      "#settings-back": createMockElement(),
      "#settings-view": createMockElement(),
      "#settings-title": createMockElement(),
      "#ui-language-label": createMockElement(),
      "#ui-language": createMockElement(),
      "#use-firefox-sync-label": createMockElement(),
      "#use-firefox-sync-hint": createMockElement(),
      "#always-filter-on-open-label": createMockElement(),
      "#category-filters-enabled-label": createMockElement(),
      "#show-filtered-as-dimmed-label": createMockElement(),
      "#show-filtered-above-threshold-label": createMockElement(),
      "#show-filtered-threshold-label": createMockElement(),
      "#hide-unfiltered-below-threshold-label": createMockElement(),
      "#hide-unfiltered-threshold-label": createMockElement(),
      "#show-below-threshold-as-dimmed-label": createMockElement(),
      "#use-firefox-sync": createMockElement(),
      "#always-filter-on-open": createMockElement(),
      "#category-filters-enabled": createMockElement(),
      "#show-filtered-as-dimmed": createMockElement(),
      "#show-below-threshold-as-dimmed": createMockElement(),
      "#show-filtered-above-threshold": createMockElement(),
      "#show-filtered-threshold": createMockElement(),
      "#hide-unfiltered-below-threshold": createMockElement(),
      "#hide-unfiltered-threshold": createMockElement()
    })
  });

  assert.equal(typeof context.queueSettingsSave, "function");
});

test("runtime scripts do not use fetch or XMLHttpRequest", () => {
  const files = ["content.js", "popup.js"];

  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

    assert.equal(/\bfetch\s*\(/.test(source), false, `${file} uses fetch()`);
    assert.equal(/\bXMLHttpRequest\b/.test(source), false, `${file} uses XMLHttpRequest`);
  }
});

test("runtime scripts use browser.storage.sync", () => {
  const files = ["content.js", "popup.js"];

  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

    assert.ok(source.includes("browser.storage.sync"), `${file} does not use storage.sync`);
  }
});
