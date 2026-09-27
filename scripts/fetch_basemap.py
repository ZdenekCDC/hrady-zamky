"""Build the offline 'Jen města' base map: towns (Wikidata) + country and kraj borders (ČÚZK INSPIRE).

Output: data/basemap/cities.json  [{name, lat, lon, pop}]  (municipalities with >= MIN_POP inhabitants)
        data/basemap/borders.json {country: [[[lat, lon], ...], ...], kraje: [...]}  (simplified polylines)
"""
import json

from common import DATA, get, save, sparql

MIN_POP = 5000
TOLERANCE = 0.0015  # degrees (~120 m); Douglas-Peucker simplification

CITIES = """
SELECT ?item ?itemLabel ?pop ?coord WHERE {
  ?item wdt:P31 wd:Q5153359; wdt:P17 wd:Q213; wdt:P1082 ?pop; wdt:P625 ?coord .
  FILTER(?pop >= %d)
  SERVICE wikibase:label { bd:serviceParam wikibase:language "cs". }
}""" % MIN_POP

# Borders: ČÚZK INSPIRE administrative units, packaged as GeoJSON by github.com/siwekm/czech-geojson (CC BY 4.0)
GEOJSON = "https://raw.githubusercontent.com/siwekm/czech-geojson/master/{}.json"


def fetch_cities():
    best = {}
    for b in sparql(CITIES):
        qid = b["item"]["value"].rsplit("/", 1)[1]
        lon, lat = map(float, b["coord"]["value"][6:-1].split())
        pop = int(float(b["pop"]["value"]))
        if qid not in best or pop > best[qid]["pop"]:  # several population statements: keep the largest
            best[qid] = {"name": b["itemLabel"]["value"], "lat": round(lat, 4), "lon": round(lon, 4), "pop": pop}
    return sorted(best.values(), key=lambda c: -c["pop"])


def simplify(pts, tol):
    """Iterative Douglas-Peucker on [lat, lon] points."""
    if len(pts) < 3:
        return pts
    if pts[0] == pts[-1]:  # closed ring: the base segment would be zero-length, split it in two halves
        mid = len(pts) // 2
        return simplify(pts[:mid + 1], tol)[:-1] + simplify(pts[mid:], tol)
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        (ay, ax), (by, bx) = pts[a], pts[b]
        dx, dy = bx - ax, by - ay
        norm = (dx * dx + dy * dy) ** 0.5 or 1e-12
        idx, dmax = None, tol
        for i in range(a + 1, b):
            py, px = pts[i]
            d = abs(dy * (px - ax) - dx * (py - ay)) / norm
            if d > dmax:
                idx, dmax = i, d
        if idx is not None:
            keep[idx] = True
            stack += [(a, idx), (idx, b)]
    return [p for p, k in zip(pts, keep) if k]


def rings(geojson):
    """All polygon rings of a FeatureCollection as [[lat, lon], ...] lists."""
    out = []
    for f in geojson["features"]:
        g = f["geometry"]
        polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
        for poly in polys:
            out += [[[y, x] for x, y in ring] for ring in poly]
    return out


def fetch_borders():
    def finish(lines):
        return [[[round(y, 4), round(x, 4)] for y, x in simplify(l, TOLERANCE)] for l in lines]
    country = rings(get(GEOJSON.format("czech_republic")).json())
    kraje = rings(get(GEOJSON.format("kraje")).json())  # shared kraj edges are drawn twice; harmless
    return {"country": finish(country), "kraje": finish(kraje)}


def main():
    cities = fetch_cities()
    save(DATA / "basemap" / "cities.json", cities)
    borders = fetch_borders()
    path = DATA / "basemap" / "borders.json"
    path.write_text(json.dumps(borders, separators=(",", ":")) + "\n", encoding="utf-8")  # compact: ~30k points
    pts = sum(len(l) for l in borders["country"] + borders["kraje"])
    print(f"cities {len(cities)}; border lines country {len(borders['country'])}, kraje {len(borders['kraje'])}, points {pts}")


if __name__ == "__main__":
    main()
