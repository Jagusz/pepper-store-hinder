const STORAGE_KEY = "hiddenStores";
const CATEGORY_STORAGE_KEY = "hiddenCategories";
const SETTINGS_KEY = "settings";
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
  hideUnfilteredThreshold: null
};

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

function setStatus(message, isWarning = false) {
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

function updateSettingsUi(settings) {
  latestSettings = settings;
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
    ? "Disable filters"
    : "Enable filters";
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
      label: "Category to hide",
      placeholder: "Gaming",
      emptyMessage: "No hidden categories.",
      clearLabel: "Clear categories",
      confirmClearMessage: "Do you want to clear the hidden category list?",
      addPromptPrefix: "category"
    };
  }

  return {
    storageKey: STORAGE_KEY,
    label: "Store to hide",
    placeholder: "Amazon.pl",
    emptyMessage: "No hidden stores.",
    clearLabel: "Clear shops",
    confirmClearMessage: "Do you want to clear the hidden store list?",
    addPromptPrefix: "store"
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
  addFilterButton.textContent = "Add";
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
    hideUnfilteredThreshold: hideUnfilteredThresholdInput.value
  };
}

async function applySavedSettings(settings) {
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
    setStatus("Filters disabled. Matching deals are currently visible.");
    return;
  }

  if (!settings.useFirefoxSync) {
    setStatus("Firefox Sync disabled. List saved locally.");
    return;
  }

  setStatus(
    syncAvailable
      ? "List saved with Firefox Sync and local backup."
      : "Firefox Sync unavailable. List saved locally as a fallback.",
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
    removeButton.textContent = "Remove";
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
    setStatus("Failed to save filter. Check the popup console.", true);
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

  refreshPopup();
});

refreshPopup()
  .catch((error) => {
    console.error("[Deal Store Filter] Failed to read filters", error);
    setStatus("Failed to read filters. Check the popup console.", true);
  });
