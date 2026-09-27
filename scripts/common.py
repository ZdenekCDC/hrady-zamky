"""Shared helpers for data scripts."""
import json
import math
import re
import time
import unicodedata
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"
UA = "HradyZamky/0.1 (personal castle map; python-requests)"

session = requests.Session()
session.headers["User-Agent"] = UA


def get(url, retries=5, **kw):
    for attempt in range(retries):
        r = session.get(url, timeout=120, **kw)
        if r.status_code == 200:
            return r
        if r.status_code in (429, 500, 502, 503, 504):
            retry_after = r.headers.get("Retry-After", "")
            time.sleep(int(retry_after) if retry_after.isdigit() else 15 * (attempt + 1))
            continue
        r.raise_for_status()
    r.raise_for_status()
    return r


def sparql(query):
    r = get("https://query.wikidata.org/sparql", params={"query": query, "format": "json"})
    return r.json()["results"]["bindings"]


def load(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def save(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def norm(s):
    """Lowercase, strip diacritics and generic words for name matching."""
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\(.*?\)", " ", s)
    s = re.sub(
        r"\b(statni|hrad|zamek|zamecek|hradozamek|zricenina|zriceniny|zamku|hradu|a|castle|chateau|the|novy|stary)\b",
        " ",
        s,
    )
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return " ".join(s.split())


def haversine_km(a_lat, a_lon, b_lat, b_lon):
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp, dl = p2 - p1, math.radians(b_lon - a_lon)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))
