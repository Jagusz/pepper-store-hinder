(function initDealStoreFilterI18n(globalScope) {
  const SUPPORTED_UI_LANGUAGES = ["en", "pl"];
  const DEFAULT_UI_LANGUAGE = "auto";
  const TRANSLATIONS = {
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
      filtersDisabledStatus: "Filters disabled. Matching deals are currently visible.",
      syncDisabledStatus: "Firefox Sync disabled. List saved locally.",
      syncEnabledStatus: "List saved with Firefox Sync and local backup.",
      syncUnavailableStatus: "Firefox Sync unavailable. List saved locally as a fallback.",
      saveFilterFailedStatus: "Failed to save filter. Check the popup console.",
      readFiltersFailedStatus: "Failed to read filters. Check the popup console.",
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
      showFilteredAboveThresholdLabel: "Show filtered deals above this threshold",
      showFilteredThresholdLabel: "Show filtered deals threshold",
      hideUnfilteredBelowThresholdLabel: "Hide deals below this threshold",
      hideUnfilteredThresholdLabel: "Hide deals threshold",
      showBelowThresholdAsDimmedLabel: "Show deals below threshold as compact previews",
      clearShopsConfirm: "Do you want to clear the hidden store list?",
      clearCategoriesConfirm: "Do you want to clear the hidden category list?",
      filterStoreButton: "Hide store: {name}",
      filterStoreButtonTitle: "Hide deals from store: {name}",
      filterCategoryButton: "Hide category: {name}",
      filterCategoryButtonTitle: "Hide deals from category: {name}",
      addStoreConfirm: "Do you want to add {name} to the filtered stores?",
      addCategoryConfirm: "Do you want to add {name} to the filtered categories?",
      removeFilterAction: "Remove filter",
      removeFilterActionTitle: "Remove filter for {name}",
      dimmedStoreNotice: "{pluginName}: Filtered by store filter",
      dimmedCategoryNotice: "{pluginName}: Filtered by category filter",
      dimmedThresholdNotice: "{pluginName}: Filtered by threshold",
      dimmedThresholdNoticeWithValue: "{pluginName}: Filtered by threshold < {value}°"
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
      clearShopsButton: "Wyczyść sklepy",
      clearCategoriesButton: "Wyczyść kategorie",
      noHiddenStores: "Brak ukrytych sklepów.",
      noHiddenCategories: "Brak ukrytych kategorii.",
      filtersDisabledStatus: "Filtrowanie jest wyłączone. Pasujące oferty są teraz widoczne.",
      syncDisabledStatus: "Firefox Sync jest wyłączony. Lista jest zapisana lokalnie.",
      syncEnabledStatus: "Lista jest zapisana w Firefox Sync i lokalnie jako kopia zapasowa.",
      syncUnavailableStatus: "Firefox Sync jest niedostępny. Lista jest zapisana lokalnie awaryjnie.",
      saveFilterFailedStatus: "Nie udało się zapisać filtra. Sprawdź konsolę popupu.",
      readFiltersFailedStatus: "Nie udało się odczytać filtrów. Sprawdź konsolę popupu.",
      removeButton: "Usuń",
      disableFiltersButton: "Wyłącz filtry",
      enableFiltersButton: "Włącz filtry",
      languageLabel: "Język",
      languageAuto: "Automatyczny (strona/przeglądarka)",
      languagePolish: "Polski",
      languageEnglish: "English",
      firefoxSyncLabel: "Firefox Sync",
      firefoxSyncHint: "(wymaga konta Firefox)",
      alwaysFilterOnOpenLabel: "Zawsze filtruj po otwarciu strony",
      categoryFiltersEnabledLabel: "Włącz filtry kategorii",
      showFilteredAsDimmedLabel: "Pokazuj przefiltrowane oferty jako kompaktowe podglądy",
      showFilteredAboveThresholdLabel: "Pokazuj przefiltrowane oferty powyżej tego progu",
      showFilteredThresholdLabel: "Próg dla pokazywania przefiltrowanych ofert",
      hideUnfilteredBelowThresholdLabel: "Ukrywaj oferty poniżej tego progu",
      hideUnfilteredThresholdLabel: "Próg ukrywania ofert",
      showBelowThresholdAsDimmedLabel: "Pokazuj oferty poniżej progu jako kompaktowe podglądy",
      clearShopsConfirm: "Czy chcesz wyczyścić listę ukrytych sklepów?",
      clearCategoriesConfirm: "Czy chcesz wyczyścić listę ukrytych kategorii?",
      filterStoreButton: "Ukryj sklep: {name}",
      filterStoreButtonTitle: "Ukryj oferty ze sklepu: {name}",
      filterCategoryButton: "Ukryj kategorię: {name}",
      filterCategoryButtonTitle: "Ukryj oferty z kategorii: {name}",
      addStoreConfirm: "Czy chcesz dodać {name} do filtrowanych sklepów?",
      addCategoryConfirm: "Czy chcesz dodać {name} do filtrowanych kategorii?",
      removeFilterAction: "Usuń filtr",
      removeFilterActionTitle: "Usuń filtr dla {name}",
      dimmedStoreNotice: "{pluginName}: Ukryte przez filtr sklepu",
      dimmedCategoryNotice: "{pluginName}: Ukryte przez filtr kategorii",
      dimmedThresholdNotice: "{pluginName}: Ukryte przez próg",
      dimmedThresholdNoticeWithValue: "{pluginName}: Ukryte przez próg < {value}°"
    }
  };

  function normalizeLanguageCode(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function getPrimaryLanguageCode(value) {
    const normalized = normalizeLanguageCode(value).replace(/_/g, "-");

    if (!normalized) {
      return "";
    }

    return normalized.split("-")[0];
  }

  function isSupportedUiLanguage(value) {
    return SUPPORTED_UI_LANGUAGES.includes(normalizeLanguageCode(value));
  }

  function normalizeUiLanguageSetting(value) {
    const normalized = normalizeLanguageCode(value);

    if (normalized === DEFAULT_UI_LANGUAGE) {
      return DEFAULT_UI_LANGUAGE;
    }

    return isSupportedUiLanguage(normalized) ? normalized : DEFAULT_UI_LANGUAGE;
  }

  function isPolishLanguage(value) {
    return getPrimaryLanguageCode(value) === "pl";
  }

  function resolveLanguageFromSources({
    pageLanguage = "",
    browserLanguage = "",
    browserLanguages = []
  } = {}) {
    if (normalizeLanguageCode(pageLanguage)) {
      return isPolishLanguage(pageLanguage) ? "pl" : "en";
    }

    const candidates = [
      browserLanguage,
      ...(Array.isArray(browserLanguages) ? browserLanguages : [])
    ];

    return candidates.some((candidate) => isPolishLanguage(candidate)) ? "pl" : "en";
  }

  function resolveUiLanguage(setting, options = {}) {
    const normalizedSetting = normalizeUiLanguageSetting(setting);

    if (normalizedSetting !== DEFAULT_UI_LANGUAGE) {
      return normalizedSetting;
    }

    return resolveLanguageFromSources(options);
  }

  function formatMessage(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => {
      return Object.prototype.hasOwnProperty.call(params, key)
        ? String(params[key])
        : match;
    });
  }

  function t(language, key, params = {}) {
    const normalizedLanguage = isSupportedUiLanguage(language) ? language : "en";
    const template =
      TRANSLATIONS[normalizedLanguage]?.[key] ??
      TRANSLATIONS.en[key] ??
      key;

    return formatMessage(template, params);
  }

  globalScope.DealStoreFilterI18n = {
    DEFAULT_UI_LANGUAGE,
    SUPPORTED_UI_LANGUAGES,
    TRANSLATIONS,
    getPrimaryLanguageCode,
    isPolishLanguage,
    normalizeUiLanguageSetting,
    resolveLanguageFromSources,
    resolveUiLanguage,
    t
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
