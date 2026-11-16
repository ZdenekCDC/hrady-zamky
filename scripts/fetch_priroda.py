"""Nature layer: caves and abysses open to the public (hand-picked Wikidata items) and via ferratas (OpenStreetMap)
-> data/priroda.json.

Only places the public may enter: show caves with tours, a few freely accessible caves and the viewpoints of the
two big abysses. Other caves are left out on purpose (protected by law, entry needs a permit, bats winter there).
Kraj and obec come from Nominatim reverse geocoding (cached in data/raw/nominatim.json, ~1 request per second).
"""
import time
from urllib.parse import unquote

from common import DATA, RAW, get, haversine_km, load, save, session, sparql

# QID -> (kind, access). vstupne = guided tours with admission, volne = freely accessible (viewpoint, open cave portal)
PLACES = {
    "Q462346": ("jeskyne", "vstupne"),  # Punkevní jeskyně
    "Q11087495": ("jeskyne", "vstupne"),  # Kateřinská jeskyně
    "Q11034336": ("jeskyne", "vstupne"),  # Balcarka
    "Q956794": ("jeskyne", "vstupne"),  # Sloupsko-šošůvské jeskyně
    "Q11721276": ("jeskyne", "vstupne"),  # Výpustek
    "Q3890135": ("jeskyne", "vstupne"),  # Koněpruské jeskyně
    "Q11087651": ("jeskyne", "vstupne"),  # Mladečské jeskyně
    "Q11015819": ("jeskyne", "vstupne"),  # Javoříčské jeskyně
    "Q1509783": ("jeskyne", "vstupne"),  # Jeskyně Na Pomezí
    "Q168272": ("jeskyne", "vstupne"),  # Zbrašovské aragonitové jeskyně
    "Q1236301": ("jeskyne", "vstupne"),  # Bozkovské dolomitové jeskyně
    "Q221742": ("jeskyne", "vstupne"),  # Chýnovská jeskyně
    "Q2461521": ("jeskyne", "vstupne"),  # Na Turoldu (Mikulov)
    "Q12024564": ("jeskyne", "vstupne"),  # Jeskyně Na Špičáku
    "Q1281044": ("jeskyne", "volne"),  # Pekárna (open portal in Moravský kras)
    "Q12032376": ("jeskyne", "volne"),  # Kůlna (open portal in Moravský kras)
    "Q3493273": ("jeskyne", "volne"),  # Šipka (Štramberk)
    "Q673317": ("propast", "volne"),  # Macocha (upper and lower viewpoints)
    "Q1379640": ("propast", "volne"),  # Hranická propast (viewpoints on the rim)
}

# Wikidata labels that are bare names on the map ("Na Turoldu"); the cave is part of the name people search for
NAMES = {
    "Q2461521": "Jeskyně Na Turoldu",
    "Q1281044": "Jeskyně Pekárna",
    "Q12032376": "Jeskyně Kůlna",
    "Q3493273": "Jeskyně Šipka",
    "Q11034336": "Jeskyně Balcarka",
    "Q11721276": "Jeskyně Výpustek",
}

QUERY = """
SELECT ?item ?itemLabel ?coord ?cswiki ?image ?website ?obecLabel WHERE {
  VALUES ?item { %s }
  ?item wdt:P625 ?coord .
  OPTIONAL { ?cswiki schema:about ?item; schema:isPartOf <https://cs.wikipedia.org/> }
  OPTIONAL { ?item wdt:P18 ?image }
  OPTIONAL { ?item wdt:P856 ?website }
  OPTIONAL { ?item wdt:P131 ?obec . ?obec wdt:P31 wd:Q5153359 }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs". }
}
"""

# a bounding box of the Czech Republic; points abroad are dropped by the reverse geocoding (country_code)
OVERPASS = """[out:json][timeout:120][bbox:48.55,12.09,51.06,18.86];
(way["highway"="via_ferrata"];relation["route"="via_ferrata"];nwr["sport"="via_ferrata"];);out tags center;"""

CLUSTER_KM = 0.4  # route segments of one via ferrata site lie within a few hundred metres
# names that OSM gives only to single routes or not at all; key = OSM id of the site (see the printed list)
RENAME = {
    "osm-r10583152": "Via ferrata Nové Hamry",
    "osm-r14708618": "Via ferraty Bystřice nad Pernštejnem",  # Horní vyhlídka, Jezerní stěna, Ledová stěna in one quarry
    "osm-r17865367": "Via ferrata Vodní brána",  # Modrá, Červená and Fialová routes
    "osm-w1565266783": "Via ferrata Frýdštejn",  # routes B and S, skab.cz
}
SKIP = {
    "osm-w1558610818",  # part C of Via ferrata Hluboká (osm-r17248977), 1 km away
}

SCALE_ORDER = "0123456"


def val(b, k):
    return b[k]["value"] if k in b else None


# ISO 3166-2 codes of the kraje: Nominatim does not always name the region, the code is always there
KRAJ = {
    "CZ-10": "Praha", "CZ-20": "Středočeský kraj", "CZ-31": "Jihočeský kraj", "CZ-32": "Plzeňský kraj",
    "CZ-41": "Karlovarský kraj", "CZ-42": "Ústecký kraj", "CZ-51": "Liberecký kraj", "CZ-52": "Královéhradecký kraj",
    "CZ-53": "Pardubický kraj", "CZ-63": "Kraj Vysočina", "CZ-64": "Jihomoravský kraj", "CZ-71": "Olomoucký kraj",
    "CZ-72": "Zlínský kraj", "CZ-80": "Moravskoslezský kraj",
}


def reverse(lat, lon, cache):
    key = f"{lat:.4f},{lon:.4f}"
    if key not in cache:
        time.sleep(1.1)  # Nominatim usage policy: at most 1 request per second
        r = get("https://nominatim.openstreetmap.org/reverse",
                params={"format": "jsonv2", "lat": lat, "lon": lon, "zoom": 14, "accept-language": "cs"})
        cache[key] = r.json().get("address", {})
    a = cache[key]
    obec = a.get("city") or a.get("town") or a.get("municipality") or a.get("village")
    return a.get("country_code"), KRAJ.get(a.get("ISO3166-2-lvl4")), obec


def wikidata_places():
    out = []
    for b in sparql(QUERY % " ".join("wd:" + q for q in PLACES)):
        qid = val(b, "item").rsplit("/", 1)[1]
        if any(p["id"] == qid for p in out):
            continue  # several coordinates or images: the first row wins
        lon, lat = map(float, val(b, "coord")[6:-1].split())
        kind, access = PLACES[qid]
        image = val(b, "image")
        out.append({
            "id": qid, "name": NAMES.get(qid) or val(b, "itemLabel"), "kind": kind, "lat": round(lat, 5), "lon": round(lon, 5),
            "access": access, "website": val(b, "website"), "cswiki": val(b, "cswiki"),
            "image": unquote(image.rsplit("/", 1)[1]) if image else None, "difficulty": None, "obec": val(b, "obecLabel"),
        })
    missing = set(PLACES) - {p["id"] for p in out}
    if missing:
        raise SystemExit(f"Wikidata returned no coordinates for {sorted(missing)}; fix PLACES in {__file__}")
    return out


def site_name(els):
    """Relation name, else the most common route name without its ': part' / ' - part' suffix."""
    rel = [e["tags"]["name"] for e in els if e["type"] == "relation" and "name" in e["tags"]]
    names = rel or [e["tags"]["name"].split(":")[0].split(" - ")[0].strip() for e in els if "name" in e["tags"]]
    if not names:
        return None
    named = [n for n in names if "errat" in n.lower()] or names
    name = max(set(named), key=named.count)
    name = name.replace("Via Ferrata", "Via ferrata")
    return name if "errat" in name.lower() else f"Via ferrata {name}"


def max_scale(els):
    scales = [s for e in els if (s := e["tags"].get("via_ferrata_scale", "")) and s[0] in SCALE_ORDER]
    return max(scales, key=lambda s: (SCALE_ORDER.index(s[0]), s)) if scales else None


def ferratas(cache):
    r = session.post("https://overpass-api.de/api/interpreter", data={"data": OVERPASS}, timeout=300)
    r.raise_for_status()
    els = [e for e in r.json()["elements"] if e["type"] != "node" or e.get("tags")]
    for e in els:
        c = e.get("center") or e
        e["lat"], e["lon"] = c["lat"], c["lon"]
    clusters = []
    for e in sorted(els, key=lambda e: (e["type"] != "relation", e["id"])):
        hit = next((c for c in clusters if any(haversine_km(e["lat"], e["lon"], x["lat"], x["lon"]) < CLUSTER_KM for x in c)), None)
        if hit:
            hit.append(e)
        else:
            clusters.append([e])
    out = []
    for c in clusters:
        head = c[0]  # a relation when the site has one, else the oldest way
        sid = f"osm-{head['type'][0]}{head['id']}"
        name = RENAME.get(sid) or site_name(c)
        if sid in SKIP or not name:
            continue
        lat = round(sum(e["lat"] for e in c) / len(c), 5)
        lon = round(sum(e["lon"] for e in c) / len(c), 5)
        country, kraj, obec = reverse(lat, lon, cache)
        if country != "cz":
            continue
        tags = [e["tags"] for e in c]
        out.append({
            "id": sid, "osm": f"{head['type']}/{head['id']}", "name": name, "kind": "ferrata", "lat": lat, "lon": lon,
            "kraj": kraj, "obec": obec, "access": "vstupne" if any(t.get("fee") == "yes" for t in tags) else "volne",
            "website": next((t.get("website") or t.get("url") for t in tags if t.get("website") or t.get("url")), None),
            "cswiki": None, "image": None, "difficulty": max_scale(c),
        })
    return out


def main():
    cache_path = RAW / "nominatim.json"
    cache = load(cache_path) if cache_path.exists() else {}
    try:
        places = wikidata_places()
        for p in places:
            _, p["kraj"], obec = reverse(p["lat"], p["lon"], cache)
            p["obec"] = p["obec"] or obec  # Wikidata names the municipality, Nominatim sometimes only its part
        places += ferratas(cache)
    finally:
        save(cache_path, cache)
    keys = ["id", "osm", "name", "kind", "lat", "lon", "kraj", "obec", "access", "difficulty", "website", "cswiki", "image"]
    places = [{k: p[k] for k in keys if k in p} for p in sorted(places, key=lambda p: (p["kind"], p["name"]))]
    save(DATA / "priroda.json", places)
    for p in places:
        print(f"{p['id']:16} {p['kind']:8} {p['access']:8} {p['difficulty'] or '':4} {p['name']} | {p['obec']}, {p['kraj']}")
    print(len(places), "places")


if __name__ == "__main__":
    main()
