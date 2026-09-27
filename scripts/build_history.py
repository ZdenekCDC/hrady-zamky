"""Aggregate data/history/*.json and data/families/*.json -> data/build/{history,families}.json.

- history.json: {QID: history record}
- families.json: {id: family record + derived places (owned periods), transfers in/out, color slot}
  Colour slots 1-8 go to the noble families owning the most places (fixed at build time so a
  filter in the UI never repaints them); institutions and the rest get no slot (neutral in UI).
Validates owner ids, years and ordering; prints problems and exits 1 if any are errors.
"""
import re
import sys
import unicodedata

from common import DATA, load, save

INSTITUTIONS = {
    "koruna": "Koruna (panovník)",
    "stat": "Stát",
    "cirkev": "Církev",
    "mesto": "Město / obec",
    "soukromnik": "Soukromý vlastník",
    "neznamo": "Neznámý vlastník",
}
HOW = {"zalozeni", "koupe", "dedictvi", "snatek", "dar", "lenni", "konfiskace", "vymena", "restituce", "jine", "neznamo"}
SLOTS = 8


def slug(title):
    s = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


def fill_unknown_years(owners):
    """Sources often give only the order of owners. A missing year inside the chain is
    interpolated between known neighbours and flagged approx; `to: null` is 'until now'
    only for owners without a known successor boundary (the last ones)."""
    n = len(owners)
    if n == 0:
        return 0
    # boundary k = start of owner k (k=0..n-1); boundary n = end of the last owner
    bounds = [owners[0]["from"]] + [owners[k]["from"] if owners[k]["from"] is not None else owners[k - 1]["to"]
                                    for k in range(1, n)]
    filled = 0
    known = [k for k, b in enumerate(bounds) if b is not None]
    for k in range(n):
        if bounds[k] is not None:
            continue
        lo = max((j for j in known if j < k), default=None)
        hi = min((j for j in known if j > k), default=None)
        if lo is not None and hi is not None:
            bounds[k] = round(bounds[lo] + (bounds[hi] - bounds[lo]) * (k - lo) / (hi - lo))
            filled += 1
    for k, o in enumerate(owners):
        if o["from"] is None and bounds[k] is not None:
            o["from"], o["from_approx"] = bounds[k], True
        if o["to"] is None and k + 1 < n and bounds[k + 1] is not None:
            o["to"], o["to_approx"] = bounds[k + 1], True
    return filled


def main():
    places = {p["id"]: p for p in load(DATA / "places.json")}
    errors, warnings = [], []

    history = {}
    for path in sorted((DATA / "history").glob("Q*.json")):
        h = load(path)
        q = path.stem
        if h.get("id") != q:
            errors.append(f"{path.name}: id {h.get('id')} != file name")
        if q not in places:
            warnings.append(f"{path.name}: not in places.json")
        if fill_unknown_years(h["owners"]):
            warnings.append(f"{q}: interpolated missing years in owner chain")
        prev_from = None
        for o in h["owners"]:
            if o.get("how") not in HOW:
                errors.append(f"{q}: missing/unknown how {o.get('how')!r} at owner {o.get('owner')} {o.get('from')} (allowed: {', '.join(sorted(HOW))})")
                o["how"] = "neznamo"
            if o["to"] is not None and o["from"] is not None and o["to"] < o["from"]:
                errors.append(f"{q}: {o['owner']} to < from")
            if prev_from is not None and o["from"] is not None and o["from"] < prev_from:
                warnings.append(f"{q}: owners not chronological at {o['owner']} {o['from']}")
            prev_from = o["from"] if o["from"] is not None else prev_from
            if o["owner"] not in INSTITUTIONS and o.get("owner_wiki"):
                o["owner"] = slug(o["owner_wiki"])  # canonical id is derived from the cs.wiki title
        history[q] = h

    families = {}
    for path in sorted((DATA / "families").glob("*.json")):
        f = load(path)
        families[f["id"]] = {**f, "places": [], "transfers": []}

    for q, h in history.items():
        owners = h["owners"]
        for i, o in enumerate(owners):
            fid = o["owner"]
            if fid not in families:
                families[fid] = {
                    "id": fid,
                    "name": INSTITUTIONS.get(fid) or o.get("owner_wiki") or fid,
                    "type": "instituce" if fid in INSTITUTIONS else "rod",
                    "cswiki": ("https://cs.wikipedia.org/wiki/" + o["owner_wiki"].replace(" ", "_")) if o.get("owner_wiki") else None,
                    "places": [], "transfers": [],
                }
            families[fid]["places"].append({
                "place": q, "from": o["from"], "to": o["to"], "person": o.get("person"), "how": o["how"],
                "from_approx": o.get("from_approx", False), "to_approx": o.get("to_approx", False),
            })
            if i > 0 and owners[i - 1]["owner"] != fid:
                t = {"place": q, "year": o["from"], "from": owners[i - 1]["owner"], "to": fid, "how": o["how"]}
                families[fid]["transfers"].append(t)
                families.setdefault(owners[i - 1]["owner"], {"transfers": []})["transfers"].append(t)

    for f in families.values():
        f["place_count"] = len({p["place"] for p in f["places"]})
        f["color_slot"] = None
    nobles = sorted((f for f in families.values() if f.get("type") != "instituce"),
                    key=lambda f: (-f["place_count"], f["name"]))
    for i, f in enumerate(nobles[:SLOTS]):
        f["color_slot"] = i + 1

    missing = [f["id"] for f in families.values() if f.get("type") == "rod" and not (DATA / "families" / f"{f['id']}.json").exists()]
    save(DATA / "build" / "history.json", history)
    save(DATA / "build" / "families.json", families)

    print(f"history {len(history)}, families {len(families)} ({len(missing)} without families/<id>.json)")
    for w in warnings:
        print("WARN", w)
    for e in errors:
        print("ERROR", e)
    if missing and "-v" in sys.argv:
        print("families without detail file:", ", ".join(sorted(missing)))
    sys.exit(1 if errors else 0)


if __name__ == "__main__":
    main()
