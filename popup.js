const STORAGE_KEY = "hiddenStores";

const form = document.querySelector("#store-form");
const input = document.querySelector("#store-name");
const list = document.querySelector("#store-list");
const clearButton = document.querySelector("#clear-stores");
const statusText = document.querySelector("#storage-status");

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

function updateStorageStatus(syncAvailable) {
  setStatus(
    syncAvailable
      ? "List saved in Firefox Sync."
      : "Firefox Sync unavailable. List saved locally as a fallback.",
    !syncAvailable
  );
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

async function getHiddenStores() {
  if (browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [STORAGE_KEY]: [] });
      const syncedStores = mergeStoreLists(syncResult[STORAGE_KEY]);

      await updateLocalCache(syncedStores);
      updateStorageStatus(true);
      return syncedStores;
    } catch (error) {
      console.warn("[Deal Store Filter] Firefox Sync unavailable", error);
    }
  }

  const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
  updateStorageStatus(false);

  return mergeStoreLists(localResult[STORAGE_KEY]);
}

async function saveHiddenStores(hiddenStores) {
  const normalizedStores = mergeStoreLists(hiddenStores);
  let syncAvailable = false;

  if (browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [STORAGE_KEY]: normalizedStores });
      syncAvailable = true;
    } catch (error) {
      console.warn("[Deal Store Filter] Firefox Sync unavailable", error);
    }
  }

  await browser.storage.local.set({ [STORAGE_KEY]: normalizedStores });
  updateStorageStatus(syncAvailable);

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
      renderStores(await saveHiddenStores(nextStores));
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
    const hiddenStores = await getHiddenStores();
    const alreadyExists = hiddenStores.some((store) => {
      return normalizeText(store) === normalizeText(cleanedStore);
    });

    const nextStores = alreadyExists
      ? hiddenStores
      : [...hiddenStores, cleanedStore];

    renderStores(await saveHiddenStores(nextStores));
    input.value = "";
  } catch (error) {
    console.error("[Deal Store Filter] Failed to save filter", error);
    setStatus("Failed to save filter. Check the popup console.", true);
  }
});

clearButton.addEventListener("click", async () => {
  renderStores(await saveHiddenStores([]));
});

browser.storage.onChanged.addListener((changes, areaName) => {
  if (!["sync", "local"].includes(areaName) || !changes[STORAGE_KEY]) {
    return;
  }

  getHiddenStores().then(renderStores);
});

getHiddenStores()
  .then(renderStores)
  .catch((error) => {
    console.error("[Deal Store Filter] Failed to read filters", error);
    setStatus("Failed to read filters. Check the popup console.", true);
  });
