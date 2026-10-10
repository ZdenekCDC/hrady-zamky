# Fáze 2 historie - postup dávek

Historie vlastníků (`data/history/<QID>.json`) se doplňují po dávkách agenty z cs.wiki. Ověřeno na dávkách 1-16 (2026-09-27): 10 objektů na dávku, 2 agenti Sonnet po 5, ~12 min a asi 7-8 % pětihodinového okna na dávku, žádné HTTP 429. Využití okna čte stavový řádek do `/tmp/claude/statusline-usage-cache-*.json` (`five_hour.utilization`).

## Pravidla (šetří kredity i Wikipedii)

- Najednou nejvýš **2 agenti**, každý 5 objektů. Žádné vnořené agenty / forky - v roce 2026 se 4 agenti sami rozvětvili na ~25 a vyčerpali limit.
- Model **Sonnet** (stačí na výtah z článku, levnější).
- Agent zpracovává objekty postupně, `sleep 3` mezi požadavky, max. ~6 požadavků na objekt, při 429 počká 60 s.
- Agent zapisuje jen svoje `data/history/<QID>.json`. Rody, build a opravy dělá hlavní relace.
- Před spuštěním dalších dávek se zeptat uživatele (kolik dávek).

## Postup

1. `python3 scripts/next_history_batch.py 10 2` - vypíše další objekty podle návštěvnosti NIPOS rozdělené na agenta A a B.
2. Spustit 2 agenty (`general-purpose`, `model: sonnet`, na pozadí) se šablonou níže. **Seznam objektů vložit přímo do zadání** a před odesláním zkontrolovat, že v textu nezůstal žádný zástupný text.
3. Po doběhnutí obou:
   - `.venv/bin/python scripts/fetch_families.py` (síť: cs.wikipedia.org, query.wikidata.org). Sám přepíše `owner_wiki` z přesměrování na cílový článek, skončí chybou u neexistujícího článku (opravit na `z-<predikat>` s `owner_wiki` null nebo na správný název) a hlásí osiřelé soubory rodů (po kontrole smazat).
   - `.venv/bin/python scripts/build_history.py` - musí projít bez chyb (WARN o dopočítaných letech jsou v pořádku).
   - Zkontrolovat nová id bez článku (`z-...`): nepatří rod k existujícímu rodu s článkem (např. Vilém Zub z Landštejna -> `landstejnove`)? Nemá stejná osoba v různých objektech různá id?
   - Hlídat, co agenti rádi pokazí (dávky 7-16): `owner_wiki` u neexistujícího článku (fetch_families skončí chybou -> `null`), diakritika v id, nový rod místo existujícího (`z-marradasu` vs. `marradasove`), stejná osoba pod dvěma id, roky „z obecné znalosti“ nebo vymyšlené kvůli buildu (vrátit na `null`), kulaté roky odvozené jen ze století (dávka 17, Dolní Benešov).
   - Zběžně projít podezřelé výsledky (otevřený poslední vlastník, dlouhé `neznamo`), případně ověřit přímo v článku.
   - E2E test: `.venv/bin/python tests/e2e.py`.
   - Nejistoty z hlášení agentů zapsat do `TODO.md` (Priorita 2 - ověřit nejistá místa) a aktualizovat počty.

## Šablona zadání

```text
PŘÍSNÁ PRAVIDLA (dodržuj bezpodmínečně):
- NEPOUŽÍVEJ nástroj Agent ani forky. Žádné další agenty nespouštěj. Všechno dělej sám.
- Objekty zpracovávej postupně, jeden po druhém.
- Mezi každými dvěma HTTP požadavky na Wikipedii dej `sleep 3`. Maximálně cca 6 požadavků na objekt. Při HTTP 429 počkej 60 s a zkus jednou znovu, pak objekt přeskoč a nahlas to.
- Zapisuj POUZE soubory `data/history/<QID>.json` pro svých 5 objektů níže. Žádné jiné soubory neupravuj (ani families, overrides, build, places).

Projekt: kořen tohoto repozitáře = tvůj pracovní adresář (osobní mapa hradů a zámků ČR). Úkol: vytvořit historii vlastníků pro 5 objektů z české Wikipedie.

Nejdřív si přečti:
- `data/SCHEMA.md` (formát history/<QID>.json a pravidla pro id vlastníků - DŮLEŽITÉ)
- vzorové soubory `data/history/Q1708948.json` a `data/history/Q1416944.json`
- seznam existujících id rodů: `ls data/families` (používej existující id, pokud rod sedí; nový rod = slug názvu článku o rodu na cs.wiki podle SCHEMA.md, s `owner_wiki` = přesný název článku PO vyřešení přesměrování, ověř, že článek existuje; rod bez článku `z-<predikat>` s `owner_wiki` null)

Stahování (Bash, curl, titulek vždy URL-encoded přes --data-urlencode, jinak Wikipedie vrátí 400):
curl -s -G -A "HradyZamky/0.1 (personal castle map; python-requests)" "https://cs.wikipedia.org/w/api.php" \
  --data-urlencode action=query --data-urlencode prop=extracts --data-urlencode explaintext=1 \
  --data-urlencode "titles=<Název článku>" --data-urlencode redirects=1 --data-urlencode format=json --data-urlencode formatversion=2
Pro ověření existence článku o rodu stačí `prop=info` s `redirects=1` (vezmi cílový titulek po přesměrování). Když článek o hradu nestačí, můžeš použít článek o panství / obci, ale drž limit požadavků.

Tvoje objekty (QID | název | typ | obec | článek):
<sem vložit blok agenta A nebo B z next_history_batch.py>

Pravidla obsahu:
- Česky, `summary` 2-4 věty. `owners` chronologicky od založení po současnost (včetně státu po 1945/1948, restitucí apod.). Používej jen to, co je ve zdroji; nic si nevymýšlej. Nejisté roky -> `*_approx: true`, neznámé roky uvnitř řetězce nech `null` (build je dopočítá). Poznámky k nejistotám dej do `note`.
- Když zdroj uvádí jen století nebo pořadí („v 18. století“, „poté“), NEvymýšlej kulatý rok (1450, 1700...) ani rok odvozený z obecných dějin (např. vznik krajů 2000) - nech `null`. Přibližný rok jen u formulací typu „kolem roku 1500“, „na přelomu 15. a 16. století“ (-> 1500, approx).
- Zmíní-li zdroj dnešního vlastníka (kraj, obec, NPÚ, firma), musí být poslední záznam `owners` on - i když rok převodu neznáš (pak `from: null`).
- `events`: 3-8 důležitých událostí (stavby, přestavby, dobytí, požáry, zpřístupnění).
- Id rodu jen malá písmena bez diakritiky, číslice a pomlčky (`illeshazyove`, ne `illesháziove`). Roky ani vlastníky nedoplňuj z obecné znalosti - co zdroj neuvádí, nech `null` a napiš do `note`.
- `owner_wiki` vyplň jen u článku, jehož existenci ti potvrdil `prop=info` (odpověď bez `"missing"`); jinak `owner_wiki: null`.
- Než založíš nové id rodu, zkus `grep -ril "<příjmení>" data/history data/families` - stejná osoba / rod už může mít id z jiného objektu.
- `sources`: URL použitých článků.
- Po zápisu každého souboru ověř validitu: `python3 -c "import json;json.load(open('data/history/<QID>.json'))"`.
- Na konci spusť `python3 scripts/build_history.py` a oprav chyby, které se týkají TVÝCH souborů (varování o jiných souborech ignoruj).

Závěrečná zpráva (stručně, max ~15 řádků): pro každý objekt počet vlastníků, nové id rodů, které nejsou v data/families, a konkrétní nejistoty (odhadnuté roky, sporné zařazení). Nic dalšího.
```

## Ověřovací dávky (2026-10-04)

Druhý průchod už hotových historií: agent najde druhý zdroj mimo cs.wiki a opraví `data/history/<QID>.json`. Po 55 objektech (vlny 2-3) mají druhý zdroj všechny zpřístupněné historie kromě Rychlebského hradu.

- Stejná pravidla jako výše (max 2 agenti Sonnet, 3 objekty na agenta, žádné vnořené agenty, zapisují jen své `data/history/<QID>.json`), v dávce 6-7 objektů ~2-6 % pětihodinového okna.
- Zadání: stejný blok PŘÍSNÁ PRAVIDLA, ale úkol je „OVĚŘIT a OPRAVIT existující historii“, seznam objektů s nejistotami z `TODO.md`, webové hledání přes Exa (`mcp__exa__web_search_exa`, `mcp__exa__web_fetch_exa`; curl na cs.wikipedia.org v sandboxu nejde), max ~8 vyhledávání na objekt. Rok měnit jen s konkrétním zdrojem (přidat do `sources`), rozpor nechat v `note` s oběma roky, `null` doplnit jen když ho zdroj výslovně uvádí.
- Kandidáty vybrat podle návštěvnosti NIPOS (`places.json`) mezi historiemi, jejichž `sources` jsou jen cs.wiki. Pozor na zaměněné objekty se stejným názvem (Nové Hrady, Kynžvart hrad / zámek, Boskovice hrad / zámek) - QID v zadání ověřit v `places.json`.
- Po doběhnutí: `fetch_families.py` (potřebuje síť na cs.wikipedia.org a Wikidata), `build_history.py`, E2E, commit, nejistoty do `TODO.md`.
- Co agenti rádi pokazí (ověřovací dávky): příslušnost osoby k rodu odvozená jen z jména (vrátit na `z-<predikat>` bez článku), roky odvozené z věku dědiců nebo z obecné znalosti, klíč `approx` v události (schéma ho nezná), id rodu s pomlčkou uprostřed (`radziwi-ove` místo `radziwiove`), překrývající se nebo nechronologické záznamy `owners`.

## Přístupnost a data vzniku po dávkách (2026-10-10)

Stejný režim jako ověřovací dávky (2 agenti Sonnet, jen čtou a hlásí, nic nezapisují, žádné vnořené agenty, Exa místo curl). Zapisuje hlavní relace. Cena: ~1-2 % pětihodinového okna na 25 objektů u přístupnosti, 100 objektů na data vzniku ~4 %.

- **Přístupnost** (`data/overrides.json`, `places.<QID>.access`): agent vrací řádek `QID | vstupne / volne / neznamo / zanikly | URL | důvod`.
  - `vstupne` = pravidelné prohlídky, muzeum nebo vstupné s dobou (aktuální zdroj 2024-2026); jen dobrovolné vstupné, volný vstup nebo pár dní v roce se nepočítá.
  - `volne` = stojící zdivo / zřícenina / úsek hradeb volně přístupný nebo viditelný z veřejného prostoru; jen terénní stopy (valy, příkopy) se nepřepisují.
  - `zanikly` = nic nezbylo; zapisuje se do `exclude` s důvodem (zbořené, zatopené, zastavěné, nikdy nepostavené). Zůstává, když z kláštera zbyl kostel nebo když jsou vidět základy.
  - Pozor na zaměnu stejnojmenných objektů (hrad vs. zámek, stará vs. nová tvrz): agent dostává titulek článku z cs.wiki a mapování se hlásí jako nejisté (Karlštejn zámek Q1505765 zaměněn s hradem, nezapsáno).
  - Výtěžnost podle pořadí podle délky článku: kláštery 40 % -> 5 %, zámky 20 % -> 4 %, hrady 10 %, tvrze 10 % -> 5 %, hradby (`volne`) ~50 %. Řazení podle délky článku na cs.wiki funguje jako náhrada významu.
- **Data vzniku** (`data/founded.json`, záznam `{year|century, kind: built|first_mention, text}`): agent otevře článek na cs.wiki (infobox "Výstavba" a historie), řádek `QID | year N / century N | built / first_mention | approx / exact | URL | citace`. Pravidla: jen výslovně uvedené, u rozsahu první rok, u století `century N`, přestavba není vznik. Nejdřív se bere `founded.year` z ověřených `data/history/<QID>.json` (bez agentů), `fetch_founded.py` už zapsané odhady nepřepisuje.
- Zápis: `data/overrides.json` má odsazení 1 mezera (`json.dumps(indent=1, ensure_ascii=False)`, jinak diff přes stovky řádků). V zsh se seznam QID v proměnné nerozdělí na slova (`for q in $V` bere jeden argument), seznamy dávat jako pole nebo přímo do Pythonu.
- Po dávce: `build_places.py`, `tests/e2e.py`, řádek do `TODO.md` (bod "Nové druhy míst" a "Stroj času"), commit.
