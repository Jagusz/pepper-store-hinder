const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createMockElement(tagName = "div") {
  const calls = [];

  return {
    tagName,
    id: "",
    className: "",
    style: {},
    textContent: "",
    title: "",
    type: "",
    appendChild: () => {},
    addEventListener: (...args) => {
      calls.push(args);
    },
    insertAdjacentElement: () => {},
    addEventListenerCalls: calls
  };
}

function loadContentScript(overrides = {}) {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "content.js"),
    "utf8"
  );
  const browser = overrides.browser || {
    storage: {
      sync: {
        get: async () => ({ hiddenStores: [] }),
        set: async () => {}
      },
      local: {
        get: async () => ({ hiddenStores: [] }),
        set: async () => {}
      },
      onChanged: {
        addListener: () => {}
      }
    }
  };
  const document = overrides.document || {
    body: {},
    documentElement: {
      appendChild: () => {}
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: createMockElement
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    browser,
    document,
    window: {
      location: {
        href: "https://www.pepper.pl/nowe",
        search: ""
      },
      confirm: overrides.confirm || (() => true),
      localStorage: {
        getItem: () => null
      },
      addEventListener: overrides.windowAddEventListener || (() => {})
    },
    MutationObserver: overrides.MutationObserver || class {
      observe() {}
    }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: "content.js" });
  return context;
}

// Verifies the exact store name stored by the user is cleaned without changing
// its casing, so labels like "Media Expert" stay readable in the popup.
test("normalizeStoreName trims and collapses whitespace", () => {
  const context = loadContentScript();

  assert.equal(context.normalizeStoreName("  Media   Expert  "), "Media Expert");
});

// Verifies comparisons use a lowercase, whitespace-normalized form, which lets
// "Amazon.PL" and "amazon.pl" match the same hidden store.
test("normalizeText lowercases and collapses whitespace", () => {
  const context = loadContentScript();

  assert.equal(context.normalizeText("  Amazon.PL  "), "amazon.pl");
});

// Verifies the extension can combine lists without showing duplicate stores.
test("mergeStoreLists removes duplicates case-insensitively", () => {
  const context = loadContentScript();

  assert.equal(
    JSON.stringify(context.mergeStoreLists(["Amazon.pl", "ALDI"], [" amazon.PL ", "Netto"])),
    JSON.stringify(["ALDI", "Amazon.pl", "Netto"])
  );
});

// Verifies the parser handles both normal JSON and HTML-escaped quotes, because
// Pepper keeps thread data inside a data-vue3 attribute.
test("parseJsonAttribute parses direct JSON and HTML encoded quotes", () => {
  const context = loadContentScript();
  const direct = '{"name":"ThreadMainListItemNormalizer"}';
  const encoded = "{&quot;name&quot;:&quot;ThreadMainListItemNormalizer&quot;}";

  assert.equal(
    JSON.stringify(context.parseJsonAttribute(direct)),
    JSON.stringify({ name: "ThreadMainListItemNormalizer" })
  );
  assert.equal(
    JSON.stringify(context.parseJsonAttribute(encoded)),
    JSON.stringify({ name: "ThreadMainListItemNormalizer" })
  );
});

// Verifies bad data-vue3 JSON is ignored instead of breaking the page script.
test("parseJsonAttribute returns null for invalid JSON", () => {
  const context = loadContentScript();

  assert.equal(context.parseJsonAttribute("{not-json"), null);
});

// Verifies thread data can still be found if Pepper wraps props.thread inside
// additional arrays or objects before rendering the listing item.
test("findThreadData finds nested props.thread data", () => {
  const context = loadContentScript();
  const thread = {
    threadId: "1271948",
    merchant: {
      merchantName: "Amazon.pl"
    }
  };

  assert.equal(
    context.findThreadData({
      wrapper: [
        {
          props: {
            thread
          }
        }
      ]
    }),
    thread
  );
});

// Verifies offers without merchant data or a link host are skipped instead of
// getting an unclear filter label.
test("getNormalizerItems ignores offers without store data", () => {
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1271922",
            merchant: null
          }
        }
      }),
    closest: () => ({})
  };
  const context = loadContentScript();

  context.document.querySelectorAll = () => [normalizer];

  assert.equal(JSON.stringify(context.getNormalizerItems()), JSON.stringify([]));
});

// Verifies real Pepper listings that have merchant:null still get a filter
// button when structured thread data contains linkHost.
test("getNormalizerItems falls back to linkHost when merchant is null", () => {
  const card = {
    textContent: "",
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1272071",
            type: "Deal",
            merchant: null,
            linkHost: "www.facebook.com"
          }
        }
      }),
    closest: () => card
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [normalizer];
    }

    return [];
  };

  assert.equal(
    JSON.stringify(context.getNormalizerItems().map((item) => item.merchant.name)),
    JSON.stringify(["facebook.com"])
  );
});

// Verifies cards can still be handled when Pepper has no visible normalizer
// element left but the merchant text is present in the rendered offer card.
test("getNormalizerItems falls back to rendered merchant text in offer cards", () => {
  const card = {
    textContent: "Termometr 9,99 zł Dostępne w Media Expert 👤 Dodane przez _Jakub_",
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  assert.equal(
    JSON.stringify(context.getNormalizerItems().map((item) => item.merchant.name)),
    JSON.stringify(["Media Expert"])
  );
});

// Verifies joined DOM text like "sklep.plDodane" does not leak the "Dodane"
// label into the filter button text.
test("getNormalizerItems strips joined added label from rendered merchant text", () => {
  const card = {
    textContent: "Kosa spalinowa 369,77 zł Dostępne w agroserwisnysa.plDodane przez KierowcaBizona",
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  assert.equal(
    JSON.stringify(context.getNormalizerItems().map((item) => item.merchant.name)),
    JSON.stringify(["agroserwisnysa.pl"])
  );
});

// Verifies Pepper cards that use the rendered redeem-on label are parsed the
// same way as cards that use the available-at label.
test("getNormalizerItems falls back to rendered redeem-on merchant text", () => {
  const card = {
    textContent: "Kupon 10 zł Zrealizuj na Rossmann Idź do okazji",
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  assert.equal(
    JSON.stringify(context.getNormalizerItems().map((item) => item.merchant.name)),
    JSON.stringify(["Rossmann"])
  );
});

// Verifies item pages do not leak a joined voucher code and CTA into the
// rendered fallback merchant name.
test("getNormalizerItems strips joined voucher CTA from item page merchant text", () => {
  const card = {
    textContent:
      "Woda toaletowa 251,64 zł Dostępne w FlaconiSPRINGTIMEPobierz kod i przejdź",
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  assert.equal(
    JSON.stringify(context.getNormalizerItems().map((item) => item.merchant.name)),
    JSON.stringify(["Flaconi"])
  );
});

// Verifies discussion entries are skipped even if the data shape contains a
// merchant field.
test("getNormalizerItems ignores discussion threads", () => {
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1270000",
            type: "Discussion",
            merchant: {
              merchantName: "Amazon.pl"
            }
          }
        }
      }),
    closest: () => ({})
  };
  const context = loadContentScript();

  context.document.querySelectorAll = () => [normalizer];

  assert.equal(JSON.stringify(context.getNormalizerItems()), JSON.stringify([]));
});

// Verifies the filter button is inserted into the stable card body before the
// description, not after Vue-managed metadata that Pepper may replace later.
test("addFilterButton inserts the button before the offer description", () => {
  let insertedPosition = "";
  let insertedElement = null;
  const userHtml = {
    insertAdjacentElement: (position, element) => {
      insertedPosition = position;
      insertedElement = element;
    }
  };
  const body = {
    querySelector: (selector) => {
      return selector === ".userHtml" ? userHtml : null;
    },
    appendChild: () => {}
  };
  const card = {
    querySelector: (selector) => {
      if (selector === ".pepper-store-filter-button") {
        return null;
      }

      if (selector === ".threadListCard-body") {
        return body;
      }

      return null;
    }
  };
  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => {}
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: (tagName) => ({
        tagName,
        appendChild: () => {},
        addEventListener: () => {},
        style: {}
      })
    }
  });

  context.addFilterButton({
    card,
    normalizer: {},
    merchant: {
      name: "Media Expert"
    }
  });

  assert.equal(insertedPosition, "beforebegin");
  assert.ok(insertedElement);
  assert.equal(insertedElement.className, "pepper-store-filter-wrapper");
});

// Verifies clicking the in-page filter button asks for confirmation before
// changing the hidden stores list.
test("createFilterButton does not save the store when confirmation is cancelled", async () => {
  const context = loadContentScript({
    confirm: () => false
  });
  let savedStore = "";

  context.saveHiddenStore = async (storeName) => {
    savedStore = storeName;
    return [storeName];
  };
  context.applyFilters = () => {};

  const button = context.createFilterButton({ name: "Media Expert" });
  const clickHandler = button.addEventListenerCalls[0][1];

  await clickHandler({
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  });

  assert.equal(savedStore, "");
});

// Verifies accepting the confirmation saves the store and immediately applies
// filters to hide matching offers without waiting for a page refresh.
test("createFilterButton saves the store and applies filters after confirmation", async () => {
  const context = loadContentScript({
    confirm: () => true
  });
  let savedStore = "";
  let applyFiltersCalls = 0;

  context.saveHiddenStore = async (storeName) => {
    savedStore = storeName;
    return [storeName];
  };
  context.applyFilters = () => {
    applyFiltersCalls += 1;
  };

  const button = context.createFilterButton({ name: "Media Expert" });
  const clickHandler = button.addEventListenerCalls[0][1];

  await clickHandler({
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  });

  assert.equal(savedStore, "Media Expert");
  assert.equal(applyFiltersCalls, 1);
});

// Verifies the content script reads hidden stores from browser.storage.sync as
// the source of truth and updates local storage only as a cache.
test("getStoredHiddenStores uses storage.sync as the primary source", async () => {
  const calls = {
    syncGet: 0,
    localGet: 0,
    localSet: 0
  };
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => {
            calls.syncGet += 1;
            return { hiddenStores: ["Amazon.pl"] };
          },
          set: async () => {}
        },
        local: {
          get: async () => {
            calls.localGet += 1;
            return { hiddenStores: ["Stale local store"] };
          },
          set: async () => {
            calls.localSet += 1;
          }
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  const stores = await context.getStoredHiddenStores();

  assert.ok(calls.syncGet > 0);
  assert.ok(calls.localGet > 0);
  assert.ok(calls.localSet > 0);
  assert.equal(JSON.stringify(stores), JSON.stringify(["Amazon.pl"]));
});

// Verifies the fallback path still returns locally cached filters when
// browser.storage.sync throws, so filtering remains usable without Sync.
test("getStoredHiddenStores falls back to storage.local when storage.sync fails", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => {
            throw new Error("sync unavailable");
          },
          set: async () => {
            throw new Error("sync unavailable");
          }
        },
        local: {
          get: async () => ({ hiddenStores: ["Netto"] }),
          set: async () => {}
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  const stores = await context.getStoredHiddenStores();

  assert.equal(JSON.stringify(stores), JSON.stringify(["Netto"]));
});

// Verifies disabling Firefox Sync keeps filtering on this device only and does
// not read the synced store list.
test("getStoredHiddenStores uses only storage.local when Firefox Sync is disabled", async () => {
  const calls = {
    syncGet: 0,
    localGet: 0
  };
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => {
            calls.syncGet += 1;
            return { hiddenStores: ["Amazon.pl"] };
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            calls.localGet += 1;

            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }

            return { hiddenStores: ["ALDI"] };
          },
          set: async () => {}
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  const stores = await context.getStoredHiddenStores();

  assert.equal(calls.syncGet, 0);
  assert.ok(calls.localGet > 0);
  assert.equal(JSON.stringify(stores), JSON.stringify(["ALDI"]));
});

// Verifies stores added from the page are saved locally only when the user
// turns Firefox Sync off in the popup.
test("setStoredHiddenStores writes only storage.local when Firefox Sync is disabled", async () => {
  const calls = {
    syncSet: 0,
    localSet: 0
  };
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: [] }),
          set: async () => {
            calls.syncSet += 1;
          }
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }

            return { hiddenStores: [] };
          },
          set: async (value) => {
            calls.localSet += 1;
            assert.equal(
              JSON.stringify(value),
              JSON.stringify({ hiddenStores: ["Netto"] })
            );
          }
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  const stores = await context.setStoredHiddenStores(["Netto"]);

  assert.equal(calls.syncSet, 0);
  assert.equal(calls.localSet, 1);
  assert.equal(JSON.stringify(stores), JSON.stringify(["Netto"]));
});

// Verifies turning filters off keeps filter buttons available but shows offers
// that would otherwise match the hidden store list.
test("refreshStateFromStorage shows hidden offers when filters are disabled", async () => {
  const card = {
    appendChild: () => {},
    dataset: {
      pepperStoreFilterHidden: "true"
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    style: {
      display: "none"
    }
  };
  const normalizer = {
    closest: () => card,
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1274000",
            type: "Deal",
            merchant: {
              merchantName: "Media Expert"
            }
          }
        }
      })
  };
  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => {}
      },
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
          return [normalizer];
        }

        return [];
      },
      createElement: createMockElement
    },
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: ["Media Expert"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: true,
                  alwaysFilterOnPageOpen: false,
                  filtersEnabled: false
                }
              };
            }

            return { hiddenStores: [] };
          },
          set: async () => {}
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(card.style.display, "");
  assert.equal(card.dataset.pepperStoreFilterHidden, undefined);
});

// Verifies the default-on page-opening option restores filtering when a new
// content script instance starts after filters were disabled earlier.
test("refreshStateFromStorage restores filters on page open when enabled", async () => {
  const savedSettings = [];
  const card = {
    appendChild: () => {},
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    style: {
      display: ""
    }
  };
  const normalizer = {
    closest: () => card,
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1274001",
            type: "Deal",
            merchant: {
              merchantName: "Media Expert"
            }
          }
        }
      })
  };
  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => {}
      },
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
          return [normalizer];
        }

        return [];
      },
      createElement: createMockElement
    },
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: ["Media Expert"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: true,
                  alwaysFilterOnPageOpen: true,
                  filtersEnabled: false
                }
              };
            }

            return { hiddenStores: [] };
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "settings")) {
              savedSettings.push(value.settings);
            }
          }
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  await context.refreshStateFromStorage(true);

  assert.equal(card.style.display, "none");
  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
  assert.equal(savedSettings.some((settings) => settings.filtersEnabled), true);
});

// Verifies dynamically loaded Pepper listings are handled through a body-level
// MutationObserver watching added descendants.
test("observePageChanges watches dynamically loaded offers", () => {
  let observedTarget = null;
  let observedOptions = null;

  loadContentScript({
    MutationObserver: class {
      observe(target, options) {
        observedTarget = target;
        observedOptions = options;
      }
    }
  });

  assert.ok(observedTarget);
  assert.equal(observedOptions.childList, true);
  assert.equal(observedOptions.subtree, true);
});

// Verifies scroll-triggered lazy loading is handled even when Pepper appends or
// hydrates cards in a way that does not produce a useful childList mutation.
test("observePageChanges schedules filtering on scroll", () => {
  const windowEvents = [];
  const documentEvents = [];

  loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => {}
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement,
      addEventListener: (...args) => {
        documentEvents.push(args);
      }
    },
    MutationObserver: class {
      observe() {}
    },
    windowAddEventListener: (...args) => {
      windowEvents.push(args);
    }
  });

  assert.equal(windowEvents.some(([eventName]) => eventName === "scroll"), true);
  assert.equal(documentEvents.some(([eventName]) => eventName === "scroll"), true);
});

// Verifies runtime scripts do not introduce network requests or remote data
// submission APIs.
test("runtime scripts do not use fetch or XMLHttpRequest", () => {
  const files = ["content.js", "popup.js"];

  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

    assert.equal(/\bfetch\s*\(/.test(source), false, `${file} uses fetch()`);
    assert.equal(/\bXMLHttpRequest\b/.test(source), false, `${file} uses XMLHttpRequest`);
  }
});

// Verifies both runtime scripts keep Firefox Sync as the primary persistence
// API for the hidden store list.
test("runtime scripts use browser.storage.sync", () => {
  const files = ["content.js", "popup.js"];

  for (const file of files) {
    const source = fs.readFileSync(path.join(__dirname, "..", file), "utf8");

    assert.ok(source.includes("browser.storage.sync"), `${file} does not use storage.sync`);
  }
});
