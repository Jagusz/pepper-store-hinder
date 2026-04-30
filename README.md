# Filtr sklepów dla Pepper.pl

Nieoficjalne rozszerzenie do Firefoksa, które pozwala ukrywać oferty z wybranych sklepów na Pepper.pl.

Rozszerzenie nie jest tworzone, wspierane ani zatwierdzone przez Pepper.pl.

## Funkcje

- Działa na stronach `https://www.pepper.pl/*`.
- Odczytuje nazwę sklepu z danych `data-vue3` komponentu `ThreadMainListItemNormalizer`.
- Używa pola `props.thread.merchant.merchantName`.
- Ignoruje oferty bez danych `merchant`.
- Dodaje przy ofertach przycisk `Filtruj sklep: Nazwa sklepu`.
- Ukrywa oferty ze sklepów zapisanych na liście filtrów.
- Popup pozwala ręcznie dodawać, usuwać i czyścić listę sklepów.

## Jak działa

Na listach ofert rozszerzenie odczytuje dane osadzone przez Pepper.pl w atrybucie `data-vue3`:

```text
props.thread.merchant.merchantName
```

Jeśli oferta ma przypisany sklep, rozszerzenie dodaje przy niej przycisk:

```text
Filtruj sklep: Nazwa sklepu
```

Kliknięcie przycisku zapisuje sklep na liście filtrów i ukrywa wszystkie oferty z tym samym sklepem.

Nazwy sklepów najlepiej dodawać dokładnie tak, jak występują na Pepper.pl, np. `Amazon.pl`, `Media Expert`, `ALDI`.

## Prywatność

Lista ukrytych sklepów jest przechowywana przy użyciu `browser.storage.sync`, aby umożliwić synchronizację filtrów między urządzeniami użytkownika przez Firefox Sync. Rozszerzenie nie wysyła tych danych do autora dodatku, nie korzysta z własnego serwera, nie zawiera analityki i nie ładuje zdalnego kodu.

Rozszerzenie używa `browser.storage.local` wyłącznie jako fallback/cache. Dzięki temu lista filtrów nadal działa, jeśli Firefox Sync jest chwilowo niedostępny albo zwróci błąd.

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

## Instalacja lokalna do testów

1. Otwórz w Firefoxie:

   ```text
   about:debugging#/runtime/this-firefox
   ```

2. Kliknij `Załaduj tymczasowy dodatek`.
3. Wybierz plik `manifest.json` z katalogu rozszerzenia.
4. Otwórz `https://www.pepper.pl/`.

Po zmianach w plikach kliknij `Reload` przy dodatku w `about:debugging`, a potem odśwież kartę Pepper.pl.

## Publikacja / pakowanie ZIP

Do Mozilla Add-ons należy wysłać ZIP zawierający pliki dodatku bez katalogu nadrzędnego.

Na Windows można użyć skryptu:

```powershell
.\scripts\package-amo.ps1
```

Skrypt tworzy plik:

```text
dist/filtr-sklepow-dla-pepper-pl.zip
```

ZIP zawiera tylko pliki potrzebne do działania dodatku:

- `manifest.json`
- `content.js`
- `popup.html`
- `popup.js`
- `popup.css`
- `LICENSE`

Do paczki nie trafiają katalogi `.git`, `.github`, `tests`, `node_modules` ani pliki CI.

## Nieoficjalny charakter dodatku

Filtr sklepów dla Pepper.pl jest projektem niezależnym.

Rozszerzenie nie jest tworzone, wspierane ani zatwierdzone przez Pepper.pl. Nazwa Pepper.pl jest używana wyłącznie do wskazania strony, na której działa dodatek.

## Debugowanie

Na stronie Pepper.pl można włączyć logi debugowe w konsoli:

```js
localStorage.setItem("pepperStoreFilterDebug", "1")
location.reload()
```

Po odświeżeniu w konsoli pojawią się wpisy zaczynające się od:

```text
[Filtr sklepów Pepper]
```

Żeby wyłączyć logi:

```js
localStorage.removeItem("pepperStoreFilterDebug")
location.reload()
```

## Testy

Projekt ma lekkie testy oparte o wbudowany runner Node.js, bez zależności npm.

Uruchomienie testów:

```bash
node tests/content.test.js
node tests/manifest-android.test.js
```

Testy sprawdzają między innymi:

- normalizację nazw sklepów,
- łączenie list zapisanych w Firefox Sync i local storage,
- parsowanie danych `data-vue3`,
- wyszukiwanie `props.thread`,
- ignorowanie ofert bez `merchant`,
- deklaracje manifestu wymagane do publikacji.

Te same testy są uruchamiane w GitHub Actions.

## Pliki

- `manifest.json` - konfiguracja dodatku Firefox Manifest V2.
- `content.js` - logika działająca na Pepper.pl.
- `popup.html` - HTML popupu.
- `popup.js` - logika popupu i zarządzania listą sklepów.
- `popup.css` - style popupu.
- `scripts/package-amo.ps1` - skrypt tworzący ZIP do AMO.

## Licencja

Projekt jest udostępniany na licencji MIT. Szczegóły znajdują się w pliku `LICENSE`.
