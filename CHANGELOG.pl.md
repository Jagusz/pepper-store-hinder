# Lista zmian

## Unreleased

### Zmieniono

- Dodano cache ustrukturyzowanych danych oferty z list Peppera, dzięki czemu rozszerzenie może zachować sklep i kategorię także po przebudowie pierwszych kart na `/nowe`.
- Uszczelniono parser listy ofert, żeby nie wpadał zbyt wcześnie w tekstowy fallback na kartach, które mają już `ThreadMainListItemNormalizer`, ale nie skończyły jeszcze hydratacji.
- Rozszerzono testy o odczyt kategorii Peppera, oferty z samą kategorią, uzupełnianie brakującego przycisku oraz ponowne użycie zcache'owanych danych po zmianach DOM.

## 0.2.0

Wydanie skupione na tym, żeby filtrowanie było łatwiejsze do kontrolowania bez utraty zapisanej listy sklepów.

### Dodano

- Widok ustawień w popupie.
- Tymczasową akcję `Disable filters` / `Enable filters`.
- Ustawienie `Firefox Sync` do przełączania między zapisem synchronizowanym a tylko lokalnym.
- Ustawienie `Always filter when opening a page`.
- Ustawienie `Show filtered deals as compact previews`, które pozwala zostawiać pasujące oferty jako kompaktowe podglądy.
- Opcję `Show filtered deals above this threshold` z osobnym polem progu.
- Opcję `Hide deals below this threshold` z osobnym polem progu.
- Opcję `Show deals below threshold as compact previews` dla przygaszania ofert poniżej progu zamiast ich całkowitego ukrywania.
- Wbudowaną etykietę `Deal Store Filter: Filtered by ...` na kompaktowych podglądach.
- Wbudowaną akcję `Remove filter` na kompaktowych podglądach filtrowanych sklepów.
- Natychmiastowe odświeżanie aktywnej karty po zmianie filtrów lub ustawień, gdy content script jest dostępny.
- Testy dla kompaktowych podglądów, trybu tylko lokalnego, przełączania filtrowania, usuwania filtra z poziomu karty oraz progów temperatury.

### Zmieniono

- Wersja pakietu to teraz `0.2.0`.
- Skrypt pakujący dla AMO odczytuje wersję ZIP-a z `manifest.json`.
- Filtrowanie progowe może teraz ukrywać oferty całkowicie albo pokazywać je jako wyszarzone podglądy, zależnie od ustawień użytkownika.
- Przy pierwszym wczytaniu listy ofert zastosowano stan przejściowy ograniczający miganie filtrowanych elementów.

### Uwagi dla AMO

- Brak nowych uprawnień hostów.
- Brak zdalnych skryptów, analityki, telemetryki, `fetch()` i `XMLHttpRequest`.
- Dane filtrów nadal pozostają wyłącznie w pamięci rozszerzenia Firefoksa.
