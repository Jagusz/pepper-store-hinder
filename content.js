const STORAGE_KEY = "hiddenStores";
const CATEGORY_STORAGE_KEY = "hiddenCategories";
const SETTINGS_KEY = "settings";
const HIDDEN_KEY = "pepperStoreFilterHidden";
const DIMMED_KEY = "pepperStoreFilterDimmed";
const DIMMED_CLASS = "pepper-store-filter-dimmed";
const DIMMED_NOTICE_SELECTOR = ".pepper-store-filter-dimmed-notice";
const LOADING_CLASS = "pepper-store-filter-loading";
const NORMALIZER_SELECTOR = '[data-vue3*="ThreadMainListItemNormalizer"]';
const CARD_SELECTOR = 'article[id^="thread_"], article.thread, [data-t="thread"]';
const FILTER_BUTTON_SELECTOR = ".pepper-store-filter-button";
const FILTER_WRAPPER_SELECTOR = ".pepper-store-filter-wrapper";
const DEBUG_STORAGE_KEY = "pepperStoreFilterDebug";
const DEBUG_QUERY_PARAM = "pshdebug";
const PLUGIN_NAME = "Deal Store Filter";
const I18N = globalThis.DealStoreFilterI18n || {
  DEFAULT_UI_LANGUAGE: "auto",
  normalizeUiLanguageSetting: (value) => {
    const normalized = String(value || "").trim().toLowerCase();

    return ["auto", "en", "pl"].includes(normalized) ? normalized : "auto";
  },
  resolveUiLanguage: (setting, options = {}) => {
    const normalizedSetting = String(setting || "").trim().toLowerCase();

    if (normalizedSetting === "en" || normalizedSetting === "pl") {
      return normalizedSetting;
    }

    const pageLanguage = String(options.pageLanguage || "").trim().toLowerCase();

    if (pageLanguage) {
      return pageLanguage.startsWith("pl") ? "pl" : "en";
    }

    const candidates = [
      options.browserLanguage,
      ...(Array.isArray(options.browserLanguages) ? options.browserLanguages : [])
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);

    return candidates.some((value) => value.startsWith("pl")) ? "pl" : "en";
  },
  t: (language, key, params = {}) => {
    const fallbackTranslations = {
      en: {
        removeFilterAction: "Remove filter",
        removeFilterActionTitle: "Remove filter for {name}",
        dimmedStoreNotice: "{pluginName}: Filtered by store filter",
        dimmedCategoryNotice: "{pluginName}: Filtered by category filter",
        dimmedThresholdNotice: "{pluginName}: Filtered by threshold",
        dimmedThresholdNoticeWithValue:
          "{pluginName}: Filtered by threshold < {value}\u00B0",
        filterStoreButton: "Hide store: {name}",
        filterStoreButtonTitle: "Hide deals from store: {name}",
        filterCategoryButton: "Hide category: {name}",
        filterCategoryButtonTitle: "Hide deals from category: {name}",
        addStoreConfirm: "Do you want to add {name} to the filtered stores?",
        addCategoryConfirm: "Do you want to add {name} to the filtered categories?"
      },
      pl: {
        removeFilterAction: "Usu\u0144 filtr",
        removeFilterActionTitle: "Usu\u0144 filtr dla {name}",
        dimmedStoreNotice: "{pluginName}: Ukryte przez filtr sklepu",
        dimmedCategoryNotice: "{pluginName}: Ukryte przez filtr kategorii",
        dimmedThresholdNotice: "{pluginName}: Ukryte przez pr\u00F3g",
        dimmedThresholdNoticeWithValue:
          "{pluginName}: Ukryte przez pr\u00F3g < {value}\u00B0",
        filterStoreButton: "Ukryj sklep: {name}",
        filterStoreButtonTitle: "Ukryj oferty ze sklepu: {name}",
        filterCategoryButton: "Ukryj kategori\u0119: {name}",
        filterCategoryButtonTitle: "Ukryj oferty z kategorii: {name}",
        addStoreConfirm:
          "Czy chcesz doda\u0107 {name} do filtrowanych sklep\u00F3w?",
        addCategoryConfirm:
          "Czy chcesz doda\u0107 {name} do filtrowanych kategorii?"
      }
    };
    const dictionary = fallbackTranslations[language] || fallbackTranslations.en;
    const template = dictionary[key] || fallbackTranslations.en[key] || key;

    return String(template).replace(/\{(\w+)\}/g, (match, name) => {
      return Object.prototype.hasOwnProperty.call(params, name)
        ? String(params[name])
        : match;
    });
  }
};
const DEFAULT_UI_LANGUAGE = I18N.DEFAULT_UI_LANGUAGE;
const DEFAULT_SETTINGS = {
  useFirefoxSync: true,
  alwaysFilterOnPageOpen: true,
  filtersEnabled: true,
  categoryFiltersEnabled: true,
  showFilteredAsDimmed: false,
  showBelowThresholdAsDimmed: false,
  showFilteredAboveThreshold: false,
  hideUnfilteredBelowThreshold: false,
  showFilteredThreshold: null,
  hideUnfilteredThreshold: null,
  uiLanguage: DEFAULT_UI_LANGUAGE
};

let hiddenStores = [];
let hiddenCategories = [];
let filtersEnabled = true;
let categoryFiltersEnabled = true;
let showFilteredAsDimmed = false;
let showBelowThresholdAsDimmed = false;
let showFilteredAboveThreshold = false;
let hideUnfilteredBelowThreshold = false;
let showFilteredThreshold = null;
let hideUnfilteredThreshold = null;
let currentUiLanguage = "en";
let lastDebugSignature = "";
let applyFiltersTimer = null;
const threadDataCache = new Map();
const THREAD_DATA_CACHE_MAX_SIZE = 500;

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

function getCurrentBrowserLanguage() {
  return browser.i18n?.getUILanguage?.() || navigator.language || "";
}

function getCurrentBrowserLanguages() {
  return Array.isArray(navigator.languages) ? navigator.languages : [];
}

function getPageLanguage() {
  return document.documentElement?.lang || "";
}

function resolvePageUiLanguage(settings = null) {
  return I18N.resolveUiLanguage(settings?.uiLanguage, {
    pageLanguage: getPageLanguage(),
    browserLanguage: getCurrentBrowserLanguage(),
    browserLanguages: getCurrentBrowserLanguages()
  });
}

function t(key, params = {}) {
  return I18N.t(currentUiLanguage, key, params);
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
    categoryFiltersEnabled: value?.categoryFiltersEnabled !== false,
    showFilteredAsDimmed: value?.showFilteredAsDimmed === true,
    showBelowThresholdAsDimmed: value?.showBelowThresholdAsDimmed === true,
    showFilteredAboveThreshold: value?.showFilteredAboveThreshold === true,
    hideUnfilteredBelowThreshold: value?.hideUnfilteredBelowThreshold === true,
    showFilteredThreshold:
      normalizeThresholdValue(value?.showFilteredThreshold) ?? legacyThreshold,
    hideUnfilteredThreshold:
      normalizeThresholdValue(value?.hideUnfilteredThreshold) ?? legacyThreshold,
    uiLanguage: I18N.normalizeUiLanguageSetting(value?.uiLanguage)
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

      await updateLocalCache(syncedStores);
      return syncedStores;
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

async function getStoredHiddenCategories(settings = null) {
  const activeSettings = settings || await getSettings();

  if (activeSettings.useFirefoxSync && browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [CATEGORY_STORAGE_KEY]: [] });
      const syncedCategories = mergeStoreLists(syncResult[CATEGORY_STORAGE_KEY]);

      const localResult = await browser.storage.local.get({ [CATEGORY_STORAGE_KEY]: [] });
      const localCategories = mergeStoreLists(localResult[CATEGORY_STORAGE_KEY]);

      if (JSON.stringify(localCategories) !== JSON.stringify(syncedCategories)) {
        await browser.storage.local.set({ [CATEGORY_STORAGE_KEY]: syncedCategories });
      }

      return syncedCategories;
    } catch (error) {
      debugLog("Firefox Sync unavailable while reading category filters", error);
    }
  }

  const localResult = await browser.storage.local.get({ [CATEGORY_STORAGE_KEY]: [] });
  return mergeStoreLists(localResult[CATEGORY_STORAGE_KEY]);
}

async function setStoredHiddenCategories(categories) {
  const settings = await getSettings();
  const normalizedCategories = mergeStoreLists(categories);

  if (settings.useFirefoxSync && browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [CATEGORY_STORAGE_KEY]: normalizedCategories });
    } catch (error) {
      debugLog("Firefox Sync unavailable while saving category filters", error);
    }
  }

  await browser.storage.local.set({ [CATEGORY_STORAGE_KEY]: normalizedCategories });
  return normalizedCategories;
}

async function removeHiddenCategory(categoryName) {
  const normalizedCategoryName = normalizeText(categoryName);
  const currentCategories = await getStoredHiddenCategories();

  return setStoredHiddenCategories(
    currentCategories.filter((item) => normalizeText(item) !== normalizedCategoryName)
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

function getThreadIdForCard(card, thread = null) {
  const threadId = normalizeStoreName(String(thread?.threadId || ""));

  if (threadId) {
    return threadId;
  }

  const cardIdMatch = String(card?.id || "").match(/^thread_(\d+)$/);

  if (cardIdMatch?.[1]) {
    return cardIdMatch[1];
  }

  return "";
}

function createStructuredThreadRecord(card, thread) {
  const threadId = getThreadIdForCard(card, thread);

  if (!threadId || !thread) {
    return null;
  }

  return {
    threadId,
    type: thread.type || null,
    merchant: thread.merchant?.merchantName
      ? {
          merchantName: thread.merchant.merchantName
        }
      : null,
    linkHost: thread.linkHost || "",
    mainGroup: thread.mainGroup?.threadGroupName
      ? {
          threadGroupName: thread.mainGroup.threadGroupName,
          threadGroupUrlName: thread.mainGroup.threadGroupUrlName || ""
        }
      : null,
    temperature: thread.temperature ?? null
  };
}

function mergeThreadDataRecords(previousRecord, nextRecord) {
  if (!previousRecord) {
    return nextRecord || null;
  }

  if (!nextRecord) {
    return previousRecord;
  }

  return {
    threadId: nextRecord.threadId || previousRecord.threadId || "",
    type: nextRecord.type || previousRecord.type || null,
    merchant: nextRecord.merchant?.merchantName
      ? nextRecord.merchant
      : previousRecord.merchant,
    linkHost: nextRecord.linkHost || previousRecord.linkHost || "",
    mainGroup: nextRecord.mainGroup?.threadGroupName
      ? nextRecord.mainGroup
      : previousRecord.mainGroup,
    temperature:
      nextRecord.temperature === null || nextRecord.temperature === undefined
        ? previousRecord.temperature ?? null
        : nextRecord.temperature
  };
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

function cacheStructuredThreadData(card, thread) {
  const nextRecord = createStructuredThreadRecord(card, thread);

  if (!nextRecord?.threadId) {
    return;
  }

  if (threadDataCache.size >= THREAD_DATA_CACHE_MAX_SIZE) {
    const firstKey = threadDataCache.keys().next().value;
    threadDataCache.delete(firstKey);
  }

  const previousRecord = threadDataCache.get(nextRecord.threadId) || null;
  threadDataCache.set(
    nextRecord.threadId,
    mergeThreadDataRecords(previousRecord, nextRecord)
  );
}

function getCachedThreadDataForCard(card) {
  const threadId = getThreadIdForCard(card);

  if (!threadId) {
    return null;
  }

  return threadDataCache.get(threadId) || null;
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
    .replace(/[^\p{L}\p{N}\s.&'+-]+$/u, "")
    .trim();
}

function getMerchantNameFromCardText(card) {
  const text = normalizeStoreName(card?.textContent);
  const match = text.match(
    /(?:Dost\S*\s+w|Zrealizuj\s+na)\s+(.+?)(?:\s*Dodane|\s*Doda\S*|\s*Opublikowane|\s+przez|\s*Id\S*\s+do\s+okazji|\s*Przejd\S*|\s*Zobacz|\s*Otw\S*|$)/i
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
  const hasStructuredNormalizer = Boolean(normalizer && normalizer !== card);
  const merchantName =
    normalizeStoreName(thread?.merchant?.merchantName) ||
    normalizeLinkHostName(thread?.linkHost) ||
    getMerchantNameFromCardText(card);
  const categoryName = normalizeStoreName(thread?.mainGroup?.threadGroupName);
  const temperature =
    normalizeDealTemperature(thread?.temperature) ??
    getTemperatureFromCardText(card);

  if (thread?.type === "Discussion") {
    return null;
  }

  if (hasStructuredNormalizer && !thread) {
    return null;
  }

  if (!merchantName && !categoryName) {
    return null;
  }

  return {
    normalizer,
    card,
    merchant: merchantName
      ? {
          name: merchantName
        }
      : null,
    category: categoryName
      ? {
          name: categoryName,
          slug: normalizeStoreName(thread?.mainGroup?.threadGroupUrlName)
        }
      : null,
    temperature
  };
}

function getNormalizerItems() {
  const items = [];
  const seenCards = new Set();
  const cardsWithStructuredNormalizers = new Set();

  for (const normalizer of document.querySelectorAll(NORMALIZER_SELECTOR)) {
    const card = getCardFromNormalizer(normalizer);

    if (card) {
      cardsWithStructuredNormalizers.add(card);
    }

    const thread = getThreadDataFromElement(normalizer);
    cacheStructuredThreadData(card, thread);
    const cachedThread = card ? getCachedThreadDataForCard(card) : null;
    const resolvedThread = mergeThreadDataRecords(
      cachedThread,
      createStructuredThreadRecord(card, thread)
    );
    const item = card
      ? createItemFromThread(card, normalizer, resolvedThread)
      : null;

    if (item) {
      items.push(item);
      seenCards.add(item.card);
    }
  }

  for (const card of document.querySelectorAll(CARD_SELECTOR)) {
    if (seenCards.has(card) || cardsWithStructuredNormalizers.has(card)) {
      continue;
    }

    const normalizer = card.querySelector?.(NORMALIZER_SELECTOR) || card;
    const thread = mergeThreadDataRecords(
      getCachedThreadDataForCard(card),
      createStructuredThreadRecord(card, getThreadDataFromElement(card))
    );
    const item = createItemFromThread(card, normalizer, thread);

    if (item) {
      items.push(item);
      seenCards.add(item.card);
    }
  }

  return items;
}

function warmStructuredThreadCache() {
  for (const normalizer of document.querySelectorAll(NORMALIZER_SELECTOR)) {
    const card = getCardFromNormalizer(normalizer);
    const thread = getThreadDataFromElement(normalizer);

    cacheStructuredThreadData(card, thread);
  }
}

function isStoreHidden(storeName) {
  const normalizedStoreName = normalizeText(storeName);

  return hiddenStores.some((hiddenStore) => {
    return normalizeText(hiddenStore) === normalizedStoreName;
  });
}

function isCategoryHidden(categoryName) {
  const normalizedCategoryName = normalizeText(categoryName);

  return hiddenCategories.some((hiddenCategory) => {
    return normalizeText(hiddenCategory) === normalizedCategoryName;
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
    button.textContent = t("removeFilterAction");
    button.title = t("removeFilterActionTitle", { name: merchant.name });

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      try {
        await onRemove();
      } catch (error) {
        debugLog("Error removing filter", error);
      }
    });

    notice.appendChild(button);
  }

  return notice;
}

function ensureDimmedNotice(card, config) {
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
    badgeText: t("dimmedStoreNotice", { pluginName: PLUGIN_NAME }),
    noticeKey: `store:${normalizeText(merchant.name)}`,
    merchant,
    onRemove: async () => {
      hiddenStores = await removeHiddenStore(merchant.name);
      applyFilters();
    }
  };
}

function getCategoryDimmedNoticeConfig(category) {
  return {
    badgeText: t("dimmedCategoryNotice", { pluginName: PLUGIN_NAME }),
    noticeKey: `category:${normalizeText(category.name)}`,
    merchant: category,
    onRemove: async () => {
      hiddenCategories = await removeHiddenCategory(category.name);
      applyFilters();
    }
  };
}

function getThresholdDimmedNoticeConfig() {
  const thresholdLabel = hideUnfilteredThreshold === null
    ? t("dimmedThresholdNotice", { pluginName: PLUGIN_NAME })
    : t("dimmedThresholdNoticeWithValue", {
        pluginName: PLUGIN_NAME,
        value: hideUnfilteredThreshold
      });

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

async function saveHiddenCategory(categoryName) {
  const cleanedCategoryName = normalizeStoreName(categoryName);

  if (!cleanedCategoryName) {
    return hiddenCategories;
  }

  const currentCategories = await getStoredHiddenCategories();
  const alreadyExists = currentCategories.some((item) => {
    return normalizeText(item) === normalizeText(cleanedCategoryName);
  });

  if (alreadyExists) {
    return currentCategories;
  }

  return setStoredHiddenCategories([...currentCategories, cleanedCategoryName]);
}

function configureStoreFilterButton(button, merchant) {
  button.type = "button";
  button.className = "pepper-store-filter-button pepper-store-filter-button-store";
  button.textContent = t("filterStoreButton", { name: merchant.name });
  button.title = t("filterStoreButtonTitle", { name: merchant.name });
}

function createStoreFilterButton(merchant) {
  const button = document.createElement("button");

  configureStoreFilterButton(button, merchant);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      const shouldAddStore = window.confirm(
        t("addStoreConfirm", { name: merchant.name })
      );

      if (!shouldAddStore) {
        return;
      }

      hiddenStores = await saveHiddenStore(merchant.name);
      applyFilters();
    } catch (error) {
      debugLog("Error adding store filter", error);
    }
  });

  return button;
}

function configureCategoryFilterButton(button, category) {
  button.type = "button";
  button.className = "pepper-store-filter-button pepper-store-filter-button-category";
  button.title = t("filterCategoryButtonTitle", { name: category.name });
  button.textContent = t("filterCategoryButton", { name: category.name });
}

function createCategoryFilterButton(category) {
  const button = document.createElement("button");

  configureCategoryFilterButton(button, category);

  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    try {
      const shouldAddCategory = window.confirm(
        t("addCategoryConfirm", { name: category.name })
      );

      if (!shouldAddCategory) {
        return;
      }

      hiddenCategories = await saveHiddenCategory(category.name);
      applyFilters();
    } catch (error) {
      debugLog("Error adding category filter", error);
    }
  });

  return button;
}

function createFilterButton(merchant) {
  return createStoreFilterButton(merchant);
}

function ensureStoreFilterButton(wrapper, merchant) {
  const existingButton = wrapper.querySelector?.(".pepper-store-filter-button-store");

  if (existingButton) {
    configureStoreFilterButton(existingButton, merchant);
    return existingButton;
  }

  const button = createStoreFilterButton(merchant);
  wrapper.appendChild(button);
  return button;
}

function ensureCategoryFilterButton(wrapper, category) {
  const existingButton = wrapper.querySelector?.(".pepper-store-filter-button-category");

  if (existingButton) {
    configureCategoryFilterButton(existingButton, category);
    return existingButton;
  }

  const button = createCategoryFilterButton(category);
  wrapper.appendChild(button);
  return button;
}

function addFilterButton(item) {
  const existingWrapper = item.card.querySelector(FILTER_WRAPPER_SELECTOR);
  const hasStoreButton = Boolean(
    existingWrapper?.querySelector?.(".pepper-store-filter-button-store")
  );
  const hasCategoryButton = Boolean(
    existingWrapper?.querySelector?.(".pepper-store-filter-button-category")
  );
  const body = item.card.querySelector(".threadListCard-body");
  const target = body || item.card.querySelector(".thread-title") || item.normalizer;
  const beforeElement = body?.querySelector(".userHtml");
  const wrapper = existingWrapper || document.createElement("div");

  wrapper.className = "pepper-store-filter-wrapper";
  if (item.merchant) {
    ensureStoreFilterButton(wrapper, item.merchant);
  }

  if (item.category) {
    ensureCategoryFilterButton(wrapper, item.category);
  }

  if (existingWrapper) {
    return;
  }

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
    const hadButton = Boolean(item.card.querySelector(FILTER_BUTTON_SELECTOR));
    addFilterButton(item);

    if (!hadButton && item.card.querySelector(FILTER_BUTTON_SELECTOR)) {
      addedButtonsCount += 1;
    }

    if (!filtersEnabled) {
      showCard(item.card);
      continue;
    }

    const isFilteredStore = item.merchant ? isStoreHidden(item.merchant.name) : false;
    const isFilteredCategory =
      categoryFiltersEnabled &&
      Boolean(item.category?.name) &&
      isCategoryHidden(item.category.name);
    const isFilteredItem = isFilteredStore || isFilteredCategory;
    const shouldShowFilteredStore =
      isFilteredStore &&
      !isFilteredCategory &&
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

    if (isFilteredItem) {
      if (showFilteredAsDimmed) {
        dimCard(
          item.card,
          isFilteredCategory
            ? getCategoryDimmedNoticeConfig(item.category)
            : getStoreDimmedNoticeConfig(item.merchant)
        );
      } else {
        hideCard(item.card);
      }

      hiddenCount += 1;
      continue;
    }

    showCard(item.card);
  }

  const merchantNames = Array.from(
    new Set(items.map((item) => item.merchant?.name).filter(Boolean))
  );
  const categoryNames = Array.from(
    new Set(items.map((item) => item.category?.name).filter(Boolean))
  );
  const debugSignature = JSON.stringify({
    items: items.length,
    hidden: hiddenCount,
    filtersEnabled,
    categoryFiltersEnabled,
    showFilteredAsDimmed,
    showBelowThresholdAsDimmed,
    showFilteredAboveThreshold,
    hideUnfilteredBelowThreshold,
    showFilteredThreshold,
    hideUnfilteredThreshold,
    stores: hiddenStores,
    categories: hiddenCategories,
    merchants: merchantNames.slice(0, 10),
    visibleCategories: categoryNames.slice(0, 10)
  });

  if (debugSignature !== lastDebugSignature) {
    lastDebugSignature = debugSignature;
    debugLog("Deal scan", {
      normalizers: document.querySelectorAll(NORMALIZER_SELECTOR).length,
      offersWithMerchant: items.length,
      addedButtons: addedButtonsCount,
      hiddenOffers: hiddenCount,
      filtersEnabled,
      categoryFiltersEnabled,
      showFilteredAsDimmed,
      showBelowThresholdAsDimmed,
      showFilteredAboveThreshold,
      hideUnfilteredBelowThreshold,
      showFilteredThreshold,
      hideUnfilteredThreshold,
      hiddenStores,
      hiddenCategories,
      sampleMerchants: merchantNames.slice(0, 10),
      sampleCategories: categoryNames.slice(0, 10)
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
      flex-wrap: wrap;
      gap: 8px;
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
  try {
    let settings = await getSettings();

    if (resetFiltersForPage && settings.alwaysFilterOnPageOpen && !settings.filtersEnabled) {
      settings = await saveSettings({
        ...settings,
        filtersEnabled: true
      });
    }

    filtersEnabled = settings.filtersEnabled;
    categoryFiltersEnabled = settings.categoryFiltersEnabled;
    showFilteredAsDimmed = settings.showFilteredAsDimmed;
    showBelowThresholdAsDimmed = settings.showBelowThresholdAsDimmed;
    showFilteredAboveThreshold = settings.showFilteredAboveThreshold;
    hideUnfilteredBelowThreshold = settings.hideUnfilteredBelowThreshold;
    showFilteredThreshold = settings.showFilteredThreshold;
    hideUnfilteredThreshold = settings.hideUnfilteredThreshold;
    currentUiLanguage = resolvePageUiLanguage(settings);
    hiddenStores = await getStoredHiddenStores(settings);
    hiddenCategories = await getStoredHiddenCategories(settings);
    applyFilters();
  } catch (error) {
    debugLog("Error refreshing filter state from storage", error);
    throw error;
  }
}

async function loadHiddenStores() {
  debugLog("Content script loaded", {
    url: window.location.href,
    normalizers: document.querySelectorAll(NORMALIZER_SELECTOR).length
  });

  try {
    await refreshStateFromStorage(true);
    scheduleFollowUpScans();
  } finally {
    setInitialLoadingState(false);
  }
}

function observePageChanges() {
  const observerTarget = document.body || document.documentElement;

  if (!observerTarget) {
    return;
  }

  let debounceTimer = null;
  let observer = null;

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    window.removeEventListener?.("scroll", scheduleFollowUpScans);
    clearTimeout(debounceTimer);
  };

  cleanup();

  observer = new MutationObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scheduleFollowUpScans, 150);
  });

  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-vue3", "aria-busy", "class"]
  });

  window.addEventListener("scroll", scheduleFollowUpScans, {
    passive: true
  });
}

browser.storage.onChanged.addListener((changes, areaName) => {
  const storesChanged =
    ["sync", "local"].includes(areaName) && Boolean(changes[STORAGE_KEY]);
  const categoriesChanged =
    ["sync", "local"].includes(areaName) && Boolean(changes[CATEGORY_STORAGE_KEY]);
  const settingsChanged = areaName === "local" && Boolean(changes[SETTINGS_KEY]);

  if (!storesChanged && !categoriesChanged && !settingsChanged) {
    return;
  }

  refreshStateFromStorage()
    .then(() => {
      debugLog("Filter state changed", {
        filtersEnabled,
        showFilteredAsDimmed,
        showFilteredAboveThreshold,
        hideUnfilteredBelowThreshold,
        showFilteredThreshold,
        hideUnfilteredThreshold,
        hiddenStores,
        hiddenCategories,
        categoryFiltersEnabled
      });
    })
    .catch((error) => {
      debugLog("Error refreshing filter state on storage change", error);
    });
});

browser.runtime?.onMessage?.addListener((message) => {
  if (message?.type === "dealStoreFilterGetPageLanguage") {
    return Promise.resolve({
      pageLanguage: getPageLanguage(),
      uiLanguage: resolvePageUiLanguage()
    });
  }

  if (message?.type === "dealStoreFilterRefresh") {
    return refreshStateFromStorage().catch((error) => {
      debugLog("Error refreshing filters on message", error);
      throw error;
    });
  }

  return undefined;
});

setInitialLoadingState(true);
injectStyles();
warmStructuredThreadCache();
loadHiddenStores();

if (document.body || document.documentElement) {
  observePageChanges();
} else {
  window.addEventListener("DOMContentLoaded", observePageChanges, { once: true });
}
