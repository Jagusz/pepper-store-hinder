const STORAGE_KEY = "hiddenStores";
const CATEGORY_STORAGE_KEY = "hiddenCategories";
const SETTINGS_KEY = "settings";
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
        appTitle: "Deal Store Filter",
        firefoxSyncBadge: "Firefox Sync",
        settingsTitle: "Settings",
        backButtonTitle: "Back",
        filterTypeLabel: "Filter type",
        shopsTab: "Shops",
        categoriesTab: "Categories",
        filterInputStoreLabel: "Store to hide",
        filterInputCategoryLabel: "Category to hide",
        filterInputStorePlaceholder: "Amazon.pl",
        filterInputCategoryPlaceholder: "Gaming",
        addButton: "Add",
        clearShopsButton: "Clear shops",
        clearCategoriesButton: "Clear categories",
        noHiddenStores: "No hidden stores.",
        noHiddenCategories: "No hidden categories.",
        filtersDisabledStatus:
          "Filters disabled. Matching deals are currently visible.",
        syncDisabledStatus: "Firefox Sync disabled. List saved locally.",
        syncEnabledStatus: "List saved with Firefox Sync and local backup.",
        syncUnavailableStatus:
          "Firefox Sync unavailable. List saved locally as a fallback.",
        saveFilterFailedStatus:
          "Failed to save filter. Check the popup console.",
        readFiltersFailedStatus:
          "Failed to read filters. Check the popup console.",
        removeButton: "Remove",
        disableFiltersButton: "Disable filters",
        enableFiltersButton: "Enable filters",
        languageLabel: "Language",
        languageAuto: "Automatic (page/browser)",
        languagePolish: "Polski",
        languageEnglish: "English",
        firefoxSyncLabel: "Firefox Sync",
        firefoxSyncHint: "(requires Firefox account)",
        alwaysFilterOnOpenLabel: "Always filter when opening a page",
        categoryFiltersEnabledLabel: "Enable category filters",
        showFilteredAsDimmedLabel: "Show filtered deals as compact previews",
        showFilteredAboveThresholdLabel:
          "Show filtered deals above this threshold",
        showFilteredThresholdLabel: "Show filtered deals threshold",
        hideUnfilteredBelowThresholdLabel: "Hide deals below this threshold",
        hideUnfilteredThresholdLabel: "Hide deals threshold",
        showBelowThresholdAsDimmedLabel:
          "Show deals below threshold as compact previews",
        clearShopsConfirm: "Do you want to clear the hidden store list?",
        clearCategoriesConfirm: "Do you want to clear the hidden category list?"
      },
      pl: {
        appTitle: "Deal Store Filter",
        firefoxSyncBadge: "Firefox Sync",
        settingsTitle: "Ustawienia",
        backButtonTitle: "Wstecz",
        filterTypeLabel: "Typ filtra",
        shopsTab: "Sklepy",
        categoriesTab: "Kategorie",
        filterInputStoreLabel: "Sklep do ukrycia",
        filterInputCategoryLabel: "Kategoria do ukrycia",
        filterInputStorePlaceholder: "Amazon.pl",
        filterInputCategoryPlaceholder: "Gaming",
        addButton: "Dodaj",
        clearShopsButton: "Wyczy\u015B\u0107 sklepy",
        clearCategoriesButton: "Wyczy\u015B\u0107 kategorie",
        noHiddenStores: "Brak ukrytych sklep\u00F3w.",
        noHiddenCategories: "Brak ukrytych kategorii.",
        filtersDisabledStatus:
          "Filtrowanie jest wy\u0142\u0105czone. Pasuj\u0105ce oferty s\u0105 teraz widoczne.",
        syncDisabledStatus:
          "Firefox Sync jest wy\u0142\u0105czony. Lista jest zapisana lokalnie.",
        syncEnabledStatus:
          "Lista jest zapisana w Firefox Sync i lokalnie jako kopia zapasowa.",
        syncUnavailableStatus:
          "Firefox Sync jest niedost\u0119pny. Lista jest zapisana lokalnie awaryjnie.",
        saveFilterFailedStatus:
          "Nie uda\u0142o si\u0119 zapisa\u0107 filtra. Sprawd\u017A konsol\u0119 popupu.",
        readFiltersFailedStatus:
          "Nie uda\u0142o si\u0119 odczyta\u0107 filtr\u00F3w. Sprawd\u017A konsol\u0119 popupu.",
        removeButton: "Usu\u0144",
        disableFiltersButton: "Wy\u0142\u0105cz filtry",
        enableFiltersButton: "W\u0142\u0105cz filtry",
        languageLabel: "J\u0119zyk",
        languageAuto: "Automatyczny (strona/przegl\u0105darka)",
        languagePolish: "Polski",
        languageEnglish: "English",
        firefoxSyncLabel: "Firefox Sync",
        firefoxSyncHint: "(wymaga konta Firefox)",
        alwaysFilterOnOpenLabel: "Zawsze filtruj po otwarciu strony",
        categoryFiltersEnabledLabel: "W\u0142\u0105cz filtry kategorii",
        showFilteredAsDimmedLabel:
          "Pokazuj przefiltrowane oferty jako kompaktowe podgl\u0105dy",
        showFilteredAboveThresholdLabel:
          "Pokazuj przefiltrowane oferty powy\u017Cej tego progu",
        showFilteredThresholdLabel:
          "Pr\u00F3g dla pokazywania przefiltrowanych ofert",
        hideUnfilteredBelowThresholdLabel:
          "Ukrywaj oferty poni\u017Cej tego progu",
        hideUnfilteredThresholdLabel: "Pr\u00F3g ukrywania ofert",
        showBelowThresholdAsDimmedLabel:
          "Pokazuj oferty poni\u017Cej progu jako kompaktowe podgl\u0105dy",
        clearShopsConfirm:
          "Czy chcesz wyczy\u015Bci\u0107 list\u0119 ukrytych sklep\u00F3w?",
        clearCategoriesConfirm:
          "Czy chcesz wyczy\u015Bci\u0107 list\u0119 ukrytych kategorii?"
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

const mainTitle = document.querySelector("#main-title");
const syncBadge = document.querySelector("#sync-badge");
const filterTabs = document.querySelector("#filter-tabs");
const form = document.querySelector("#store-form");
const input = document.querySelector("#store-name");
const inputLabel = document.querySelector("#filter-input-label");
const addFilterButton = document.querySelector("#add-filter-button");
const list = document.querySelector("#store-list");
const clearButton = document.querySelector("#clear-filters");
const statusText = document.querySelector("#storage-status");
const filterToggleButton = document.querySelector("#toggle-filters");
const shopsTabButton = document.querySelector("#tab-shops");
const categoriesTabButton = document.querySelector("#tab-categories");
const mainView = document.querySelector("#main-view");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsBack = document.querySelector("#settings-back");
const settingsView = document.querySelector("#settings-view");
const settingsTitle = document.querySelector("#settings-title");
const uiLanguageLabel = document.querySelector("#ui-language-label");
const uiLanguageSelect = document.querySelector("#ui-language");
const firefoxSyncLabel = document.querySelector("#use-firefox-sync-label");
const firefoxSyncHint = document.querySelector("#use-firefox-sync-hint");
const alwaysFilterOnOpenLabel = document.querySelector("#always-filter-on-open-label");
const categoryFiltersEnabledLabel = document.querySelector(
  "#category-filters-enabled-label"
);
const showFilteredAsDimmedLabel = document.querySelector(
  "#show-filtered-as-dimmed-label"
);
const showFilteredAboveThresholdLabel = document.querySelector(
  "#show-filtered-above-threshold-label"
);
const showFilteredThresholdLabel = document.querySelector(
  "#show-filtered-threshold-label"
);
const hideUnfilteredBelowThresholdLabel = document.querySelector(
  "#hide-unfiltered-below-threshold-label"
);
const hideUnfilteredThresholdLabel = document.querySelector(
  "#hide-unfiltered-threshold-label"
);
const showBelowThresholdAsDimmedLabel = document.querySelector(
  "#show-below-threshold-as-dimmed-label"
);
const syncCheckbox = document.querySelector("#use-firefox-sync");
const alwaysFilterCheckbox = document.querySelector("#always-filter-on-open");
const categoryFiltersEnabledCheckbox = document.querySelector(
  "#category-filters-enabled"
);
const dimmedCheckbox = document.querySelector("#show-filtered-as-dimmed");
const showBelowThresholdAsDimmedCheckbox = document.querySelector(
  "#show-below-threshold-as-dimmed"
);
const showFilteredAboveThresholdCheckbox = document.querySelector(
  "#show-filtered-above-threshold"
);
const showFilteredThresholdInput = document.querySelector(
  "#show-filtered-threshold"
);
const hideUnfilteredBelowThresholdCheckbox = document.querySelector(
  "#hide-unfiltered-below-threshold"
);
const hideUnfilteredThresholdInput = document.querySelector(
  "#hide-unfiltered-threshold"
);
let latestSettings = { ...DEFAULT_SETTINGS };
let settingsSaveQueue = Promise.resolve();
let activeFilterTab = "shops";
let currentUiLanguage = I18N.resolveUiLanguage(DEFAULT_UI_LANGUAGE, {
  browserLanguage: browser.i18n?.getUILanguage?.() || navigator.language || "",
  browserLanguages: Array.isArray(navigator.languages) ? navigator.languages : []
});

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

function t(key, params = {}) {
  return I18N.t(currentUiLanguage, key, params);
}

function getCurrentBrowserLanguage() {
  return browser.i18n?.getUILanguage?.() || navigator.language || "";
}

function getCurrentBrowserLanguages() {
  return Array.isArray(navigator.languages) ? navigator.languages : [];
}

function setStatus(message, isWarning = false) {
  if (!statusText) return;
  statusText.textContent = message;
  statusText.classList.toggle("warning", isWarning);
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

async function getActiveTabPageLanguage() {
  if (!browser.tabs?.query || !browser.tabs?.sendMessage) {
    return "";
  }

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });
    const activeTab = tabs[0];

    if (activeTab?.id === undefined) {
      return "";
    }

    const response = await browser.tabs.sendMessage(activeTab.id, {
      type: "dealStoreFilterGetPageLanguage"
    });

    return response?.pageLanguage || "";
  } catch {
    return "";
  }
}

async function applyPopupTranslations(settings = latestSettings) {
  currentUiLanguage = I18N.resolveUiLanguage(settings?.uiLanguage, {
    pageLanguage: await getActiveTabPageLanguage(),
    browserLanguage: getCurrentBrowserLanguage(),
    browserLanguages: getCurrentBrowserLanguages()
  });

  document.documentElement.lang = currentUiLanguage;
  document.title = t("appTitle");
  if (mainTitle) mainTitle.textContent = t("appTitle");
  if (syncBadge) syncBadge.textContent = t("firefoxSyncBadge");
  if (settingsToggle) {
    settingsToggle.title = t("settingsTitle");
    settingsToggle.setAttribute("aria-label", t("settingsTitle"));
  }
  if (settingsBack) {
    settingsBack.title = t("backButtonTitle");
    settingsBack.setAttribute("aria-label", t("backButtonTitle"));
  }
  if (settingsTitle) settingsTitle.textContent = t("settingsTitle");
  if (filterTabs) filterTabs.setAttribute("aria-label", t("filterTypeLabel"));
  if (shopsTabButton) shopsTabButton.textContent = t("shopsTab");
  if (categoriesTabButton) categoriesTabButton.textContent = t("categoriesTab");
  if (uiLanguageLabel) uiLanguageLabel.textContent = t("languageLabel");
  if (firefoxSyncLabel) firefoxSyncLabel.textContent = t("firefoxSyncLabel");
  if (firefoxSyncHint) firefoxSyncHint.textContent = t("firefoxSyncHint");
  if (alwaysFilterOnOpenLabel) alwaysFilterOnOpenLabel.textContent = t("alwaysFilterOnOpenLabel");
  if (categoryFiltersEnabledLabel) categoryFiltersEnabledLabel.textContent = t("categoryFiltersEnabledLabel");
  if (showFilteredAsDimmedLabel) showFilteredAsDimmedLabel.textContent = t("showFilteredAsDimmedLabel");
  if (showFilteredAboveThresholdLabel) showFilteredAboveThresholdLabel.textContent = t("showFilteredAboveThresholdLabel");
  if (showFilteredThresholdLabel) showFilteredThresholdLabel.textContent = t("showFilteredThresholdLabel");
  if (hideUnfilteredBelowThresholdLabel) hideUnfilteredBelowThresholdLabel.textContent = t("hideUnfilteredBelowThresholdLabel");
  if (hideUnfilteredThresholdLabel) hideUnfilteredThresholdLabel.textContent = t("hideUnfilteredThresholdLabel");
  if (showBelowThresholdAsDimmedLabel) showBelowThresholdAsDimmedLabel.textContent = t("showBelowThresholdAsDimmedLabel");

  if (uiLanguageSelect) {
    for (const option of uiLanguageSelect.options) {
      if (option.value === "auto") {
        option.textContent = t("languageAuto");
      } else if (option.value === "pl") {
        option.textContent = t("languagePolish");
      } else if (option.value === "en") {
        option.textContent = t("languageEnglish");
      }
    }
  }
}

function updateSettingsUi(settings) {
  latestSettings = settings;
  uiLanguageSelect.value = settings.uiLanguage;
  syncCheckbox.checked = settings.useFirefoxSync;
  alwaysFilterCheckbox.checked = settings.alwaysFilterOnPageOpen;
  categoryFiltersEnabledCheckbox.checked = settings.categoryFiltersEnabled;
  dimmedCheckbox.checked = settings.showFilteredAsDimmed;
  showBelowThresholdAsDimmedCheckbox.checked = settings.showBelowThresholdAsDimmed;
  showFilteredAboveThresholdCheckbox.checked = settings.showFilteredAboveThreshold;
  showFilteredThresholdInput.value = settings.showFilteredThreshold ?? "";
  hideUnfilteredBelowThresholdCheckbox.checked = settings.hideUnfilteredBelowThreshold;
  hideUnfilteredThresholdInput.value = settings.hideUnfilteredThreshold ?? "";
  filterToggleButton.textContent = settings.filtersEnabled
    ? t("disableFiltersButton")
    : t("enableFiltersButton");
  filterToggleButton.classList.toggle("is-off", !settings.filtersEnabled);
  filterToggleButton.setAttribute(
    "aria-pressed",
    String(!settings.filtersEnabled)
  );
}

function getActiveFilterConfig() {
  if (activeFilterTab === "categories") {
    return {
      storageKey: CATEGORY_STORAGE_KEY,
      label: t("filterInputCategoryLabel"),
      placeholder: t("filterInputCategoryPlaceholder"),
      emptyMessage: t("noHiddenCategories"),
      clearLabel: t("clearCategoriesButton"),
      confirmClearMessage: t("clearCategoriesConfirm")
    };
  }

  return {
    storageKey: STORAGE_KEY,
    label: t("filterInputStoreLabel"),
    placeholder: t("filterInputStorePlaceholder"),
    emptyMessage: t("noHiddenStores"),
    clearLabel: t("clearShopsButton"),
    confirmClearMessage: t("clearShopsConfirm")
  };
}

function updateActiveTabUi() {
  const config = getActiveFilterConfig();
  const isShopsTab = activeFilterTab === "shops";

  shopsTabButton.classList.toggle("is-active", isShopsTab);
  shopsTabButton.setAttribute("aria-selected", String(isShopsTab));
  categoriesTabButton.classList.toggle("is-active", !isShopsTab);
  categoriesTabButton.setAttribute("aria-selected", String(!isShopsTab));
  inputLabel.textContent = config.label;
  input.placeholder = config.placeholder;
  addFilterButton.textContent = t("addButton");
  clearButton.textContent = config.clearLabel;
}

function collectSettingsFromUi(baseSettings = latestSettings) {
  return {
    ...baseSettings,
    useFirefoxSync: syncCheckbox.checked,
    alwaysFilterOnPageOpen: alwaysFilterCheckbox.checked,
    categoryFiltersEnabled: categoryFiltersEnabledCheckbox.checked,
    showFilteredAsDimmed: dimmedCheckbox.checked,
    showBelowThresholdAsDimmed: showBelowThresholdAsDimmedCheckbox.checked,
    showFilteredAboveThreshold: showFilteredAboveThresholdCheckbox.checked,
    hideUnfilteredBelowThreshold: hideUnfilteredBelowThresholdCheckbox.checked,
    showFilteredThreshold: showFilteredThresholdInput.value,
    hideUnfilteredThreshold: hideUnfilteredThresholdInput.value,
    uiLanguage: uiLanguageSelect.value
  };
}

async function applySavedSettings(settings) {
  await applyPopupTranslations(settings);
  updateSettingsUi(settings);
  await renderActiveList(settings);
  await refreshActiveTabFilters();
  return settings;
}

function queueSettingsSave(buildNextSettings) {
  settingsSaveQueue = settingsSaveQueue
    .catch(() => undefined)
    .then(async () => {
      const currentSettings = latestSettings || await getSettings();
      const nextSettings = normalizeSettings(
        typeof buildNextSettings === "function"
          ? buildNextSettings(currentSettings)
          : buildNextSettings
      );

      return applySavedSettings(await saveSettings(nextSettings));
    });

  return settingsSaveQueue;
}

function updateStorageStatus(syncAvailable, settings) {
  if (!settings.filtersEnabled) {
    setStatus(t("filtersDisabledStatus"));
    return;
  }

  if (!settings.useFirefoxSync) {
    setStatus(t("syncDisabledStatus"));
    return;
  }

  setStatus(
    syncAvailable
      ? t("syncEnabledStatus")
      : t("syncUnavailableStatus"),
    !syncAvailable
  );
}

async function refreshActiveTabFilters() {
  if (!browser.tabs?.query || !browser.tabs?.sendMessage) {
    return;
  }

  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true
    });
    const activeTab = tabs[0];

    if (activeTab?.id === undefined) {
      return;
    }

    await browser.tabs.sendMessage(activeTab.id, {
      type: "dealStoreFilterRefresh"
    });
  } catch {
    // The active tab may be unsupported or may not have the content script.
  }
}

async function saveThresholdSetting(settingKey, value) {
  return queueSettingsSave((currentSettings) => ({
    ...collectSettingsFromUi(currentSettings),
    [settingKey]: value
  }));
}

function showMainView() {
  mainView.hidden = false;
  settingsView.hidden = true;
  settingsToggle.focus();
}

function showSettingsView() {
  mainView.hidden = true;
  settingsView.hidden = false;
  settingsBack.focus();
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

async function updateLocalCacheForKey(storageKey, values) {
  const normalizedValues = mergeStoreLists(values);
  const localResult = await browser.storage.local.get({ [storageKey]: [] });
  const localValues = mergeStoreLists(localResult[storageKey]);

  if (JSON.stringify(localValues) !== JSON.stringify(normalizedValues)) {
    await browser.storage.local.set({ [storageKey]: normalizedValues });
  }
}

async function getHiddenValues(storageKey, settings) {
  if (settings.useFirefoxSync && browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [storageKey]: [] });
      const syncedValues = mergeStoreLists(syncResult[storageKey]);

      await updateLocalCacheForKey(storageKey, syncedValues);
      updateStorageStatus(true, settings);
      return syncedValues;
    } catch (error) {
      console.warn("[Deal Store Filter] Firefox Sync unavailable", error);
    }
  }

  const localResult = await browser.storage.local.get({ [storageKey]: [] });
  updateStorageStatus(false, settings);

  return mergeStoreLists(localResult[storageKey]);
}

async function saveHiddenValues(storageKey, values, settings) {
  const normalizedValues = mergeStoreLists(values);
  let syncAvailable = false;

  if (settings.useFirefoxSync && browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [storageKey]: normalizedValues });
      syncAvailable = true;
    } catch (error) {
      console.warn("[Deal Store Filter] Firefox Sync unavailable", error);
    }
  }

  await browser.storage.local.set({ [storageKey]: normalizedValues });
  updateStorageStatus(syncAvailable, settings);
  await refreshActiveTabFilters();

  return normalizedValues;
}

function renderStores(hiddenStores) {
  const config = getActiveFilterConfig();
  list.replaceChildren();
  clearButton.disabled = hiddenStores.length === 0;

  if (hiddenStores.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = config.emptyMessage;
    list.append(item);
    return;
  }

  hiddenStores.forEach((store, index) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const removeButton = document.createElement("button");

    name.textContent = store;
    removeButton.type = "button";
    removeButton.textContent = t("removeButton");
    removeButton.addEventListener("click", async () => {
      const nextStores = hiddenStores.filter((_, itemIndex) => itemIndex !== index);
      const settings = await getSettings();
      renderStores(await saveHiddenValues(config.storageKey, nextStores, settings));
    });

    item.append(name, removeButton);
    list.append(item);
  });
}

async function renderActiveList(settings = null) {
  const activeSettings = settings || await getSettings();
  const config = getActiveFilterConfig();

  updateActiveTabUi();
  renderStores(await getHiddenValues(config.storageKey, activeSettings));
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const cleanedStore = normalizeStoreName(input.value);
  const config = getActiveFilterConfig();

  if (!cleanedStore) {
    return;
  }

  try {
    const settings = await getSettings();
    const hiddenStores = await getHiddenValues(config.storageKey, settings);
    const alreadyExists = hiddenStores.some((store) => {
      return normalizeText(store) === normalizeText(cleanedStore);
    });

    const nextStores = alreadyExists
      ? hiddenStores
      : [...hiddenStores, cleanedStore];

    renderStores(await saveHiddenValues(config.storageKey, nextStores, settings));
    input.value = "";
  } catch (error) {
    console.error("[Deal Store Filter] Failed to save filter", error);
    setStatus(t("saveFilterFailedStatus"), true);
  }
});

clearButton.addEventListener("click", async () => {
  const config = getActiveFilterConfig();
  const shouldClearStores = window.confirm(
    config.confirmClearMessage
  );

  if (!shouldClearStores) {
    return;
  }

  const settings = await getSettings();

  renderStores(await saveHiddenValues(config.storageKey, [], settings));
});

settingsToggle.addEventListener("click", showSettingsView);

settingsBack.addEventListener("click", showMainView);

uiLanguageSelect.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

syncCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

alwaysFilterCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

categoryFiltersEnabledCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

dimmedCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

showBelowThresholdAsDimmedCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

showFilteredThresholdInput.addEventListener("input", () => {
  saveThresholdSetting("showFilteredThreshold", showFilteredThresholdInput.value);
});

showFilteredThresholdInput.addEventListener("change", () => {
  saveThresholdSetting("showFilteredThreshold", showFilteredThresholdInput.value);
});

showFilteredAboveThresholdCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

hideUnfilteredBelowThresholdCheckbox.addEventListener("change", async () => {
  await queueSettingsSave((currentSettings) => {
    return collectSettingsFromUi(currentSettings);
  });
});

hideUnfilteredThresholdInput.addEventListener("input", () => {
  saveThresholdSetting("hideUnfilteredThreshold", hideUnfilteredThresholdInput.value);
});

hideUnfilteredThresholdInput.addEventListener("change", () => {
  saveThresholdSetting("hideUnfilteredThreshold", hideUnfilteredThresholdInput.value);
});

filterToggleButton.addEventListener("click", async () => {
  await queueSettingsSave((currentSettings) => ({
    ...collectSettingsFromUi(currentSettings),
    filtersEnabled: !currentSettings.filtersEnabled
  }));
});

shopsTabButton.addEventListener("click", async () => {
  activeFilterTab = "shops";
  await renderActiveList();
});

categoriesTabButton.addEventListener("click", async () => {
  activeFilterTab = "categories";
  await renderActiveList();
});

async function refreshPopup() {
  const settings = await getSettings();

  await applyPopupTranslations(settings);
  updateSettingsUi(settings);
  await renderActiveList(settings);
}

browser.storage.onChanged.addListener((changes, areaName) => {
  const storageChanged =
    ["sync", "local"].includes(areaName) &&
    (Boolean(changes[STORAGE_KEY]) || Boolean(changes[CATEGORY_STORAGE_KEY]));
  const settingsChanged = areaName === "local" && Boolean(changes[SETTINGS_KEY]);

  if (!storageChanged && !settingsChanged) {
    return;
  }

  refreshPopup().catch((error) => {
    console.error("[Deal Store Filter] Error refreshing popup", error);
  });
});

refreshPopup()
  .catch((error) => {
    console.error("[Deal Store Filter] Failed to read filters", error);
    setStatus(t("readFiltersFailedStatus"), true);
  });
