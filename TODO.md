# TODO

Stav k 2026-09-27: fáze 1 hotová, fáze 2 rozjetá (mapa 2236 objektů, historie vlastníků 109 objektů, 346 rodů). Web je připravený na veřejné nasazení (prázdná mapa pro každého, vlastní úložiště návštěv, lokální náhledy fotek).

## Priorita 1 - ověřit a doplnit základ

- [ ] Otevřít web v normálním prohlížeči a zkontrolovat podklady OpenStreetMap / OpenTopoMap a fotku v detailu (Wikimedia Commons) - v sandboxu se nenačítaly, ověřené je jen rozvržení. Náhledy při najetí myší jsou nově lokální (`data/thumbs/`).
- [ ] Ručně vyzkoušet připojený soubor návštěv v Chrome / Edge (Vytvořit soubor…, uložit návštěvu, restart prohlížeče, Povolit zápis) - E2E test to ověřuje jen s náhradou souborového dialogu.
- [ ] Doplnit datum, hodnocení a poznámku k 5 navštíveným - v detailu místa (sekce Návštěva), web spusť přes `python3 scripts/serve.py` (zapisuje do `data/visited.json`, který je v `.gitignore`).
- [x] Dark mode: značky měly tmavé barvy na světlé mapě - opraveno (značky mají pevnou světlou paletu), ověřeno screenshotem.

## Priorita 2 - data

- [ ] **Fáze 2 historie**: zbývá 186 zpřístupněných objektů bez `data/history/<QID>.json` (hotovo 60 nejnavštěvovanějších v dávkách 1-6, 2026-09-27). Jedna dávka = 10 objektů, 2 agenti Sonnet po 5, cca 200k tokenů, ~12 min. Postup, pravidla a šablona zadání v [docs/history-batches.md](docs/history-batches.md); seznam další dávky vypíše `scripts/next_history_batch.py`. Počet dávek odsouhlasit předem. 5 objektů nemá článek na cs.wiki (Neustupov, Orlice, Chuchelná, Dolní Životice, Dubová) - jiný zdroj.
- [ ] Ověřit nejistá místa v historiích (hlášená agenty):
  - Karlštejn - roky zástavních držitelů cca 1648-1690 odhadnuté; Tereziánský ústav šlechtičen zařazen jako `cirkev` (diskutabilní).
  - Slatiňany - rané vlastníky (Otháj, Talmberkové, Šárovcové…) jen v pořadí, roky odhadnuté.
  - Dobříš - pořadí zástavních držitelů 1460-1569 nejisté.
  - Velhartice - build hlásí nechronologické pořadí (páni z Hradce 1391); mnoho krátkých držeb.
  - Vranov nad Dyjí - roky 1516-1614 dopočítané (zdroj zná jen pořadí).
  - Jindřichův Hradec, Valdštejn, Zákupy - rok přechodu na stát / město odhadnutý.
  - Kunětická hora - přechod komora -> Drasche z Wartinberka nepřesný.
  - Hukvaldy - článek na cs.wiki končí rokem 1602, poslední záznam (olomoucké biskupství) je otevřený; doplnit 17.-20. stol. (arcibiskupství do 1948?, stát / současný vlastník) z jiného zdroje.
  - Kokořín - vlastníci 1544-1894 neznámí (zdroj uvádí jen pustý hrad), pořadí majitelů v 15.-16. stol. bez let.
  - Nový Hrádek - roky 6 majitelů v 16. stol. dopočítané; konec držby Mniszků / Stadnických odhadnutý.
  - Třeboň - mezidobí 1621-1660 přiřazeno koruně (zdroj neuvádí přesně).
  - Zruč nad Sázavou (27 vlastníků) a Milotice - řada roků v 16.-19. stol. dopočítaná; Milotice: souběh Choiseul d'Aillecourt / Hardeggové 1811-1888 nejasný.
  - Žebrák - mezera mezi Kolovraty (~1460) a Krajíři z Krajku; Točník - zástavy 1723-1864 jen rámcově.
  - Opočno - 1431-1455 `neznamo` (spor uzurpátorů); `stat` 1942-1945 je fakticky protektorátní správa; příslušnost Jana z Janovic a Prešpurka k Janovicům odvozená z predikátu.
  - Náchod - Jetřich z Janovic (do 1412) veden jako `z-janovic`, nejasné, zda patří k `janovici`; řada mezivládců bez let.
  - Ratibořice - konec držby Smiřických (~1621) odhadnutý; Kratochvíle - vymření Eggenbergů (1719) a pozemková reforma (1923) odhadnuté.
  - Hrádek u Nechanic - počátek držby Schaffgotschů neznámý.
  - Dačice - roky Osteinů / Dalbergů odvozené z let narození a úmrtí; Landštejn - řada držeb jen přibližně.
  - Starý Jičín - u 6 majitelů (Ditrichštejnové...Deymové) jen tabulka, `how` neznámo; Lichnice - drobné zástavy sloučené do 2 záznamů `koruna`, přechody KČT -> ONV -> Třemošnice bez přesných let.
  - Rožmberk - zástava Walsee sloučená do záznamu Rožmberků; Zvíkov - návrat zástavy Rožmberkům (~1429) a dědičné držení Švamberků 1473-1574 nejasné.
  - Jaroměřice n. R. - mezera 1325-1498 u Lichtenburků; Kynžvart - generační přechody Metternichů 1681-1818 bez let; Lukov - vnitrorodové přechody Šternberků bez let.
  - Raduň - "smrt hraběte Larische 1875" koliduje s držbou Blücherů (možná chyba zdroje).
  - Cimburk (Kroměříž) - přesuny 1470-1523 zdroj neuvádí, po ~1700 `neznamo`; Náměšť na Hané - řídké prameny, většina let null/approx.
  - Tolštejn - rok prodeje Mehlů (~1600) a držba 1642-1681 neznámé; Lemberk - roky Kurzbachů a přechodů Berkové / Donínové nejisté; Šternberk - přechod Kravaři -> Berkové bez roku, konec Minsterberků ~1650.
  - Ledeč n. S. (31 vlastníků) - Magdaléna Salmová veden jako `z-salmu` (větev Salmů neuvedena), zakladatel Slavek z Ledče nejistý; Doksy - 3 teorie o zakladateli.
  - Lipnice, Slavkov, Doksy - rok přechodu stát -> kraj / město chybí.
  - Dívčí kámen - 1541-~1700 `neznamo` (mezi Rožmberky a Schwarzenbergy); Zbiroh - zakladatel Břetislav ze Zbiroha `neznamo`, rané držby jen v pořadí; Frýdštejn - zakladatel (Biberštejnové?) nedoložen.
  - Mníšek p. B. - roky Engel -> Unwerth -> Pacht odhadnuté; Rájec - přechody páni z Rájce / Kunštátu / Lomnice odhadnuté; Grabštejn - roky Hoffmannů, Černousů, Nosticů odhadnuté.
  - Ploskovice - Wittelsbachové 1741-1805 a Habsburkové 1805-1918 sloučeni do jednoho záznamu; Radyně - 1521-1529 dvě verze držitele; Krakovec - 1424-1437 `neznamo`, rok KČT -> stát (1948) odhadnutý.
  - Jezeří - návrat Lobkowiczům 1945-1948 jen odvozený (článek uvádí znárodnění po 1948); Kravaře - majitelé 1553-1636 a 1853-1911 neznámí; Chvaly - mezery 1462-1614 a 1848-1918 `neznamo`.
  - Nové Město n. M. - způsob nabytí u 6 rodů neuveden; Horšovský Týn - zástavní držitelé 15. stol. approx.
  - Košumberk - konec jezuitské správy, nabytí Thurn-Taxisy a přechod na Luži bez let; Stekník - Lobkovicové -> Kaplířové 1595 vs. 1594, přechod na stát 1949; Brandýs n. L. - přechod komora -> Leopold II. Toskánský (1860).
  - Vítkův hrádek - Sezema z Chotěnic jako poslední majitel je jen odhad A. Sedláčka (`z-chotenic` je jiný rod než `z-chotemic`).
- [ ] Rody bez článku na cs.wiki (144 z 346, z toho 117 id typu `z-...`): dohledat, zda nepatří k existujícímu rodu (např. Licek z Rýzmburka, Mazanec z Frymburka, Jetřich z Janovic u Náchoda).
- [ ] Zkontrolovat duplicity / větve rodů (Valdštejnové vs. Valdštejnové-Vartenberkové, Lobkovicové a jejich větve) - rozhodnout, zda větve slučovat.
- [ ] Doplnit `related` (příbuzné rody, sňatky, větve) v `data/families/*.json` - zatím prázdné; vazby „od koho / komu“ se počítají z převodů automaticky.
- [ ] Erby chybí u 208 z 346 rodů, popis u 144 (hlavně rody bez článku) - doplnit z Commons / Wikipedie.
- [x] Zámky ve správě muzeí (Pardubice, Mikulov, Špilberk, Znojmo, Hukvaldy…) - doplněno ze statistiky muzeí NIPOS (+15 objektů).
- [ ] Zbylé chybějící zpřístupněné objekty (muzea, která mají jiný web než Wikidata, soukromé zámky mimo statistiku) - přidávat do `data/overrides.json` (`places.<QID>.access = "vstupne"`); nahlas mi, co ti chybí.
- [ ] Nenapárovaná položka NIPOS: zřícenina Putna (není na Wikidatech jako hrad).
- [ ] Projít klasifikaci typu u známých objektů (Wikidata vede např. Kašperk, Rabí jako zříceniny) - opravy do `overrides.json`.
- [ ] Podivné duplicity z Wikidat (např. druhý „Karlštejn“ Q1505765 jako zámek ze 70. let 18. stol.) - vyřadit přes overrides.

## Priorita 3 - web

- [x] Podklad „Krajina + města“ (výchozí: lesy, reliéf, řeky + hranice a města) a „Jen města“, multi-výběr rodů jako chipy + reset, náhled při najetí myší, přidávání návštěv v rozhraní.
- [x] Filtr návštěv: místo matoucího „jen nenavštívené“ výběr všechny / jen navštívené / jen nenavštívené, pokrytý E2E testem.
- [x] Návštěvy pro každého návštěvníka zvlášť: prázdný start, prohlížeč / připojený soubor / `serve.py`, export a import (viz níže a README).
- [x] Náhledy fotek při najetí myší jako lokální miniatury (`scripts/fetch_thumbs.py` -> `data/thumbs/<QID>.webp`, ~14 kB, autor a licence do `data/build/thumbs.json`, zobrazují se jako popisek fotky). Náhledy z Commons používají jen standardní šířky (jiné Commons od 2026 odmítá).

- [ ] Nasazení na GitHub Pages (vytvořit repo, push - na tvoje schválení). Předtím:
  - první commit (zkontrolovat, že `data/visited.json`, `.venv/`, `.claude/` a `aa/` nejsou v commitu - jsou v `.gitignore`),
  - zaregistrovat doménu na stadiamaps.com (zdarma), jinak se na webu nezobrazí terén výchozího podkladu,
  - na Mapy.com klíč (pokud se použije) omezit na doménu Pages,
  - po nasazení projít web na mobilu (Safari = jen prohlížeč + export / import).
- [ ] Zvýraznit hrad vybraný přes hledání (i kliknutím): teď po přiblížení na mapě splývá s okolními značkami - vybraná značka má jen slabý stín (`.mk.sel` v `app/style.css`). Např. větší značka + výrazný kroužek / pulzování na pár sekund, nahoru nad ostatní (z-index).
- [ ] Tabulkové zobrazení vlastníků v detailu (přístupnost - barvy ve stroji času rozliší barvoslepý jen omezeně; teď pomáhá jen zvýraznění rodu a tooltip).
- [ ] Volitelně: statistiky navštíveného (po krajích, typech, rodech).
- [ ] Volitelně: podklad Mapy.com - připraveno, stačí vložit API klíč do `app/config.js` (viz níže).
- [ ] Volitelně: rozšířit E2E test o kontrolu obsahu (nyní jen smoke test + screenshoty).

## API klíč

CARTO (původní světlý podklad) nově vyžaduje API klíč a bez něj ukazuje vodoznak - nahrazen podklady OpenStreetMap a OpenTopoMap, které klíč nepotřebují. Klíč je potřeba jen pro volitelný podklad Mapy.com (vložit do `MAPY_API_KEY` v `app/config.js`, pak se v přepínači vrstev objeví „Mapy.com turistická“ a „Mapy.com základní“):

- zdarma na <https://developer.mapy.com> (přihlášení Seznam účtem -> My Account -> nový projekt, klíč se vytvoří automaticky),
- tarif Basic: 250 000 kreditů měsíčně zdarma (1 dlaždice = 1 kredit), bez souhlasu se nic neúčtuje,
- ve statickém webu je klíč veřejně vidět - v nastavení klíče omezit na doménu (localhost / GitHub Pages).

## Návštěvy pro více uživatelů

Hotovo (2026-09-27): veřejný web začíná prázdný, návštěvy jsou v prohlížeči nebo v souboru připojeném přes File System Access API (Chromium), export / import JSON všude; `data/visited.json` jen přes lokální `serve.py`. Popis v README (Navštívená místa).

- [ ] Volitelně později, pokud to bude používat víc lidí napříč zařízeními i ve Firefoxu / Safari: hostovaný backend (Supabase / Firebase) s přihlášením; stávající režimy nechat jako variantu bez účtu. Ověřit aktuální limity bezplatných tarifů a GDPR (ukládání e-mailů).
- [ ] Import neumí přenést smazání návštěv (slučuje) - případně přidat volbu „nahradit vše“.
