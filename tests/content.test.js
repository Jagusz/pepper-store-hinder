const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadContentScript() {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "content.js"),
    "utf8"
  );

  const context = {
    console,
    setTimeout,
    clearTimeout,
    URLSearchParams,
    browser: {
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
    },
    document: {
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
    },
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
