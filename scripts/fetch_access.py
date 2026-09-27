"""Download sources that say which castles are open to visitors -> data/raw/access_sources.json.

- NPÚ: cs.wiki "Seznam památkových objektů ve správě Národního památkového ústavu" (all open with tours)
- NIPOS: official statistics of monuments open for admission, per kraj xlsx (data/raw/nipos/*.xlsx)
- OSM: historic=castle/manor/ruins via Overpass, tags hinting at opening (opening_hours, fee, tourism, access)
"""
import re

import openpyxl

from common import RAW, get, save, session

NIPOS_YEAR = 25  # file suffix of the latest NIPOS release (2025 data)
NIPOS_KRAJE = {
    "Praha": "Hlavní město Praha", "Stredocesky": "Středočeský kraj", "Jihocesky": "Jihočeský kraj",
    "Plzensky": "Plzeňský kraj", "Karlovarsky": "Karlovarský kraj", "Ustecky": "Ústecký kraj",
    "Liberecky": "Liberecký kraj", "Kralovehradecky": "Královéhradecký kraj", "Pardubicky": "Pardubický kraj",
    "Vysocina": "Kraj Vysočina", "Jihomoravsky": "Jihomoravský kraj", "Olomoucky-": "Olomoucký kraj",
    "Zlinsky": "Zlínský kraj", "Moravskoslezsky": "Moravskoslezský kraj",
}
NIPOS_URL = "https://www.statistikakultury.cz/wp-content/uploads/2026/08/{}_{}%d.xlsx" % NIPOS_YEAR
# file key differences between the two releases (monuments "pam", museums "muz")
NIPOS_FILE_KEY = {("Olomoucky-", "muz"): "Olomoucky"}

OVERPASS = """
[out:json][timeout:180];
area["ISO3166-1"="CZ"][admin_level=2]->.cz;
(
  nwr["historic"~"^(castle|manor|palace)$"](area.cz);
  nwr["historic"="ruins"]["ruins"~"castle"](area.cz);
);
out tags center;
"""


def wiki_raw(title):
    return get("https://cs.wikipedia.org/w/index.php", params={"title": title, "action": "raw"}).text


def titles_to_qids(titles):
    out = {}
    titles = list(titles)
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        r = get("https://cs.wikipedia.org/w/api.php", params={
            "action": "query", "titles": "|".join(chunk), "prop": "pageprops", "ppprop": "wikibase_item",
            "redirects": 1, "format": "json"}).json()["query"]
        alias = {t: t for t in chunk}
        for n in r.get("normalized", []):
            alias[n["from"]] = n["to"]
        redirects = {x["from"]: x["to"] for x in r.get("redirects", [])}
        by_title = {p["title"]: p.get("pageprops", {}).get("wikibase_item") for p in r["pages"].values()}
        for t in chunk:
            tt = alias[t]
            tt = redirects.get(tt, tt)
            out[t] = by_title.get(tt)
    return out


def fetch_npu():
    text = wiki_raw("Seznam památkových objektů ve správě Národního památkového ústavu")
    rows = []
    for block in text.split("\n|-")[1:]:
        cells = [c.strip() for c in block.split("\n|") if c.strip()]
        links = [c for c in cells if c.startswith("[[") and not c.startswith("[[Soubor")]
        if len(links) < 1:
            continue
        m = re.match(r"\[\[([^\]|]+)(?:\|([^\]]+))?\]\]", links[0])
        idx = cells.index(links[0])
        rows.append({"title": m.group(1), "name": m.group(2) or m.group(1),
                     "kind": cells[idx + 1] if idx + 1 < len(cells) else None})
    qids = titles_to_qids(r["title"] for r in rows)
    for r in rows:
        r["qid"] = qids.get(r["title"])
    return rows


def fetch_nipos(kind="pam"):
    """kind 'pam' = monuments open for admission, 'muz' = museums incl. branches (castles run by museums)."""
    folder = RAW / "nipos"
    folder.mkdir(parents=True, exist_ok=True)
    rows = []
    for key, kraj in NIPOS_KRAJE.items():
        fkey = NIPOS_FILE_KEY.get((key, kind), key)
        path = folder / f"{fkey}_{kind}{NIPOS_YEAR}.xlsx"
        if not path.exists():
            path.write_bytes(get(NIPOS_URL.format(fkey, kind)).content)
        ws = openpyxl.load_workbook(path, data_only=True).active
        years = None
        parent = None  # museum files: branches follow their museum
        for row in ws.iter_rows(values_only=True):
            if kind == "muz":
                r = museum_row(row, kraj, parent)
                if r:
                    parent = r["parent"] or r["name"]
                    rows.append(r)
                continue
            name, web, *visits = row[:5]
            if name == "Název":
                years = visits
                continue
            if years is None or not name or str(name).startswith("Celkem"):
                continue
            v = {str(y): (x if isinstance(x, int) else None) for y, x in zip(years, visits)}
            rows.append({"name": str(name).strip(), "website": web, "kraj": kraj, "visitors": v})
    return rows


def museum_row(row, kraj, parent):
    """Museum files: (name | 'Pobočka', branch name, website, visits 2025, visits 2024, ...)."""
    name, branch, web, v25, v24 = (list(row) + [None] * 5)[:5]
    if not name or name == "Název" or str(name).startswith("Celkem") or not isinstance(name, str):
        return None
    if v25 is None and v24 is None and not web and name != "Pobočka":
        return None  # header / note lines
    visits = {"2025": v25 if isinstance(v25, int) else None, "2024": v24 if isinstance(v24, int) else None}
    if name.strip() == "Pobočka":
        return {"name": str(branch or "").strip(), "website": None, "kraj": kraj, "visitors": visits, "parent": parent}
    return {"name": name.strip(), "website": (web or "").strip() or None, "kraj": kraj, "visitors": visits, "parent": None}


def fetch_osm():
    r = session.post("https://overpass-api.de/api/interpreter", data={"data": OVERPASS}, timeout=300)
    r.raise_for_status()
    keep = ("name", "wikidata", "historic", "castle_type", "ruins", "opening_hours", "fee", "tourism",
            "access", "website", "charge")
    out = []
    for e in r.json()["elements"]:
        t = e.get("tags", {})
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        out.append({"osm": f"{e['type']}/{e['id']}", "lat": c["lat"], "lon": c["lon"],
                    **{k: t[k] for k in keep if k in t}})
    return out


def main():
    npu = fetch_npu()
    nipos = fetch_nipos("pam")
    museums = fetch_nipos("muz")
    osm = fetch_osm()
    save(RAW / "access_sources.json", {"npu": npu, "nipos": nipos, "museums": museums, "osm": osm})
    print(f"NPÚ {len(npu)} ({sum(1 for r in npu if r['qid'])} with QID), NIPOS {len(nipos)}, museums {len(museums)}, OSM {len(osm)}")


if __name__ == "__main__":
    main()
