"""Seznam věcí k ruční kontrole -> docs/rucni-kontrola.md (generuje se z dat, po opravě dat zmizí).

Tři části: historie vlastníků (mezery, neznámé a přibližné roky, rozpory v poznámkách), rody (bez erbu,
bez článku na cs.wiki) a místa bez fotografie. U každé položky jsou odkazy, kde hledat dál.
Spuštění: python3 scripts/build_manual_review.py
"""
import json
import re
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "rucni-kontrola.md"

NOTE_FLAG = re.compile(r"rozpor|\bx\b|\bvs\.|nezn[aá]m|nezjišt|nepotvrz|neověř|odvozen|bez roku|žádný zdroj", re.I)


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def visitors(place):
    v = place.get("visitors") or {}
    for year in sorted(v, reverse=True):
        if v[year]:
            return v[year]
    return 0


def search(q):
    return f"https://duckduckgo.com/?q={quote(q)}"


def place_links(p):
    links = [f"[Wikidata](https://www.wikidata.org/wiki/{p['id']})"]
    if p.get("cswiki"):
        links.append(f"[cs.wiki]({p['cswiki']})")
    if p.get("website"):
        links.append(f"[web]({p['website']})")
    name = p["name"].split(" (")[0]
    links.append(f"[hledat majitele]({search(f'{name} {p.get('obec') or ''} majitelé historie zámek hrad')})")
    return ", ".join(links)


def history_issues(h):
    """Vrátí seznam textových problémů jednoho souboru history."""
    owners = h.get("owners") or []
    out = []
    for i, o in enumerate(owners):
        who = o.get("person") or o.get("owner")
        who = (who[:60] + "...") if who and len(who) > 60 else who
        span = f"{o.get('from') if o.get('from') is not None else '?'}-{o.get('to') if o.get('to') is not None else '?'}"
        flags = []
        if o.get("owner") == "neznamo":
            flags.append("neznámý vlastník")
        if o.get("from") is None and i > 0:
            flags.append("chybí začátek")
        if o.get("to") is None and i < len(owners) - 1:
            flags.append("chybí konec")
        if o.get("from_approx") or o.get("to_approx"):
            flags.append("přibližný rok")
        note = o.get("note") or ""
        if NOTE_FLAG.search(note):
            flags.append("poznámka uvádí nejistotu")
        # samotný přibližný rok je u středověku běžný, nejistotou je až s dalším důvodem
        if flags and flags != ["přibližný rok"]:
            out.append(f"{span} {who}: {', '.join(flags)}")
    return out


def history_section(places):
    rows = []
    for p in places:
        path = DATA / "history" / f"{p['id']}.json"
        if not path.exists():
            continue
        h = load(path)
        issues = history_issues(h)
        if issues:
            rows.append((visitors(p), p, h, issues))
    rows.sort(key=lambda r: (-r[0], r[1]["name"]))
    lines = [
        "## 1. Historie vlastníků",
        "",
        f"{len(rows)} míst s nejistotou (neznámý vlastník, chybějící rok, rozpor nebo nejistota v poznámce; samotné přibližné roky se nepočítají). "
        "Seřazeno podle návštěvnosti NIPOS (poslední rok s údajem). Plné rozpory jsou v poznámkách u jednotlivých "
        "záznamů v `data/history/<QID>.json`, souhrn po vlnách ověřování v `TODO.md`. "
        "Po doplnění dat spusť `scripts/build_history.py` a tento soubor znovu vygeneruj.",
        "",
    ]
    for v, p, h, issues in rows:
        lines.append(f"### {p['name']} ({p.get('obec') or p.get('kraj') or ''}) - {v} návštěv, `{p['id']}`")
        lines.append("")
        lines.append(f"Odkazy: {place_links(p)}. Zdrojů v datech: {len(h.get('sources') or [])}.")
        lines.append("")
        for line in issues[:8]:
            lines.append(f"- [ ] {line}")
        if len(issues) > 8:
            lines.append(f"- ... a dalších {len(issues) - 8}")
        lines.append("")
    return lines


def family_section(places):
    fams = [load(f) for f in sorted((DATA / "families").glob("*.json"))]
    usage = defaultdict(set)
    names = {p["id"]: p["name"] for p in places}
    for f in (DATA / "history").glob("*.json"):
        h = load(f)
        for o in h.get("owners") or []:
            usage[o.get("owner")].add(h["id"])

    with_article_no_coat = [f for f in fams if f.get("cswiki") and not f.get("coat_of_arms")]
    no_article = [f for f in fams if not f.get("cswiki")]
    lines = [
        "## 2. Rody",
        "",
        f"Rodů celkem {len(fams)}: bez erbu {sum(1 for f in fams if not f.get('coat_of_arms'))}, "
        f"bez článku na cs.wiki {len(no_article)} (ty nemají ani popis ani erb).",
        "",
        f"### 2a. Rod má článek na cs.wiki, ale chybí erb ({len(with_article_no_coat)})",
        "",
        "Erb doplň ručně: najdi soubor na Wikimedia Commons a název souboru zapiš do `coat_of_arms` v "
        "`data/families/<id>.json` (nebo doplň obrázek do Wikidat a spusť `fetch_families.py`).",
        "",
        "| Rod | Míst | Odkazy |",
        "|---|---|---|",
    ]
    for f in sorted(with_article_no_coat, key=lambda f: (-len(usage[f["id"]]), f["name"])):
        q = f"erb {f['name']}"
        links = [f"[cs.wiki]({f['cswiki']})"]
        if f.get("wikidata"):
            links.append(f"[Wikidata](https://www.wikidata.org/wiki/{f['wikidata']})")
        links.append(f"[Commons](https://commons.wikimedia.org/w/index.php?search={quote(q)}&ns6=1)")
        lines.append(f"| {f['name']} (`{f['id']}`) | {len(usage[f['id']])} | {', '.join(links)} |")
    lines += [
        "",
        f"### 2b. Rod bez článku na cs.wiki ({len(no_article)})",
        "",
        "Zkus najít, zda nepatří k existujícímu rodu (větev), případně popis a erb v jiných zdrojích "
        "(Historická šlechta, Wikipedie v jiných jazycích, Ottův slovník). Řazeno podle počtu míst, kde rod figuruje.",
        "",
        "| Rod | Míst | Kde | Hledat |",
        "|---|---|---|---|",
    ]
    for f in sorted(no_article, key=lambda f: (-len(usage[f["id"]]), f["id"])):
        used = sorted(usage[f["id"]])
        where = ", ".join(names.get(q, q) for q in used[:3]) + (f" (+{len(used) - 3})" if len(used) > 3 else "")
        label = f["name"] if f["name"] != f["id"] else f["id"].replace("-", " ")
        link = f"[hledat]({search(f'{label} šlechtický rod erb')})"
        lines.append(f"| `{f['id']}` | {len(used)} | {where or '-'} | {link} |")
    lines.append("")
    return lines


def photo_section(places):
    missing = [p for p in places if not p.get("image")]
    by_kraj = defaultdict(list)
    for p in missing:
        by_kraj[p.get("kraj") or "bez kraje"].append(p)
    lines = [
        "## 3. Místa bez fotografie",
        "",
        f"{len(missing)} z {len(places)} míst nemá ve Wikidatech obrázek (P18), proto nemají fotku v detailu ani "
        "miniaturu. Fotku přidáš nahráním na Wikimedia Commons a doplněním P18 do položky na Wikidatech; "
        "pak `fetch_wikidata.py`, `build_places.py`, `fetch_thumbs.py`.",
        "",
    ]
    for kraj in sorted(by_kraj):
        items = sorted(by_kraj[kraj], key=lambda p: (-visitors(p), p["name"]))
        lines += [f"### {kraj} ({len(items)})", "", "| Místo | Typ | Obec | Přístup | Odkazy |", "|---|---|---|---|---|"]
        for p in items:
            name = p["name"].split(" (")[0]
            commons = f"https://commons.wikimedia.org/w/index.php?search={quote(f'{name} {p.get('obec') or ''}')}&ns6=1&ns14=1"
            links = [f"[Wikidata](https://www.wikidata.org/wiki/{p['id']})"]
            if p.get("cswiki"):
                links.append(f"[cs.wiki]({p['cswiki']})")
            links.append(f"[Commons]({commons})")
            lines.append(f"| {p['name']} | {p.get('kind')} | {p.get('obec') or ''} | {p.get('access') or ''} | {', '.join(links)} |")
        lines.append("")
    return lines


def main():
    places = load(DATA / "places.json")
    lines = [
        "# Ruční kontrola",
        "",
        "Generováno skriptem `scripts/build_manual_review.py` z dat v `data/`. Obsahuje věci, které se automaticky "
        "(agenti, Wikidata, cs.wiki) nepodařilo dohledat nebo ověřit; u každé jsou odkazy, kde hledat dál. "
        "Po opravě dat a přegenerování položka zmizí.",
        "",
    ]
    lines += history_section(places)
    lines += family_section(places)
    lines += photo_section(places)
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)}: {len(lines)} řádků")


if __name__ == "__main__":
    main()
