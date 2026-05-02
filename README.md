# Deal Store Filter

[English version](README.en.md)

[Lista zmian](CHANGELOG.md)

## Co nowego w 0.2.0

- Dodano widok ustawień w popupie.
- Dodano przełącznik `Disable filters` / `Enable filters`, który tymczasowo włącza lub wyłącza filtrowanie bez usuwania zapisanej listy sklepów.
- Dodano ustawienie `Firefox Sync`, które pozwala wybrać zapis przez Firefox Sync albo zapis tylko lokalny na bieżącym urządzeniu.
- Dodano ustawienie `Always filter when opening a page`, które automatycznie przywraca filtrowanie po otwarciu obsługiwanej strony.
- Dodano ustawienie `Show filtered deals as compact previews`, które pokazuje przefiltrowane oferty jako kompaktowy podgląd zamiast całkowicie je ukrywać.
- Kompaktowy podgląd pokazuje komunikat `Filtered by Deal Store Filter` oraz przycisk `Remove filter` usuwający dany sklep z listy filtrów.
- Zmiany listy filtrów i ustawień próbują odświeżyć aktywną kartę od razu, jeśli działa na niej content script rozszerzenia.

Nieoficjalne rozszerzenie do Firefoksa, które pozwala ukrywać oferty z wybranych sklepów na obsługiwanych stronach z promocjami.

Obecna wersja działa na Pepper.pl. Rozszerzenie nie jest tworzone, wspierane ani zatwierdzone przez Pepper.pl.

## Funkcje

- Działa obecnie na stronach `https://www.pepper.pl/*`.
- Dodaje przy ofertach przycisk `Filtruj sklep: Nazwa sklepu`.
- Ukrywa oferty ze sklepów zapisanych na liście filtrów.
- Działa na listach ofert oraz na stronach pojedynczych okazji.
- Odczytuje sklep z danych `data-vue3`, jeśli obsługiwana strona udostępnia je w komponencie oferty.
- Używa `props.thread.merchant.merchantName` jako głównej nazwy sklepu.
- Gdy `merchant` jest pusty, używa `props.thread.linkHost`, np. `www.facebook.com` -> `facebook.com`.
- Gdy dane strukturalne nie są dostępne, próbuje odczytać sklep z widocznego tekstu oferty, m.in. z etykiet `Dostępne w` i `Zrealizuj na`.
- Ignoruje wpisy typu `Discussion`.
- Popup pozwala ręcznie dodawać, usuwać i czyścić listę sklepów.

## Jak działa

Na listach ofert rozszerzenie najpierw odczytuje dane osadzone przez obsługiwaną stronę w atrybucie `data-vue3`:

```text
props.thread.merchant.merchantName
```

Jeśli oferta nie ma przypisanego `merchant`, rozszerzenie próbuje użyć hosta linku:

```text
props.thread.linkHost
```

Jeśli dane strukturalne nie są dostępne, rozszerzenie korzysta z tekstu wyrenderowanego na stronie i szuka etykiet takich jak:

```text
Dostępne w Nazwa sklepu
Zrealizuj na Nazwa sklepu
```

Fallback tekstowy czyści też doklejone etykiety strony, przyciski CTA i kody kuponów, aby przycisk nie dostał nazwy w stylu `FlaconiSPRINGTIMEPobierz kod`.

Jeśli uda się ustalić sklep, rozszerzenie dodaje przy ofercie przycisk:

```text
Filtruj sklep: Nazwa sklepu
```

Kliknięcie przycisku prosi o potwierdzenie, zapisuje sklep na liście filtrów i ukrywa wszystkie oferty z tym samym sklepem.

Nazwy sklepów najlepiej dodawać dokładnie tak, jak występują na obsługiwanej stronie, np. `Amazon.pl`, `Media Expert`, `ALDI`.

## Prywatność

Lista ukrytych sklepów jest przechowywana przy użyciu `browser.storage.sync`, aby umożliwić synchronizację filtrów między urządzeniami użytkownika przez Firefox Sync. Rozszerzenie nie wysyła tych danych do autora dodatku, nie korzysta z własnego serwera, nie zawiera analityki i nie ładuje zdalnego kodu.

Rozszerzenie używa `browser.storage.local` wyłącznie jako fallback/cache. Gdy Firefox Sync działa, `browser.storage.sync` jest źródłem prawdy, a lokalna kopia jest nadpisywana aktualną listą. Jeśli Firefox Sync jest chwilowo niedostępny albo zwróci błąd, rozszerzenie korzysta z lokalnej kopii.

Rozszerzenie nie używa:

- `fetch()`,
- `XMLHttpRequest`,
- analityki,
- telemetryki,
- zewnętrznych skryptów,
- zależności npm,
- własnego backendu.

## Synchronizacja

Głównym miejscem zapisu listy filtrów jest `browser.storage.sync`. Jeśli użytkownik ma włączony Firefox Sync i synchronizację dodatków, lista może być dostępna na innych urządzeniach zalogowanych do tego samego konta Firefox/Mozilla.

Kopia w `browser.storage.local` jest utrzymywana tylko po to, aby zwiększyć odporność dodatku na błędy lub niedostępność Sync.

Jeśli w ustawieniach wyłączysz `Firefox Sync`, rozszerzenie nie czyta ani nie zapisuje listy w `browser.storage.sync`. W takim trybie lista filtrów zostaje tylko w lokalnym profilu Firefoksa.

## Ustawienia

Popup ma widok ustawień otwierany ikoną koła zębatego.

- `Firefox Sync` - zapisuje listę filtrów w `browser.storage.sync` i utrzymuje lokalną kopię awaryjną. Po wyłączeniu lista jest zapisywana tylko lokalnie na bieżącym urządzeniu.
- `Always filter when opening a page` - po otwarciu obsługiwanej strony automatycznie włącza filtrowanie, nawet jeśli wcześniej zostało tymczasowo wyłączone.
- `Show filtered deals as compact previews` - zamiast ukrywać pasujące oferty, zostawia je na liście jako kompaktowy podgląd.
- `Show filtered deals above this threshold` - pokazuje oferty z filtrowanych sklepów, jeśli ich temperatura jest równa ustawionemu progowi albo go przekracza.
- `Show filtered deals threshold` - ustawia próg temperatury dla pokazywania ofert z filtrowanych sklepów.
- `Hide deals below this threshold` - ukrywa oferty, jeśli ich temperatura spada poniżej ustawionego progu.
- `Show deals below threshold as compact previews` - zamiast całkowicie ukrywać oferty poniżej progu, zostawia je na liście jako wyszarzony podgląd.
- `Hide deals threshold` - ustawia próg temperatury dla ukrywania ofert o zbyt niskiej temperaturze.

Przełącznik `Disable filters` / `Enable filters` w głównym widoku popupu tymczasowo pokazuje albo ukrywa pasujące oferty bez usuwania zapisanej listy sklepów.

## Instalacja lokalna do testów

1. Otwórz w Firefoxie:

   ```text
   about:debugging#/runtime/this-firefox
   ```

2. Kliknij `Załaduj tymczasowy dodatek`.
3. Wybierz plik `manifest.json` z katalogu rozszerzenia.
4. Otwórz `https://www.pepper.pl/`.

Po zmianach w plikach kliknij `Reload` przy dodatku w `about:debugging`, a potem odśwież kartę obsługiwanej strony.

## Publikacja / pakowanie ZIP

Do Mozilla Add-ons należy wysłać ZIP zawierający pliki dodatku bez katalogu nadrzędnego.

Na Windows można użyć skryptu:

```powershell
.\scripts\package-amo.ps1
```

Skrypt tworzy plik na podstawie wersji z `manifest.json`:

```text
dist/deal-store-filter-<manifest-version>.zip
```

ZIP zawiera tylko pliki potrzebne do działania dodatku:

- `manifest.json`
- `content.js`
- `popup.html`
- `popup.js`
- `popup.css`

Do paczki nie trafiają katalogi `.git`, `.github`, `tests`, `node_modules`, `dist` ani pliki takie jak `README.md`, `LICENSE`, `package.json` i `package-lock.json`.

## Nieoficjalny charakter dodatku

Deal Store Filter jest projektem niezależnym.

Rozszerzenie nie jest tworzone, wspierane ani zatwierdzone przez Pepper.pl. Nazwa Pepper.pl jest używana wyłącznie do wskazania aktualnie obsługiwanej strony.

## Debugowanie

Na obsługiwanej stronie można włączyć logi debugowe w konsoli:

```js
localStorage.setItem("pepperStoreFilterDebug", "1")
location.reload()
```

Po odświeżeniu w konsoli pojawią się wpisy zaczynające się od:

```text
[Deal Store Filter]
```

Żeby wyłączyć logi:

```js
localStorage.removeItem("pepperStoreFilterDebug")
location.reload()
```

Można też włączyć debugowanie tylko dla jednej karty, dodając do adresu parametr:

```text
?pshdebug=1
```

## Testy

Projekt ma lekkie testy oparte o wbudowany runner Node.js, bez zależności npm.

Sprawdzenie składni:

```bash
node --check content.js
node --check popup.js
```

Uruchomienie testów:

```bash
node tests/content.test.js
node tests/manifest.test.js
```

Testy sprawdzają między innymi:

- normalizację nazw sklepów,
- zapis i odczyt przez Firefox Sync,
- fallback do local storage,
- parsowanie danych `data-vue3`,
- wyszukiwanie `props.thread`,
- fallback do `linkHost`, gdy `merchant` jest pusty,
- fallback do tekstu wyrenderowanej oferty,
- obsługę etykiet `Dostępne w` i `Zrealizuj na`,
- czyszczenie doklejonych etykiet, kodów kuponów i CTA z nazwy sklepu,
- ignorowanie ofert bez możliwej do ustalenia nazwy sklepu,
- ignorowanie wpisów typu `Discussion`,
- deklaracje manifestu wymagane do publikacji.

Te same testy są uruchamiane w GitHub Actions.

## Pliki

- `manifest.json` - konfiguracja dodatku Firefox Manifest V2.
- `content.js` - logika działająca na obsługiwanych stronach.
- `popup.html` - HTML popupu.
- `popup.js` - logika popupu i zarządzania listą sklepów.
- `popup.css` - style popupu.
- `scripts/package-amo.ps1` - skrypt tworzący ZIP do AMO.

## Licencja

Projekt jest udostępniany na licencji MIT. Szczegóły znajdują się w pliku `LICENSE`.
