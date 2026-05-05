const STORAGE_KEY = "hiddenStores";
const SETTINGS_KEY = "settings";
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

const form = document.querySelector("#store-form");
const input = document.querySelector("#store-name");
const list = document.querySelector("#store-list");
const clearButton = document.querySelector("#clear-stores");
const statusText = document.querySelector("#storage-status");
const filterToggleButton = document.querySelector("#toggle-filters");
const mainView = document.querySelector("#main-view");
const settingsToggle = document.querySelector("#settings-toggle");
const settingsBack = document.querySelector("#settings-back");
const settingsView = document.querySelector("#settings-view");
const syncCheckbox = document.querySelector("#use-firefox-sync");
const alwaysFilterCheckbox = document.querySelector("#always-filter-on-open");
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
const confirmModal = document.querySelector("#confirm-modal");
const confirmModalMessage = document.querySelector("#confirm-modal-message");
const confirmModalConfirmButton = document.querySelector("#confirm-modal-confirm");
const confirmModalCancelButton = document.querySelector("#confirm-modal-cancel");
let latestSettings = { ...DEFAULT_SETTINGS };
let settingsSaveQueue = Promise.resolve();
let confirmModalResolver = null;

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

function closeConfirmModal(result) {
  if (!confirmModalResolver) {
    return;
  }

  const resolve = confirmModalResolver;
  confirmModalResolver = null;
  confirmModal.hidden = true;
  resolve(result);
}

function showConfirmModal(message, confirmLabel = "Confirm", cancelLabel = "Cancel") {
  if (!confirmModal || !confirmModalMessage || !confirmModalConfirmButton || !confirmModalCancelButton) {
    return Promise.resolve(window.confirm(message));
  }

  if (confirmModalResolver) {
    closeConfirmModal(false);
  }

  confirmModalMessage.textContent = message;
  confirmModalConfirmButton.textContent = confirmLabel;
  confirmModalCancelButton.textContent = cancelLabel;
  confirmModal.hidden = false;

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
    confirmModalConfirmButton.focus();
  });
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

function collectSettingsFromUi(baseSettings = latestSettings) {
  return {
    ...baseSettings,
    useFirefoxSync: syncCheckbox.checked,
    alwaysFilterOnPageOpen: alwaysFilterCheckbox.checked,
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
  renderStores(await getHiddenStores(settings));
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

async function getHiddenStores(settings) {
  if (settings.useFirefoxSync && browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [STORAGE_KEY]: [] });
      const syncedStores = mergeStoreLists(syncResult[STORAGE_KEY]);
      const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
      const mergedStores = mergeStoreLists(
        syncedStores,
        localResult[STORAGE_KEY]
      );

      await updateLocalCache(mergedStores);
      updateStorageStatus(true, settings);
      return mergedStores;
    } catch (error) {
      console.warn("[Deal Store Filter] Firefox Sync unavailable", error);
    }
  }

  const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
  updateStorageStatus(false, settings);

  return mergeStoreLists(localResult[STORAGE_KEY]);
}

async function saveHiddenStores(hiddenStores, settings) {
  const normalizedStores = mergeStoreLists(hiddenStores);
  let syncAvailable = false;

  if (settings.useFirefoxSync && browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [STORAGE_KEY]: normalizedStores });
      syncAvailable = true;
    } catch (error) {
      console.warn("[Deal Store Filter] Firefox Sync unavailable", error);
    }
  }

  await browser.storage.local.set({ [STORAGE_KEY]: normalizedStores });
  updateStorageStatus(syncAvailable, settings);
  await refreshActiveTabFilters();

  return normalizedStores;
}

function renderStores(hiddenStores) {
  list.replaceChildren();
  clearButton.disabled = hiddenStores.length === 0;

  if (hiddenStores.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "No hidden stores.";
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
      renderStores(await saveHiddenStores(nextStores, settings));
    });

    item.append(name, removeButton);
    list.append(item);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const cleanedStore = normalizeStoreName(input.value);

  if (!cleanedStore) {
    return;
  }

  try {
    const settings = await getSettings();
    const hiddenStores = await getHiddenStores(settings);
    const alreadyExists = hiddenStores.some((store) => {
      return normalizeText(store) === normalizeText(cleanedStore);
    });

    const nextStores = alreadyExists
      ? hiddenStores
      : [...hiddenStores, cleanedStore];

    renderStores(await saveHiddenStores(nextStores, settings));
    input.value = "";
  } catch (error) {
    console.error("[Deal Store Filter] Failed to save filter", error);
    setStatus("Failed to save filter. Check the popup console.", true);
  }
});

confirmModal.addEventListener("click", (event) => {
  if (event.target === confirmModal || event.target.classList.contains("confirm-modal__backdrop")) {
    closeConfirmModal(false);
  }
});

confirmModalConfirmButton.addEventListener("click", () => {
  closeConfirmModal(true);
});

confirmModalCancelButton.addEventListener("click", () => {
  closeConfirmModal(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && confirmModalResolver) {
    event.preventDefault();
    closeConfirmModal(false);
  }
});

clearButton.addEventListener("click", async () => {
  const shouldClearStores = await showConfirmModal(
    "Do you want to clear the hidden store list?",
    "Clear list",
    "Cancel"
  );

  if (!shouldClearStores) {
    return;
  }

  const settings = await getSettings();

  renderStores(await saveHiddenStores([], settings));
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

async function refreshPopup() {
  const settings = await getSettings();

  updateSettingsUi(settings);
  renderStores(await getHiddenStores(settings));
}

browser.storage.onChanged.addListener((changes, areaName) => {
  const storageChanged =
    ["sync", "local"].includes(areaName) && Boolean(changes[STORAGE_KEY]);
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
