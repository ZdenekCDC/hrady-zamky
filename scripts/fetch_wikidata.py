"""Download Czech castles, chateaux and castle ruins from Wikidata -> data/raw/wikidata.json."""
from common import DATA, RAW, load, save, sparql

TYPES = {
    "Q23413": "hrad",
    "Q751876": "zamek",
    "Q17715832": "zricenina",
}

QUERY = """
SELECT ?item ?itemLabel ?type ?coord ?inception ?cswiki ?image ?website ?obecLabel ?krajLabel ?heritageLabel ?monument ?state ?incPrec ?partOf
WHERE {
  %s
  ?item wdt:P31 ?type; wdt:P17 wd:Q213; wdt:P625 ?coord .
  OPTIONAL { ?item p:P571/psv:P571 [ wikibase:timeValue ?inception; wikibase:timePrecision ?incPrec ] }
  OPTIONAL { ?item wdt:P361 ?partOf }
  OPTIONAL { ?cswiki schema:about ?item; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P131 ?obec }
  OPTIONAL { ?item wdt:P131+ ?kraj . ?kraj wdt:P31 wd:Q38911 }
  OPTIONAL { ?item wdt:P1435 ?heritage }
  OPTIONAL { ?item wdt:P762 ?monument }
  OPTIONAL { ?item wdt:P5816 ?state }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
}
"""
BY_TYPE = "VALUES ?type { %s }" % " ".join("wd:" + q for q in TYPES)

OWNERS = """
SELECT ?item ?owner ?ownerLabel ?start ?end WHERE {
  %s
  ?item wdt:P31 ?type; wdt:P17 wd:Q213 .
  ?item p:P127 ?st . ?st ps:P127 ?owner .
  OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs,en". }
}
"""


def val(b, k):
    return b[k]["value"] if k in b else None


def extra_qids():
    """Castles from NPÚ list and overrides that are typed differently on Wikidata, e.g. 'hradozámek'."""
    qids = set()
    path = RAW / "access_sources.json"
    if path.exists():
        qids |= {r["qid"] for r in load(path)["npu"] if r["qid"]}
    path = DATA / "overrides.json"
    if path.exists():
        qids |= set(load(path)["extra_qids"])
    return sorted(qids)


def main():
    items = {}
    extra = "VALUES ?item { %s }" % " ".join("wd:" + q for q in extra_qids())
    rows = sparql(QUERY % BY_TYPE) + sparql(QUERY % extra)
    for b in rows:
        qid = val(b, "item").rsplit("/", 1)[1]
        lon, lat = map(float, val(b, "coord")[6:-1].split())
        it = items.setdefault(qid, {
            "qid": qid, "name": val(b, "itemLabel"), "types": set(), "lat": lat, "lon": lon,
            "inception": None, "inception_precision": None, "part_of": set(), "cswiki": None, "image": None, "website": None,
            "obec": None, "kraj": None, "heritage": set(), "monument_id": None, "states": set(), "owners": [],
        })
        t = val(b, "type").rsplit("/", 1)[1]
        if t in TYPES:
            it["types"].add(TYPES[t])
        for k, f in [("inception", "inception"), ("cswiki", "cswiki"), ("image", "image"),
                     ("website", "website"), ("obec", "obecLabel"), ("kraj", "krajLabel"),
                     ("monument_id", "monument")]:
            if it[k] is None and val(b, f):
                it[k] = val(b, f)
        if val(b, "inception") == it["inception"] and val(b, "incPrec"):
            it["inception_precision"] = int(val(b, "incPrec"))
        if val(b, "partOf"):
            it["part_of"].add(val(b, "partOf").rsplit("/", 1)[1])
        if val(b, "state"):
            it["states"].add(val(b, "state").rsplit("/", 1)[1])
        if val(b, "heritageLabel"):
            it["heritage"].add(val(b, "heritageLabel"))
    for b in sparql(OWNERS % BY_TYPE) + sparql(OWNERS % extra):
        qid = val(b, "item").rsplit("/", 1)[1]
        if qid in items:
            o = {"qid": val(b, "owner").rsplit("/", 1)[1], "name": val(b, "ownerLabel"),
                 "start": val(b, "start"), "end": val(b, "end")}
            if o not in items[qid]["owners"]:
                items[qid]["owners"].append(o)
    out = []
    for it in items.values():
        it["types"] = sorted(it["types"])
        it["heritage"] = sorted(it["heritage"])
        it["states"] = sorted(it["states"])
        it["part_of"] = sorted(it["part_of"])
        out.append(it)
    out.sort(key=lambda x: x["name"])
    save(RAW / "wikidata.json", out)
    print(len(out), "items;", sum(1 for i in out if i["owners"]), "with owners;",
          sum(1 for i in out if i["cswiki"]), "with cswiki")


if __name__ == "__main__":
    main()
