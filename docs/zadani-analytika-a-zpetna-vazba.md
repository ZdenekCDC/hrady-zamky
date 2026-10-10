# Zadání: návštěvnost webu a zpětná vazba od uživatelů

Stav: **nápad, neimplementovat**. Před implementací je potřeba projít zadání otázkami (skill `grilling`) a rozhodnutí zapsat sem.

## Cíl

1. Vědět, kolik lidí web používá a co dělají (které funkce, která místa, jaká zařízení).
2. Dát návštěvníkům snadný způsob, jak poslat náměty na vylepšení a opravy údajů (přístupnost, data vzniku, majitelé, chybějící místa).

Web je statický na GitHub Pages (<https://zdenekcdc.github.io/hrady-zamky/>), bez vlastního backendu. Řešení musí být bez serveru, bez cookies a bez nutnosti účtu pro běžného návštěvníka.

## Výchozí návrh (k potvrzení)

### Návštěvnost

- Analytika bez cookies a bez osobních údajů: kandidáti GoatCounter, Plausible, Umami, Cloudflare Web Analytics. Vložení jedním `<script>` do `index.html`.
- Měřit zobrazení stránky, zemi a zařízení; volitelně vlastní události (otevřel detail místa, zapnul stroj času, použil filtr přístupnosti, exportoval návštěvy).
- Bez cookies a bez osobních údajů odpadá cookie lišta; GDPR ověřit u vybrané služby.

### Zpětná vazba

- Odkaz "Navrhni vylepšení / chybu" v patičce a tlačítko "Opravit údaj o tomto místě" v detailu místa s předvyplněným QID, názvem a odkazem na místo.
- Varianty: GitHub Issues (šablona předvyplněná z detailu; vyžaduje účet GitHub), nebo formulář bez účtu (Google Forms, Formspree a podobně) s volným textem a volitelným e-mailem.
- Opravy dat (přístupnost, rok vzniku) mohou jít do stejného kanálu a pak se zapisují do `data/overrides.json` a `data/founded.json` jako dnes.

## Otázky pro grilling (než se začne)

- Kdo jsou uživatelé a kolik jich čekáme (jen ty, rodina, veřejnost)? Má smysl vůbec cokoli měřit?
- Je přijatelná externí služba třetí strany, nebo má zůstat vše vlastní (self-host, vlastní počítadlo)?
- Co přesně chceme z návštěvnosti vědět a jaké rozhodnutí z toho plyne (např. kterým místům věnovat data)?
- Jaký kanál pro náměty: GitHub Issues (účet), formulář (e-mail, spam), nebo e-mail? Kdo to bude číst a třídit?
- Smí být ve formuláři e-mail a jak dlouho se uchovává (GDPR)?
- Má se zpětná vazba vázat na konkrétní místo (QID) a mají se opravy dat přijímat poloautomaticky?
- Čeho se bojíme (spam, zneužití, náklady při růstu, přísnější limity bezplatného tarifu)?
- Agent-native: dá se zpětná vazba a statistika číst i agentem (soubor, API), aby se z ní dalo pracovat bez ručního kopírování?
- Jak to souvisí s volitelným hostovaným backendem s přihlášením (viz `TODO.md`, sekce Návštěvy pro více uživatelů)?

## Před implementací ověřit

- Aktuální podmínky, limity bezplatného tarifu a cenu vybrané analytiky (nespoléhat na paměť, dohledat).
- Zda je daná služba v souladu s GDPR bez souhlasu a co uvádí o ukládání IP adres.
- Kam v UI tlačítko patří (patička, panel filtrů, detail místa) a jak se testuje v `tests/e2e.py`.
