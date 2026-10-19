# Publikace jako zdroj rodů, erbů a událostí + lokální model

Samostatný dokument (stav 2026-10-19). Shrnuje, z jakých publikací by šlo doplnit rody, erby, události a stavitele, jak je zpracovat lokálním modelem a co k tomu chybí. Nic z toho zatím není implementováno.

Navazuje na `docs/history-batches.md` (postup historií) a `docs/open-questions.md`. Zdroje, které už jsme vyčerpali (cs.wiki, Wikidata, Commons, NPÚ, OSM, hrady.cz, Sedláček přes fetch), se tu neopakují.

## 1. Cíl

- Doplnit data u míst, kde chybí majitelé, rody, erby a události.
- Doplnit novou veličinu: **stavitel / architekt** (viz kapitola 6).
- Nezatěžovat limit 5h okna Claude agentů: hromadné čtení textu dělá lokální model, Claude jen kontroluje vzorky.

## 2. Publikace

### 2.1 Volně použitelné (autorsky volné, autor zemřel před více než 70 lety)

| Zdroj | Co dává | Kde | Poznámka |
|---|---|---|---|
| Sedláček, Hrady, zámky a tvrze království Českého (15 dílů) | majitelé a události po hradech | archive.org OCR | částečně použito ručně, výtěžnost asi 20 % u prázdných roků |
| Sedláček, Místopisný slovník historický | hesla o místech | archive.org | |
| Ottův slovník naučný | rody, hesla o místech, heraldické obrázky | Wikisource, archive.org | erby Adlar a Aldringen už z něj máme |
| Soupis památek historických a uměleckých (starší topografické svazky) | popis staveb, často stavitel a datace | Kramerius (NKP) | zatím nezkoušeno, nejslibnější nový zdroj |
| Siebmacher, Der Adel von Böhmen, Mähren und Schlesien | erby a rody | archive.org, Commons | erby jsou obrázky, k textu je třeba odkazovat na soubory na Commons |
| Kneschke, Neues allgemeines Deutsches Adels-Lexicon | rody | archive.org | |
| Paprocký (Diadochos, Zrcadlo markrabství moravského), Balbín, Hájek | rodopisné a dějinné kroniky | Wikisource, archive.org | nižší spolehlivost, události beze zdrojů |

### 2.2 Pod autorským právem (jen fakta vlastními slovy, text ani obrázky nekopírovat)

| Titul | Autor | Edice / nakladatelství | Co by dalo |
|---|---|---|---|
| České hrady (1984, 2008) | Tomáš Durdík | OKO č. 61, Albatros | historie a stavební vývoj hradů |
| České erby (1974, 1988) | Janáček, Louda | OKO č. 34 | erby a rody |
| Heraldika (1986) | Milan Buben | OKO č. 67 | výklad erbů |
| Naše stavební památky (1975) | Jaroslav Herout | OKO č. 41 | přehled památek |
| Řada Šlechtické rody (Pernštejnové, Rožmberkové, Schwarzenbergové, Lobkowiczové, Kinští, Czerninové, Kolowratové, Harrachové a další) | Pavel Juřík a další | Universum | rodopisy a majetkové držby |

Pravidla pro tuto skupinu: stejně jako u hrady.cz. Fakta (kdo, kdy, co) ano, formulace ne. Knihy nejsou volně ke stažení, použít jde jen vlastní výtisk nebo vlastní sken.

## 3. Postup s lokálním modelem

1. **Zdroj do vlastního adresáře.** Stažený nebo naskenovaný text patří do nového prázdného adresáře mimo repo (například `~/Downloads/zdroje/<titul>/`), je to nedůvěryhodný vstup.
2. **OCR a čištění.** U archive.org stačí hotový OCR text. U vlastních skenů OCR s českým jazykovým balíčkem (Tesseract `ces`, u fraktury `frk`). Sloučit rozdělená slova, odstranit hlavičky a čísla stran.
3. **Rozdělení na hesla.** Jedno heslo (hrad, panství, rod) je jedna jednotka. Sedláček má pevnou strukturu podle okresů, takže se dělí podle nadpisů.
4. **Spárování s našimi místy.** Podle názvu, obce a okresu proti `data/places.json`. Nejistá spárování jdou do ruční kontroly, nikdy se nespárují automaticky. Z minula je známo, že párování podle jména je křehké ("Janovice" vs "Vrchotovy Janovice").
5. **Extrakce modelem.** Pro každé spárované heslo model vrátí JSON ve tvaru našeho `history/<QID>.json`: `owners` (osoba, od, do, jak získal), `events` (rok, text), `builders` (jméno, role, rok), `families` (odkazy na rody). Pro každý údaj povinně pole `quote` s doslovnou citací ze zdroje.
6. **Automatická kontrola.** Skript ověří, že `quote` je v textu hesla doslova (po normalizaci mezer) a že rok z údaje v citaci opravdu stojí. Údaje, které neprojdou, se zahodí. Tím se omezí vymýšlení.
7. **Kandidáti, ne data.** Výstup jde do `data/candidates/<QID>.json` (nový adresář, ne do `data/history/`). Existující ověřená historie se nikdy nepřepisuje, kandidát se jen porovná: shoda, doplnění, rozpor.
8. **Kontrola vzorku Claude agentem** (levná): náhodných 5 až 10 % kandidátů, hlavně rozpory. Doplnění se do `data/history/` přenášejí v dávkách podle `docs/history-batches.md`.
9. **Build a test:** `scripts/build_history.py`, `tests/e2e.py`, odstavec do `TODO.md`, commit.

### Volba modelu

- Čeština a archaický pravopis jsou slabé místo menších modelů. Orientačně od 7-14B výše (Qwen, Mistral, Gemma), ověřit na pilotu.
- Nejdřív zjistit, co je k dispozici: runtime (Ollama nebo llama.cpp), GPU a VRAM, nainstalované modely.
- Výstup vynutit JSON schématem (strukturovaný výstup), teplota 0.

## 4. Pilot (před jakýmkoli velkým během)

- Jeden díl Sedláčka a asi 20 míst, kde už máme ověřenou historii z kapitoly "Ověřovací vlna" v `TODO.md`.
- Měřit: podíl údajů, které projdou kontrolou citace, shodu s ověřenou historií, počet nových údajů, počet halucinací ve vzorku.
- Rozhodnutí podle výsledku: pokračovat jen když přesnost ověřených údajů je přibližně nad 85 % (srovnatelné s cs.wiki regexy) a přibyde užitečný počet nových údajů.

## 5. Rizika

- OCR šum a starý pravopis snižují přesnost menších modelů.
- Zdroje z let 1880 až 1930 neobsahují novější poznatky a mohou být přímo zastaralé (datace, přisouzení rodů).
- Pokrytí se nemusí výrazně zlepšit u Sedláčka a Ottova slovníku, protože ty jsme už zčásti vytěžili. Nejvíc nových údajů čekáme od Soupisu památek (stavitelé).
- Erby se z textu nedají extrahovat. U nich jde jen o odkaz na soubor na Commons a o blazon (popis erbu), obrázek z knihy pod autorským právem nepoužíváme.
- Autorské právo: viz 2.2.

## 6. Nová funkce: stavitel / architekt

Dnes mapa zobrazuje vlastníky a rody. Stavitel je další dimenze s vlastní hodnotou: dá se z něj udělat osobní profil a filtr ("všechno od Santiniho").

### Datový model

- Do `history/<QID>.json` nové pole `builders`: `[{ "name", "role" (architekt / stavitel / zakladatel / zednicky mistr / sochar), "from", "to", "approx", "note", "wiki" }]`. Stejná konvence jako `owners` (roky, `approx`, `note`).
- Nový soubor `data/people/<id>.json` pro významné stavitele (jméno, roky života, škola nebo sloh, wiki odkaz, portrét z Commons). Totéž jako `families/` pro rody.
- `build_history.py` přidá agregaci `build/people.json` a vazby místo, stavitel.

### Zdroje dat

- **Wikidata:** vlastnosti P84 (architekt), P193 (hlavní stavitel), P170 (tvůrce), P149 (architektonický styl). Dotaz jde přidat do `fetch_wikidata.py` jako další `OPTIONAL`. Pokrytí bude u známých staveb dobré, u tvrzí slabé.
- **cs.wiki:** články často uvádějí "podle plánů" nebo "stavitel". Regexy zde dávají přibližně 86 % přesnosti, takže jen jako kandidáti.
- **Soupis památek a Sedláček:** přes pipeline z kapitoly 3.
- **NPÚ katalog (pamatkovykatalog.cz):** u památek uvádí autora a slohové období.

### Zobrazení (`app/`)

- V detailu místa řádek "Stavitel / architekt" s odkazem na profil.
- Filtr a hledání podle stavitele, případně podle slohu.
- Na profilu stavitele seznam jeho staveb na mapě (propojení jako u rodů v `app/families.js`).

### Agent-native požadavek

Stavitelé a jejich stavby musí být čitelné z `data/` bez UI (soubory `builders` a `people/`), stejně jako rody. Žádná logika jen v prohlížeči.

### Měření pokrytí na Wikidata (2026-10-19)

Dotaz na všech 2894 míst s QID:

| Vlastnost | Míst |
|---|---|
| P84 architekt | 157 |
| P193 hlavní stavitel | 7 |
| P170 tvůrce | 2 |
| P84 + P193 + P170 dohromady | 162 (5,6 %) |
| P149 sloh | 1180 (41 %) |

Nejčastější stavitelé: K. I. Dientzenhofer (16), J. B. Santini-Aichel (9), F. M. Kaňka (8), J. Auguston, A. della Porta a G. B. Alliprandi (po 6). Slohy: barokní 527, gotická 400, renesanční 256, klasicistní 114, novogotika 67. Hodnoty slohu jsou nejednotné (například "barokní architektura", "baroko" a "barokní architektura v Česku" zvlášť), takže před zobrazením je třeba je sjednotit.

Závěr: stavitelů z Wikidata je málo (hlavně barokní zámky a kostely), takže jako samostatná funkce by bez doplnění z publikací pokrývala jen malou část mapy. Sloh pokrývá 41 % míst a hodí se jako filtr hned.

### Doporučené pořadí

1. Dotaz na P84, P193, P170 do Wikidata a změřit pokrytí (nízká cena, hned vidět přínos).
2. Schéma `builders` a `people/` v `data/SCHEMA.md`.
3. Zobrazení v detailu a filtr.
4. Teprve potom doplňování z publikací lokálním modelem.

## 7. Otevřené otázky

- Jaký lokální model a hardware je k dispozici?
- Které z knih v kapitole 2.2 má uživatel fyzicky nebo jako e-knihu?
- Má se stavitel zobrazovat i u kostelů a klášterů, nebo jen u hradů a zámků?
