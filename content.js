const STORAGE_KEY = "hiddenStores";
const SETTINGS_KEY = "settings";
const HIDDEN_KEY = "pepperStoreFilterHidden";
const DIMMED_KEY = "pepperStoreFilterDimmed";
const DIMMED_CLASS = "pepper-store-filter-dimmed";
const DIMMED_NOTICE_SELECTOR = ".pepper-store-filter-dimmed-notice";
const LOADING_CLASS = "pepper-store-filter-loading";
const NORMALIZER_SELECTOR = '[data-vue3*="ThreadMainListItemNormalizer"]';
const CARD_SELECTOR = 'article[id^="thread_"], article.thread, [data-t="thread"]';
const BUTTON_SELECTOR = ".pepper-store-filter-button";
const DEBUG_STORAGE_KEY = "pepperStoreFilterDebug";
const DEBUG_QUERY_PARAM = "pshdebug";
const PLUGIN_NAME = "Deal Store Filter";
const DEFAULT_SETTINGS = {
  useFirefoxSync: true,
  alwaysFilterOnPageOpen: true,
  filtersEnabled: true,
  showFilteredAsDimmed: false,
  showBelowThresholdAsDimmed: false,
  showFilteredAboveThreshold: false,
  hideUnfilteredBelowThreshold: false,
  showFilteredThreshold: null,
  hideUnfilteredThreshold: null
};

let hiddenStores = [];
let filtersEnabled = true;
let showFilteredAsDimmed = false;
let showBelowThresholdAsDimmed = false;
let showFilteredAboveThreshold = false;
let hideUnfilteredBelowThreshold = false;
let showFilteredThreshold = null;
let hideUnfilteredThreshold = null;
let lastDebugSignature = "";
let applyFiltersTimer = null;
let confirmModalState = null;

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
    console.log(`[Deal Store Filter] ${message}`);
  } else {
    console.log(`[Deal Store Filter] ${message}`, data);
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

function normalizeThresholdValue(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const normalizedValue =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));

  if (!Number.isFinite(normalizedValue) || normalizedValue < 0) {
    return null;
  }

  return normalizedValue;
}

function normalizeDealTemperature(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const normalizedValue =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));

  if (!Number.isFinite(normalizedValue)) {
    return null;
  }

  return normalizedValue;
}

function normalizeLinkHostName(value) {
  return normalizeStoreName(value)
    .replace(/^https?:\/\//i, "")
    .replace(/^\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./i, "");
}

function ensureConfirmModal() {
  if (confirmModalState?.container?.isConnected) {
    return confirmModalState;
  }

  const container = document.createElement("div");
  const backdrop = document.createElement("div");
  const dialog = document.createElement("section");
  const title = document.createElement("h2");
  const message = document.createElement("p");
  const actions = document.createElement("div");
  const cancelButton = document.createElement("button");
  const confirmButton = document.createElement("button");

  container.className = "pepper-store-filter-confirm-modal";
  container.hidden = true;

  backdrop.className = "pepper-store-filter-confirm-backdrop";

  dialog.className = "pepper-store-filter-confirm-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");

  title.className = "pepper-store-filter-confirm-title";
  title.textContent = PLUGIN_NAME;

  message.className = "pepper-store-filter-confirm-message";

  actions.className = "pepper-store-filter-confirm-actions";

  cancelButton.type = "button";
  cancelButton.className = "pepper-store-filter-confirm-cancel";
  cancelButton.textContent = "Cancel";

  confirmButton.type = "button";
  confirmButton.className = "pepper-store-filter-confirm-submit";
  confirmButton.textContent = "Confirm";

  actions.append(cancelButton, confirmButton);
  dialog.append(title, message, actions);
  container.append(backdrop, dialog);
  document.body.appendChild(container);

  confirmModalState = {
    container,
    message,
    cancelButton,
    confirmButton,
    resolve: null,
    keydownHandler: null
  };

  return confirmModalState;
}

function closeConfirmModal(result) {
  if (!confirmModalState?.resolve) {
    return;
  }

  const resolve = confirmModalState.resolve;
  confirmModalState.resolve = null;
  confirmModalState.container.hidden = true;

  if (confirmModalState.keydownHandler) {
    document.removeEventListener("keydown", confirmModalState.keydownHandler, true);
    confirmModalState.keydownHandler = null;
  }

  resolve(result);
}

function showConfirmModal(message, confirmLabel = "Confirm", cancelLabel = "Cancel") {
  let modal = null;

  try {
    modal = ensureConfirmModal();
  } catch {
    return Promise.resolve(window.confirm(message));
  }

  if (modal.resolve) {
    closeConfirmModal(false);
  }

  modal.message.textContent = message;
  modal.confirmButton.textContent = confirmLabel;
  modal.cancelButton.textContent = cancelLabel;
  modal.container.hidden = false;

  return new Promise((resolve) => {
    modal.resolve = resolve;

    modal.keydownHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeConfirmModal(false);
      }
    };

    document.addEventListener("keydown", modal.keydownHandler, true);

    modal.confirmButton.onclick = () => closeConfirmModal(true);
    modal.cancelButton.onclick = () => closeConfirmModal(false);
    modal.container.onclick = (event) => {
      if (
        event.target === modal.container ||
        event.target.classList.contains("pepper-store-filter-confirm-backdrop")
      ) {
        closeConfirmModal(false);
      }
    };

    modal.confirmButton.focus();
  });
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

async function updateLocalCache(stores) {
  const normalizedStores = mergeStoreLists(stores);
  const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
  const localStores = mergeStoreLists(localResult[STORAGE_KEY]);

  if (JSON.stringify(localStores) !== JSON.stringify(normalizedStores)) {
    await browser.storage.local.set({ [STORAGE_KEY]: normalizedStores });
  }
}

function normalizeSettings(value) {
  const legacyThreshold = normalizeThresholdValue(value?.temperatureThreshold);

  return {
    useFirefoxSync: value?.useFirefoxSync !== false,
    alwaysFilterOnPageOpen: value?.alwaysFilterOnPageOpen !== false,
    filtersEnabled: value?.filtersEnabled !== false,
    showFilteredAsDimmed: value?.showFilteredAsDimmed === true,
    showBelowThresholdAsDimmed: value?.showBelowThresholdAsDimmed === true,
    showFilteredAboveThreshold: value?.showFilteredAboveThreshold === true,
    hideUnfilteredBelowThreshold: value?.hideUnfilteredBelowThreshold === true,
    showFilteredThreshold:
      normalizeThresholdValue(value?.showFilteredThreshold) ?? legacyThreshold,
    hideUnfilteredThreshold:
      normalizeThresholdValue(value?.hideUnfilteredThreshold) ?? legacyThreshold
  };
}

async function getSettings() {
  const result = await browser.storage.local.get({
    [SETTINGS_KEY]: DEFAULT_SETTINGS
  });

  return normalizeSettings(result[SETTINGS_KEY]);
}

async function saveSettings(settings) {
  const normalizedSettings = normalizeSettings(settings);

  await browser.storage.local.set({ [SETTINGS_KEY]: normalizedSettings });
  return normalizedSettings;
}

async function getStoredHiddenStores(settings = null) {
  const activeSettings = settings || await getSettings();

  if (activeSettings.useFirefoxSync && browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [STORAGE_KEY]: [] });
      const syncedStores = mergeStoreLists(syncResult[STORAGE_KEY]);
      const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
      const mergedStores = mergeStoreLists(
        syncedStores,
        localResult[STORAGE_KEY]
      );

      await updateLocalCache(mergedStores);
      return mergedStores;
    } catch (error) {
      debugLog("Firefox Sync unavailable while reading filters", error);
    }
  }

  const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });

  return mergeStoreLists(localResult[STORAGE_KEY]);
}

async function setStoredHiddenStores(stores) {
  const settings = await getSettings();
  const normalizedStores = mergeStoreLists(stores);

  if (settings.useFirefoxSync && browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [STORAGE_KEY]: normalizedStores });
    } catch (error) {
      debugLog("Firefox Sync unavailable while saving filters", error);
    }
  }

  await browser.storage.local.set({ [STORAGE_KEY]: normalizedStores });
  return normalizedStores;
}

async function removeHiddenStore(storeName) {
  const normalizedStoreName = normalizeText(storeName);
  const currentStores = await getStoredHiddenStores();

  return setStoredHiddenStores(
    currentStores.filter((item) => normalizeText(item) !== normalizedStoreName)
  );
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
      debugLog("Failed to parse a data-vue3 variant.");
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

function getTemperatureFromCardText(card) {
  const noticeText = normalizeStoreName(
    card?.querySelector?.(DIMMED_NOTICE_SELECTOR)?.textContent
  );
  const text = normalizeStoreName(card?.textContent);
  const searchableText = noticeText ? text.replace(noticeText, " ") : text;
  const match = searchableText.match(/(-?\d+(?:[.,]\d+)?)\s*\u00B0/);

  if (!match) {
    return null;
  }

  return normalizeDealTemperature(match[1]);
}

function createItemFromThread(card, normalizer, thread) {
  const merchantName =
    normalizeStoreName(thread?.merchant?.merchantName) ||
    normalizeLinkHostName(thread?.linkHost) ||
    getMerchantNameFromCardText(card);
  const temperature =
    normalizeDealTemperature(thread?.temperature) ??
    getTemperatureFromCardText(card);

  if (!merchantName || thread?.type === "Discussion") {
    return null;
  }

  return {
    normalizer,
    card,
    merchant: {
      name: merchantName
    },
    temperature
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

function removeDimmedNotice(card) {
  const notice = card.querySelector?.(DIMMED_NOTICE_SELECTOR);

  if (!notice) {
    return;
  }

  if (notice.remove) {
    notice.remove();
  } else {
    notice.parentNode?.removeChild?.(notice);
  }
}

function createDimmedNotice({ badgeText, noticeKey, merchant = null, onRemove = null }) {
  const notice = document.createElement("div");
  const badge = document.createElement("span");

  notice.className = "pepper-store-filter-dimmed-notice";
  notice.dataset.noticeKey = noticeKey;
  if (merchant) {
    notice.dataset.store = merchant.name;
  }

  badge.className = "pepper-store-filter-dimmed-badge";
  badge.textContent = badgeText;
  notice.appendChild(badge);

  if (onRemove && merchant) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Remove filter";
    button.title = `Remove filter for ${merchant.name}`;

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      await onRemove();
    });

    notice.appendChild(button);
  }

  return notice;
}

function ensureDimmedNotice(card, config) {
  const existingNotice = card.querySelector?.(DIMMED_NOTICE_SELECTOR);

  if (existingNotice?.dataset?.noticeKey === config.noticeKey) {
    return;
  }

  removeDimmedNotice(card);

  const notice = createDimmedNotice(config);
  const noticeParent =
    (card.matches?.(".threadListCard") ? card : null) ||
    card.querySelector?.(".threadListCard") ||
    card.querySelector?.(".threadItemCard-about") ||
    card;

  if (noticeParent.prepend) {
    noticeParent.prepend(notice);
  } else if (noticeParent.insertAdjacentElement) {
    noticeParent.insertAdjacentElement("afterbegin", notice);
  } else {
    noticeParent.appendChild?.(notice);
  }
}

function setInitialLoadingState(isLoading) {
  document.documentElement?.classList?.toggle?.(LOADING_CLASS, isLoading);
}

function hideCard(card) {
  if (card.dataset) {
    card.dataset[HIDDEN_KEY] = "true";
    delete card.dataset[DIMMED_KEY];
  }

  card.classList?.remove(DIMMED_CLASS);
  removeDimmedNotice(card);

  if (card.style) {
    card.style.display = "none";
  }
}

function getStoreDimmedNoticeConfig(merchant) {
  return {
    badgeText: `${PLUGIN_NAME}: Filtered by store filter`,
    noticeKey: `store:${normalizeText(merchant.name)}`,
    merchant,
    onRemove: async () => {
      hiddenStores = await removeHiddenStore(merchant.name);
      applyFilters();
    }
  };
}

function getThresholdDimmedNoticeConfig() {
  const thresholdLabel = hideUnfilteredThreshold === null
    ? `${PLUGIN_NAME}: Filtered by threshold`
    : `${PLUGIN_NAME}: Filtered by threshold < ${hideUnfilteredThreshold}\u00B0`;

  return {
    badgeText: thresholdLabel,
    noticeKey: `threshold:${hideUnfilteredThreshold ?? "off"}`
  };
}

function dimCard(card, noticeConfig = null) {
  if (card.dataset) {
    delete card.dataset[HIDDEN_KEY];
    card.dataset[DIMMED_KEY] = "true";
  }

  card.classList?.add(DIMMED_CLASS);
  if (noticeConfig) {
    ensureDimmedNotice(card, noticeConfig);
  } else {
    removeDimmedNotice(card);
  }

  if (card.style) {
    card.style.display = "";
  }
}

function showCard(card) {
  if (card.dataset?.[HIDDEN_KEY] === "true") {
    delete card.dataset[HIDDEN_KEY];
  }

  if (card.dataset?.[DIMMED_KEY] === "true") {
    delete card.dataset[DIMMED_KEY];
  }

  card.classList?.remove(DIMMED_CLASS);
  removeDimmedNotice(card);

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

    const shouldAddStore = await showConfirmModal(
      `Do you want to add ${merchant.name} to the filtered stores?`,
      "Add filter",
      "Cancel"
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

function isTemperatureAtOrAboveThreshold(value) {
  return (
    showFilteredThreshold !== null &&
    value !== null &&
    value >= showFilteredThreshold
  );
}

function isTemperatureBelowThreshold(value) {
  return (
    hideUnfilteredThreshold !== null &&
    value !== null &&
    value < hideUnfilteredThreshold
  );
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

    if (!filtersEnabled) {
      showCard(item.card);
      continue;
    }

    const isFilteredStore = isStoreHidden(item.merchant.name);
    const shouldShowFilteredStore =
      isFilteredStore &&
      showFilteredAboveThreshold &&
      isTemperatureAtOrAboveThreshold(item.temperature);
    const shouldHideBelowThreshold =
      hideUnfilteredBelowThreshold &&
      isTemperatureBelowThreshold(item.temperature);

    if (shouldShowFilteredStore) {
      showCard(item.card);
      continue;
    }

    if (shouldHideBelowThreshold) {
      if (showBelowThresholdAsDimmed) {
        dimCard(item.card, getThresholdDimmedNoticeConfig());
      } else {
        hideCard(item.card);
      }

      hiddenCount += 1;
      continue;
    }

    if (isFilteredStore) {
      if (showFilteredAsDimmed) {
        dimCard(item.card, getStoreDimmedNoticeConfig(item.merchant));
      } else {
        hideCard(item.card);
      }

      hiddenCount += 1;
      continue;
    }

    showCard(item.card);
  }

  const merchantNames = Array.from(new Set(items.map((item) => item.merchant.name)));
  const debugSignature = JSON.stringify({
    items: items.length,
    hidden: hiddenCount,
    filtersEnabled,
    showFilteredAsDimmed,
    showBelowThresholdAsDimmed,
    showFilteredAboveThreshold,
    hideUnfilteredBelowThreshold,
    showFilteredThreshold,
    hideUnfilteredThreshold,
    stores: hiddenStores,
    merchants: merchantNames.slice(0, 10)
  });

  if (debugSignature !== lastDebugSignature) {
    lastDebugSignature = debugSignature;
    debugLog("Deal scan", {
      normalizers: document.querySelectorAll(NORMALIZER_SELECTOR).length,
      offersWithMerchant: items.length,
      addedButtons: addedButtonsCount,
      hiddenOffers: hiddenCount,
      filtersEnabled,
      showFilteredAsDimmed,
      showBelowThresholdAsDimmed,
      showFilteredAboveThreshold,
      hideUnfilteredBelowThreshold,
      showFilteredThreshold,
      hideUnfilteredThreshold,
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
    .${LOADING_CLASS} :is(${CARD_SELECTOR}) {
      visibility: hidden !important;
    }

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

    .pepper-store-filter-confirm-modal[hidden] {
      display: none !important;
    }

    .pepper-store-filter-confirm-modal {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
    }

    .pepper-store-filter-confirm-backdrop {
      position: absolute;
      inset: 0;
      background: rgba(15, 23, 42, 0.45);
    }

    .pepper-store-filter-confirm-dialog {
      position: absolute;
      top: 50%;
      left: 50%;
      width: min(360px, calc(100vw - 32px));
      padding: 16px;
      border: 1px solid #d8dde6;
      border-radius: 8px;
      color: #1f2933;
      background: #fff;
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.24);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transform: translate(-50%, -50%);
    }

    .pepper-store-filter-confirm-title {
      margin: 0 0 8px;
      font-size: 17px;
      line-height: 1.2;
    }

    .pepper-store-filter-confirm-message {
      margin: 0;
      font-size: 14px;
      line-height: 1.45;
    }

    .pepper-store-filter-confirm-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 14px;
    }

    .pepper-store-filter-confirm-actions button {
      appearance: none;
      padding: 8px 12px;
      border: 1px solid #de5a00;
      border-radius: 999px;
      color: #fff;
      background: #ff6400;
      box-shadow: 0 1px 2px rgba(26, 33, 43, 0.14);
      font-family: inherit;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.35;
      cursor: pointer;
    }

    .pepper-store-filter-confirm-actions .pepper-store-filter-confirm-cancel {
      border-color: #d8dde6;
      color: #1f2933;
      background: #fff;
    }

    .pepper-store-filter-confirm-actions .pepper-store-filter-confirm-cancel:hover {
      color: #fff;
      border-color: #4b5563;
      background: #4b5563;
    }

    .pepper-store-filter-confirm-actions .pepper-store-filter-confirm-submit:hover {
      background: #e85b00;
    }

    .${DIMMED_CLASS} {
      display: block !important;
      min-height: 0 !important;
    }

    .pepper-store-filter-dimmed-notice {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin: 0 0 10px !important;
      padding: 0;
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.3;
    }

    .pepper-store-filter-dimmed-badge {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      overflow: hidden;
      padding: 5px 10px;
      border: 1px solid #de5a00;
      border-radius: 999px;
      color: #fff;
      background: #ff6400;
      box-shadow: 0 1px 2px rgba(26, 33, 43, 0.14);
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .pepper-store-filter-dimmed-notice button {
      appearance: none;
      flex: 0 0 auto;
      padding: 4px 9px;
      border: 1px solid #de5a00;
      border-radius: 999px;
      color: #fff;
      background: #ff6400;
      box-shadow: 0 1px 2px rgba(26, 33, 43, 0.14);
      font-family: inherit;
      font-size: 12px;
      font-weight: 700;
      line-height: 1.35;
      cursor: pointer;
    }

    .pepper-store-filter-dimmed-notice button:hover {
      background: #e85b00;
    }

    .pepper-store-filter-dimmed-notice button:active {
      transform: translateY(1px);
      box-shadow: none;
    }

    .${DIMMED_CLASS} .threadListCard {
      display: block !important;
      min-height: 0 !important;
      padding: 12px 14px 10px !important;
    }

    .${DIMMED_CLASS} .threadListCard-header {
      display: none !important;
      margin: 0 !important;
    }

    .${DIMMED_CLASS} .threadListCard-body {
      display: block !important;
    }

    .${DIMMED_CLASS} .thread-title {
      margin-bottom: 4px !important;
    }

    .${DIMMED_CLASS} .threadListCard-image,
    .${DIMMED_CLASS} .threadListCard-label,
    .${DIMMED_CLASS} .threadItemCard-gallery,
    .${DIMMED_CLASS} picture,
    .${DIMMED_CLASS} img,
    .${DIMMED_CLASS} .imgFrame {
      display: none !important;
    }

    .${DIMMED_CLASS} .userHtml,
    .${DIMMED_CLASS} .threadListCard-footer,
    .${DIMMED_CLASS} .pepper-store-filter-wrapper {
      display: none !important;
    }

    .${DIMMED_CLASS} .threadListCard-body,
    .${DIMMED_CLASS} .threadItemCard-about {
      padding-top: 4px !important;
      padding-bottom: 4px !important;
    }

    .${DIMMED_CLASS} .threadListCard-body,
    .${DIMMED_CLASS} .threadItemCard-about > :not(.pepper-store-filter-dimmed-notice) {
      opacity: 0.48;
      filter: grayscale(0.85);
    }

    .${DIMMED_CLASS} .thread-title a {
      display: -webkit-box !important;
      overflow: hidden !important;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
    }
  `;

  document.documentElement.appendChild(style);
}

async function refreshStateFromStorage(resetFiltersForPage = false) {
  let settings = await getSettings();

  if (resetFiltersForPage && settings.alwaysFilterOnPageOpen && !settings.filtersEnabled) {
    settings = await saveSettings({
      ...settings,
      filtersEnabled: true
    });
  }

  filtersEnabled = settings.filtersEnabled;
  showFilteredAsDimmed = settings.showFilteredAsDimmed;
  showBelowThresholdAsDimmed = settings.showBelowThresholdAsDimmed;
  showFilteredAboveThreshold = settings.showFilteredAboveThreshold;
  hideUnfilteredBelowThreshold = settings.hideUnfilteredBelowThreshold;
  showFilteredThreshold = settings.showFilteredThreshold;
  hideUnfilteredThreshold = settings.hideUnfilteredThreshold;
  hiddenStores = await getStoredHiddenStores(settings);
  applyFilters();
}

async function loadHiddenStores() {
  debugLog("Content script loaded", {
    url: window.location.href,
    normalizers: document.querySelectorAll(NORMALIZER_SELECTOR).length
  });

  try {
    await refreshStateFromStorage(true);
  } finally {
    setInitialLoadingState(false);
  }
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
  const storesChanged =
    ["sync", "local"].includes(areaName) && Boolean(changes[STORAGE_KEY]);
  const settingsChanged = areaName === "local" && Boolean(changes[SETTINGS_KEY]);

  if (!storesChanged && !settingsChanged) {
    return;
  }

  refreshStateFromStorage().then(() => {
    debugLog("Filter state changed", {
      filtersEnabled,
      showFilteredAsDimmed,
      showFilteredAboveThreshold,
      hideUnfilteredBelowThreshold,
      showFilteredThreshold,
      hideUnfilteredThreshold,
      hiddenStores
    });
  });
});

browser.runtime?.onMessage?.addListener((message) => {
  if (message?.type !== "dealStoreFilterRefresh") {
    return undefined;
  }

  return refreshStateFromStorage();
});

setInitialLoadingState(true);
injectStyles();
loadHiddenStores();

if (document.body) {
  observePageChanges();
} else {
  window.addEventListener("DOMContentLoaded", observePageChanges, { once: true });
}
