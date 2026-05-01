# Filtr sklepów dla Pepper.pl

[English version](README.en.md)

Nieoficjalne rozszerzenie do Firefoksa, które pozwala ukrywać oferty z wybranych sklepów na Pepper.pl.

Rozszerzenie nie jest tworzone, wspierane ani zatwierdzone przez Pepper.pl.

## Funkcje

- Działa na stronach `https://www.pepper.pl/*`.
- Dodaje przy ofertach przycisk `Filtruj sklep: Nazwa sklepu`.
- Ukrywa oferty ze sklepów zapisanych na liście filtrów.
- Działa na listach ofert oraz na stronach pojedynczych okazji.
- Odczytuje sklep z danych `data-vue3`, jeśli Pepper.pl udostępnia je w komponencie oferty.
- Używa `props.thread.merchant.merchantName` jako głównej nazwy sklepu.
- Gdy `merchant` jest pusty, używa `props.thread.linkHost`, np. `www.facebook.com` -> `facebook.com`.
- Gdy dane strukturalne nie są dostępne, próbuje odczytać sklep z widocznego tekstu oferty, m.in. z etykiet `Dostępne w` i `Zrealizuj na`.
- Ignoruje wpisy typu `Discussion`.
- Popup pozwala ręcznie dodawać, usuwać i czyścić listę sklepów.

## Jak działa

Na listach ofert rozszerzenie najpierw odczytuje dane osadzone przez Pepper.pl w atrybucie `data-vue3`:

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

Fallback tekstowy czyści też doklejone etykiety Pepper.pl, przyciski CTA i kody kuponów, aby przycisk nie dostał nazwy w stylu `FlaconiSPRINGTIMEPobierz kod`.

Jeśli uda się ustalić sklep, rozszerzenie dodaje przy ofercie przycisk:

```text
Filtruj sklep: Nazwa sklepu
```

Kliknięcie przycisku prosi o potwierdzenie, zapisuje sklep na liście filtrów i ukrywa wszystkie oferty z tym samym sklepem.

Nazwy sklepów najlepiej dodawać dokładnie tak, jak występują na Pepper.pl, np. `Amazon.pl`, `Media Expert`, `ALDI`.

## Prywatność

Lista ukrytych sklepów jest przechowywana przy użyciu `browser.storage.sync`, aby umożliwić synchronizację filtrów między urządzeniami użytkownika przez Firefox Sync. Rozszerzenie nie wysyła tych danych do autora dodatku, nie korzysta z własnego serwera, nie zawiera analityki i nie ładuje zdalnego kodu.

Rozszerzenie używa `browser.storage.local` jako fallback/cache. Na gałęzi Android lista odczytana z Firefox Sync jest łączona z lokalną kopią, aby nie zgubić filtrów zapisanych lokalnie, gdy synchronizacja jest czasowo niedostępna albo zachowuje się inaczej na Firefox for Android.

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

Kopia w `browser.storage.local` jest utrzymywana po to, aby zwiększyć odporność dodatku na błędy lub niedostępność Sync. Na gałęzi Android odczyt zwraca połączoną, zduplikowaną tylko raz listę z obu miejsc zapisu.

## Instalacja lokalna do testów

1. Otwórz w Firefoxie:

   ```text
   about:debugging#/runtime/this-firefox
   ```

2. Kliknij `Załaduj tymczasowy dodatek`.
3. Wybierz plik `manifest.json` z katalogu rozszerzenia.
4. Otwórz `https://www.pepper.pl/`.

Po zmianach w plikach kliknij `Reload` przy dodatku w `about:debugging`, a potem odśwież kartę Pepper.pl.

## Firefox for Android

Branch `android` zawiera deklarację zgodności z Firefox for Android:

```json
"browser_specific_settings": {
  "gecko_android": {}
}
```

Manifest zachowuje też stały identyfikator Gecko, wymagany przy podpisywaniu i dla stabilnego działania magazynu WebExtension.

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
node tests/manifest-android.test.js
```

Testy sprawdzają między innymi:

- normalizację nazw sklepów,
- łączenie list zapisanych w Firefox Sync i local storage,
- parsowanie danych `data-vue3`,
- wyszukiwanie `props.thread`,
- fallback do `linkHost`, gdy `merchant` jest pusty,
- fallback do tekstu wyrenderowanej oferty,
- obsługę etykiet `Dostępne w` i `Zrealizuj na`,
- czyszczenie doklejonych etykiet, kodów kuponów i CTA z nazwy sklepu,
- ignorowanie ofert bez możliwej do ustalenia nazwy sklepu,
- ignorowanie wpisów typu `Discussion`,
- deklaracje manifestu wymagane do publikacji na Firefox for Android.

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
