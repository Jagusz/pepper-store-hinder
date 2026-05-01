const STORAGE_KEY = "hiddenStores";
const SETTINGS_KEY = "settings";
const DEFAULT_SETTINGS = {
  useFirefoxSync: true,
  alwaysFilterOnPageOpen: true,
  filtersEnabled: true
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

function normalizeSettings(value) {
  return {
    useFirefoxSync: value?.useFirefoxSync !== false,
    alwaysFilterOnPageOpen: value?.alwaysFilterOnPageOpen !== false,
    filtersEnabled: value?.filtersEnabled !== false
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
  syncCheckbox.checked = settings.useFirefoxSync;
  alwaysFilterCheckbox.checked = settings.alwaysFilterOnPageOpen;
  filterToggleButton.textContent = settings.filtersEnabled
    ? "Disable filters"
    : "Enable filters";
  filterToggleButton.classList.toggle("is-off", !settings.filtersEnabled);
  filterToggleButton.setAttribute(
    "aria-pressed",
    String(!settings.filtersEnabled)
  );
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

      await updateLocalCache(syncedStores);
      updateStorageStatus(true, settings);
      return syncedStores;
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

clearButton.addEventListener("click", async () => {
  const shouldClearStores = window.confirm(
    "Do you want to clear the hidden store list?"
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
  const currentSettings = await getSettings();
  const settings = await saveSettings({
    ...currentSettings,
    useFirefoxSync: syncCheckbox.checked
  });

  updateSettingsUi(settings);
  renderStores(await getHiddenStores(settings));
});

alwaysFilterCheckbox.addEventListener("change", async () => {
  const currentSettings = await getSettings();
  const settings = await saveSettings({
    ...currentSettings,
    alwaysFilterOnPageOpen: alwaysFilterCheckbox.checked
  });

  updateSettingsUi(settings);
  renderStores(await getHiddenStores(settings));
});

filterToggleButton.addEventListener("click", async () => {
  const currentSettings = await getSettings();
  const settings = await saveSettings({
    ...currentSettings,
    filtersEnabled: !currentSettings.filtersEnabled
  });

  updateSettingsUi(settings);
  renderStores(await getHiddenStores(settings));
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
