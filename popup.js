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

async function getHiddenStores() {
  let syncedStores = [];
  let localStores = [];
  let syncAvailable = false;

  if (browser.storage.sync) {
    try {
      const syncResult = await browser.storage.sync.get({ [STORAGE_KEY]: [] });
      syncedStores = Array.isArray(syncResult[STORAGE_KEY])
        ? syncResult[STORAGE_KEY]
        : [];
      syncAvailable = true;
    } catch (error) {
      console.warn("[Filtr sklepów Pepper] Firefox Sync niedostępny", error);
    }
  }

  const localResult = await browser.storage.local.get({ [STORAGE_KEY]: [] });
  localStores = Array.isArray(localResult[STORAGE_KEY])
    ? localResult[STORAGE_KEY]
    : [];

  setStatus(
    syncAvailable
      ? "Lista synchronizowana przez Firefox Sync."
      : "Firefox Sync niedostępny. Lista zapisana lokalnie.",
    !syncAvailable
  );

  return mergeStoreLists(syncedStores, localStores);
}

async function saveHiddenStores(hiddenStores) {
  const normalizedStores = mergeStoreLists(hiddenStores);
  let syncAvailable = false;

  if (browser.storage.sync) {
    try {
      await browser.storage.sync.set({ [STORAGE_KEY]: normalizedStores });
      syncAvailable = true;
    } catch (error) {
      console.warn("[Filtr sklepów Pepper] Firefox Sync niedostępny", error);
    }
  }

  await browser.storage.local.set({ [STORAGE_KEY]: normalizedStores });

  setStatus(
    syncAvailable
      ? "Lista synchronizowana przez Firefox Sync."
      : "Firefox Sync niedostępny. Lista zapisana lokalnie.",
    !syncAvailable
  );

  return normalizedStores;
}

function renderStores(hiddenStores) {
  list.replaceChildren();
  clearButton.disabled = hiddenStores.length === 0;

  if (hiddenStores.length === 0) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = "Brak ukrytych sklepów.";
    list.append(item);
    return;
  }

  hiddenStores.forEach((store, index) => {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const removeButton = document.createElement("button");

    name.textContent = store;
    removeButton.type = "button";
    removeButton.textContent = "Usuń";
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
    console.error("[Filtr sklepów Pepper] Nie udało się zapisać filtra", error);
    setStatus("Nie udało się zapisać filtra. Sprawdź konsolę popupu.", true);
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
    console.error("[Filtr sklepów Pepper] Nie udało się odczytać filtrów", error);
    setStatus("Nie udało się odczytać filtrów. Sprawdź konsolę popupu.", true);
  });
