# TODO

Stav k 2026-09-27: fáze 1 hotová, fáze 2 rozjetá (mapa 2236 objektů, historie vlastníků 209 objektů, 559 rodů). Web je připravený na veřejné nasazení (prázdná mapa pro každého, vlastní úložiště návštěv, lokální náhledy fotek).

## Priorita 1 - ověřit a doplnit základ

- [ ] Otevřít web v normálním prohlížeči a zkontrolovat podklady OpenStreetMap / OpenTopoMap a fotku v detailu (Wikimedia Commons) - v sandboxu se nenačítaly, ověřené je jen rozvržení. Náhledy při najetí myší jsou nově lokální (`data/thumbs/`).
- [ ] Ručně vyzkoušet připojený soubor návštěv v Chrome / Edge (Vytvořit soubor…, uložit návštěvu, restart prohlížeče, Povolit zápis) - E2E test to ověřuje jen s náhradou souborového dialogu.
- [ ] Doplnit datum, hodnocení a poznámku k 5 navštíveným - v detailu místa (sekce Návštěva), web spusť přes `python3 scripts/serve.py` (zapisuje do `data/visited.json`, který je v `.gitignore`).
- [x] Dark mode: značky měly tmavé barvy na světlé mapě - opraveno (značky mají pevnou světlou paletu), ověřeno screenshotem.

## Priorita 2 - data

- [ ] **Fáze 2 historie**: zbývá 86 zpřístupněných objektů bez `data/history/<QID>.json` (hotovo 160 nejnavštěvovanějších v dávkách 1-16, 2026-09-27). Jedna dávka = 10 objektů, 2 agenti Sonnet po 5, cca 200k tokenů, ~12 min. Postup, pravidla a šablona zadání v [docs/history-batches.md](docs/history-batches.md); seznam další dávky vypíše `scripts/next_history_batch.py`. Počet dávek odsouhlasit předem. 5 objektů nemá článek na cs.wiki (Neustupov, Orlice, Chuchelná, Dolní Životice, Dubová) - jiný zdroj.
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
  - Jemniště - roky Rottenhan / Chotek / Buquoy chybí, konfiskace ~1953; Týnec - po 1927 sloučeno se starým zámkem, restituent po 1989 neuveden; Houska - jméno princezny Hohenlohe neuvedeno, přechod na stát 1945-1950 přibližně.
  - Vizovice - roky Anny ze Žerotína, Tetoura a Löwenthurnova regentství přibližné; Vimperk - přechod město -> Správa NP Šumava bez roku; Mnichovo Hradiště - 1250-1550 `neznamo` (zástavní držitelé); Uherčice - Collaltové 1768-1945 v jednom záznamu.
  - Albrecht z Kolovrat veden jednou jako `kolovratove`, jednou jako `kolowrat-krakowsti` (větev) - sjednotit spolu s větvemi rodů.
  - Nové Hrady (Ústí n. O.) - mezera mezi Kostky z Postupic (~1450) a Chamaré (1750), restituce Bartoňům ~1990, prodej Bergerovi 1903 vs. 1904; Plumlov - koupě Lichtenštejny kladena k požáru 1586.
  - Rychmburk (34 vlastníků) - mezera 1644-1650 u Berků; Choustník - přechod Voračičtí (do 1838) -> Rohanové nedoložen; `homutove-z-harasova` je jiný rod než `hrzanove-z-harasova`.
  - Hrubý Rohozec - vlastník `stat`, restituce Des Fours Walderode (Kammerlanderová) sporná, čeká na Ústavní soud - ověřit aktuální stav.
  - Fryštát - roky raných Piastovců odhadnuté; Žampach z Potštejna veden jako `z-potstejna` (jiný rod než `pani-z-potstejna-a-litic`?); Helfenburk - nabytí státem 1928 bez způsobu.
  - Náměšť n. O. - sňatek Žerotín / Lomnice a předání Verda -> Enkenvoirt bez přesného roku; Potštejn (25 vlastníků) - přechod Harbuval Chamaré -> Dobřenští nedoložen, rané zástavy přibližně.
  - Hasištejn - založení ~1324, konec Martiniců a Karschů bez roku, přechod na obec Místo neznámý; Krásný Dvůr - zakladatel Václav Pětipeský sporný (Sedláček ho neuvádí), prodej Údrčtí -> Michna bez roku, znárodnění Černínů ~1945.
  - Litice - držba Pušů 1309-1310 jen dedukce ze zdroje; Manětín - konfiskace Šlikům -> Hrobčičtí jen „krátce“ (1544-1560); Valeč - založení ~1450, počátek Kyšperských z Vřesovic ~1500.
  - Moravská Třebová - přechod Kunštátové -> Jiří z Poděbrad a stát -> město bez roku; Rotštejn a Valečov - po 15. stol. vlastníci nedoloženi (`neznamo`), Valečov: přechod Valdštejnové -> obec Boseň 1994 bez předchozího vlastníka.
  - Březnice - koruna / Lokšanové 1547-1558 odhadnuté; Kozí hrádek - roky prvních tří držitelů před 1406 odhadnuté (`z-ujezda` = Vilém z Újezda, jiný rod než `jeniskove-z-ujezda`).
  - Benešov n. Pl. - přechod Aldringenové -> Clary-Aldringenové ~1750, Horní a Dolní zámek sloučeny do jedné osy; Bučovice - konec Boskoviců 1597 a přechod na stát 1945 agent doplnil „z obecné historie“, ne z článku - ověřit; Tovačov - přechody Salmové / Petřvaldští odhadnuté.
  - Hořovice - generace Bruntálských z Vrbna 1705-1848 odhadnuté; Zvířetice - 1610-1623 Vratislav z Mitrovic / Vlk z Kvítkova odhadnuto, po Valdštejnech (18.-20. stol.) nic; Žirovnice - několik mezidat odhadnutých.
  - Brumov - konec Meziříčských (1620) a prodej Illésházyů (1848) odhadnuté, vlastník zříceniny po Dreherovi neuveden; Krašov - vlastník po zrušení náboženského fondu nejasný; Svitákové z Landštejna vedeni jako `z-landstejna` (jiný rod než `landstejnove`?).
  - Kunštát - přechod Lambergové -> Coudenhove-Honrichs ~1903; Červená Řečice - počátek biskupské držby (~1100), znárodnění a dnešní soukromý majitel bez let; Uherský Ostroh - kníže Fridrich 1439-1446 jako `neznamo`; Doudleby - restituce ~1990, přechod na Barboru Tomáškovou bez roku.
  - Bystřice p. H. - konec Rottalů ~1780 a prodej Loudonů státu ~1935 odhadnuté; Nový hrad (Jimlín) - smrt Kristiána Viléma Hohenzollerna / prodej dědici jen rozmezím; Šluknov - konfiskace Staršedlovi datovaná 1618 (dle zdroje), Nostic-Rieneck ~1930.
  - Nebílovy - prodej Vrtbové -> Černínové ~1715; Chanovice - roky uvnitř rodu Chanovských 1542-1717 jen pořadím, Becherové -> stát / obec 1948 a 1990 odhadnuté.
  - Bechyně - přechod Rožmberkové -> Kunštátové ~1340 odhadnutý, prodej Paarů společnosti APS bez roku; Lipý - nabytí Kounici, emigrace Altschula / Müllera ~1938, roky Harrachů; Svijany - mezera 1814-1820 před Rohany; Dobrohoř - roky Herbersteinů a Sternbachů chybí (zdroj stručný).
  - Červený Újezd - jen novostavba Pavla Orny (2001-2002); historický zámek Žďárských ze Žďáru ve stejném článku záměrně vynechán - případně samostatný objekt.
  - Stránov - mezidobí 1468-1545 a konce Biberštejnů / Slavatů bez let; Linhartovy - mezera 1566-1578; Choltice - přestávka Thunů 1719-1731; Poláky - Strojetičtí / Warmsbach / Questenberkové 1662-1738 nerozlišeni; Slezské Rudoltice - léta Steuer / Brücker a přechod 1945 chybí.
  - Jindřich z Lipé veden jednou jako `pani-z-lipe`, jednou jako `ronovci` (větev) - sjednotit s větvemi rodů.
  - Chyše - mezera 1365-1397 (žlutické panství) vynechána, přechody Griselda ze Švamberka / Berka z Dubé bez let; Bor - Švamberkové 1533-1650 bez jmenovaného držitele; Holešov - prodej Lobkovicové -> Rottalové 1650 vs. 1651 (rozpor v článku).
  - Hofmannové z Grünbühelu sjednoceni na `hofmannove` (dříve `z-grunbuchlu`, Grabštejn, Starý Jičín, Janovice).
  - Rýzmberk - držba 1622-1676 (Habsburkové, Kracové, Colonnové z Felsu, Černínové) bez přesných let, KČT Kdyně 1908-90. léta odvozeno; Zelená Hora - prodej Auerspergem Plavcovým 1852-1931, přechod na stát po Karlu Blažkovi.
  - Tachov (23 vlastníků) - krátké zástavy sloučené; Šelmberk - větev pánů z Dubé u Petra Mrackého neurčena, 1620-1820 chybí; Červené Poříčí - vlastníci 1400-1550 nejmenovaní.
  - Jenštejn (21 vlastníků) - drobní držitelé 15.-16. stol. jen přibližně, vlastník 1568-1608 neuveden, nabytí obcí bez roku; Aleš Škopek z Dubé veden jako `z-dube` (větev pánů z Dubé?).
  - Letovice - nástup Kálnokyů 1820 zdroj sám značí [zdroj?], restituce ~1990; Pátek - prodej Ditrichštejnům 1676 vs. 1679 (Sedláček / Anděl), použit Anděl; Miroslav - „hrabata z Náchoda“ 1621-1661 jako `neznamo`; Hošťálkovy - převod stát -> Spolek Renesance 2006-2015.
  - Chropyně - Hanuš Haugvic z Biskupic možná jen stavebník, ne vlastník; Osečany (22 vlastníků) - Tiegel von Lindenkron / Pulpán von Feldstein možná tatáž osoba, prodej 1928 vs. 1931 rozporný; Aichelburg - vlastnictví 1883-1996 nezmíněno; Růžkovy Lhotice - JZD vedeno jako `stat`.
  - Kámen (27 vlastníků) - mezera 1872-1916 bez majitele, převod na Kraj Vysočina ~2001; Hartenštejn - po 1609 vlastník neuveden, hasištejnská větev jako `lobkovicove`; Maleč - léta Beneda z Nečtin a Schönfeldů chybí, předání Macháčkové-Riegerové synovi bez roku.
  - Brtnice - současné vlastnictví sporné (SBD Svébyt v likvidaci vs. Nadace Svébyt); Jílové - konfiskace 1945 a předání městu bez let.
  - Paskov (26 vlastníků) - lenní držitelé biskupství 1267-1530 bez let; Vartenberk - Lichtenštejnové / Hartigové / Valdštejn 1563-1645 bez let; Poběžovice - léta Matyáše z Vunšic a Königsfeldů chybí; Skalka - přechod Schönbornů na stát po 1945 bez roku.
  - Rokytnice v O. h. - zdroj nezmiňuje konec Nosticů ani majitele ve 20.-21. stol. (poslední záznam otevřený) - doplnit z jiného zdroje; `z-rysmburka` je jiný rod než páni z Rýzmburka.
  - Colonnové z Felsu sjednoceni na `colonnove-z-felsu` (dříve `z-felsu` u Rýzmberku).
  - Bartošovice - převzetí Hugem Meinertem a Czeczowiczkovými bez roku, dcera Josefína (Taaffe vs. Canal) nejednoznačná; Blansko (zámek) - biskupská držba 12.-16. stol. jen rámcově; Bruntál - stavebník hradu a nabytí pány z Vrbna neuvedeny; Chotěboř - roky Kinských, Brachfelda a Vančurů chybí.
  - Blansko (hrad) - mezera 1407-1416, přechod Thunové -> stát -> obec Ryjice bez let; Bolatice - nabytí Lichnovskými neznámé; Budyně n. O. - léta Bernarda z Kamence a Griffiny Haličské neznámá (agent je doplnil odhadem, vráceno na null); Chebský hrad - připojení Chebska ~1322; Cimburk (Trnávka) - Lichtenštejnové -> obec bez roku.
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
- [x] Návštěvy pro každého návštěvníka zvlášť: prázdný start, prohlížeč / připojený soubor / `serve.py`, export a import (viz níže a docs/DEVELOPMENT.md).
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

Hotovo (2026-09-27): veřejný web začíná prázdný, návštěvy jsou v prohlížeči nebo v souboru připojeném přes File System Access API (Chromium), export / import JSON všude; `data/visited.json` jen přes lokální `serve.py`. Popis v docs/DEVELOPMENT.md (Navštívená místa).

- [ ] Volitelně později, pokud to bude používat víc lidí napříč zařízeními i ve Firefoxu / Safari: hostovaný backend (Supabase / Firebase) s přihlášením; stávající režimy nechat jako variantu bez účtu. Ověřit aktuální limity bezplatných tarifů a GDPR (ukládání e-mailů).
- [ ] Import neumí přenést smazání návštěv (slučuje) - případně přidat volbu „nahradit vše“.
