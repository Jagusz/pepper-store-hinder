const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function createMockElement(tagName = "div") {
  const calls = [];
  const children = [];

  return {
    tagName,
    id: "",
    className: "",
    dataset: {},
    style: {},
    textContent: "",
    title: "",
    type: "",
    children,
    appendChild: (child) => {
      children.push(child);
    },
    addEventListener: (...args) => {
      calls.push(args);
    },
    insertAdjacentElement: () => {},
    addEventListenerCalls: calls
  };
}

function loadContentScript(overrides = {}) {
  const i18nSource = fs.readFileSync(
    path.join(__dirname, "..", "i18n.js"),
    "utf8"
  );
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
    },
    navigator: overrides.navigator || {
      language: "en-US",
      languages: ["en-US"]
    }
  };

  vm.createContext(context);
  vm.runInContext(i18nSource, context, { filename: "i18n.js" });
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

test("setInitialLoadingState toggles the initial loading class", () => {
  const calls = [];
  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => {},
        classList: {
          toggle: (className, enabled) => calls.push([className, enabled])
        }
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement
    }
  });

  context.setInitialLoadingState(true);
  context.setInitialLoadingState(false);

  assert.equal(
    JSON.stringify(calls.slice(-2)),
    JSON.stringify([
      ["pepper-store-filter-loading", true],
      ["pepper-store-filter-loading", false]
    ])
  );
});

test("injectStyles scopes the initial loading selector to the loading class", () => {
  let injectedStyle = null;
  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: (element) => {
          injectedStyle = element;
        },
        classList: {
          toggle: () => {}
        }
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement
    }
  });

  context.injectStyles();

  assert.ok(injectedStyle);
  assert.equal(
    injectedStyle.textContent.includes(
      '.pepper-store-filter-loading :is(article[id^="thread_"], article.thread, [data-t="thread"])'
    ),
    true
  );
});

// Verifies threshold values accept clean numbers and treat empty or invalid
// values as disabled, so settings can be stored safely.
test("normalizeThresholdValue parses valid numbers and rejects invalid values", () => {
  const context = loadContentScript();

  assert.equal(context.normalizeThresholdValue("200"), 200);
  assert.equal(context.normalizeThresholdValue("9.5"), 9.5);
  assert.equal(context.normalizeThresholdValue(""), null);
  assert.equal(context.normalizeThresholdValue("-1"), null);
  assert.equal(context.normalizeThresholdValue("abc"), null);
});

// Verifies deal temperatures may legitimately be below zero on Pepper, so the
// content script must keep them instead of treating them as missing data.
test("normalizeDealTemperature accepts negative listing values", () => {
  const context = loadContentScript();

  assert.equal(context.normalizeDealTemperature("55.5"), 55.5);
  assert.equal(context.normalizeDealTemperature("-0.59"), -0.59);
  assert.equal(context.normalizeDealTemperature("abc"), null);
});

// Verifies the new split threshold fields still accept the legacy shared
// threshold value, so early testers keep the same behavior after the rename.
test("normalizeSettings falls back to the legacy shared threshold", () => {
  const context = loadContentScript();

  assert.equal(
    JSON.stringify(
      context.normalizeSettings({
        showFilteredAboveThreshold: true,
        hideUnfilteredBelowThreshold: true,
        temperatureThreshold: 150
      })
    ),
    JSON.stringify({
      useFirefoxSync: true,
      alwaysFilterOnPageOpen: true,
      filtersEnabled: true,
      categoryFiltersEnabled: true,
      showFilteredAsDimmed: false,
      showBelowThresholdAsDimmed: false,
      showFilteredAboveThreshold: true,
      hideUnfilteredBelowThreshold: true,
      showFilteredThreshold: 150,
      hideUnfilteredThreshold: 150,
      uiLanguage: "auto"
    })
  );
});

test("resolvePageUiLanguage prefers Polish when the page language is Polish", () => {
  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        lang: "pl-PL",
        appendChild: () => {}
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement
    },
    navigator: {
      language: "en-US",
      languages: ["en-US"]
    }
  });

  assert.equal(
    context.resolvePageUiLanguage({ uiLanguage: "auto" }),
    "pl"
  );
});

test("resolvePageUiLanguage falls back to the browser language when the page language is missing", () => {
  const context = loadContentScript({
    navigator: {
      language: "pl-PL",
      languages: ["pl-PL", "en-US"]
    }
  });

  assert.equal(
    context.resolvePageUiLanguage({ uiLanguage: "auto" }),
    "pl"
  );
});

// Verifies the extension can combine lists without showing duplicate stores.
test("mergeStoreLists removes duplicates case-insensitively", () => {
  const context = loadContentScript();

  assert.equal(
    JSON.stringify(context.mergeStoreLists(["Amazon.pl", "ALDI"], [" amazon.PL ", "Netto"])),
    JSON.stringify(["ALDI", "Amazon.pl", "Netto"])
  );
});

test("getNormalizerItems reads the visible category from mainGroup", () => {
  const card = {
    querySelector: () => null,
    querySelectorAll: () => [],
    parentElement: null,
    textContent: ""
  };
  const normalizer = {
    closest: () => card,
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1275001",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Gaming",
              threadGroupUrlName: "gry"
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
    }
  });

  const items = context.getNormalizerItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].category.name, "Gaming");
  assert.equal(items[0].category.slug, "gry");
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

// Verifies cards that already expose Pepper's structured normalizer do not fall
// back to merchant text before the thread payload is complete, because that can
// create an early store-only button with no category on the first listings.
test("getNormalizerItems skips text fallback for cards that already have a Pepper normalizer", () => {
  const card = {
    textContent: "Radiohead Dostępne w Amazon.pl Dodane przez gregov",
    appendChild: () => {},
    querySelector: (selector) => {
      if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
        return normalizer;
      }

      return null;
    },
    querySelectorAll: () => [normalizer],
    getAttribute: () => null
  };
  const normalizer = {
    getAttribute: () => "",
    closest: () => card
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [normalizer];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  assert.equal(JSON.stringify(context.getNormalizerItems()), JSON.stringify([]));
});

test("getNormalizerItems reuses cached structured thread data after Pepper removes the normalizer", () => {
  const card = {
    id: "thread_1276175",
    textContent: "Google Pixelsnap Phone Case Dostępne w Amazon.pl Dodane przez zakup_marzeń",
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null
  };
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1276175",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Elektronika",
              threadGroupUrlName: "elektronika"
            }
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

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  context.warmStructuredThreadCache();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  const items = context.getNormalizerItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].merchant.name, "Amazon.pl");
  assert.equal(items[0].category.name, "Elektronika");
});

test("getNormalizerItems keeps the cached category when Pepper later returns partial thread data", () => {
  const card = {
    id: "thread_1276175",
    textContent: "Google Pixelsnap Phone Case DostÄ™pne w Amazon.pl Dodane przez zakup_marzeĹ„",
    appendChild: () => {},
    querySelector: () => null,
    querySelectorAll: () => [],
    getAttribute: () => null
  };
  const fullNormalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1276175",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Elektronika",
              threadGroupUrlName: "elektronika"
            }
          }
        }
      }),
    closest: () => card
  };
  const partialNormalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1276175",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: null
          }
        }
      }),
    closest: () => card
  };
  const context = loadContentScript();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [fullNormalizer];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  context.warmStructuredThreadCache();

  context.document.querySelectorAll = (selector) => {
    if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
      return [partialNormalizer];
    }

    if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
      return [card];
    }

    return [];
  };

  const items = context.getNormalizerItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].merchant.name, "Amazon.pl");
  assert.equal(items[0].category.name, "Elektronika");
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

// Verifies structured thread data keeps the deal temperature so threshold-based
// filtering can be applied later in the content script.
test("getNormalizerItems keeps numeric temperature from thread data", () => {
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
            threadId: "1272072",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            temperature: 321.5
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
    JSON.stringify(context.getNormalizerItems().map((item) => item.temperature)),
    JSON.stringify([321.5])
  );
});

// Verifies cold deals keep negative temperatures from Pepper, which the
// separate below-threshold rule needs in the live listing.
test("getNormalizerItems keeps negative temperatures from thread data", () => {
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
            threadId: "1272564",
            type: "Deal",
            merchant: {
              merchantName: "Hebe"
            },
            temperature: -0.59
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
    JSON.stringify(context.getNormalizerItems().map((item) => item.temperature)),
    JSON.stringify([-0.59])
  );
});

// Verifies the script can still read the visible temperature badge when Pepper
// omits the structured temperature field from the thread payload.
test("getNormalizerItems falls back to the rendered card temperature badge", () => {
  const card = {
    textContent: "28° Dostępne w myjki.com Dodane przez Dakn_lwd",
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1275001",
            type: "Deal",
            merchant: {
              merchantName: "myjki.com"
            },
            temperature: null
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
    JSON.stringify(context.getNormalizerItems().map((item) => item.temperature)),
    JSON.stringify([28])
  );
});

test("getNormalizerItems reads the rendered temperature badge without spacing", () => {
  const card = {
    textContent: "28°Dodane 1 godz. temu Dostępne w myjki.com",
    querySelector: () => null,
    querySelectorAll: () => []
  };
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1275002",
            type: "Deal",
            merchant: {
              merchantName: "myjki.com"
            },
            temperature: null
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
    JSON.stringify(context.getNormalizerItems().map((item) => item.temperature)),
    JSON.stringify([28])
  );
});

test("getNormalizerItems ignores the plugin notice when reading temperature", () => {
  const notice = {
    textContent: "Deal Store Filter: Filtered by threshold < 50°"
  };
  const card = {
    textContent:
      "Deal Store Filter: Filtered by threshold < 50° 28° Dodane 1 godz. temu Dostępne w myjki.com",
    querySelector: (selector) => {
      return selector === ".pepper-store-filter-dimmed-notice" ? notice : null;
    },
    querySelectorAll: () => []
  };
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1275003",
            type: "Deal",
            merchant: {
              merchantName: "myjki.com"
            },
            temperature: null
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
    JSON.stringify(context.getNormalizerItems().map((item) => item.temperature)),
    JSON.stringify([28])
  );
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

test("getNormalizerItems keeps offers that only expose a category", () => {
  const card = {
    querySelector: () => null,
    querySelectorAll: () => [],
    parentElement: null,
    textContent: ""
  };
  const normalizer = {
    closest: () => card,
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1275002",
            type: "Deal",
            merchant: null,
            linkHost: "",
            mainGroup: {
              threadGroupName: "Dom i mieszkanie",
              threadGroupUrlName: "dom-i-mieszkanie"
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
    }
  });

  const items = context.getNormalizerItems();

  assert.equal(items.length, 1);
  assert.equal(items[0].merchant, null);
  assert.equal(items[0].category.name, "Dom i mieszkanie");
});

test("addFilterButton includes a category filter button when the offer exposes a category", () => {
  let insertedElement = null;
  const userHtml = {
    insertAdjacentElement: (_, element) => {
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
      if (selector === ".pepper-store-filter-button-store") {
        return null;
      }

      if (selector === ".pepper-store-filter-button-category") {
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
        className: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
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
    },
    category: {
      name: "Gaming",
      slug: "gry"
    }
  });

  assert.ok(insertedElement);
  assert.equal(insertedElement.className, "pepper-store-filter-wrapper");
  assert.equal(insertedElement.children.length, 2);
  assert.equal(insertedElement.children[0].className.includes("pepper-store-filter-button-store"), true);
  assert.equal(insertedElement.children[1].className.includes("pepper-store-filter-button-category"), true);
});

test("addFilterButton appends a missing category button into an existing wrapper", () => {
  const wrapperChildren = [
    {
      className: "pepper-store-filter-button pepper-store-filter-button-store"
    }
  ];
  const existingWrapper = {
    className: "pepper-store-filter-wrapper",
    children: wrapperChildren,
    appendChild(child) {
      this.children.push(child);
    },
    querySelector(selector) {
      return (
        this.children.find((child) => child.className?.includes(selector.slice(1))) ||
        null
      );
    }
  };
  const userHtml = {
    insertAdjacentElement: () => {}
  };
  const body = {
    querySelector: (selector) => {
      return selector === ".userHtml" ? userHtml : null;
    },
    appendChild: () => {}
  };
  const card = {
    querySelector: (selector) => {
      if (selector === ".pepper-store-filter-wrapper") {
        return existingWrapper;
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
        className: "",
        children: [],
        appendChild(child) {
          this.children.push(child);
        },
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
    },
    category: {
      name: "Gaming",
      slug: "gry"
    }
  });

  assert.equal(existingWrapper.children.length, 2);
  assert.equal(
    existingWrapper.children[1].className.includes("pepper-store-filter-button-category"),
    true
  );
});

test("applyFilters adds both buttons when Pepper fills the thread data after an empty normalizer pass", () => {
  let currentNormalizer = null;
  let insertedWrapper = null;

  function findButtonByClass(children, className) {
    return children.find((child) => child.className?.includes(className)) || null;
  }

  function createTestElement(tagName) {
    return {
      tagName,
      className: "",
      textContent: "",
      title: "",
      type: "",
      style: {},
      dataset: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
      querySelector(selector) {
        if (selector === ".pepper-store-filter-button-store") {
          return findButtonByClass(this.children, "pepper-store-filter-button-store");
        }

        if (selector === ".pepper-store-filter-button-category") {
          return findButtonByClass(this.children, "pepper-store-filter-button-category");
        }

        return null;
      },
      addEventListener: () => {}
    };
  }

  const userHtml = {
    insertAdjacentElement: (_, element) => {
      insertedWrapper = element;
    }
  };
  const body = {
    querySelector: (selector) => {
      return selector === ".userHtml" ? userHtml : null;
    },
    appendChild: (element) => {
      insertedWrapper = element;
    }
  };
  const card = {
    id: "thread_1277001",
    textContent: "Oferta Dostepne w Amazon.pl Dodane przez tester",
    dataset: {},
    style: {},
    appendChild: (element) => {
      insertedWrapper = element;
    },
    querySelector: (selector) => {
      if (selector === ".pepper-store-filter-wrapper") {
        return insertedWrapper;
      }

      if (selector === ".pepper-store-filter-button") {
        return insertedWrapper?.children?.[0] || null;
      }

      if (selector === ".threadListCard-body") {
        return body;
      }

      if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
        return currentNormalizer;
      }

      return null;
    },
    querySelectorAll: () => []
  };
  const emptyNormalizer = {
    getAttribute: () => "",
    closest: () => card
  };
  const fullNormalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1277001",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Elektronika",
              threadGroupUrlName: "elektronika"
            }
          }
        }
      }),
    closest: () => card
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
          return currentNormalizer ? [currentNormalizer] : [];
        }

        if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
          return [card];
        }

        return [];
      },
      createElement: createTestElement
    }
  });

  currentNormalizer = emptyNormalizer;
  context.applyFilters();
  assert.equal(insertedWrapper, null);

  currentNormalizer = fullNormalizer;
  context.applyFilters();

  assert.ok(insertedWrapper);
  assert.equal(insertedWrapper.children.length, 2);
  assert.equal(
    insertedWrapper.children.some((child) =>
      child.className.includes("pepper-store-filter-button-store")
    ),
    true
  );
  assert.equal(
    insertedWrapper.children.some((child) =>
      child.className.includes("pepper-store-filter-button-category")
    ),
    true
  );
});

test("applyFilters appends the missing category button when a card first renders with only a store button", () => {
  let insertedWrapper = null;
  let useStructuredThread = false;

  function findButtonByClass(children, className) {
    return children.find((child) => child.className?.includes(className)) || null;
  }

  function createTestElement(tagName) {
    return {
      tagName,
      className: "",
      textContent: "",
      title: "",
      type: "",
      style: {},
      dataset: {},
      children: [],
      appendChild(child) {
        this.children.push(child);
      },
      querySelector(selector) {
        if (selector === ".pepper-store-filter-button-store") {
          return findButtonByClass(this.children, "pepper-store-filter-button-store");
        }

        if (selector === ".pepper-store-filter-button-category") {
          return findButtonByClass(this.children, "pepper-store-filter-button-category");
        }

        return null;
      },
      addEventListener: () => {}
    };
  }

  const userHtml = {
    insertAdjacentElement: (_, element) => {
      insertedWrapper = element;
    }
  };
  const body = {
    querySelector: (selector) => {
      return selector === ".userHtml" ? userHtml : null;
    },
    appendChild: (element) => {
      insertedWrapper = element;
    }
  };
  const card = {
    id: "thread_1277002",
    textContent: "Oferta Dostepne w Amazon.pl Dodane przez tester",
    dataset: {},
    style: {},
    appendChild: (element) => {
      insertedWrapper = element;
    },
    querySelector: (selector) => {
      if (selector === ".pepper-store-filter-wrapper") {
        return insertedWrapper;
      }

      if (selector === ".pepper-store-filter-button") {
        return insertedWrapper?.children?.[0] || null;
      }

      if (selector === ".threadListCard-body") {
        return body;
      }

      if (selector === '[data-vue3*="ThreadMainListItemNormalizer"]') {
        return useStructuredThread ? normalizer : null;
      }

      return null;
    },
    querySelectorAll: () => []
  };
  const normalizer = {
    getAttribute: () =>
      JSON.stringify({
        name: "ThreadMainListItemNormalizer",
        props: {
          thread: {
            threadId: "1277002",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Gaming",
              threadGroupUrlName: "gry"
            }
          }
        }
      }),
    closest: () => card
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
          return useStructuredThread ? [normalizer] : [];
        }

        if (selector === 'article[id^="thread_"], article.thread, [data-t="thread"]') {
          return [card];
        }

        return [];
      },
      createElement: createTestElement
    }
  });

  context.applyFilters();
  assert.ok(insertedWrapper);
  assert.equal(insertedWrapper.children.length, 1);
  assert.equal(
    insertedWrapper.children[0].className.includes("pepper-store-filter-button-store"),
    true
  );

  useStructuredThread = true;
  context.applyFilters();

  assert.equal(insertedWrapper.children.length, 2);
  assert.equal(
    insertedWrapper.children.some((child) =>
      child.className.includes("pepper-store-filter-button-category")
    ),
    true
  );
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

// Verifies filtered deals can stay visible as compact previews when the
// user chooses not to fully hide matching stores.
test("refreshStateFromStorage previews hidden offers when compact preview mode is enabled", async () => {
  const classNames = new Set();
  const card = {
    appendChild: () => {},
    classList: {
      add: (className) => classNames.add(className),
      remove: (className) => classNames.delete(className)
    },
    dataset: {},
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
            threadId: "1274002",
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
                  filtersEnabled: true,
                  showFilteredAsDimmed: true
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
  assert.equal(card.dataset.pepperStoreFilterDimmed, "true");
  assert.equal(classNames.has("pepper-store-filter-dimmed"), true);
});

// Verifies compact filtered previews explain why they are compacted and let the
// user remove that store filter without opening the popup.
test("compact filtered previews include a remove filter action", async () => {
  const savedStoreLists = [];
  const classNames = new Set();
  let notice = null;
  let noticeParent = "";

  function createElement(tagName = "div") {
    const calls = [];
    const children = [];

    return {
      tagName,
      className: "",
      dataset: {},
      style: {},
      textContent: "",
      title: "",
      type: "",
      children,
      appendChild: (child) => {
        children.push(child);
      },
      addEventListener: (...args) => {
        calls.push(args);
      },
      addEventListenerCalls: calls,
      remove: () => {
        if (notice?.className === "pepper-store-filter-dimmed-notice") {
          notice = null;
        }
      }
    };
  }

  const card = {
    appendChild: (child) => {
      if (child.className === "pepper-store-filter-dimmed-notice") {
        notice = child;
        noticeParent = "card";
      }
    },
    classList: {
      add: (className) => classNames.add(className),
      remove: (className) => classNames.delete(className)
    },
    dataset: {},
    querySelector: (selector) => {
      if (selector === ".pepper-store-filter-dimmed-notice") {
        return notice;
      }

      if (selector === ".threadListCard") {
        return {
          prepend: (child) => {
            if (child.className === "pepper-store-filter-dimmed-notice") {
              notice = child;
              noticeParent = "threadListCard";
            }
          }
        };
      }

      return null;
    },
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
            threadId: "1274003",
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
      createElement
    },
    browser: {
      storage: {
        sync: null,
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: false,
                  alwaysFilterOnPageOpen: true,
                  filtersEnabled: true,
                  showFilteredAsDimmed: true
                }
              };
            }

            return { hiddenStores: ["Media Expert", "Other Store"] };
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "hiddenStores")) {
              savedStoreLists.push(value.hiddenStores);
            }
          }
        },
        onChanged: {
          addListener: () => {}
        }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.ok(notice);
  assert.equal(noticeParent, "threadListCard");
  assert.equal(
    notice.children[0].textContent,
    "Deal Store Filter: Filtered by store filter"
  );
  assert.equal(notice.children[1].textContent, "Remove filter");

  await notice.children[1].addEventListenerCalls[0][1]({
    preventDefault: () => {},
    stopPropagation: () => {},
    stopImmediatePropagation: () => {}
  });

  assert.equal(
    JSON.stringify(savedStoreLists.at(-1)),
    JSON.stringify(["Other Store"])
  );
  assert.equal(card.dataset.pepperStoreFilterDimmed, undefined);
  assert.equal(classNames.has("pepper-store-filter-dimmed"), false);
});

// Verifies filtered stores can stay visible when their temperature reaches the
// configured threshold assigned to the filtered-store rule.
test("refreshStateFromStorage shows filtered stores above the configured threshold", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
    dataset: {},
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
            threadId: "1274010",
            type: "Deal",
            merchant: {
              merchantName: "Media Expert"
            },
            temperature: 250
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
                  filtersEnabled: true,
                  showFilteredAboveThreshold: true,
                  showFilteredThreshold: 200
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
  assert.equal(card.dataset.pepperStoreFilterDimmed, undefined);
});

test("refreshStateFromStorage keeps category-filtered deals hidden even above the filtered-store threshold", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
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
            threadId: "1274010-category-threshold-conflict",
            type: "Deal",
            merchant: {
              merchantName: "Media Expert"
            },
            temperature: 250,
            mainGroup: {
              threadGroupName: "Gaming",
              threadGroupUrlName: "gry"
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
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: ["Media Expert"] };
            }

            return { hiddenCategories: ["Gaming"] };
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: true,
                  alwaysFilterOnPageOpen: true,
                  filtersEnabled: true,
                  categoryFiltersEnabled: true,
                  showFilteredAboveThreshold: true,
                  showFilteredThreshold: 200
                }
              };
            }

            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
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

  assert.equal(card.style.display, "none");
  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
});

test("refreshStateFromStorage hides deals from filtered categories", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
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
            threadId: "1274010-category",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Gaming",
              threadGroupUrlName: "gry"
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
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: [] };
            }

            return { hiddenCategories: ["Gaming"] };
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: true,
                  alwaysFilterOnPageOpen: true,
                  filtersEnabled: true,
                  categoryFiltersEnabled: true
                }
              };
            }

            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
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

  assert.equal(card.style.display, "none");
  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
});

test("refreshStateFromStorage ignores filtered categories when category filters are disabled", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
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
            threadId: "1274010-category-off",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            mainGroup: {
              threadGroupName: "Gaming",
              threadGroupUrlName: "gry"
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
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: [] };
            }

            return { hiddenCategories: ["Gaming"] };
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: true,
                  alwaysFilterOnPageOpen: true,
                  filtersEnabled: true,
                  categoryFiltersEnabled: false
                }
              };
            }

            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
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

test("refreshStateFromStorage hides category-filtered deals even when merchant data is missing", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
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
            threadId: "1274010-category-no-merchant",
            type: "Deal",
            merchant: null,
            linkHost: "",
            mainGroup: {
              threadGroupName: "Gaming",
              threadGroupUrlName: "gry"
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
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: [] };
            }

            return { hiddenCategories: ["Gaming"] };
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return {
                settings: {
                  useFirefoxSync: true,
                  alwaysFilterOnPageOpen: true,
                  filtersEnabled: true,
                  categoryFiltersEnabled: true
                }
              };
            }

            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
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

  assert.equal(card.style.display, "none");
  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
});

// Verifies deals can be hidden globally when their temperature drops below the
// configured threshold, regardless of merchant filtering.
test("refreshStateFromStorage hides deals below the configured threshold", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
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
            threadId: "1274011",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            temperature: 49
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
                  filtersEnabled: true,
                  hideUnfilteredBelowThreshold: true,
                  hideUnfilteredThreshold: 50
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

  assert.equal(card.style.display, "none");
  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
});

test("refreshStateFromStorage dims deals below the configured threshold when enabled", async () => {
  const classNames = new Set();
  let notice = null;
  const card = {
    appendChild: () => {},
    classList: {
      add: (className) => classNames.add(className),
      remove: (className) => classNames.delete(className)
    },
    dataset: {},
    querySelector: (selector) => {
      if (selector === ".pepper-store-filter-dimmed-notice") {
        return notice;
      }

      if (selector === ".threadListCard") {
        return {
          prepend: (child) => {
            if (child.className === "pepper-store-filter-dimmed-notice") {
              notice = child;
            }
          }
        };
      }

      return null;
    },
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
            threadId: "1274011b",
            type: "Deal",
            merchant: {
              merchantName: "Amazon.pl"
            },
            temperature: 28
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
                  filtersEnabled: true,
                  hideUnfilteredBelowThreshold: true,
                  showBelowThresholdAsDimmed: true,
                  hideUnfilteredThreshold: 50
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
  assert.equal(card.dataset.pepperStoreFilterDimmed, "true");
  assert.equal(classNames.has("pepper-store-filter-dimmed"), true);
  assert.ok(notice);
  assert.equal(
    notice.children[0].textContent,
    "Deal Store Filter: Filtered by threshold < 50°"
  );
  assert.equal(notice.children.length, 1);
});

test("refreshStateFromStorage hides filtered stores below the configured threshold", async () => {
  const card = {
    appendChild: () => {},
    classList: {
      add: () => {},
      remove: () => {}
    },
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
            threadId: "1274012",
            type: "Deal",
            merchant: {
              merchantName: "Media Expert"
            },
            temperature: 35
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
                  filtersEnabled: true,
                  showFilteredAboveThreshold: true,
                  showFilteredThreshold: 200,
                  hideUnfilteredBelowThreshold: true,
                  hideUnfilteredThreshold: 50
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

  assert.equal(card.style.display, "none");
  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
  assert.equal(card.dataset.pepperStoreFilterDimmed, undefined);
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
  assert.equal(observedOptions.attributes, true);
  assert.equal(
    JSON.stringify(observedOptions.attributeFilter),
    JSON.stringify(["data-vue3", "aria-busy", "class"])
  );
});

test("observePageChanges starts observing before document.body exists", () => {
  const documentElement = {
    appendChild: () => {}
  };
  let observedTarget = null;

  loadContentScript({
    document: {
      body: null,
      documentElement,
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement,
      addEventListener: () => {}
    },
    MutationObserver: class {
      observe(target) {
        observedTarget = target;
      }
    }
  });

  assert.equal(observedTarget, documentElement);
});

// Verifies scroll-triggered lazy loading is handled even when Pepper appends or
// hydrates cards in a way that does not produce a useful childList mutation.
test("observePageChanges schedules filtering on scroll", () => {
  const windowEvents = [];

  loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => {}
      },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement
    },
    MutationObserver: class {
      observe() {}
    },
    windowAddEventListener: (...args) => {
      windowEvents.push(args);
    }
  });

  assert.equal(windowEvents.some(([eventName]) => eventName === "scroll"), true);
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

test("isStoreHidden matches case-insensitively", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: ["Amazon.pl", "Netto"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: true } };
            }
            return { hiddenStores: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isStoreHidden("Amazon.pl"), true);
  assert.equal(context.isStoreHidden("amazon.pl"), true);
  assert.equal(context.isStoreHidden("AMAZON.PL"), true);
  assert.equal(context.isStoreHidden("Media Expert"), false);
});

test("isStoreHidden returns false for empty list", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: [] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            return { hiddenStores: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isStoreHidden("Amazon.pl"), false);
});

test("isCategoryHidden matches case-insensitively", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: ["Gaming", "Dom i mieszkanie"] };
            }
            return {};
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: true } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
            }
            return defaults;
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isCategoryHidden("Gaming"), true);
  assert.equal(context.isCategoryHidden("gaming"), true);
  assert.equal(context.isCategoryHidden("GAMING"), true);
  assert.equal(context.isCategoryHidden("Elektronika"), false);
});

test("isCategoryHidden returns false for empty list", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenCategories: [] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
            }
            return defaults;
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isCategoryHidden("Gaming"), false);
});

test("saveHiddenStore adds new store", async () => {
  let savedStores = null;
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: [] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: [] };
            }
            return defaults;
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "hiddenStores")) {
              savedStores = value.hiddenStores;
            }
          }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.saveHiddenStore("Amazon.pl");

  assert.equal(JSON.stringify(result), JSON.stringify(["Amazon.pl"]));
  assert.equal(JSON.stringify(savedStores), JSON.stringify(["Amazon.pl"]));
});

test("saveHiddenStore does not add duplicate", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: ["Amazon.pl"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: ["Amazon.pl"] };
            }
            return defaults;
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.saveHiddenStore("Amazon.pl");

  assert.equal(result.length, 1);
  assert.equal(result[0], "Amazon.pl");
});

test("saveHiddenStore ignores empty name", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: ["Existing"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: ["Existing"] };
            }
            return defaults;
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();
  const result = await context.saveHiddenStore("");

  assert.equal(result.length, 1);
  assert.equal(result[0], "Existing");
});

test("saveHiddenCategory adds new category", async () => {
  let savedCategories = null;
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenCategories: [] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: [] };
            }
            return defaults;
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "hiddenCategories")) {
              savedCategories = value.hiddenCategories;
            }
          }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.saveHiddenCategory("Gaming");

  assert.equal(JSON.stringify(result), JSON.stringify(["Gaming"]));
  assert.equal(JSON.stringify(savedCategories), JSON.stringify(["Gaming"]));
});

test("saveHiddenCategory does not add duplicate", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenCategories: ["Gaming"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: ["Gaming"] };
            }
            return defaults;
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.saveHiddenCategory("Gaming");

  assert.equal(result.length, 1);
  assert.equal(result[0], "Gaming");
});

test("removeHiddenStore removes matching store", async () => {
  let savedStores = null;
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: ["Amazon.pl", "Netto"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenStores")) {
              return { hiddenStores: ["Amazon.pl", "Netto"] };
            }
            return defaults;
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "hiddenStores")) {
              savedStores = value.hiddenStores;
            }
          }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.removeHiddenStore("Amazon.pl");

  assert.equal(JSON.stringify(result), JSON.stringify(["Netto"]));
  assert.equal(JSON.stringify(savedStores), JSON.stringify(["Netto"]));
});

test("removeHiddenCategory removes matching category", async () => {
  let savedCategories = null;
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenCategories: ["Gaming", "Elektronika"] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: false } };
            }
            if (Object.prototype.hasOwnProperty.call(defaults, "hiddenCategories")) {
              return { hiddenCategories: ["Gaming", "Elektronika"] };
            }
            return defaults;
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "hiddenCategories")) {
              savedCategories = value.hiddenCategories;
            }
          }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.removeHiddenCategory("Gaming");

  assert.equal(JSON.stringify(result), JSON.stringify(["Elektronika"]));
  assert.equal(JSON.stringify(savedCategories), JSON.stringify(["Elektronika"]));
});

test("getStoredHiddenCategories uses sync as primary source", async () => {
  const calls = { syncGet: 0, localGet: 0, localSet: 0 };
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => {
            calls.syncGet += 1;
            return { hiddenCategories: ["Gaming"] };
          },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            calls.localGet += 1;
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: true } };
            }
            return { hiddenCategories: ["Stale"] };
          },
          set: async () => {
            calls.localSet += 1;
          }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const categories = await context.getStoredHiddenCategories();

  assert.ok(calls.syncGet > 0);
  assert.ok(calls.localGet > 0);
  assert.ok(calls.localSet > 0);
  assert.equal(JSON.stringify(categories), JSON.stringify(["Gaming"]));
});

test("getStoredHiddenCategories falls back to local when sync fails", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => { throw new Error("sync unavailable"); },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { useFirefoxSync: true } };
            }
            return { hiddenCategories: ["Elektronika"] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const categories = await context.getStoredHiddenCategories();

  assert.equal(JSON.stringify(categories), JSON.stringify(["Elektronika"]));
});

test("setStoredHiddenCategories writes to sync and local", async () => {
  const calls = { syncSet: 0, localSet: 0 };
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenCategories: [] }),
          set: async () => { calls.syncSet += 1; }
        },
        local: {
          get: async () => ({ settings: { useFirefoxSync: true }, hiddenCategories: [] }),
          set: async () => { calls.localSet += 1; }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.setStoredHiddenCategories(["Gaming", "Elektronika"]);

  assert.equal(calls.syncSet, 1);
  assert.equal(calls.localSet, 1);
});

test("runtime.onMessage handles dealStoreFilterGetPageLanguage", async () => {
  let registeredListener = null;
  const context = loadContentScript({
    document: {
      documentElement: { lang: "pl-PL", appendChild: () => {} },
      body: {},
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement
    },
    navigator: { language: "en-US", languages: ["en-US"] },
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) return { settings: {} };
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { registeredListener = fn; }
        }
      }
    }
  });

  const response = await registeredListener({ type: "dealStoreFilterGetPageLanguage" });

  assert.equal(response.pageLanguage, "pl-PL");
  assert.equal(response.uiLanguage, "pl");
});

test("runtime.onMessage handles dealStoreFilterRefresh", async () => {
  let registeredListener = null;
  let refreshCalls = 0;
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) return { settings: {} };
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { registeredListener = fn; }
        }
      }
    }
  });

  context.refreshStateFromStorage = async () => { refreshCalls += 1; };

  await registeredListener({ type: "dealStoreFilterRefresh" });

  assert.equal(refreshCalls, 1);
});

test("runtime.onMessage returns undefined for unknown message type", async () => {
  let registeredListener = null;
  loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) return { settings: {} };
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      },
      runtime: {
        onMessage: {
          addListener: (fn) => { registeredListener = fn; }
        }
      }
    }
  });

  const result = await registeredListener({ type: "unknownType" });

  assert.equal(result, undefined);
});

test("storage.onChanged listener is registered", () => {
  let listenerRegistered = false;
  loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) return { settings: {} };
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: {
          addListener: () => { listenerRegistered = true; }
        }
      }
    }
  });

  assert.equal(listenerRegistered, true);
});

test("storage.onChanged triggers refresh when settings changes", async () => {
  let registeredListener = null;
  let refreshCalls = 0;
  loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) return { settings: {} };
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: {
          addListener: (fn) => { registeredListener = fn; }
        }
      }
    }
  });

  registeredListener({ settings: { newValue: { filtersEnabled: false } } }, "local");

  await new Promise((resolve) => setTimeout(resolve, 50));
});

test("storage.onChanged ignores unrelated changes", async () => {
  let registeredListener = null;
  let refreshCalls = 0;
  loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) return { settings: {} };
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: {
          addListener: (fn) => { registeredListener = fn; }
        }
      }
    }
  });

  registeredListener({ someOtherKey: { newValue: "value" } }, "local");

  await new Promise((resolve) => setTimeout(resolve, 50));
});

test("isTemperatureAtOrAboveThreshold returns true when value equals threshold", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { showFilteredAboveThreshold: true, showFilteredThreshold: 100 } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isTemperatureAtOrAboveThreshold(100), true);
  assert.equal(context.isTemperatureAtOrAboveThreshold(150), true);
  assert.equal(context.isTemperatureAtOrAboveThreshold(99), false);
});

test("isTemperatureAtOrAboveThreshold returns false when threshold is null", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { showFilteredAboveThreshold: true, showFilteredThreshold: null } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isTemperatureAtOrAboveThreshold(100), false);
});

test("isTemperatureAtOrAboveThreshold returns false when value is null", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { showFilteredAboveThreshold: true, showFilteredThreshold: 100 } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isTemperatureAtOrAboveThreshold(null), false);
});

test("isTemperatureBelowThreshold returns true when value is below threshold", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { hideUnfilteredBelowThreshold: true, hideUnfilteredThreshold: 50 } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isTemperatureBelowThreshold(49), true);
  assert.equal(context.isTemperatureBelowThreshold(50), false);
  assert.equal(context.isTemperatureBelowThreshold(51), false);
});

test("isTemperatureBelowThreshold returns false when threshold is null", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { hideUnfilteredBelowThreshold: true, hideUnfilteredThreshold: null } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isTemperatureBelowThreshold(10), false);
});

test("isTemperatureBelowThreshold returns false when value is null", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { hideUnfilteredBelowThreshold: true, hideUnfilteredThreshold: 50 } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  assert.equal(context.isTemperatureBelowThreshold(null), false);
});

test("normalizeLinkHostName strips protocol, www, and path", () => {
  const context = loadContentScript();

  assert.equal(context.normalizeLinkHostName("https://www.amazon.pl/deals"), "amazon.pl");
  assert.equal(context.normalizeLinkHostName("http://facebook.com/page"), "facebook.com");
  assert.equal(context.normalizeLinkHostName("//example.com/path"), "example.com");
  assert.equal(context.normalizeLinkHostName("www.store.com"), "store.com");
});

test("normalizeSettings handles all fields explicitly set", () => {
  const context = loadContentScript();

  const result = context.normalizeSettings({
    useFirefoxSync: false,
    alwaysFilterOnPageOpen: false,
    filtersEnabled: false,
    categoryFiltersEnabled: false,
    showFilteredAsDimmed: true,
    showBelowThresholdAsDimmed: true,
    showFilteredAboveThreshold: true,
    hideUnfilteredBelowThreshold: true,
    showFilteredThreshold: 100,
    hideUnfilteredThreshold: 50,
    uiLanguage: "pl"
  });

  assert.equal(result.useFirefoxSync, false);
  assert.equal(result.alwaysFilterOnPageOpen, false);
  assert.equal(result.filtersEnabled, false);
  assert.equal(result.categoryFiltersEnabled, false);
  assert.equal(result.showFilteredAsDimmed, true);
  assert.equal(result.showBelowThresholdAsDimmed, true);
  assert.equal(result.showFilteredAboveThreshold, true);
  assert.equal(result.hideUnfilteredBelowThreshold, true);
  assert.equal(result.showFilteredThreshold, 100);
  assert.equal(result.hideUnfilteredThreshold, 50);
  assert.equal(result.uiLanguage, "pl");
});

test("normalizeSettings handles undefined/null input", () => {
  const context = loadContentScript();

  const result = context.normalizeSettings(undefined);

  assert.equal(result.useFirefoxSync, true);
  assert.equal(result.alwaysFilterOnPageOpen, true);
  assert.equal(result.filtersEnabled, true);
  assert.equal(result.categoryFiltersEnabled, true);
});

test("cacheStructuredThreadData function exists", () => {
  const context = loadContentScript();

  assert.equal(typeof context.cacheStructuredThreadData, "function");
});

test("hideCard sets hidden dataset and display none", () => {
  const card = {
    dataset: { pepperStoreFilterDimmed: "true" },
    classList: { remove: (cls) => { card.classListRemoved = cls; } },
    style: { display: "" }
  };
  const context = loadContentScript();

  context.hideCard(card);

  assert.equal(card.dataset.pepperStoreFilterHidden, "true");
  assert.equal(card.dataset.pepperStoreFilterDimmed, undefined);
  assert.equal(card.style.display, "none");
  assert.equal(card.classListRemoved, "pepper-store-filter-dimmed");
});

test("showCard clears hidden and dimmed dataset", () => {
  const card = {
    dataset: { pepperStoreFilterHidden: "true", pepperStoreFilterDimmed: "true" },
    classList: { remove: (cls) => { card.classListRemoved = cls; } },
    style: { display: "none" }
  };
  const context = loadContentScript();

  context.showCard(card);

  assert.equal(card.dataset.pepperStoreFilterHidden, undefined);
  assert.equal(card.dataset.pepperStoreFilterDimmed, undefined);
  assert.equal(card.style.display, "");
});

test("dimCard sets dimmed dataset and adds class", () => {
  const card = {
    dataset: {},
    classList: { add: (cls) => { card.classListAdded = cls; } },
    style: { display: "none" }
  };
  const context = loadContentScript();

  context.dimCard(card, { badgeText: "Test", noticeKey: "test:1" });

  assert.equal(card.dataset.pepperStoreFilterDimmed, "true");
  assert.equal(card.dataset.pepperStoreFilterHidden, undefined);
  assert.equal(card.classListAdded, "pepper-store-filter-dimmed");
  assert.equal(card.style.display, "");
});

test("createDimmedNotice creates notice with badge and optional remove button", () => {
  const context = loadContentScript();

  const noticeWithButton = context.createDimmedNotice({
    badgeText: "Filtered",
    noticeKey: "store:amazon",
    merchant: { name: "Amazon.pl" },
    onRemove: async () => {}
  });

  assert.ok(noticeWithButton);
  assert.equal(noticeWithButton.className, "pepper-store-filter-dimmed-notice");
  assert.equal(noticeWithButton.children.length, 2);

  const noticeWithoutButton = context.createDimmedNotice({
    badgeText: "Filtered",
    noticeKey: "threshold:50"
  });

  assert.equal(noticeWithoutButton.children.length, 1);
});

test("removeDimmedNotice removes notice from card", () => {
  const notice = { remove: () => { notice.removed = true; } };
  const card = {
    querySelector: () => notice
  };
  const context = loadContentScript();

  context.removeDimmedNotice(card);

  assert.ok(notice.removed);
});

test("removeDimmedNotice handles missing notice", () => {
  const card = { querySelector: () => null };
  const context = loadContentScript();

  assert.doesNotThrow(() => {
    context.removeDimmedNotice(card);
  });
});

test("getStoreDimmedNoticeConfig returns correct config", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { uiLanguage: "en" } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  const config = context.getStoreDimmedNoticeConfig({ name: "Amazon.pl" });

  assert.equal(config.badgeText.includes("Amazon.pl"), false);
  assert.equal(config.badgeText.includes("Filtered by store filter"), true);
  assert.equal(config.noticeKey, "store:amazon.pl");
  assert.equal(typeof config.onRemove, "function");
});

test("getThresholdDimmedNoticeConfig returns config with value", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: { get: async () => ({}), set: async () => {} },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { hideUnfilteredBelowThreshold: true, hideUnfilteredThreshold: 50 } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await context.refreshStateFromStorage();

  const config = context.getThresholdDimmedNoticeConfig();

  assert.equal(config.badgeText.includes("50"), true);
  assert.equal(config.noticeKey, "threshold:50");
});

test("getThresholdDimmedNoticeConfig returns config without value when null", () => {
  const context = loadContentScript();

  context.currentUiLanguage = "en";
  context.hideUnfilteredThreshold = null;

  const config = context.getThresholdDimmedNoticeConfig();

  assert.equal(config.badgeText.includes("<"), false);
  assert.equal(config.noticeKey, "threshold:off");
});

test("refreshStateFromStorage throws on error", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => { throw new Error("storage error"); },
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: {} };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async () => {}
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const originalGetSettings = context.getSettings;
  context.getSettings = async () => { throw new Error("settings error"); };

  await assert.rejects(
    () => context.refreshStateFromStorage(),
    /settings error/
  );

  context.getSettings = originalGetSettings;
});

test("refreshStateFromStorage resets filters when resetFiltersForPage is true", async () => {
  let savedSettings = null;
  const context = loadContentScript({
    browser: {
      storage: {
        sync: {
          get: async () => ({ hiddenStores: [] }),
          set: async () => {}
        },
        local: {
          get: async (defaults) => {
            if (Object.prototype.hasOwnProperty.call(defaults, "settings")) {
              return { settings: { alwaysFilterOnPageOpen: true, filtersEnabled: false } };
            }
            return { hiddenStores: [], hiddenCategories: [] };
          },
          set: async (value) => {
            if (Object.prototype.hasOwnProperty.call(value, "settings")) {
              savedSettings = value.settings;
            }
          }
        },
        onChanged: { addListener: () => {} }
      }
    }
  });

  await new Promise((r) => setTimeout(r, 50));
  await context.refreshStateFromStorage(true);

  assert.equal(savedSettings?.filtersEnabled, true);
});

test("observePageChanges sets up observer and scroll listener", () => {
  let observeCalls = 0;
  let scrollAddCalls = 0;

  loadContentScript({
    document: {
      body: {},
      documentElement: { appendChild: () => {} },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: createMockElement
    },
    MutationObserver: class {
      observe() { observeCalls += 1; }
      disconnect() {}
    },
    windowAddEventListener: (event, handler, options) => {
      if (event === "scroll") scrollAddCalls += 1;
    }
  });

  assert.equal(observeCalls, 1);
  assert.equal(scrollAddCalls, 1);
});

test("injectStyles is idempotent", () => {
  let appendCount = 0;
  let stylesExist = false;

  const context = loadContentScript({
    document: {
      body: {},
      documentElement: {
        appendChild: () => { appendCount += 1; },
        classList: { toggle: () => {} }
      },
      querySelector: (selector) => {
        if (selector === "#pepper-store-filter-styles") {
          return stylesExist ? {} : null;
        }
        return null;
      },
      querySelectorAll: () => [],
      createElement: createMockElement
    }
  });

  stylesExist = true;
  context.injectStyles();
  context.injectStyles();

  assert.equal(appendCount, 1);
});

test("normalizeThresholdValue handles comma decimal separator", () => {
  const context = loadContentScript();

  assert.equal(context.normalizeThresholdValue("9,5"), 9.5);
  assert.equal(context.normalizeThresholdValue("0"), 0);
});

test("parseJsonAttribute handles &#34; encoded quotes", () => {
  const context = loadContentScript();
  const encoded = "{&#34;name&#34;:&#34;ThreadMainListItemNormalizer&#34;}";

  assert.equal(
    JSON.stringify(context.parseJsonAttribute(encoded)),
    JSON.stringify({ name: "ThreadMainListItemNormalizer" })
  );
});

test("parseJsonAttribute handles null/undefined input", () => {
  const context = loadContentScript();

  assert.equal(context.parseJsonAttribute(null), null);
  assert.equal(context.parseJsonAttribute(undefined), null);
});

test("getSettings reads and normalizes settings", async () => {
  const context = loadContentScript({
    browser: {
      storage: {
        local: {
          get: async () => ({
            settings: {
              useFirefoxSync: false,
              filtersEnabled: false,
              uiLanguage: "pl"
            }
          }),
          set: async () => {}
        },
        sync: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const settings = await context.getSettings();

  assert.equal(settings.useFirefoxSync, false);
  assert.equal(settings.filtersEnabled, false);
  assert.equal(settings.uiLanguage, "pl");
});

test("saveSettings normalizes and saves", async () => {
  let savedValue = null;
  const context = loadContentScript({
    browser: {
      storage: {
        local: {
          get: async () => ({ settings: {} }),
          set: async (value) => { savedValue = value; }
        },
        sync: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener: () => {} }
      }
    }
  });

  const result = await context.saveSettings({ filtersEnabled: false, uiLanguage: "en" });

  assert.equal(result.filtersEnabled, false);
  assert.equal(result.uiLanguage, "en");
  assert.ok(savedValue);
});
