# Filtr sklepów dla Pepper.pl

Rozszerzenie do Firefoksa, które pozwala ukrywać oferty z wybranych sklepów na Pepper.pl.

## Jak działa

Rozszerzenie działa tylko na stronach:

```text
https://www.pepper.pl/*
```

Na listach ofert odczytuje nazwę sklepu z danych osadzonych przez Pepper w atrybucie `data-vue3` komponentu `ThreadMainListItemNormalizer`:

```text
props.thread.merchant.merchantName
```

Jeśli oferta ma przypisany sklep, rozszerzenie dodaje przy niej przycisk:

```text
Filtruj sklep: Nazwa sklepu
```

Kliknięcie przycisku zapisuje sklep na liście filtrów i ukrywa wszystkie oferty z tym samym sklepem. Oferty bez danych `merchant` są ignorowane.

## Popup

Popup rozszerzenia pozwala:

- ręcznie dodać nazwę sklepu,
- usunąć pojedynczy sklep z listy,
- wyczyścić całą listę.

Nazwy sklepów najlepiej dodawać dokładnie tak, jak występują na Pepper.pl, np. `Amazon.pl`, `Media Expert`, `ALDI`.

## Przechowywanie danych

Lista ukrytych sklepów jest zapisywana przez `browser.storage.sync`, dzięki czemu może synchronizować się przez konto Firefox/Mozilla między przeglądarkami.

Dla większej odporności rozszerzenie zapisuje też kopię w `browser.storage.local`. Jeśli Firefox Sync jest niedostępny, lista nadal działa lokalnie.

Rozszerzenie nie wysyła żadnych danych do własnych serwerów ani zewnętrznych usług. Ewentualna synchronizacja odbywa się wyłącznie przez mechanizm Firefox Sync.

## Instalacja tymczasowa w Firefoxie

1. Otwórz w Firefoxie:

   ```text
   about:debugging#/runtime/this-firefox
   ```

2. Kliknij `Załaduj tymczasowy dodatek`.
3. Wybierz plik `manifest.json` z katalogu rozszerzenia.
4. Otwórz `https://www.pepper.pl/`.

Po zmianach w plikach kliknij `Reload` przy dodatku w `about:debugging`, a potem odśwież kartę Pepper.pl.

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
```

Testy sprawdzają między innymi:

- normalizację nazw sklepów,
- łączenie list zapisanych w Firefox Sync i local storage,
- parsowanie danych `data-vue3`,
- wyszukiwanie `props.thread`,
- ignorowanie ofert bez `merchant`.

Te same testy są uruchamiane w GitHub Actions.

## Pliki

- `manifest.json` - konfiguracja dodatku Firefox Manifest V2.
- `content.js` - logika działająca na Pepper.pl.
- `popup.html` - HTML popupu.
- `popup.js` - logika popupu i zarządzania listą sklepów.
- `popup.css` - style popupu.

## Licencja

Projekt może być opublikowany na licencji MIT.
