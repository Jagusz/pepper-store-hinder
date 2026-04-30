const STORAGE_KEY = "hiddenStores";
const HIDDEN_KEY = "pepperStoreFilterHidden";
const NORMALIZER_SELECTOR = '[data-vue3*="ThreadMainListItemNormalizer"]';
const DEBUG_STORAGE_KEY = "pepperStoreFilterDebug";
const DEBUG_QUERY_PARAM = "pshdebug";

let hiddenStores = [];
let lastDebugSignature = "";

function isDebugEnabled() {
  try {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get(DEBUG_QUERY_PARAM) === "1" ||
      window.localStorage.getItem(DEBUG_STORAGE_KEY) === "1"
    );
  } catch {
    return false;
  }
}

function debugLog(message, data) {
  if (!isDebugEnabled()) {
    return;
  }

  if (data === undefined) {
    console.log(`[Filtr sklepów Pepper] ${message}`);
  } else {
    console.log(`[Filtr sklepów Pepper] ${message}`, data);
  }
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeStoreName(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function mergeStoreLists(...storeLists) {
  const merged = [];

  for (const storeList of storeLists) {
    if (!Array.isArray(storeList)) {
      continue;
    }

    for (const store of storeList) {
      const cleanedStore = normalizeStoreName(store);
      const alreadyExists = merged.some((item) => {
        return normalizeText(item) === normalizeText(cleanedStore);
      });

      if (cleanedStore && !alreadyExists) {
        merged.push(cleanedStore);
      }
    }
  }

  return merged.sort((a, b) => a.localeCompare(b, "pl"));
}

async function getStoredHiddenStores() {
  let syncedStores = [];
  let localStores = [];

  if (browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [STORAGE_KEY]: [] });
      syncedStores = Array.isArray(syncResult[STORAGE_KEY])
        ? syncResult[STORAGE_KEY]
        : [];
    } catch (error) {
      debugLog("Firefox Sync niedostępny podczas odczytu", error);
    }
  }

  const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
  localStores = Array.isArray(localResult[STORAGE_KEY])
    ? localResult[STORAGE_KEY]
    : [];

  return mergeStoreLists(syncedStores, localStores);
}

async function setStoredHiddenStores(stores) {
  const normalizedStores = mergeStoreLists(stores);

  if (browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [STORAGE_KEY]: normalizedStores });
    } catch (error) {
      debugLog("Firefox Sync niedostępny podczas zapisu", error);
    }
  }

  await browser.storage.local.set({ [STORAGE_KEY]: normalizedStores });
  return normalizedStores;
}

function parseJsonAttribute(value) {
  if (!value) {
    return null;
  }

  const candidates = [
    value,
    value.replace(/&quot;/g, '"').replace(/&#34;/g, '"')
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      debugLog("Nie udało się sparsować wariantu data-vue3.");
    }
  }

  return null;
}

function findThreadData(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (value.props?.thread) {
    return value.props.thread;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const thread = findThreadData(item);

      if (thread) {
        return thread;
      }
    }

    return null;
  }

  for (const item of Object.values(value)) {
    const thread = findThreadData(item);

    if (thread) {
      return thread;
    }
  }

  return null;
}

function getCardFromNormalizer(normalizer) {
  return (
    normalizer.closest("article") ||
    normalizer.closest('[data-t="thread"]') ||
    normalizer.closest(".thread") ||
    normalizer.closest(".threadListCard") ||
    normalizer.parentElement
  );
}

function getNormalizerItems() {
  return Array.from(document.querySelectorAll(NORMALIZER_SELECTOR))
    .map((normalizer) => {
      const vueData = parseJsonAttribute(normalizer.getAttribute("data-vue3"));
      const thread = findThreadData(vueData);
      const merchantName = normalizeStoreName(thread?.merchant?.merchantName);

      if (!merchantName) {
        return null;
      }

      return {
        normalizer,
        card: getCardFromNormalizer(normalizer),
        merchant: {
          name: merchantName
        }
      };
    })
    .filter(Boolean)
    .filter((item) => item.card);
}

function isStoreHidden(storeName) {
  const normalizedStoreName = normalizeText(storeName);

  return hiddenStores.some((hiddenStore) => {
    return normalizeText(hiddenStore) === normalizedStoreName;
  });
}

function hideCard(card) {
  card.dataset[HIDDEN_KEY] = "true";
  card.style.display = "none";
}

function showCard(card) {
  if (card.dataset[HIDDEN_KEY] === "true") {
    delete card.dataset[HIDDEN_KEY];
    card.style.display = "";
  }
}

async function saveHiddenStore(storeName) {
  const cleanedStoreName = normalizeStoreName(storeName);

  if (!cleanedStoreName) {
    return hiddenStores;
  }

  const currentStores = await getStoredHiddenStores();
  const alreadyExists = currentStores.some((item) => {
    return normalizeText(item) === normalizeText(cleanedStoreName);
  });

  if (alreadyExists) {
    return currentStores;
  }

  return setStoredHiddenStores([...currentStores, cleanedStoreName]);
}

function getButtonTarget(card, normalizer) {
  return (
    card.querySelector('[data-vue3*="ThreadListItemInfo"]') ||
    card.querySelector(".thread-title") ||
    card.querySelector(".threadListCard-body") ||
    normalizer
  );
}

function createFilterButton(merchant) {
  const button = document.createElement("button");

  button.type = "button";
  button.className = "pepper-store-filter-button";
  button.textContent = `Filtruj sklep: ${merchant.name}`;
  button.title = `Ukryj oferty ze sklepu: ${merchant.name}`;

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    hiddenStores = await saveHiddenStore(merchant.name);
    applyFilters();
  });

  return button;
}

function addFilterButton(item) {
  if (item.card.querySelector(".pepper-store-filter-button")) {
    return;
  }

  const target = getButtonTarget(item.card, item.normalizer);
  const wrapper = document.createElement("div");

  wrapper.className = "pepper-store-filter-wrapper";
  wrapper.appendChild(createFilterButton(item.merchant));
  target.insertAdjacentElement("afterend", wrapper);
}

function applyFilters() {
  const items = getNormalizerItems();
  let hiddenCount = 0;
  let addedButtonsCount = 0;

  for (const item of items) {
    const hadButton = Boolean(item.card.querySelector(".pepper-store-filter-button"));
    addFilterButton(item);

    if (!hadButton && item.card.querySelector(".pepper-store-filter-button")) {
      addedButtonsCount += 1;
    }

    if (isStoreHidden(item.merchant.name)) {
      hideCard(item.card);
      hiddenCount += 1;
    } else {
      showCard(item.card);
    }
  }

  const merchantNames = Array.from(new Set(items.map((item) => item.merchant.name)));
  const debugSignature = JSON.stringify({
    items: items.length,
    hidden: hiddenCount,
    stores: hiddenStores,
    merchants: merchantNames.slice(0, 10)
  });

  if (debugSignature !== lastDebugSignature) {
    lastDebugSignature = debugSignature;
    debugLog("Skan ofert", {
      normalizers: document.querySelectorAll(NORMALIZER_SELECTOR).length,
      offersWithMerchant: items.length,
      addedButtons: addedButtonsCount,
      hiddenOffers: hiddenCount,
      hiddenStores,
      sampleMerchants: merchantNames.slice(0, 10)
    });
  }
}

function injectStyles() {
  if (document.querySelector("#pepper-store-filter-styles")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "pepper-store-filter-styles";
  style.textContent = `
    .pepper-store-filter-wrapper {
      display: flex;
      align-items: center;
      margin-top: 8px;
      margin-bottom: 2px;
    }

    .pepper-store-filter-button {
      appearance: none;
      max-width: 100%;
      overflow: hidden;
      padding: 5px 12px;
      border: 1px solid #de5a00;
      border-radius: 999px;
      color: #fff;
      background: #ff6400;
      box-shadow: 0 1px 2px rgba(26, 33, 43, 0.14);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.4;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    .pepper-store-filter-button:hover {
      background: #e85b00;
    }

    .pepper-store-filter-button:active {
      transform: translateY(1px);
      box-shadow: none;
    }
  `;

  document.documentElement.appendChild(style);
}

async function loadHiddenStores() {
  debugLog("Content script załadowany", {
    url: window.location.href,
    normalizers: document.querySelectorAll(NORMALIZER_SELECTOR).length
  });

  hiddenStores = await getStoredHiddenStores();
  applyFilters();
}

function observePageChanges() {
  if (!document.body) {
    return;
  }

  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyFilters, 150);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (!["sync", "local"].includes(areaName) || !changes[STORAGE_KEY]) {
    return;
  }

  getStoredHiddenStores().then((stores) => {
    hiddenStores = stores;
    debugLog("Zmieniono listę sklepów", hiddenStores);
    applyFilters();
  });
});

injectStyles();
loadHiddenStores();

if (document.body) {
  observePageChanges();
} else {
  window.addEventListener("DOMContentLoaded", observePageChanges, { once: true });
}
