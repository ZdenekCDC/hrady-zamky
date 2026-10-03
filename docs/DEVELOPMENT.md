# Vývoj a údržba

Poznámky k provozu, datům a skriptům. Veřejný popis projektu je v [README](../README.md). Statický web (Leaflet + JSON), bez buildu.

## Spuštění

```sh
python3 scripts/serve.py        # otevři http://localhost:8000
```

`serve.py` je statický server + čtení a zápis tvých návštěv v `data/visited.json` (poslouchá jen na 127.0.0.1). Stačí systémový Python, žádné balíčky. Přes `file://` to nefunguje (prohlížeč blokuje načtení JSON). Na GitHub Pages stačí nahrát repozitář, web je v kořeni (`index.html`); každý návštěvník tam začíná s prázdnou mapou (viz Navštívená místa).

## Co umí

- **Mapa**: vrstvy se vstupným (prohlídky, expozice) / volně přístupné zříceniny / ostatní (přístupnost neznámá, skrytá). Piktogram značky = typ (věž s cimbuřím hrad, několik kuželových věží a brána zámek, cimbuřová věž s kuželovými věžemi hrad a zámek, věž a rozpadlá zeď zřícenina) a zemitá výplň = typ (okrová hrad, cihlová zámek, fialová hrad a zámek, smaragdová zřícenina); barevné téma ikon (zemitá výchozí, dál kámen, sytá, pastelová) se volí v panelu filtrů, ukládá se do souboru s návštěvami (`iconTheme`, viz `data/SCHEMA.md`) a definuje se v `style.css` jako `:root[data-icon-theme=...]`; se vstupným = plná výplň a silný černý obrys, volně přístupné = zesvětlená výplň a tenký šedý obrys; plná modrá s fajfkou = navštíveno; značky nemají lem. Dalších 13 druhů (tvrz, klášter, kostel, usedlost, hospitál, důl, vila, areál, zahrada, pevnost, hradby, kostnice, krypta) má piktogram v `PICTOGRAMS` v `app/map.js`, barvy v `--mk-kind-*` v `app/style.css` a popisek v `KIND` v `app/data.js`; filtry `DEFAULTS.kinds` se z `KIND` odvozují samy.
- **Filtry**: panel je složený ze sbalitelných sekcí (Vrstvy, Typ, Další filtry, Zvýraznit rody, Moje návštěvy, Legenda a barvy; otevřený / zavřený stav a výběr se ukládají v `localStorage` s ostatními filtry), vysvětlivky jsou v tooltipech u značky ⓘ; ve výchozím stavu jsou zapnuté jen druhy hrad, zámek, hrad a zámek a zřícenina (`DEFAULT_KINDS` v `app/map.js`, tlačítka „jen hrady a zámky“ / „vše“). Filtry: typ, kraj, správce (NPÚ / ostatní), století vzniku (z roku vzniku, jinak z textu „14. stol.“ / „1920. léta“), návštěvy (všechny / jen navštívené / jen nenavštívené), jen s historií; hledání (místa i rody), vybrané místo má na mapě větší značku s pulzujícím kroužkem nad ostatními; „resetovat vše“.
- **Zvýraznit rody**: více rodů najednou jako chipy (× odebere, „zrušit výběr“ vše); značky rodu dostanou jeho barvu, ostatní se ztlumí. Totéž kliknutím v legendě.
- **Náhled při najetí myší**: fotka (lokální miniatura z `data/thumbs/`, rychlá i na GitHub Pages), typ, obec, vznik, přístupnost, rody (ve stroji času vlastník v daném roce).
- **Detail místa**: fotka (Wikimedia Commons), vznik, shrnutí, časová osa vlastníků (klik na rod -> přehled rodu; tlačítko ⤢ roztáhne panel pro širší osu, volba se pamatuje), události, odkazy (web, Wikipedie, Mapy.com, navigace), návštěvnost (NIPOS), „Co je poblíž“ (nenavštívené do 10-100 km).
- **Stroj času**: posuvník roku obarví místa podle tehdejšího vlastníka; 8 rodů s nejvíce objekty má pevnou barvu, ostatní rody šedě, instituce tmavě; všechny značky mají tmavý obrys (čitelné na světlé mapě), navštívené modrý a silnější, vybrané rody jsou větší a ostatní se zmenší a zesvětlí. Legenda i výběr „Zvýraznit rod“ zvýrazní jeden rod. Osa začíná u nejstaršího vlastníka v datech zaokrouhleného na 50 let (`D.tmMin` z `loadAll()`, nyní 850); místo se ukáže od roku vzniku (`startYear`: přesný rok, jinak začátek století z textu „14. stol.“, jinak nejstarší rok v historii). Volba „skrýt místa bez data vzniku“ (výchozí zapnuto) schová místa, u kterých se nic z toho nezjistí, kromě navštívených.
- **Rody** (`#/rody`): přehledová časová osa rodů, detail rodu s erbem, popisem, časovou osou držení, čtvercovou mapou v pravém sloupci a vazbami (od koho majetek získali / komu předali a jak). Seznam rodů a detail se rolují každý zvlášť (tenké lišty), seznam si drží pozici při přepnutí rodu; na úzkém okně se roluje celá stránka.

## Podkladové mapy

„Krajina + města“ (výchozí) - terén bez popisků a silnic (lesy, reliéf, řeky; Stadia Maps / Stamen Terrain Background) a nad ním vlastní vrstva hranic a měst; okolí ČR je ztlumené. Na `localhost` funguje bez účtu. **Na GitHub Pages** je potřeba zdarma účet na https://stadiamaps.com a v něm zaregistrovat doménu (Manage Properties -> Authentication, domain-based) - klíč do kódu se nedává. Tarif zdarma = nekomerční použití, 200 000 kreditů měsíčně.

„Jen města“ - totéž bez terénu, kreslené čistě z `data/basemap/` (hranice ČR a krajů z ČÚZK, města nad 5 000 obyvatel z Wikidat, popisky podle přiblížení); nepotřebuje žádný mapový server a funguje i offline.

Dále OpenStreetMap a turistická OpenTopoMap, obě bez API klíče; volba se pamatuje. Volitelně Mapy.com: vlož klíč do `MAPY_API_KEY` v `app/config.js` (zdarma na https://developer.mapy.com, 250 000 dlaždic měsíčně; na veřejném webu klíč omez na svou doménu).

## Navštívená místa

V detailu místa sekce **Návštěva**: datum, hodnocení 1-5 hvězd, poznámka, „Označit jako navštívené“ / „Uložit změny“ / „odebrat návštěvu“. Návštěvy jsou osobní - veřejný web začíná pro každého s prázdnou mapou. Kam se ukládají, ukazuje v panelu filtrů sekce **Moje návštěvy**:

- **Lokální server** (`scripts/serve.py`): rovnou do `data/visited.json` (soubor je v `.gitignore`, na web se nedostane).
- **Připojený soubor** (Chrome, Edge, Opera, Chrome na Androidu): „Vytvořit soubor…“ / „Otevřít soubor…“ připojí JSON soubor na disku a web do něj zapisuje každou změnu. Soubor ve složce Google Drive, OneDrive nebo Dropbox = záloha a synchronizace mezi zařízeními. Po restartu prohlížeče může být potřeba jednou kliknout na „Povolit zápis“; změny udělané do té doby se pak do souboru dopíšou (přitom se nejdřív načte, co do souboru mezitím zapsalo jiné zařízení).
- **Jen prohlížeč** (Firefox, Safari, iPhone): `localStorage`. Smazáním dat prohlížeče se návštěvy ztratí - zálohu stáhni přes „Exportovat“.

Spolu s návštěvami se ukládá i zvolené barevné téma ikon (`iconTheme`, viz `data/SCHEMA.md`), na serveru, v připojeném souboru i v prohlížeči.

**Export / import** funguje všude: „Exportovat“ stáhne všechny návštěvy jako JSON, „Importovat…“ je načte zpět (jiný prohlížeč, zařízení nebo návštěvy od kamaráda). Import návštěvy sloučí - nová místa přidá, u stejného místa přepíše záznam importovaným; smazání se importem nepřenáší. „Nahradit vším…“ (s potvrzením) udělá z návštěv přesně obsah souboru, místa, která v souboru nejsou, se smažou.

Soubor jde editovat i ručně:

```json
{"id": "Q1701829", "name": "Karlova Koruna", "date": "2025-07-12", "rating": 5, "note": "krásné interiéry"}
```

`id` je Wikidata QID (je v URL detailu, `#/misto/Q...`).

## Data a zdroje

Popis všech souborů a formátů: [`data/SCHEMA.md`](../data/SCHEMA.md).

| Zdroj | K čemu | Licence |
|---|---|---|
| Wikidata | seznam objektů, souřadnice, typ, obrázek, web, obec, kraj | CC0 |
| Wikimedia Commons | fotky objektů (detail) a jejich miniatury v `data/thumbs/`; autor a licence u každé fotky | licence podle souboru (hlavně CC BY-SA) |
| Wikipedie (cs, doplňkově de/en) | historie vlastníků, události, rody | CC BY-SA |
| NPÚ (seznam na cs.wiki) | objekty ve správě NPÚ = se vstupným | - |
| NIPOS, návštěvnost památek 2025 | místa se vstupným, návštěvnost, web | veřejná statistika |
| NIPOS, návštěvnost muzeí 2025 | hrady a zámky ve správě muzeí (pobočky podle názvu, sídla podle webu) | veřejná statistika |
| Stadia Maps / Stamen Terrain Background | terén pod podkladem „Krajina + města“ | © Stadia Maps, Stamen, OpenMapTiles, OSM |
| OpenStreetMap (Overpass) | doplňkové signály otevření (opening_hours, fee, tourism) | ODbL |
| ČÚZK INSPIRE (přes github.com/siwekm/czech-geojson) | hranice ČR a krajů pro podklad „Jen města“ | CC BY 4.0 |

hrady.cz se nepoužívá - jeho `robots.txt` zakazuje AI crawlery.

## Aktualizace dat

Požadavky: Python 3.12+ a venv: `python3 -m venv .venv && .venv/bin/pip install openpyxl requests pillow` (závislosti viz `pyproject.toml`).

```sh
.venv/bin/python scripts/fetch_access.py     # NPÚ, NIPOS xlsx, OSM -> data/raw/access_sources.json
.venv/bin/python scripts/fetch_wikidata.py   # Wikidata -> data/raw/wikidata.json
.venv/bin/python scripts/build_places.py -v  # sloučení -> data/places.json (vypíše nenapárované řádky NIPOS)
.venv/bin/python scripts/fetch_thumbs.py     # náhledy fotek pro najetí myší -> data/thumbs/ + data/build/thumbs.json (jen změněné)
.venv/bin/python scripts/fetch_families.py   # doplní data/families/<id>.json (erb, popis, období)
.venv/bin/python scripts/fetch_basemap.py    # podklad „Jen města“ -> data/basemap/ (stačí jednou)
.venv/bin/python scripts/build_history.py    # data/history + families -> data/build/*.json (validace)
```

- Ruční opravy (párování NIPOS, chybné odkazy v seznamu NPÚ, vyřazené duplicity, typ, přístupnost) patří do `data/overrides.json`, ne do vygenerovaných souborů.
- Typ objektu: bere se z Wikidat, ale „Hrad“ ze seznamu NPÚ má přednost (hrad se zastřešenými a zpřístupněnými částmi je hrad, ne zřícenina). Ostatní druhy: z NPÚ podle jeho typu objektu (`KIND_FROM_NPU` v `build_places.py`), z Wikidat podle `TYPES` ve `fetch_wikidata.py` (jeden dotaz na druh, společný dotaz vyprší); bez cs.wiki článku a bez zdroje návštěvnosti (NPÚ, NIPOS, muzea, `extra_qids`) se místo vynechá. Výjimky oběma směry (např. Vízmburk zůstává zřícenina, Kašperk je hrad) jsou v `overrides.json` u `places`.
- Historii nového objektu přidáš jako `data/history/<QID>.json` podle `data/SCHEMA.md` (ručně nebo agentem z cs.wiki), pak `fetch_families.py` a `build_history.py`. Hromadné doplňování po dávkách: [docs/history-batches.md](history-batches.md), další dávku vypíše `scripts/next_history_batch.py`.
- NIPOS vydává data jednou ročně; při novém ročníku uprav `NIPOS_YEAR` a URL v `scripts/fetch_access.py`.

## Test

```sh
.venv/bin/pip install playwright && .venv/bin/playwright install chromium
.venv/bin/python tests/e2e.py    # projde mapu, detail, stroj času, rody, statistiky, návštěvy, porovná obsah s daty (počty rodů a míst, vlastníci, souhrn); screenshoty do $TMPDIR/hz-e2e
```
