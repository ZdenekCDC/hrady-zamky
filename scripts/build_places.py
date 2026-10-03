"""Merge Wikidata + access sources + manual overrides -> data/places.json.

Access levels:
  vstupne   - open for visitors with admission / tours (NPÚ, NIPOS statistics, OSM opening hints)
  volne     - freely accessible, typically castle ruins
  neznamo   - no evidence of public access (hidden layer in the map)
Manual corrections live in data/overrides.json (keyed by Wikidata QID).
"""
import re
import sys
from collections import Counter
from urllib.parse import unquote

from common import DATA, RAW, load, norm, save

RUIN_STATES = {"Q109607"}  # P5816 = ruins
KIND_FROM_NPU = {
    "Zámek": "zamek", "Hrad": "hrad", "Hrad a zámek": "hradozamek",
    "Klášter": "klaster", "Kostel": "kostel", "Usedlost": "usedlost", "Zdravotnické zařízení": "hospital",
    "Důlní dílo": "dul", "Vila": "vila", "Zámecký park": "areal", "Komplex zahrad": "zahrada",
}
CASTLE_KINDS = {"zamek", "hrad", "hradozamek", "zricenina"}
# Wikidata-only kinds, by precedence when an item has several types (castle types win over all of them)
OTHER_KINDS = ["tvrz", "pevnost", "klaster", "hospital", "hradby", "kostnice", "krypta"]


def domain(url):
    if not url:
        return None
    url = url.strip().lower()
    url = re.sub(r"^https?://", "", url)
    url = re.sub(r"^www\.", "", url)
    return url.split("/")[0] or None


def founded(item):
    """Year for year-or-better precision, century label for century precision, else None."""
    inc, prec = item["inception"], item["inception_precision"]
    m = re.match(r"^\+?(-?\d{1,4})", inc or "")
    if not m or prec is None or prec < 7:
        return None, None
    year = int(m.group(1))
    if prec >= 9:
        return year, str(year)
    century = (year - 1) // 100 + 1 if prec == 7 else None
    if prec == 8:
        return None, f"{year // 10 * 10}. léta"
    return None, f"{century}. stol."


_KIND_WORD = r"(?:zámecký areál|zřícenina hradu|hradozámek|zámeček|zámek|zřícenina|hrad|tvrz)"
PREFIX = re.compile(rf"^(státní |nový |starý )?{_KIND_WORD}(\s+a\s+{_KIND_WORD})?\s+", re.I)


def short_name(name):
    s = PREFIX.sub("", name)
    return s[:1].upper() + s[1:] if s else name


GENERIC_NAME = re.compile(r"(?i)^(kostnice|špitál|klášter|tvrz|hradby|hradba|opevnění|městské opevnění|městské hradby|pevnost|katakomby|krypta)$")


def display_name(name, kind, obec):
    """Castles drop the 'zámek' prefix; other kinds keep their full name, generic ones get the municipality."""
    if kind in CASTLE_KINDS or kind == "tvrz":
        return short_name(name)
    name = name[:1].upper() + name[1:]
    return f"{name} ({obec})" if GENERIC_NAME.match(name) and obec else name


def classify(item, npu_kind):
    types = set(item["types"])
    if npu_kind in ("Hrad", "Hrad a zámek") or (not types and npu_kind in KIND_FROM_NPU):
        return KIND_FROM_NPU[npu_kind]  # NPÚ "Hrad" = castle with roofed, visitable parts, even if Wikidata says ruin
    if not types & {"hrad", "zamek", "zricenina"}:
        if npu_kind in KIND_FROM_NPU:
            return KIND_FROM_NPU[npu_kind]
        for k in OTHER_KINDS:
            if k in types:
                return k
    if "zricenina" in types or RUIN_STATES & set(item["states"]):
        return "zricenina"
    if {"hrad", "zamek"} <= types:
        return "hradozamek"
    if "zamek" in types:
        return "zamek"
    return "hrad"


def match_nipos(rows, items, manual):
    """Match NIPOS rows (name, web, kraj) to Wikidata items. Returns {qid: row}, unmatched rows."""
    by_domain = {}
    for it in items:
        d = domain(it["website"])
        if d:
            by_domain.setdefault(d, []).append(it)
    matched, unmatched = {}, []
    for row in rows:
        if row["name"].startswith("Okres"):
            continue
        if row["name"] in manual:
            for q in manual[row["name"]]:
                matched[q] = row
            continue
        main, _, place = row["name"].partition(",")
        is_castle = re.search(r"(?i)hrad|zámek|zamek|zámeč|zřícenin|pevnost|tvrz|klášter|kostnice|katakomb|krypt|hospitál|opevnění", main)
        cands = by_domain.get(domain(row["website"]), []) if row["website"] else []
        if not cands and is_castle:
            key = norm(main)
            cands = [it for it in items if norm(it["name"]) == key and (it["kraj"] in (row["kraj"], None))]
            if len(cands) > 1 and place.strip():
                cands = [c for c in cands if norm(c["obec"] or "") == norm(place)] or cands
        if len(cands) >= 1 and is_castle or len(cands) == 1:
            best = cands[0]
            matched.setdefault(best["qid"], row)
        elif is_castle:
            unmatched.append(row)
    return matched, unmatched


CASTLE_IN_NAME = re.compile(r"(?i)\b(?:státní\s+)?(?:hrad a zámek|hrad|zámek|zámeček|zřícenina hradu|zřícenina)\s+([^,\-–(]+)")


def match_museums(rows, items):
    """Castles run by museums (not in the monuments statistics). Branches named 'Zámek X' match by name
    within the kraj; museum headquarters match when the castle's website is the museum's website.
    Returns {qid: (row, is_branch)}."""
    by_domain = {}
    for it in items:
        d = domain(it["website"])
        if d:
            by_domain.setdefault(d, []).append(it)
    out = {}
    for row in rows:
        m = CASTLE_IN_NAME.search(row["name"])
        if m:
            key = norm(m.group(1))
            cands = [it for it in items if key and norm(it["name"]) == key and it["kraj"] in (row["kraj"], None)]
            if len(cands) > 1:  # e.g. castle and chateau of the same name: the branch name says which
                want = {"hrad", "zricenina"} if re.search(r"(?i)\bhrad|zřícenin", m.group(0)) else {"zamek"}
                cands = [c for c in cands if want & set(c["types"])] or cands
            if len(cands) == 1:
                out.setdefault(cands[0]["qid"], (row, True))
                continue
        if row["website"] and not row.get("parent"):
            for it in by_domain.get(domain(row["website"]), []):
                out.setdefault(it["qid"], (row, False))
    return out


def osm_signals(osm):
    out = {}
    for e in osm:
        q = e.get("wikidata")
        if not q:
            continue
        s = out.setdefault(q, {"open": False, "closed": False})
        if e.get("opening_hours") or e.get("fee") == "yes" or e.get("tourism") in ("museum", "attraction"):
            s["open"] = True
        if e.get("access") in ("private", "no"):
            s["closed"] = True
    return out


def main():
    items = load(RAW / "wikidata.json")
    src = load(RAW / "access_sources.json")
    overrides_path = DATA / "overrides.json"
    overrides = load(overrides_path)
    est = load(DATA / "founded.json") if (DATA / "founded.json").exists() else {}  # scripts/fetch_founded.py

    npu = {r["qid"]: r for r in src["npu"] if r["qid"]}
    nipos, nipos_unmatched = match_nipos(src["nipos"], items, overrides["nipos_match"])
    osm = osm_signals(src["osm"])
    museums = match_museums(src.get("museums", []), items)

    qids = {it["qid"] for it in items}
    places = []
    for it in items:
        q = it["qid"]
        if set(it["part_of"]) & qids and q not in npu and q not in nipos:
            continue  # building/part of another castle in the dataset
        if q in overrides["exclude"]:
            continue  # duplicate Wikidata item of a place already in the dataset
        if not it["types"] and q not in npu and q not in overrides["extra_qids"]:
            continue  # fetched only because of a stale NPÚ link (see overrides npu_qid)
        kind = classify(it, npu.get(q, {}).get("kind"))
        if kind == "hradby" and re.match(r"(?i)(fort|pevnost|bastion)\b", it["name"]):
            kind = "pevnost"  # forts are typed as generic fortifications on Wikidata
        if not re.match(r"\w", display_name(it["name"], kind, it["obec"])):
            continue  # sub-object labels such as "- areál křižovnického dvora"
        if (kind not in CASTLE_KINDS and q not in npu and q not in nipos and q not in museums
                and q not in overrides["extra_qids"] and not it["cswiki"]):
            continue  # minor non-castle objects: only with a cs.wiki article or a visitor source
        sources = []
        if q in npu:
            sources.append("npu")
        if q in nipos:
            sources.append("nipos")
        if osm.get(q, {}).get("open"):
            sources.append("osm")
        if q in museums:
            sources.append("muzeum")
        if sources:
            access = "vstupne"
        elif kind == "zricenina" and not osm.get(q, {}).get("closed"):
            access = "volne"
        else:
            access = "neznamo"
        image = unquote(it["image"].rsplit("/", 1)[1]) if it["image"] else None
        p = {
            "id": q,
            "name": display_name(it["name"], kind, it["obec"]),
            "wd_label": it["name"],
            "kind": kind,
            "lat": round(it["lat"], 5),
            "lon": round(it["lon"], 5),
            "kraj": it["kraj"] or ("Hlavní město Praha" if (it["obec"] or "").startswith("Praha") else None),
            "obec": it["obec"],
            "founded": founded(it)[0],
            "founded_text": founded(it)[1],
            "access": access,
            "access_sources": sources,
            "manager": "NPÚ" if q in npu else (museums[q][0].get("parent") or museums[q][0]["name"]) if q in museums else None,
            "website": it["website"] or (("https://" + nipos[q]["website"].strip()) if q in nipos and nipos[q]["website"] else None),
            "cswiki": unquote(it["cswiki"]) if it["cswiki"] else None,
            "image": image,
            "visitors": nipos[q]["visitors"] if q in nipos else museums[q][0]["visitors"] if q in museums and museums[q][1] else None,
            "nkp": any("národní kulturní památka" in h.lower() for h in it["heritage"]),
            "unesco": any("světového dědictví" in h.lower() or "world heritage" in h.lower() for h in it["heritage"]),
        }
        e = est.get(q)
        if e and p["founded"] is None and not p["founded_text"]:  # only where Wikidata has no inception
            if e["kind"] == "first_mention":
                p["first_mention"] = e["year"]
            elif "year" in e:
                p["founded"], p["founded_text"] = e["year"], str(e["year"])
            else:
                p["founded_text"] = f"{e['century']}. stol."
        p.update(overrides["places"].get(q, {}))
        places.append(p)
    names = Counter(p["name"] for p in places)
    for p in places:
        if names[p["name"]] > 1 and p["kind"] not in CASTLE_KINDS and p["obec"] and p["obec"] not in p["name"]:
            p["name"] += f" ({p['obec']})"  # e.g. five places called "Dominikánský klášter"
    places.sort(key=lambda p: p["name"])
    save(DATA / "places.json", places)

    print("places", len(places), Counter(p["access"] for p in places), Counter(p["kind"] for p in places))
    missing_npu = [r["name"] for r in src["npu"] if r["qid"] and r["qid"] not in {p["id"] for p in places}]
    print("NPÚ castles missing from places:", missing_npu)
    if "-v" in sys.argv:
        print("NIPOS castle rows unmatched:")
        for r in nipos_unmatched:
            print("  ", r["kraj"], "|", r["name"], "|", r["website"])


if __name__ == "__main__":
    main()
