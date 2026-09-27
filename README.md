# Hrady a zámky ČR

Interaktivní mapa českých hradů, zámků a zřícenin, kde si můžeš odškrtávat, co už jsi navštívil, a pročítat, komu která místa během staletí patřila.

**Web: <https://zdenekcdc.github.io/hrady-zamky/>**

## Co na mapě najdeš

- **Přes 2 200 míst** z celé republiky: hrady, zámky i zříceniny. Zvlášť jsou vidět ty, které jsou zpřístupněné (se vstupným nebo prohlídkami), a volně přístupné zříceniny.
- **Filtry a hledání:** typ, kraj, správce (NPÚ / ostatní), století vzniku, navštívená / nenavštívená; hledat jde místa i šlechtické rody.
- **Detail místa:** fotka, vznik, stručná historie, časová osa vlastníků, důležité události, návštěvnost, odkazy na web, Wikipedii a navigaci a „Co je poblíž“ - nenavštívená místa do zvolené vzdálenosti.
- **Stroj času:** posuneš rok a mapa se obarví podle toho, který rod tehdy místa vlastnil.
- **Šlechtické rody:** přehled rodů s erbem, popisem, časovou osou držení, mapou jejich sídel a tím, od koho majetek získali a komu ho předali.

Historie vlastníků je zatím zpracovaná u nejnavštěvovanějších objektů a postupně přibývá.

## Tvoje návštěvy

U každého místa si uložíš návštěvu s datem, hodnocením a poznámkou. Návštěvy zůstávají jen u tebe - web nemá žádný server ani účty a každý začíná s prázdnou mapou.

- **Chrome, Edge, Opera, Chrome na Androidu:** v panelu filtrů (Moje návštěvy) si můžeš připojit soubor na disku a web do něj bude každou změnu ukládat sám. Když ho dáš do složky Google Drive, OneDrive nebo Dropbox, máš zálohu i na dalších zařízeních.
- **Firefox, Safari, iPhone:** návštěvy se ukládají v prohlížeči. Smazáním dat prohlížeče by se ztratily, proto si občas stáhni zálohu.
- **Export a import** fungují všude: návštěvy stáhneš jako soubor JSON a můžeš je nahrát v jiném prohlížeči nebo si je vyměnit s kamarádem (import je sloučí s tvými).

## Zdroje dat

Mapa stojí na otevřených datech. Díky všem, kdo je tvoří.

| Zdroj | K čemu | Licence |
|---|---|---|
| [Wikidata](https://www.wikidata.org) | seznam míst, poloha, typ, odkazy | CC0 |
| [Wikipedie](https://cs.wikipedia.org) | historie vlastníků, události, popisy rodů | CC BY-SA |
| [Wikimedia Commons](https://commons.wikimedia.org) | fotky a erby; autor a licence jsou uvedeny u každé fotky | podle souboru (hlavně CC BY-SA) |
| [NPÚ](https://www.npu.cz), [NIPOS](https://www.nipos.cz) | zpřístupněné objekty, návštěvnost 2025 | veřejná statistika |
| [OpenStreetMap](https://www.openstreetmap.org) | podkladové mapy, doplňující údaje o otevření | ODbL |
| [Stadia Maps](https://stadiamaps.com) / Stamen | terén výchozí mapy | © Stadia Maps, Stamen, OpenMapTiles, OSM |
| [ČÚZK](https://cuzk.gov.cz) | hranice ČR a krajů | CC BY 4.0 |

Historie vlastníků vznikla výtahem z článků české Wikipedie a jako odvozené dílo spadá pod CC BY-SA 4.0; u každého místa jsou uvedeny zdrojové články. Najdeš-li chybu, dej vědět přes [Issues](https://github.com/ZdenekCDC/hrady-zamky/issues).

## Spuštění u sebe

Web je čistě statický (HTML, JavaScript a JSON, bez sestavování). Stačí Python 3:

```sh
git clone https://github.com/ZdenekCDC/hrady-zamky.git
cd hrady-zamky
python3 scripts/serve.py    # otevři http://localhost:8000
```

Lokální server ukládá návštěvy do `data/visited.json`. Aktualizace dat, skripty a testy jsou popsané v [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md), formát dat v [data/SCHEMA.md](data/SCHEMA.md).
