"""Fast structural checks of the data files, no browser: python3 tests/test_data.py

Covers what the web app assumes about data/: field set and types of places.json, ids,
references between places, history, families and the generated data/build/*.json.
Owner chains inside history/*.json (years, order, `how`) are validated by scripts/build_history.py.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"

# a CR bounding box with a margin; a swapped lat/lon or a stray point lands far outside
LAT = (48.4, 51.2)
LON = (11.9, 19.0)
ACCESS = {"vstupne", "volne", "neznamo"}
ID_RE = re.compile(r"^(Q\d+|osm-[nwr]\d+)$")
REQUIRED = {"id", "name", "wd_label", "kind", "lat", "lon", "kraj", "obec", "founded", "founded_text",
            "access", "access_sources", "manager", "website", "cswiki", "image", "visitors", "nkp", "unesco"}
NULLABLE = {"kraj", "obec", "founded", "founded_text", "manager", "website", "cswiki", "image", "visitors"}


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def kinds_in_app():
    src = (ROOT / "app" / "data.js").read_text(encoding="utf-8")
    body = src.split("export const KIND = {")[1].split("};")[0]
    return set(re.findall(r"^\s+(\w+):", body, re.M))


class DataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.places = load(DATA / "places.json")
        cls.by_id = {p["id"]: p for p in cls.places}
        cls.history = {p.stem: load(p) for p in sorted((DATA / "history").glob("Q*.json"))}
        cls.families = {p.stem: load(p) for p in sorted((DATA / "families").glob("*.json"))}
        cls.kinds = kinds_in_app()

    def test_place_ids_unique_and_wellformed(self):
        ids = [p["id"] for p in self.places]
        self.assertEqual(len(ids), len(set(ids)), "duplicate place ids")
        bad = [i for i in ids if not ID_RE.match(i)]
        self.assertFalse(bad, f"malformed ids: {bad[:5]}")

    def test_place_fields(self):
        problems = []
        for p in self.places:
            missing = REQUIRED - p.keys()
            if missing:
                problems.append(f"{p['id']}: missing {sorted(missing)}")
            for k in REQUIRED - NULLABLE:
                if p.get(k) is None:
                    problems.append(f"{p['id']}: {k} is null")
            if p.get("kind") not in self.kinds:
                problems.append(f"{p['id']}: kind {p.get('kind')!r} not in KIND (app/data.js)")
            if p.get("access") not in ACCESS:
                problems.append(f"{p['id']}: access {p.get('access')!r}")
            if not (LAT[0] <= p["lat"] <= LAT[1] and LON[0] <= p["lon"] <= LON[1]):
                problems.append(f"{p['id']}: {p['lat']}, {p['lon']} outside the Czech Republic")
            if p.get("founded") is not None and not isinstance(p["founded"], int):
                problems.append(f"{p['id']}: founded {p['founded']!r} is not a year")
        self.assertFalse(problems, "\n".join(problems[:20]))

    def test_osm_places_match_extra_places(self):
        extra = load(DATA / "extra_places.json")
        extra = extra if isinstance(extra, list) else extra.get("places", [])
        for e in extra:
            self.assertIn(e["id"], self.by_id, f"{e['id']} from extra_places.json missing in places.json")
            self.assertIn("osm", self.by_id[e["id"]])
        osm_ids = {p["id"] for p in self.places if p["id"].startswith("osm-")}
        self.assertEqual(osm_ids, {e["id"] for e in extra})

    def test_history_files(self):
        for q, h in self.history.items():
            self.assertEqual(h["id"], q)
            self.assertIn(q, self.by_id, f"history/{q}.json has no place")
            self.assertIsInstance(h["owners"], list)
            self.assertTrue(h["owners"], f"{q}: no owners")

    def test_family_files(self):
        for fid, f in self.families.items():
            self.assertEqual(f["id"], fid)
            for r in f["related"]:
                self.assertIn(r["family"], self.families, f"{fid}: related {r['family']} has no file")

    def test_built_owners_exist_in_built_families(self):
        # raw history owner ids may be non-canonical (build_history.py derives them from owner_wiki), so check the built files
        families = load(DATA / "build" / "families.json")
        missing = [f"{q}: {o['owner']}" for q, h in load(DATA / "build" / "history.json").items()
                   for o in h["owners"] if o["owner"] not in families]
        self.assertFalse(missing, f"owners missing in build/families.json: {missing[:10]}")
    def test_build_is_current(self):
        build = load(DATA / "build" / "history.json")
        self.assertEqual(set(build), set(self.history), "data/build/history.json is stale: run scripts/build_history.py")
        fam_build = load(DATA / "build" / "families.json")
        self.assertLessEqual(set(self.families), set(fam_build), "data/build/families.json is stale: run scripts/build_history.py")


if __name__ == "__main__":
    unittest.main()
