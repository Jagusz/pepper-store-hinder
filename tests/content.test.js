const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

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
    createElement: () => ({
      id: "",
      style: {},
      textContent: ""
    })
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
      localStorage: {
        getItem: () => null
      },
      addEventListener: () => {}
    },
    MutationObserver: class {
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

// Verifies the extension can combine Firefox Sync and local fallback storage
// without showing duplicate stores or losing entries from either source.
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

// Verifies offers without props.thread.merchant are skipped, matching the
// extension requirement to ignore listings that do not have merchant data.
test("getNormalizerItems ignores offers without merchant", () => {
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

// Verifies the content script reads hidden stores from browser.storage.sync and
// merges them with the local fallback cache.
test("getStoredHiddenStores uses storage.sync as the primary source", async () => {
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
          get: async () => {
            calls.localGet += 1;
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

  assert.ok(calls.syncGet > 0);
  assert.ok(calls.localGet > 0);
  assert.equal(JSON.stringify(stores), JSON.stringify(["ALDI", "Amazon.pl"]));
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
