const STORAGE_KEY = "hiddenStores";
const HIDDEN_KEY = "pepperStoreFilterHidden";
const NORMALIZER_SELECTOR = '[data-vue3*="ThreadMainListItemNormalizer"]';
const CARD_SELECTOR = 'article[id^="thread_"], article.thread, [data-t="thread"]';
const BUTTON_SELECTOR = ".pepper-store-filter-button";
const DEBUG_STORAGE_KEY = "pepperStoreFilterDebug";
const DEBUG_QUERY_PARAM = "pshdebug";

let hiddenStores = [];
let lastDebugSignature = "";
let applyFiltersTimer = null;

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

function normalizeLinkHostName(value) {
  return normalizeStoreName(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "");
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

function getThreadDataFromElement(element) {
  const candidates = [
    element,
    ...Array.from(element.querySelectorAll?.("[data-vue3]") || [])
  ];

  for (const candidate of candidates) {
    const vueData = parseJsonAttribute(candidate.getAttribute?.("data-vue3"));
    const thread = findThreadData(vueData);

    if (thread) {
      return thread;
    }
  }

  return null;
}

function cleanMerchantCandidate(value) {
  return normalizeStoreName(value)
    .replace(
      /([\p{Ll}])([\p{Lu}\p{N}]{3,})(?=\s*(?:Pobierz|Kod|Id\S*|Przejd\S*|Zobacz|Otw\S*))/u,
      "$1"
    )
    .replace(
      /\s+[\p{Lu}\p{N}]{3,}(?=\s*(?:Pobierz|Kod|Id\S*|Przejd\S*|Zobacz|Otw\S*))/u,
      ""
    )
    .replace(
      /\s*(?:Pobierz\s+kod.*|Pobierz.*|Kod.*|Id\S*\s+do\s+okazji.*|Przejd\S*.*|Zobacz.*|Otw\S*.*)$/i,
      ""
    )
    .replace(/[^\p{L}\p{N}\s.&'’+-]+$/u, "")
    .trim();
}

function getMerchantNameFromCardText(card) {
  const text = normalizeStoreName(card?.textContent);
  const match = text.match(
    /(?:Dostępne\s+w|Zrealizuj\s+na)\s+(.+?)(?:\s*Dodane|\s*Dodał|\s*Opublikowane|\s+przez|\s*Idź\s+do\s+okazji|\s*Przejdź|\s*Zobacz|\s*Otwórz|$)/i
  );

  if (!match) {
    return "";
  }

  return cleanMerchantCandidate(match[1]);
}

function createItemFromThread(card, normalizer, thread) {
  const merchantName =
    normalizeStoreName(thread?.merchant?.merchantName) ||
    normalizeLinkHostName(thread?.linkHost) ||
    getMerchantNameFromCardText(card);

  if (!merchantName || thread?.type === "Discussion") {
    return null;
  }

  return {
    normalizer,
    card,
    merchant: {
      name: merchantName
    }
  };
}

function getNormalizerItems() {
  const items = [];
  const seenCards = new Set();

  for (const normalizer of document.querySelectorAll(NORMALIZER_SELECTOR)) {
    const card = getCardFromNormalizer(normalizer);
    const thread = getThreadDataFromElement(normalizer);
    const item = card ? createItemFromThread(card, normalizer, thread) : null;

    if (item) {
      items.push(item);
      seenCards.add(item.card);
    }
  }

  for (const card of document.querySelectorAll(CARD_SELECTOR)) {
    if (seenCards.has(card)) {
      continue;
    }

    const normalizer = card.querySelector?.(NORMALIZER_SELECTOR) || card;
    const thread = getThreadDataFromElement(card);
    const item = createItemFromThread(card, normalizer, thread);

    if (item) {
      items.push(item);
      seenCards.add(item.card);
    }
  }

  return items;
}

function isStoreHidden(storeName) {
  const normalizedStoreName = normalizeText(storeName);

  return hiddenStores.some((hiddenStore) => {
    return normalizeText(hiddenStore) === normalizedStoreName;
  });
}

function hideCard(card) {
  if (card.dataset) {
    card.dataset[HIDDEN_KEY] = "true";
  }

  if (card.style) {
    card.style.display = "none";
  }
}

function showCard(card) {
  if (card.dataset?.[HIDDEN_KEY] === "true") {
    delete card.dataset[HIDDEN_KEY];
  }

  if (card.style) {
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

    const shouldAddStore = window.confirm(
      `Czy chcesz dodać sklep ${merchant.name} do filtrowanych?`
    );

    if (!shouldAddStore) {
      return;
    }

    hiddenStores = await saveHiddenStore(merchant.name);
    applyFilters();
  });

  return button;
}

function addFilterButton(item) {
  if (item.card.querySelector(BUTTON_SELECTOR)) {
    return;
  }

  const body = item.card.querySelector(".threadListCard-body");
  const target = body || item.card.querySelector(".thread-title") || item.normalizer;
  const beforeElement = body?.querySelector(".userHtml");
  const wrapper = document.createElement("div");

  wrapper.className = "pepper-store-filter-wrapper";
  wrapper.appendChild(createFilterButton(item.merchant));

  if (beforeElement) {
    beforeElement.insertAdjacentElement("beforebegin", wrapper);
  } else if (body) {
    body.appendChild(wrapper);
  } else if (target?.insertAdjacentElement) {
    target.insertAdjacentElement("afterend", wrapper);
  } else {
    item.card.appendChild?.(wrapper);
  }
}

function applyFilters() {
  const items = getNormalizerItems();
  let hiddenCount = 0;
  let addedButtonsCount = 0;

  for (const item of items) {
    const hadButton = Boolean(item.card.querySelector(BUTTON_SELECTOR));
    addFilterButton(item);

    if (!hadButton && item.card.querySelector(BUTTON_SELECTOR)) {
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

function scheduleApplyFilters(delay = 150) {
  clearTimeout(applyFiltersTimer);
  applyFiltersTimer = setTimeout(applyFilters, delay);
}

function scheduleFollowUpScans() {
  scheduleApplyFilters(80);
  setTimeout(applyFilters, 350);
  setTimeout(applyFilters, 1000);
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
    debounceTimer = setTimeout(scheduleFollowUpScans, 150);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  window.addEventListener("scroll", scheduleFollowUpScans, {
    passive: true
  });

  document.addEventListener?.("scroll", scheduleFollowUpScans, true);
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
