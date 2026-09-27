# Datové soubory

| Soubor | Vzniká | Obsah |
|---|---|---|
| `raw/wikidata.json` | `scripts/fetch_wikidata.py` | surová data z Wikidata |
| `raw/access_sources.json`, `raw/nipos/*.xlsx` | `scripts/fetch_access.py` | NPÚ seznam, NIPOS statistika návštěvnosti, OSM |
| `overrides.json` | ručně | ruční opravy párování a polí míst |
| `places.json` | `scripts/build_places.py` | všechna místa pro mapu |
| `history/<QID>.json` | ručně / agent (z cs.wiki) | historie vlastníků jednoho místa |
| `families/<id>.json` | ručně / agent | detail rodu (erb, popis, původ) |
| `visited.json` | `serve.py` / ručně | tvoje navštívená místa (jen lokálně, v `.gitignore`) |
| `build/history.json`, `build/families.json` | `scripts/build_history.py` | agregace pro web (historie, rody, vazby) |
| `thumbs/<QID>.webp`, `build/thumbs.json` | `scripts/fetch_thumbs.py` | miniatura fotky pro náhled (360x195) a `{QID: {file, artist, license, license_url}}` pro popisek fotky |

## places.json - položka

`id` (Wikidata QID), `name`, `kind` (`hrad` / `zamek` / `hradozamek` / `zricenina`), `lat`, `lon`, `kraj`, `obec`,
`founded` (rok nebo null), `founded_text` (např. „13. stol.“), `access` (`vstupne` / `volne` / `neznamo`),
`access_sources` (`npu`, `nipos`, `osm`), `manager`, `website`, `cswiki`, `image` (soubor na Commons),
`visitors` (NIPOS, podle roku), `nkp`, `unesco`.

## history/&lt;QID&gt;.json

```json
{
  "id": "Q1701829",
  "name": "Karlova Koruna",
  "founded": {"year": 1721, "approx": false, "text": "1721-1723 stavba barokního zámku"},
  "summary": "2-4 věty česky o historii objektu.",
  "owners": [
    {"owner": "kinsti", "owner_wiki": "Kinští", "person": "Václav Vchynský z Vchynic", "from": 1611, "to": 1948,
     "from_approx": true, "to_approx": false, "how": "koupe", "note": "volitelná poznámka"}
  ],
  "events": [{"year": 1723, "text": "dokončení stavby podle Santiniho"}],
  "sources": ["https://cs.wikipedia.org/wiki/Karlova_Koruna"]
}
```

- `owners` jsou chronologicky. `owner` je id rodu nebo instituce (viz níže). `to` je rok konce, pro současného vlastníka `null`.
- Zná-li zdroj jen pořadí vlastníků, nech neznámé `from`/`to` jako `null`; `build_history.py` je rovnoměrně dopočítá mezi známými roky a označí jako přibližné.
- `how` = způsob nabytí: `zalozeni`, `koupe`, `dedictvi`, `snatek`, `dar`, `lenni` (udělení panovníkem, zástava), `konfiskace` (i po Bílé hoře, 1945, 1948), `vymena`, `restituce`, `jine`, `neznamo`.
- `from_approx` / `to_approx` = letopočet je přibližný („kolem 1300“, „poč. 14. stol.“ -> rok 1300/1310 + approx).
- Spoluvlastnictví / dělení = dva záznamy s překrývajícím se obdobím.

## Id vlastníků

- Šlechtické rody: id = název článku o rodu na cs.wiki (po vyřešení přesměrování) bez diakritiky, malými písmeny, mezery a interpunkce -> `-`. Např. `Pernštejnové` -> `pernstejnove`, `Páni z Hradce` -> `pani-z-hradce`, `Kinští` -> `kinsti`. Do záznamu vlastníka patří i `owner_wiki` (přesný název článku). Rod bez článku: `z-<predikat>` (např. `z-miletinka`), případně slug jména rodu (např. `mniszkove`), `owner_wiki` null. `scripts/fetch_families.py` odmítne `owner_wiki` bez článku a přesměrování sám přepíše na cílový článek.
- Zvláštní vlastníci (instituce): `koruna` (panovník / královská komora, zeměpanský majetek), `stat` (Československo / ČR po 1918, včetně NPÚ), `cirkev` (biskupství, kláštery, řády - upřesni v `note`), `mesto` (obec / město / kraj - upřesni v `note`), `soukromnik` (nešlechtická osoba nebo firma - jméno do `person`), `neznamo`.

## families/&lt;id&gt;.json

```json
{
  "id": "pernstejnove",
  "name": "Pernštejnové",
  "type": "rod",
  "wikidata": "Q...",
  "cswiki": "https://cs.wikipedia.org/wiki/Pernštejnové",
  "coat_of_arms": "Soubor na Commons.svg",
  "origin": "Morava",
  "period": "13. stol. - 1631",
  "summary": "2-4 věty česky.",
  "related": [{"family": "lobkowiczove", "relation": "dědictví sňatkem Polyxeny z Pernštejna (1603)"}]
}
```

## visited.json

```json
[{"id": "Q1701829", "name": "Karlova Koruna", "date": null, "rating": null, "note": ""}]
```

`id` je QID z `places.json`, `name` jen pro čitelnost. `date` ve formátu `YYYY-MM-DD` nebo `YYYY`, `rating` 1-5. Stejný formát má export / import návštěv a soubor připojený v prohlížeči (`app/visits.js`).
