"""Fill data/families/<id>.json for every noble family used in data/history (from cs.wiki + Wikidata).

Automatic fields: name, wikidata, cswiki, coat_of_arms (P94), period (P571/P576 or first/last ownership),
summary (intro of the cs.wiki article, first sentences). Existing files keep manually edited fields;
only missing/empty fields are filled. Run after adding histories, then scripts/build_history.py.
"""
import re
import sys
import time
from urllib.parse import unquote

from common import DATA, get, load, save, sparql

INSTITUTIONS = {"koruna", "stat", "cirkev", "mesto", "soukromnik", "neznamo"}
FIELDS = ("name", "wikidata", "cswiki", "coat_of_arms", "period", "summary")


def slug(title):
    import unicodedata
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def used_families():
    fams = {}
    for path in (DATA / "history").glob("Q*.json"):
        for o in load(path)["owners"]:
            if o["owner"] in INSTITUTIONS:
                continue
            fid = slug(o["owner_wiki"]) if o.get("owner_wiki") else o["owner"]
            fams.setdefault(fid, o.get("owner_wiki"))
    return fams


def wiki_info(titles):
    """cs.wiki title -> {qid, extract, title} (redirects resolved)."""
    out = {}
    titles = [t for t in titles if t]
    for i in range(0, len(titles), 20):
        if i:
            time.sleep(1.5)
        chunk = titles[i:i + 20]
        r = get("https://cs.wikipedia.org/w/api.php", params={
            "action": "query", "titles": "|".join(chunk), "prop": "pageprops|extracts", "ppprop": "wikibase_item",
            "exintro": 1, "explaintext": 1, "exlimit": "max", "redirects": 1, "format": "json"}).json()["query"]
        alias = {t: t for t in chunk}
        for n in r.get("normalized", []):
            alias[n["from"]] = n["to"]
        redir = {x["from"]: x["to"] for x in r.get("redirects", [])}
        pages = {p["title"]: p for p in r["pages"].values()}
        for t in chunk:
            tt = redir.get(alias[t], alias[t])
            p = pages.get(tt, {})
            out[t] = {"title": tt, "qid": p.get("pageprops", {}).get("wikibase_item"), "extract": p.get("extract", ""),
                      "missing": not p or "missing" in p}
    return out


def wd_info(qids):
    if not qids:
        return {}
    q = """SELECT ?item ?coa ?start ?end WHERE { VALUES ?item { %s }
      OPTIONAL { ?item wdt:P94 ?coa } OPTIONAL { ?item wdt:P571 ?start } OPTIONAL { ?item wdt:P576 ?end } }""" % " ".join("wd:" + x for x in qids)
    out = {}
    for b in sparql(q):
        qid = b["item"]["value"].rsplit("/", 1)[1]
        o = out.setdefault(qid, {})
        if "coa" in b and "coa" not in o:
            o["coa"] = unquote(b["coa"]["value"].rsplit("/", 1)[1])
        for k in ("start", "end"):
            if k in b and k not in o:
                m = re.match(r"^\+?(-?\d{1,4})", b[k]["value"])
                o[k] = int(m.group(1)) if m else None
    return out


def summary_of(text, max_chars=420):
    text = re.sub(r"\s+", " ", text or "").strip()
    text = text.replace("–", "-").replace("—", "-")
    if len(text) <= max_chars:
        return text or None
    cut = text[:max_chars]
    end = cut.rfind(". ")
    return (cut[: end + 1] if end > 120 else cut.rstrip() + "…")


def canonicalize_titles(wi):
    """Rewrite owner_wiki in history files from redirects to the target article, so one family never gets two ids."""
    fixes = {t: v["title"] for t, v in wi.items() if not v["missing"] and v["title"] != t}
    for path in sorted((DATA / "history").glob("Q*.json")):
        h = load(path)
        hits = [o for o in h["owners"] if o.get("owner_wiki") in fixes]
        for o in hits:
            print(f"{path.name}: owner_wiki {o['owner_wiki']!r} -> {fixes[o['owner_wiki']]!r} (redirect)")
            o["owner_wiki"] = fixes[o["owner_wiki"]]
            o["owner"] = slug(o["owner_wiki"])
        if hits:
            save(path, h)
    return bool(fixes)


def main():
    fams = used_families()
    wi = wiki_info(sorted({t for t in fams.values() if t}))
    missing = sorted(t for t, v in wi.items() if v["missing"])
    if missing:
        sys.exit("owner_wiki without a cs.wiki article (use id z-<predikat> with owner_wiki null, or the correct title): "
                 + ", ".join(missing))
    if canonicalize_titles(wi):
        fams = used_families()
        wi = wiki_info(sorted({t for t in fams.values() if t}))
    wd = wd_info(sorted({v["qid"] for v in wi.values() if v["qid"]}))
    folder = DATA / "families"
    folder.mkdir(exist_ok=True)
    created = updated = 0
    for fid, title in sorted(fams.items()):
        path = folder / f"{fid}.json"
        cur = load(path) if path.exists() else {"id": fid, "type": "rod"}
        info = wi.get(title) or {}
        d = wd.get(info.get("qid"), {})
        auto = {
            "name": info.get("title") or title or fid,
            "wikidata": info.get("qid"),
            "cswiki": ("https://cs.wikipedia.org/wiki/" + info["title"].replace(" ", "_")) if info.get("title") else None,
            "coat_of_arms": d.get("coa"),
            "period": (f"{d.get('start') or '?'} - {d.get('end') or 'dosud'}" if d.get("start") or d.get("end") else None),
            "summary": summary_of(info.get("extract")),
        }
        changed = False
        for k in FIELDS:
            if not cur.get(k) and auto.get(k):
                cur[k] = auto[k]
                changed = True
        cur.setdefault("related", [])
        if changed or not path.exists():
            created += not path.exists()
            updated += path.exists()
            save(path, cur)
    print(f"families used {len(fams)}: created {created}, updated {updated}")
    orphans = sorted(f.stem for f in folder.glob("*.json") if f.stem not in fams)
    if orphans:
        print("WARN family files not used by any history (merged or renamed id? delete after checking):", ", ".join(orphans))


if __name__ == "__main__":
    main()
